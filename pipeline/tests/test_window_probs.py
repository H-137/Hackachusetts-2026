"""Tests for the window-level marginal-probability audit tool."""

from __future__ import annotations

from pathlib import Path

from ancestry_explorer.window_probs import (
    parse_fb,
    parse_msp_segments,
    pel_detail,
    summarize_segment_windows,
)

# Minimal fb.tsv: 3 populations (AAA, PEL, CCC), 2 copies, 3 windows.
FB = (
    "#reference_panel_population:\tAAA\tPEL\tCCC\n"
    "chromosome\tphysical_position\tgenetic_position\tgenetic_marker_index"
    "\ts:::hap1:::AAA\ts:::hap1:::PEL\ts:::hap1:::CCC"
    "\ts:::hap2:::AAA\ts:::hap2:::PEL\ts:::hap2:::CCC\n"
    # pos, gpos, idx, hap1(AAA,PEL,CCC), hap2(AAA,PEL,CCC)
    "22\t100\t0.1\t0\t0.80\t0.15\t0.05\t0.10\t0.00\t0.90\n"
    "22\t200\t0.2\t1\t0.70\t0.20\t0.10\t0.05\t0.00\t0.95\n"
    "22\t300\t0.3\t2\t0.10\t0.85\t0.05\t0.20\t0.00\t0.80\n"
)

# msp.tsv: one segment covering all three windows. copy1 -> AAA(0), copy2 -> CCC(2).
MSP = (
    "#Subpopulation order/codes: AAA=0\tPEL=1\tCCC=2\n"
    "#chm\tspos\tepos\tsgpos\tegpos\tn snps\ts.0\ts.1\n"
    "22\t100\t300\t0.1\t0.3\t3\t0\t2\n"
)


def _write(tmp: Path) -> tuple[Path, Path]:
    fb = tmp / "r.fb.tsv"
    msp = tmp / "r.msp.tsv"
    fb.write_text(FB, encoding="utf-8")
    msp.write_text(MSP, encoding="utf-8")
    return fb, msp


def test_fb_parse_order_and_copies(tmp_path: Path):
    fb, _ = _write(tmp_path)
    pops, windows = parse_fb(fb)
    assert pops == ["AAA", "PEL", "CCC"]
    assert len(windows) == 3
    # copy1 at pos 100: AAA strongest (0.80); copy2: CCC strongest (0.90)
    w0 = windows[0]
    assert max(w0["copy1"], key=w0["copy1"].get) == "AAA"
    assert max(w0["copy2"], key=w0["copy2"].get) == "CCC"


def test_segment_window_summary_preserves_variation(tmp_path: Path):
    fb, msp = _write(tmp_path)
    summ = summarize_segment_windows(fb, msp)
    assert len(summ) == 1
    seg = summ[0]
    # copy1 segment label from msp index 0 = AAA.
    assert seg["copy1"]["segment_label"] == "AAA"
    # but the per-window assigned pop varies: windows 1-2 AAA, window 3 PEL.
    assert set(seg["copy1"]["distinct_window_assignments"]) == {"AAA", "PEL"}
    # copy2 is consistently CCC.
    assert seg["copy2"]["distinct_window_assignments"] == ["CCC"]
    # gap_min reflects the tightest window.
    assert seg["copy1"]["gap_min"] <= seg["copy1"]["gap_mean"]


def test_pel_detail(tmp_path: Path):
    # Make PEL the msp label on copy1 so pel_detail finds it.
    fb = tmp_path / "r.fb.tsv"
    msp = tmp_path / "r.msp.tsv"
    fb.write_text(FB, encoding="utf-8")
    msp.write_text(
        "#Subpopulation order/codes: AAA=0\tPEL=1\tCCC=2\n"
        "#chm\tspos\tepos\tsgpos\tegpos\tn snps\ts.0\ts.1\n"
        "22\t100\t300\t0.1\t0.3\t3\t1\t2\n",
        encoding="utf-8",
    )
    detail = pel_detail(fb, msp)
    assert detail["found"] is True
    assert detail["copy"] == "copy1"
    assert detail["n_windows"] == 3
    assert len(detail["window_profiles"]) == 3
    # Each profile reports PEL's own marginal.
    assert all("PEL_p" in p for p in detail["window_profiles"])


def test_msp_segment_parse(tmp_path: Path):
    _, msp = _write(tmp_path)
    segs = parse_msp_segments(msp)
    assert len(segs) == 1
    assert segs[0]["copy1_label"] == "AAA"
    assert segs[0]["copy2_label"] == "CCC"
    assert segs[0]["n_snps"] == 3
