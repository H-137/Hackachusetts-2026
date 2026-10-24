"""Tests for span-based composition and run comparison (chr22 audit)."""

from __future__ import annotations

from ancestry_explorer.compare_runs import RunDescriptor, _bp_agreement
from ancestry_explorer.composition import compose_by_span


def _seg(copy, start, end, label, status="assigned"):
    return {
        "copy_index": copy, "start_0based": start, "end_0based_exclusive": end,
        "ancestry_label": label, "assignment_status": status, "chromosome": "22",
    }


def test_composition_reconciles_to_100():
    # copy1: 0-100 GBR, 100-200 TSI ; copy2: 0-200 GBR
    segs = [
        _seg(1, 0, 100, "GBR"),
        _seg(1, 100, 200, "TSI"),
        _seg(2, 0, 200, "GBR"),
    ]
    r = compose_by_span(segs, "22").as_dict()
    # Total assigned span = 100+100+200 = 400. GBR=300, TSI=100.
    assert r["assigned_bp"] == 400
    assert r["by_label"]["GBR"]["bp"] == 300
    assert r["by_label"]["TSI"]["bp"] == 100
    assert r["reconciles"] is True
    s = sum(v["fraction_of_assigned"] for v in r["by_label"].values())
    assert abs(s - 1.0) < 1e-9


def test_superpop_rollup():
    segs = [_seg(1, 0, 100, "GBR"), _seg(2, 0, 100, "YRI")]
    r = compose_by_span(segs, "22").as_dict()
    assert r["by_superpop"]["EUR"]["bp"] == 100
    assert r["by_superpop"]["AFR"]["bp"] == 100
    assert abs(r["by_superpop"]["EUR"]["fraction_of_assigned"] - 0.5) < 1e-9


def test_uncertain_and_unknown_tracked_separately():
    segs = [
        _seg(1, 0, 100, "GBR", "assigned"),
        _seg(1, 100, 200, "TSI", "uncertain"),
        _seg(2, 0, 200, "unknown", "unknown"),
    ]
    r = compose_by_span(segs, "22").as_dict()
    assert r["assigned_bp"] == 100
    assert r["uncertain_bp"] == 100
    assert r["unknown_bp"] == 200
    # Only the assigned span enters label composition.
    assert list(r["by_label"].keys()) == ["GBR"]


def test_bp_agreement_measures_stability():
    a = [_seg(1, 0, 200, "GBR"), _seg(2, 0, 200, "TSI")]
    b = [_seg(1, 0, 200, "GBR"), _seg(2, 0, 200, "IBS")]  # copy2 differs
    agree, compared = _bp_agreement(a, b)
    assert compared == 400
    assert agree == 200  # copy1 agrees (200), copy2 differs (0)


def test_run_descriptor_shape():
    d = RunDescriptor(name="baseline", segments=[], msp_path="x", usable_markers=4999)
    assert d.usable_markers == 4999
    assert d.runtime_seconds is None
