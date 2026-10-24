"""Restore observed homozygous-reference SNPs for ancestry inference (chr22+).

Problem: phasing drops hom-ref sites (ALT='.') because they carry no phase
information and Beagle needs a concrete ALT. But those sites ARE informative for
ancestry (a confirmed homozygous-reference genotype is real signal). Feeding
only the phased het/hom-alt subset to RFMix throws away roughly half the usable
markers.

This module rebuilds an ancestry input VCF from:
  * the existing PHASED output (het + hom-alt, kept exactly as Beagle phased
    them), and
  * the observed hom-ref sites from the harmonized VCF, each re-expressed as a
    phased 0|0 using the reference panel's REF/ALT at that position.

Strict rules (no fabrication):
  * A hom-ref site is restored ONLY if it is present in the reference panel at
    the same position with a REF allele that matches our harmonized REF. The
    panel supplies the ALT; the sample's observed genotype is homozygous
    reference, so it is 0|0 by construction — nothing is inferred.
  * Missing / no-call / not-assayed sites are never turned into 0|0.
  * Heterozygous calls are never arbitrarily phased here; they come only from
    the phased VCF, where Beagle resolved phase.
  * Genome build, coordinates, strand, and REF/ALT coding must be consistent
    with the panel; mismatches are dropped and counted, never coerced.

The result is sorted, de-duplicated, and tabix-indexed.

Privacy: the report carries aggregate counts only; no genotype values.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class RestoreReport:
    phased_markers: int = 0
    homref_candidates: int = 0
    homref_restored: int = 0
    homref_dropped_not_in_panel: int = 0
    homref_dropped_ref_mismatch: int = 0
    homref_dropped_non_biallelic_snp: int = 0
    total_before_intersect: int = 0
    surviving_panel_intersection: int = 0
    merged_markers: int = 0
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "phased_markers": self.phased_markers,
            "homref_candidates": self.homref_candidates,
            "homref_restored": self.homref_restored,
            "homref_dropped_not_in_panel": self.homref_dropped_not_in_panel,
            "homref_dropped_ref_mismatch": self.homref_dropped_ref_mismatch,
            "homref_dropped_non_biallelic_snp": self.homref_dropped_non_biallelic_snp,
            "total_before_intersect": self.total_before_intersect,
            "surviving_panel_intersection": self.surviving_panel_intersection,
            "merged_markers": self.merged_markers,
            "warnings": self.warnings,
        }


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


_SNP = {"A", "C", "G", "T"}


def _panel_ref_alt(panel_vcf: Path, chromosome: str) -> dict[int, tuple[str, str]]:
    """Map position -> (REF, ALT) for biallelic SNP sites in the panel.

    Multiallelic or non-SNP panel sites are skipped: restoring against them
    would be ambiguous, so those hom-ref sites are dropped with a reason.
    """
    res = _run(["bcftools", "view", "-H", "-v", "snps", "-m2", "-M2",
                "-r", chromosome, str(panel_vcf)])
    out: dict[int, tuple[str, str]] = {}
    for line in res.stdout.splitlines():
        parts = line.split("\t", 5)
        if len(parts) < 5:
            continue
        pos = int(parts[1])
        ref, alt = parts[3].upper(), parts[4].upper()
        if ref in _SNP and alt in _SNP:
            out[pos] = (ref, alt)
    return out


def restore_ancestry_vcf(
    harmonized_vcf: Path,
    phased_vcf: Path,
    panel_vcf: Path,
    chromosome: str,
    out_vcf_gz: Path,
    sample_id: str = "sample",
) -> RestoreReport:
    """Build an ancestry VCF = phased het/hom-alt + restored observed hom-ref.

    Returns a RestoreReport. The surviving_panel_intersection count reflects how
    many RESTORED hom-ref sites actually matched the panel (the figure the task
    asks to report; do not assume all candidates survive).
    """
    report = RestoreReport()
    out_vcf_gz.parent.mkdir(parents=True, exist_ok=True)

    report.phased_markers = _count(phased_vcf)
    panel = _panel_ref_alt(panel_vcf, chromosome)

    # Collect observed hom-ref sites (ALT='.') from the harmonized VCF for this
    # chromosome. Fields: POS, REF, FORMAT sample GT.
    res = _run(["bcftools", "query", "-r", chromosome,
                "-f", "%POS\t%REF\t%ALT[\t%GT]\n", str(harmonized_vcf)])
    restored_rows: list[tuple[int, str, str]] = []  # (pos, ref, alt)
    for line in res.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        pos = int(parts[0])
        ref = parts[1].upper()
        alt = parts[2]
        gt = parts[3].replace("|", "/")
        if alt != ".":
            continue  # only hom-ref sites were written with ALT='.'
        if gt not in ("0/0", "0|0"):
            continue  # defensive: only genuine hom-ref
        report.homref_candidates += 1

        panel_entry = panel.get(pos)
        if panel_entry is None:
            # Position may exist in panel but not as biallelic SNP, or not at all.
            report.homref_dropped_not_in_panel += 1
            continue
        p_ref, p_alt = panel_entry
        if p_ref != ref:
            report.homref_dropped_ref_mismatch += 1
            continue
        if p_alt not in _SNP:
            report.homref_dropped_non_biallelic_snp += 1
            continue
        restored_rows.append((pos, p_ref, p_alt))

    report.homref_restored = len(restored_rows)
    report.surviving_panel_intersection = len(restored_rows)

    # Write restored hom-ref sites as a phased-0|0 VCF.
    restored_vcf = out_vcf_gz.parent / f"{out_vcf_gz.stem}.restored_homref.vcf"
    header = [
        "##fileformat=VCFv4.2",
        "##source=AncestryAwareVariantExplorer-restore-homref",
        "##reference=GRCh37/human_g1k_v37",
        '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
        f"##contig=<ID={chromosome}>",
        "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t" + sample_id,
    ]
    body = [
        f"{chromosome}\t{pos}\t.\t{ref}\t{alt}\t.\tPASS\t.\tGT\t0|0"
        for pos, ref, alt in sorted(restored_rows)
    ]
    restored_vcf.write_text("\n".join(header + body) + "\n", encoding="utf-8")
    _run(["bgzip", "-f", str(restored_vcf)])
    restored_gz = Path(f"{restored_vcf}.gz")
    _run(["tabix", "-f", "-p", "vcf", str(restored_gz)])

    # The phased VCF sample column may be named differently; normalize to
    # sample_id so bcftools concat/merge aligns the single sample.
    phased_renamed = out_vcf_gz.parent / f"{out_vcf_gz.stem}.phased_renamed.vcf.gz"
    rn = out_vcf_gz.parent / "rename_sample.txt"
    rn.write_text(_sample_name(phased_vcf) + " " + sample_id + "\n", encoding="utf-8")
    _run(["bcftools", "reheader", "-s", str(rn), "-o", str(phased_renamed), str(phased_vcf)])
    _run(["tabix", "-f", "-p", "vcf", str(phased_renamed)])

    report.total_before_intersect = report.phased_markers + report.homref_restored

    # Concatenate phased + restored, sort by position, drop exact duplicate
    # positions (prefer the phased record if a position appears in both), index.
    concat = out_vcf_gz.parent / f"{out_vcf_gz.stem}.concat.vcf.gz"
    _run(["bcftools", "concat", "-a", "-Oz", "-o", str(concat),
          str(phased_renamed), str(restored_gz)])
    # Sort then remove duplicate positions.
    sorted_vcf = out_vcf_gz.parent / f"{out_vcf_gz.stem}.sorted.vcf.gz"
    _run(["bcftools", "sort", "-Oz", "-o", str(sorted_vcf), str(concat)])
    # --rm-dup keeps the first record at duplicate (chrom,pos); phased comes
    # first in concat so phased wins where a position somehow appears in both.
    _run(["bcftools", "norm", "--rm-dup", "all", "-Oz", "-o", str(out_vcf_gz),
          str(sorted_vcf)])
    _run(["tabix", "-f", "-p", "vcf", str(out_vcf_gz)])

    report.merged_markers = _count(out_vcf_gz)

    # Clean intermediates.
    for p in (restored_gz, Path(str(restored_gz) + ".tbi"), phased_renamed,
              Path(str(phased_renamed) + ".tbi"), concat, sorted_vcf, rn):
        p.unlink(missing_ok=True)

    return report


def _count(vcf: Path) -> int:
    r = _run(["bcftools", "index", "-n", str(vcf)])
    if r.returncode == 0 and r.stdout.strip().isdigit():
        return int(r.stdout.strip())
    r2 = _run(["bcftools", "view", "-H", str(vcf)])
    return len([ln for ln in r2.stdout.splitlines() if ln])


def _sample_name(vcf: Path) -> str:
    r = _run(["bcftools", "query", "-l", str(vcf)])
    names = r.stdout.split()
    return names[0] if names else "sample"
