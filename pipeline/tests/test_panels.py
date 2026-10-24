"""Tests for the Step 7 reference-panel registry and panel-aware behavior."""

from __future__ import annotations

from ancestry_explorer.composition import compose_by_span
from ancestry_explorer.panels import FALLBACK_SUPERPOP, get_panel, load_registry
from ancestry_explorer.watchlist import _compatibility, build_watchlist, CopyAncestry


def test_registry_loads_baseline_26_from_data():
    reg = load_registry()
    assert "1kg_phase3_26pop" in reg
    p = reg["1kg_phase3_26pop"]
    # Population list is READ FROM the sample map, not hardcoded in code.
    assert len(p.populations()) == 26
    assert "AJ_PROXY" not in p.populations()
    # Super-pop rollup is complete for the baseline (no OTHER fallbacks).
    assert all(v != "OTHER" for v in p.superpop_map().values())


def test_expanded_panel_adds_real_aj_population():
    p = get_panel("1kg_phase3_plus_aj_v2")
    pops = p.populations()
    # The real Ashkenazi group is present; the old proxy label is gone.
    assert "AJ" in pops
    assert "AJ_PROXY" not in pops
    assert len(pops) == 27
    # AJ rolls up to MID (not EUR), so it stays distinguishable.
    assert p.superpop_for("AJ") == "MID"


def test_fallback_superpop_includes_aj():
    # AJ (the real code) must roll up under MID, not silently OTHER.
    assert FALLBACK_SUPERPOP.get("AJ") == "MID"


def test_composition_uses_supplied_superpop_map():
    segs = [
        {"copy_index": 1, "start_0based": 0, "end_0based_exclusive": 100,
         "ancestry_label": "AJ", "assignment_status": "assigned", "chromosome": "22"},
    ]
    # With the panel map, AJ -> MID; without it, it would be OTHER.
    sp_map = get_panel("1kg_phase3_plus_aj_v2").superpop_map()
    r = compose_by_span(segs, "22", superpop_map=sp_map).as_dict()
    assert r["by_superpop"].get("MID", {}).get("bp") == 100
    assert "OTHER" not in r["by_superpop"]

    # A label the fallback table does NOT know rolls up to OTHER and is surfaced.
    segs_unknown = [dict(segs[0], ancestry_label="ZZZ_UNKNOWN_POP")]
    r2 = compose_by_span(segs_unknown, "22").as_dict()
    assert "OTHER" in r2["by_superpop"]
    assert any("OTHER" in n for n in r2["notes"])


def _copy(label):
    return CopyAncestry(copy_index=1, available=True, ancestry_label=label,
                        assignment_status="assigned",
                        segment_start_0based=0, segment_end_0based_exclusive=100)


def test_aj_association_is_unresolved_not_mismatch_without_aj_group():
    # An AJ-associated variant, local ancestry is a European sub-pop, and the
    # BASELINE panel has NO group for AJ (nor its super-pop): must be
    # ancestry_unresolved, not mismatch.
    panel_pops = set(get_panel("1kg_phase3_26pop").populations())  # no AJ, no MID
    sp = get_panel("1kg_phase3_26pop").superpop_map()
    compat = _compatibility(["AJ"], _copy("CEU"), _copy("TSI"),
                            superpop=sp, panel_populations=panel_pops)
    assert compat.status == "ancestry_unresolved"


def test_aj_association_supported_when_real_aj_locus_in_expanded_panel():
    # Expanded panel HAS the real AJ group. An AJ-associated variant whose locus
    # ancestry is AJ on a copy must be 'supported' (the gap the panel closes).
    panel = get_panel("1kg_phase3_plus_aj_v2")
    compat = _compatibility(["AJ"], _copy("AJ"), _copy("CEU"),
                            superpop=panel.superpop_map(),
                            panel_populations=set(panel.populations()))
    assert compat.status == "supported"


def test_supported_requires_exact_population_match():
    panel = get_panel("1kg_phase3_plus_aj_v2")
    # Locus label AJ matches an AJ association exactly -> supported.
    compat = _compatibility(["AJ"], _copy("AJ"), _copy("CEU"),
                            superpop=panel.superpop_map(),
                            panel_populations=set(panel.populations()))
    assert compat.status == "supported"


def test_build_watchlist_threads_panel_populations():
    panel = get_panel("1kg_phase3_26pop")
    seg = {"copy_index": 1, "start_0based": 0, "end_0based_exclusive": 1_000_000,
           "ancestry_label": "CEU", "assignment_status": "assigned", "chromosome": "22"}
    seg2 = dict(seg, copy_index=2, ancestry_label="TSI")
    variant = {
        "variant_id": "V_AJ", "condition": "X", "gene": "G", "inheritance": "AR",
        "chromosome": "22", "position_1based": 500_000, "source_build": "GRCh37",
        "hgvs": None, "rsid": None, "clinical_classification": "Pathogenic",
        "review_status": "criteria provided, single submitter", "citations": [],
        "associated_populations": ["AJ"], "founder_variant": True,
        "frequency_evidence": [],
    }
    wl = build_watchlist([variant], [seg, seg2], {"22"},
                         panel_superpop_map=panel.superpop_map(),
                         panel_populations=set(panel.populations()))
    assert wl[0]["priority_category"] == "ancestry_unresolved"
