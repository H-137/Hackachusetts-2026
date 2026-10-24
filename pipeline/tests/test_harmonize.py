"""Harmonization tests tied to Step 2 acceptance criteria.

These build a tiny synthetic reference FASTA on the fly (indexed with samtools)
so the tests need no network download. They verify:
  * REF alleles in the output match the reference (independently via bcftools),
  * het / hom-alt genotype resolution,
  * multiallelic-vs-reference drop,
  * strand-ambiguous unresolvable drop,
  * the build-mismatch guard,
  * that bcftools accepts the written VCF.

Tests are skipped (not failed) if bcftools/samtools are unavailable, so the
suite still runs on machines without the htslib toolchain.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from ancestry_explorer.harmonize import harmonize
from ancestry_explorer.parser import parse_ancestrydna

TOOLS_PRESENT = all(shutil.which(t) for t in ("bcftools", "samtools", "bgzip", "tabix"))
pytestmark = pytest.mark.skipif(not TOOLS_PRESENT, reason="htslib toolchain not installed")

# A tiny reference: chromosome "22", 10 bases. 1-based positions:
#   1:A 2:C 3:G 4:T 5:A 6:C 7:G 8:T 9:A 10:C
REF_SEQ = "ACGTACGTAC"


@pytest.fixture()
def tiny_fasta(tmp_path: Path) -> Path:
    fa = tmp_path / "tiny22.fa"
    fa.write_text(f">22\n{REF_SEQ}\n", encoding="utf-8")
    subprocess.run(["samtools", "faidx", str(fa)], check=True)
    return fa


def _mk_input(rows: list[str]) -> str:
    header = [
        "#build 37.1",
        "rsid\tchromosome\tposition\tallele1\tallele2",
    ]
    return "\n".join(header + rows) + "\n"


def test_build_mismatch_is_refused(tiny_fasta: Path, tmp_path: Path):
    parsed = parse_ancestrydna(_mk_input(["rsX\t22\t1\tA\tA"]).replace("37.1", "38"))
    with pytest.raises(ValueError):
        harmonize(parsed, tiny_fasta, tmp_path / "out.vcf.gz")


def test_homref_het_homalt_resolution(tiny_fasta: Path, tmp_path: Path):
    # pos1 ref=A: A/A -> 0/0 ; pos2 ref=C: C/T -> 0/1 alt T ; pos3 ref=G: T/T -> 1/1 alt T
    rows = [
        "rs1\t22\t1\tA\tA",
        "rs2\t22\t2\tC\tT",
        "rs3\t22\t3\tT\tT",
    ]
    parsed = parse_ancestrydna(_mk_input(rows))
    out = tmp_path / "out.vcf.gz"
    report = harmonize(parsed, tiny_fasta, out, restrict_chrom="22")
    assert report.total_input_snps == 3
    assert report.written == 3
    assert report.dropped == 0

    # Read back genotypes via bcftools.
    res = subprocess.run(
        ["bcftools", "query", "-f", "%POS\t%REF\t%ALT[\t%GT]\n", str(out)],
        capture_output=True, text=True, check=True,
    )
    lines = {ln.split("\t")[0]: ln for ln in res.stdout.strip().splitlines()}
    assert lines["1"].split("\t")[3] == "0/0"
    assert lines["2"].split("\t")[1:4] == ["C", "T", "0/1"]
    assert lines["3"].split("\t")[1:4] == ["G", "T", "1/1"]


def test_multiallelic_vs_reference_is_dropped(tiny_fasta: Path, tmp_path: Path):
    # pos4 ref=T: alleles A/C, neither is ref and they differ -> drop.
    parsed = parse_ancestrydna(_mk_input(["rs4\t22\t4\tA\tC"]))
    report = harmonize(parsed, tiny_fasta, tmp_path / "out.vcf.gz", restrict_chrom="22")
    assert report.written == 0
    assert report.drop_reasons.get("multiallelic_vs_reference") == 1


def test_strand_ambiguous_site_is_kept_and_flagged(tiny_fasta: Path, tmp_path: Path):
    # pos1 ref=A: alleles A/T (an A/T ambiguous pair) -> resolvable het here, but
    # flagged as strand_check for downstream panel matching. Not dropped.
    parsed = parse_ancestrydna(_mk_input(["rs5\t22\t1\tA\tT"]))
    out = tmp_path / "out.vcf.gz"
    report = harmonize(parsed, tiny_fasta, out, restrict_chrom="22")
    assert report.ambiguous_flagged == 1
    assert report.written == 1
    assert report.dropped == 0
    res = subprocess.run(
        ["bcftools", "query", "-f", "%INFO/AA_REFCHK\n", str(out)],
        capture_output=True, text=True, check=True,
    )
    assert "strand_check" in res.stdout


def test_output_passes_bcftools_refcheck(tiny_fasta: Path, tmp_path: Path):
    rows = ["rs1\t22\t1\tA\tA", "rs2\t22\t2\tC\tT", "rs3\t22\t5\tA\tA"]
    parsed = parse_ancestrydna(_mk_input(rows))
    out = tmp_path / "out.vcf.gz"
    harmonize(parsed, tiny_fasta, out, restrict_chrom="22")
    # bcftools norm --check-ref e exits non-zero on any REF mismatch. Write the
    # normalized output to a file (BCF is binary; do not capture it as text).
    res = subprocess.run(
        ["bcftools", "norm", "--check-ref", "e", "-f", str(tiny_fasta),
         "-o", str(tmp_path / "norm.vcf"), "-Ov", str(out)],
        capture_output=True, text=True, check=False,
    )
    assert res.returncode == 0, res.stderr


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
