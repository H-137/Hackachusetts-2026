"""Phasing tests (Step 3).

These run Beagle against a tiny synthetic panel and sample, so they are skipped
(not failed) when the Beagle jar or htslib toolchain is unavailable. They verify
that phasing produces phased genotypes (| separator) and preserves observed
allele counts.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from ancestry_explorer.phasing import phase_chromosome

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
BEAGLE = PIPELINE_ROOT / "reference/assets/tools/beagle.27Feb25.75f.jar"
CONFORM = PIPELINE_ROOT / "reference/assets/tools/conform-gt.24May16.cee.jar"
MAP = PIPELINE_ROOT / "reference/assets/genetic_maps/plink.chr22.GRCh37.map"

TOOLS = all(shutil.which(t) for t in ("bcftools", "tabix")) and shutil.which("java")
ASSETS = BEAGLE.exists() and MAP.exists()

pytestmark = pytest.mark.skipif(
    not (TOOLS and ASSETS),
    reason="Beagle jar / genetic map / htslib not available (run setup --mode phasing)",
)

# A small synthetic panel on chr22 with several biallelic SNPs and enough
# haplotype diversity for Beagle to phase against.
PANEL_POS = [20010730, 20012286, 20024174, 20046687, 20081852, 20098359]


def _write_vcf(path: Path, samples: list[str], rows: list[str]) -> None:
    header = [
        "##fileformat=VCFv4.2",
        "##FORMAT=<ID=GT,Number=1,Type=String,Description=\"Genotype\">",
        "##contig=<ID=22>",
        "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t" + "\t".join(samples),
    ]
    plain = path.with_suffix("")
    plain.write_text("\n".join(header + rows) + "\n", encoding="utf-8")
    subprocess.run(["bgzip", "-f", str(plain)], check=True)
    subprocess.run(["tabix", "-f", "-p", "vcf", str(path)], check=True)


@pytest.fixture()
def synthetic_panel(tmp_path: Path) -> Path:
    # 4 reference samples (8 haplotypes) with varied genotypes.
    samples = [f"ref{i}" for i in range(4)]
    gts = [
        ["0|0", "0|1", "1|1", "0|1"],
        ["0|1", "0|0", "0|1", "1|1"],
        ["1|1", "0|1", "0|0", "0|1"],
        ["0|1", "1|1", "0|1", "0|0"],
        ["0|0", "0|1", "1|1", "0|1"],
        ["0|1", "0|0", "0|1", "1|1"],
    ]
    rows = []
    for pos, g in zip(PANEL_POS, gts):
        rows.append(f"22\t{pos}\t.\tA\tG\t.\tPASS\t.\tGT\t" + "\t".join(g))
    panel = tmp_path / "panel.vcf.gz"
    _write_vcf(panel, samples, rows)
    return panel


@pytest.fixture()
def synthetic_sample(tmp_path: Path) -> Path:
    # Unphased target with a mix including a hom-ref ALT='.' site to be filtered.
    rows = [
        "22\t20010730\trsA\tA\tG\t.\tPASS\t.\tGT\t1/1",
        "22\t20012286\trsB\tA\tG\t.\tPASS\t.\tGT\t0/1",
        "22\t20024174\trsC\tA\tG\t.\tPASS\t.\tGT\t0/1",
        "22\t20046687\trsD\tA\t.\t.\tPASS\t.\tGT\t0/0",  # hom-ref, filtered out
        "22\t20081852\trsE\tA\tG\t.\tPASS\t.\tGT\t1/1",
    ]
    sample = tmp_path / "sample.vcf.gz"
    _write_vcf(sample, ["proband"], rows)
    return sample


def test_phasing_produces_phased_allele_preserving_output(
    synthetic_panel: Path, synthetic_sample: Path, tmp_path: Path
):
    res = phase_chromosome(
        sample_vcf_gz=synthetic_sample,
        panel_vcf_gz=synthetic_panel,
        genetic_map=MAP,
        chromosome="22",
        out_prefix=tmp_path / "phased",
        beagle_jar=BEAGLE,
        conform_gt_jar=CONFORM,
    )
    assert res.input_markers == 5
    assert res.phasable_markers == 4  # hom-ref ALT='.' dropped
    assert res.phased_markers >= 3
    assert res.allele_counts_preserved is True

    # Output genotypes must be phased (| separator).
    out = subprocess.run(
        ["bcftools", "query", "-f", "[%GT]\n", res.phased_vcf],
        capture_output=True, text=True, check=True,
    )
    gts = [g for g in out.stdout.split() if g]
    assert gts, "no genotypes in phased output"
    assert all("|" in g for g in gts)
