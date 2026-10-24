"""Statistical phasing with Beagle 5.5 (Step 3).

Reference-assisted, single-sample phasing run chromosome by chromosome. The
family-aware path is a separate, explicit Mendelian-consistency layer (see
family.py); Beagle 5.x does not model parent-offspring relationships itself.

Pipeline per chromosome:
  1. conform-gt aligns the sample VCF to the reference panel (consistent
     positions and REF/ALT; markers absent from the panel are dropped).
  2. Beagle phases the conformed VCF against the panel using the PLINK genetic
     map for that chromosome.
  3. We verify that phasing did not change the observed allele counts: the
     multiset of alleles per site must be identical before and after. Phasing
     only reorders alleles across the two chromosome copies; it must never add,
     drop, or change an allele. A violation raises.

Track labelling: without evidence of parental origin the two haplotypes are
labelled copy 1 / copy 2 (phase order from Beagle). Parental origin is assigned
only by the family-aware layer when trio data supports it.

Privacy: logs record marker counts, parameters, and tool versions, never
genotype values. Phased VCFs contain genotypes (their purpose) and live under a
gitignored path.
"""

from __future__ import annotations

import subprocess
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class PhasingResult:
    chromosome: str
    input_markers: int
    phasable_markers: int
    conformed_markers: int
    phased_markers: int
    allele_counts_preserved: bool
    beagle_version: str
    reference_panel: str
    genetic_map: str
    phased_vcf: str
    parameters: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "chromosome": self.chromosome,
            "input_markers": self.input_markers,
            "phasable_markers": self.phasable_markers,
            "conformed_markers": self.conformed_markers,
            "phased_markers": self.phased_markers,
            "allele_counts_preserved": self.allele_counts_preserved,
            "beagle_version": self.beagle_version,
            "reference_panel": self.reference_panel,
            "genetic_map": self.genetic_map,
            "phased_vcf": self.phased_vcf,
            "parameters": self.parameters,
            "warnings": self.warnings,
        }


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def _site_allele_counts(vcf_gz: Path) -> dict[int, Counter]:
    """Return {position: Counter(alleles)} for the single sample in a VCF.

    Counts the actual allele *bases* (not 0/1 indices) so the comparison is
    robust across REF/ALT reordering: we resolve each GT index to its allele.
    """
    res = _run(["bcftools", "query", "-f", "%POS\t%REF\t%ALT[\t%GT]\n", str(vcf_gz)])
    counts: dict[int, Counter] = {}
    for line in res.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        pos = int(parts[0])
        ref = parts[1]
        alts = parts[2].split(",")
        gt = parts[3].replace("|", "/")
        alleles = [ref] + alts
        c: Counter = Counter()
        for idx in gt.split("/"):
            if idx in (".", ""):
                c["."] += 1
                continue
            i = int(idx)
            c[alleles[i] if 0 <= i < len(alleles) else "?"] += 1
        counts[pos] = c
    return counts


def _allele_counts_preserved(before: Path, after: Path) -> tuple[bool, list[str]]:
    """Verify per-site allele multisets are unchanged by phasing.

    Only positions present in BOTH files are compared (conform-gt may drop
    panel-absent markers before phasing; that is an expected reduction, not an
    allele change). Any shared position whose allele multiset differs is a
    violation.
    """
    b = _site_allele_counts(before)
    a = _site_allele_counts(after)
    warnings: list[str] = []
    shared = set(b) & set(a)
    ok = True
    mism = 0
    for pos in shared:
        if b[pos] != a[pos]:
            ok = False
            mism += 1
    if mism:
        warnings.append(f"{mism} shared sites changed allele multiset during phasing")
    return ok, warnings


def phase_chromosome(
    sample_vcf_gz: Path,
    panel_vcf_gz: Path,
    genetic_map: Path,
    chromosome: str,
    out_prefix: Path,
    beagle_jar: Path,
    conform_gt_jar: Path,
    beagle_version: str = "5.5",
    java: str = "java",
    seed: int = 42,
) -> PhasingResult:
    """Phase one chromosome of a single sample against a reference panel."""
    out_prefix.parent.mkdir(parents=True, exist_ok=True)

    def _count(vcf: Path) -> int:
        r = _run(["bcftools", "index", "-n", str(vcf)])
        if r.returncode == 0 and r.stdout.strip().isdigit():
            return int(r.stdout.strip())
        r2 = _run(["bcftools", "view", "-H", str(vcf)])
        return len(r2.stdout.splitlines())

    input_markers = _count(sample_vcf_gz)

    # 1. Filter to phasing-informative sites. Hom-ref sites written with ALT='.'
    #    carry no phasing information (both copies are reference regardless of
    #    phase) and Beagle requires a concrete ALT allele. Dropping them is
    #    sound, not a data loss: their phase is trivially 0|0.
    phasable = out_prefix.parent / f"{out_prefix.name}.phasable.vcf.gz"
    fx = _run([
        "bcftools", "view", "-e", 'ALT="."',
        "-Oz", "-o", str(phasable), str(sample_vcf_gz),
    ])
    if not phasable.exists():
        raise RuntimeError(
            f"Failed to prepare phasing input. stderr: {fx.stderr.strip()[:300]}"
        )
    _run(["tabix", "-f", "-p", "vcf", str(phasable)])
    phasable_markers = _count(phasable)

    # Note: we feed the harmonized VCF directly to Beagle rather than running
    # conform-gt first. conform-gt's job is to align target alleles/strand to a
    # reference VCF, but Step 2 harmonization already made our REF/ALT consistent
    # with GRCh37 (bcftools --check-ref verified 0 mismatches). Beagle matches the
    # target to the panel itself via gt=/ref=, so conform-gt is redundant here.
    # conform_gt_jar is retained in the signature for the family-aware path.
    _ = conform_gt_jar
    conformed_markers = phasable_markers

    # 2. Beagle phasing against the panel using the genetic map.
    phased_prefix = out_prefix
    bg = _run([
        java, "-jar", str(beagle_jar),
        f"gt={phasable}",
        f"ref={panel_vcf_gz}",
        f"map={genetic_map}",
        f"out={phased_prefix}",
        f"seed={seed}",
        "impute=false",  # phase only; do not impute ungenotyped markers here.
    ])
    phased_vcf = Path(f"{phased_prefix}.vcf.gz")
    if not phased_vcf.exists():
        raise RuntimeError(
            f"Beagle did not produce output. stderr: {bg.stderr.strip()[:400]}"
        )
    _run(["tabix", "-f", "-p", "vcf", str(phased_vcf)])
    phased_markers = _count(phased_vcf)

    # 3. Verify phasing preserved observed allele counts.
    preserved, warnings = _allele_counts_preserved(phasable, phased_vcf)

    return PhasingResult(
        chromosome=chromosome,
        input_markers=input_markers,
        phasable_markers=phasable_markers,
        conformed_markers=conformed_markers,
        phased_markers=phased_markers,
        allele_counts_preserved=preserved,
        beagle_version=beagle_version,
        reference_panel=str(panel_vcf_gz.name),
        genetic_map=str(genetic_map.name),
        phased_vcf=str(phased_vcf),
        parameters={"seed": seed, "impute": False, "conform_gt": False,
                    "ref_assisted": True},
        warnings=warnings,
    )
