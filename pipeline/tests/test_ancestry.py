"""Tests for Step 4 local ancestry inference (RFMix wrapper + parsing).

The RFMix binary and full panels are not available in CI, so these tests focus
on the deterministic pieces: genetic-map conversion, sample-map construction,
and parsing a synthetic .msp.tsv into normalized AncestrySegment records
(coordinate conversion, copy indexing, subpop labels, unknown handling).

An end-to-end RFMix run is exercised manually and documented in
docs/step-04-ancestry.md. The workflow uses the 26 fine-grain 1000 Genomes
reference populations ("pop" level); label order is read from RFMix output.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from ancestry_explorer.ancestry import (
    build_rfmix_genetic_map,
    build_sample_map,
    parse_msp_to_segments,
)


def test_genetic_map_conversion(tmp_path: Path):
    # Beagle PLINK format: chrom . cM bp  ->  RFMix: chrom bp cM
    plink = tmp_path / "plink.chr22.GRCh37.map"
    plink.write_text(
        "22\t.\t0.000000\t16051347\n22\t.\t0.010291\t16052618\n", encoding="utf-8"
    )
    out = build_rfmix_genetic_map(plink, tmp_path / "rfmix.map")
    rows = [ln.split("\t") for ln in out.read_text().splitlines() if ln]
    assert rows[0] == ["22", "16051347", "0.000000"]
    assert rows[1] == ["22", "16052618", "0.010291"]


def test_sample_map_restricted_to_vcf(tmp_path: Path, monkeypatch):
    # Stub bcftools query -l to return a fixed sample list.
    panel = tmp_path / "samples.panel"
    panel.write_text(
        "sample\tpop\tsuper_pop\tgender\n"
        "HG1\tGBR\tEUR\tmale\n"
        "HG2\tYRI\tAFR\tfemale\n"
        "HG3\tCHB\tEAS\tmale\n",
        encoding="utf-8",
    )

    import ancestry_explorer.ancestry as anc

    class _CP:
        stdout = "HG1\nHG3\n"  # HG2 not in the VCF

    monkeypatch.setattr(anc, "_run", lambda *a, **k: _CP())
    # Default level is now "pop" (26 sub-populations), so labels are the fine
    # pop codes (GBR, CHB), not super-populations.
    out, n = build_sample_map(panel, tmp_path / "ref.vcf.gz", tmp_path / "map.tsv")
    lines = out.read_text().splitlines()
    assert n == 2
    assert "HG1\tGBR" in lines
    assert "HG3\tCHB" in lines
    assert not any("HG2" in ln for ln in lines)


def test_sample_map_superpop_level_still_available(tmp_path: Path, monkeypatch):
    panel = tmp_path / "samples.panel"
    panel.write_text(
        "sample\tpop\tsuper_pop\tgender\nHG1\tGBR\tEUR\tmale\n", encoding="utf-8"
    )
    import ancestry_explorer.ancestry as anc

    class _CP:
        stdout = "HG1\n"

    monkeypatch.setattr(anc, "_run", lambda *a, **k: _CP())
    out, n = build_sample_map(panel, tmp_path / "ref.vcf.gz", tmp_path / "m.tsv",
                              level="super_pop")
    assert "HG1\tEUR" in out.read_text().splitlines()


# Sub-population (pop-level) header, as RFMix emits with the 26-population map.
# Label order and names come from this metadata line, not from any hardcoded set.
MSP = """#Subpopulation order/codes: CEU=0\tGBR=1\tYRI=2\tCHB=3\tGIH=4
#chm\tspos\tepos\tsgpos\tegpos\tn snps\tS.0\tS.1
22\t20000001\t20500000\t1.0\t2.0\t30\t1\t2
22\t20500001\t21000000\t2.0\t3.0\t25\t1\t1
"""


def test_parse_msp_to_segments(tmp_path: Path):
    msp = tmp_path / "r.msp.tsv"
    msp.write_text(MSP, encoding="utf-8")
    segs, summary = parse_msp_to_segments(msp, "S", [], "panel")

    assert summary.windows == 2
    assert summary.segments_emitted == 4
    assert summary.subpop_order == ["CEU", "GBR", "YRI", "CHB", "GIH"]

    # First window, copy 1 = index 1 (GBR), copy 2 = index 2 (YRI).
    w1 = [s for s in segs if s["start_0based"] == 20000000]
    c1 = next(s for s in w1 if s["copy_index"] == 1)
    c2 = next(s for s in w1 if s["copy_index"] == 2)
    assert c1["ancestry_label"] == "GBR"
    assert c2["ancestry_label"] == "YRI"
    # 1-based inclusive [20000001,20500000] -> 0-based half-open [20000000,20500000)
    assert c1["start_0based"] == 20000000
    assert c1["end_0based_exclusive"] == 20500000
    assert c1["assignment_status"] == "assigned"


def test_parse_msp_unknown_token(tmp_path: Path):
    msp = tmp_path / "r.msp.tsv"
    msp.write_text(
        "#Subpopulation order/codes: AFR=0\tEUR=1\n"
        "#chm\tspos\tepos\tsgpos\tegpos\tn snps\tS.0\tS.1\n"
        "22\t20000001\t20500000\t1.0\t2.0\t30\t.\t1\n",
        encoding="utf-8",
    )
    segs, summary = parse_msp_to_segments(msp, "S", [], "panel")
    labels = {s["copy_index"]: s["ancestry_label"] for s in segs}
    assert labels[1] == "unknown"
    assert labels[2] == "EUR"
    assert summary.unknown == 1


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
