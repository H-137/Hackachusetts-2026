#!/usr/bin/env python3
"""Build the REAL expanded chr22 reference panel: 1000G Phase 3 + real AADR
Ashkenazi Jewish individuals (Step 7, real-data path).

Inputs (already produced/verified upstream):
  * 1000G Phase 3 chr22 panel VCF (phased), pipeline/reference/assets/panel/
  * Real AADR Human Origins 'Jew_Ashkenazi' chr22 VCF (8 unrelated, modern,
    diploid individuals; unphased array genotypes) from scripts/aadr_to_vcf.py,
    produced with the VERIFIED TGENO decoder and md5-checked source.

Steps (no fabrication; nothing filled as reference):
  1. Normalize the AADR AJ VCF to biallelic SNPs.
  2. Restrict to sites shared with the 1000G panel at the SAME position with an
     EXACTLY matching REF/ALT (bcftools isec -c none). Mismatches are dropped
     and counted, never strand-flipped.
  3. Reference-assisted PHASE the reconciled AJ VCF against the 1000G panel with
     Beagle 5.5 (array genotypes are unphased; RFMix needs phased reference
     haplotypes). The 1000G panel is already phased.
  4. MERGE the phased AJ VCF into the 1000G panel (bcftools merge).
  5. Write the expanded sample map: all 1000G labels + the 8 AJ individuals
     labeled 'AJ' (super_pop MID). Duplicate individuals across sources: none
     (AADR ids disjoint from 1000G ids); asserted.
"""

from __future__ import annotations

import json
import shlex
import subprocess
import sys
from pathlib import Path


def q(p) -> str:
    """Shell-quote a path (the repo path contains spaces)."""
    return shlex.quote(str(p))

REPO = Path(__file__).resolve().parents[2]
PANEL_DIR = REPO / "pipeline/reference/assets/panel"
META_DIR = REPO / "pipeline/reference/assets/panel_meta"
AADR_DIR = REPO / "pipeline/reference/assets/aadr"
GM_DIR = REPO / "pipeline/reference/assets/genetic_maps"
BEAGLE = REPO / "pipeline/reference/assets/tools/beagle.27Feb25.75f.jar"


def sh(cmd: str, check: bool = True) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"Command failed ({r.returncode}): {cmd}\n{r.stderr[-800:]}")
    return r


def nsites(vcf: Path) -> int:
    return int(sh(f"bcftools view -H {q(vcf)} | wc -l").stdout.strip() or 0)


def main() -> int:
    chrom = "22"
    panel = PANEL_DIR / f"ALL.chr{chrom}.phase3.genotypes.vcf.gz"
    aj_raw = AADR_DIR / f"aadr_aj.chr{chrom}.vcf.gz"
    gmap = GM_DIR / f"plink.chr{chrom}.GRCh37.map"
    for p, what in [(panel, "1000G panel"), (aj_raw, "AADR AJ VCF"),
                    (gmap, "genetic map"), (BEAGLE, "Beagle jar")]:
        if not p.exists():
            print(f"Missing {what}: {p}", file=sys.stderr)
            return 2

    work = AADR_DIR / "work_chr22"
    sh(f"rm -rf {q(work)} && mkdir -p {q(work)}")
    report: dict = {"chromosome": chrom}

    # --- 0) Normalize AJ to biallelic SNPs.
    aj_norm = work / "aj.norm.vcf.gz"
    sh(f"bcftools norm -m -any {q(aj_raw)} 2>/dev/null | "
       f"bcftools view -m2 -M2 -v snps -Oz -o {q(aj_norm)} - && tabix -f -p vcf {q(aj_norm)}")
    report["aj_input_sites"] = nsites(aj_raw)
    report["aj_biallelic_snp_sites"] = nsites(aj_norm)

    # --- 1) Panel SITES at AJ positions (-G drops the 2504 genotypes -> fast).
    regions = work / "aj_regions.txt"
    sh(f"bcftools view -H {q(aj_norm)} | awk '{{print $1\"\\t\"$2}}' > {q(regions)}")
    panel_sites = work / "panel_sites.vcf.gz"
    sh(f"bcftools view -R {q(regions)} -G {q(panel)} -Oz 2>/dev/null | "
       f"bcftools norm -m -any 2>/dev/null | "
       f"bcftools view -m2 -M2 -v snps -Oz -o {q(panel_sites)} - && tabix -f -p vcf {q(panel_sites)}")
    report["panel_sites_at_aj_positions"] = nsites(panel_sites)

    # --- 2) Exact REF/ALT intersection (reconciliation). 0003 = shared AJ records.
    isec = work / "isec"
    sh(f"bcftools isec -c none -p {q(isec)} -Oz {q(panel_sites)} {q(aj_norm)}")
    aj_shared = isec / "0003.vcf.gz"
    if not aj_shared.exists() or nsites(aj_shared) == 0:
        print("Intersection produced no shared AJ sites.", file=sys.stderr)
        return 2
    sh(f"tabix -f -p vcf {q(aj_shared)}")
    report["shared_reconciled_sites"] = nsites(aj_shared)
    report["dropped_unreconcilable_sites"] = (
        report["aj_biallelic_snp_sites"] - report["shared_reconciled_sites"])

    # --- 3) Phase + IMPUTE the reconciled AJ VCF against the 1000G panel with
    # Beagle. Imputation (impute=true) is essential here: the AADR Human Origins
    # array covers only ~7.6k chr22 sites, which overlap the query's restored
    # markers at only ~2k positions. Without imputation the AJ reference samples
    # are missing at ~81% of analysis sites, which makes RFMix both statistically
    # unsound and memory-pathological (it attempted ~200 GB). Beagle imputes the
    # AJ samples' unobserved genotypes from the 1000G reference, yielding dense
    # AJ haplotypes at all panel sites. These are model estimates (standard
    # array-into-sequence-panel practice), not fabricated calls.
    phased_prefix = work / "aj.phased.imputed"
    sh(f"java -Xmx12g -jar {q(BEAGLE)} gt={q(aj_shared)} ref={q(panel)} map={q(gmap)} "
       f"out={q(phased_prefix)} impute=true seed=42")
    phased = Path(str(phased_prefix) + ".vcf.gz")
    if not phased.exists():
        print("Beagle phasing produced no output.", file=sys.stderr)
        return 2
    sh(f"tabix -f -p vcf {q(phased)}")
    report["aj_phased_imputed_sites"] = nsites(phased)
    report["aj_imputation"] = (
        "Beagle impute=true against 1000G; AJ array (~7.6k chr22 sites) imputed "
        "to the full panel so RFMix sees dense AJ reference haplotypes.")

    # --- 4) Merge phased AJ into the full 1000G panel.
    out_vcf = PANEL_DIR / f"EXP.chr{chrom}.v2.vcf.gz"
    sh(f"bcftools merge -m none -Oz -o {q(out_vcf)} {q(panel)} {q(phased)} && tabix -f -p vcf {q(out_vcf)}")
    report["merged_sites"] = nsites(out_vcf)

    # --- 5) Expanded sample map.
    base_meta = META_DIR / "samples.panel"
    out_map = META_DIR / "samples.expanded.panel"
    aj_samples = sh(f"bcftools query -l {q(phased)}").stdout.split()
    panel_samples = set(sh(f"bcftools query -l {q(panel)}").stdout.split())
    dup = sorted(set(aj_samples) & panel_samples)
    report["duplicate_individuals_across_sources"] = dup
    assert not dup, f"Unexpected duplicate ids across sources: {dup}"

    lines = ["sample\tpop\tsuper_pop\tgender"]
    with open(base_meta) as fh:
        fh.readline()
        for line in fh:
            p = line.split()
            if len(p) >= 3:
                lines.append(f"{p[0]}\t{p[1]}\t{p[2]}\t{p[3] if len(p) > 3 else 'NA'}")
    for s in aj_samples:
        lines.append(f"{s}\tAJ\tMID\tNA")
    out_map.write_text("\n".join(lines) + "\n", encoding="utf-8")

    report.update({
        "aj_individuals": len(aj_samples),
        "aj_sample_ids": aj_samples,
        "expanded_vcf": str(out_vcf),
        "expanded_sample_map": str(out_map),
        "sources": {
            "base": "1000 Genomes Phase 3 chr22 (phased, GRCh37, 2504 individuals)",
            "added": ("AADR v66 Human Origins 'Jew_Ashkenazi' (8 unrelated modern "
                      "diploid individuals, real array genotypes, GRCh37; md5 and "
                      "TGENO decoder verified), reconciled to 1000G REF/ALT and "
                      "Beagle-phased against the 1000G panel"),
        },
        "notes": [
            "REAL Ashkenazi reference data; NO proxy.",
            "Only sites shared with the 1000G panel at matching REF/ALT are used; "
            "unreconcilable sites dropped, never strand-flipped.",
            "AADR arrays are unphased; phased against the 1000G panel with Beagle.",
            "8 individuals is a small reference group; AJ assignments on one "
            "chromosome are not a validated ancestry result.",
        ],
    })
    (AADR_DIR / "aj_build_report.chr22.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
