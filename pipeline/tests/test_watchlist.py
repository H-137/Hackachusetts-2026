"""Tests for the SNPshot ancestry-informed watchlist engine (core feature)."""

from __future__ import annotations

from ancestry_explorer.catalog import CATALOG, catalog, catalog_provenance
from ancestry_explorer.watchlist import build_watchlist


def _seg(copy, chrom, start, end, label, status="assigned"):
    return {
        "chromosome": chrom, "copy_index": copy, "start_0based": start,
        "end_0based_exclusive": end, "ancestry_label": label,
        "assignment_status": status, "probabilities": None,
    }


def _variant(**kw):
    base = {
        "variant_id": "X", "condition": "C", "gene": "G",
        "inheritance": "autosomal recessive", "source_build": "GRCh37",
        "chromosome": "22", "position_1based": 1000, "ref": "A", "alt": "T",
        "hgvs": None, "rsid": None, "variant_class": "snp",
        "clinical_classification": "Pathogenic",
        "review_status": "criteria provided, multiple submitters, no conflicts",
        "citations": [], "associated_populations": [], "founder_variant": False,
        "frequency_evidence": [],
    }
    base.update(kw)
    return base


# --- catalog integrity ---

def test_catalog_excludes_vus_and_benign():
    # Accept the valid ClinVar P/LP aggregate forms; exclude VUS/benign/conflicting.
    allowed = {"Pathogenic", "Likely pathogenic", "Pathogenic/Likely pathogenic"}
    forbidden_substrings = ("uncertain", "benign", "conflicting", "vus")
    for v in CATALOG:
        assert v.clinical_classification in allowed
        low = v.clinical_classification.lower()
        assert not any(s in low for s in forbidden_substrings)


def test_catalog_includes_unassayed_variants():
    # The catalog is not restricted to array positions: BRCA/HEXA are included.
    genes = {v.gene for v in CATALOG}
    assert {"BRCA1", "BRCA2", "HEXA"} <= genes


def test_chr22_expansion_present_and_in_window():
    # Data-mined chr22 additions exist and fall in the real ancestry window.
    chr22 = [v for v in CATALOG if v.chromosome == "22"]
    ids = {v.variant_id for v in chr22}
    assert {"CHEK2_c1100delC", "UPB1_c917minus1GA", "ARSA_c542T_G",
            "SCO2_c16_17ins", "ADA2_c973minus2AG"} <= ids
    for v in chr22:
        assert 16_000_000 <= v.position_1based <= 51_300_000


def test_provenance_reports_size_and_limits():
    p = catalog_provenance()
    assert p["catalog_size"] == len(CATALOG)
    assert "Only chr22 ancestry is currently available; other loci are " \
           "ancestry_not_available by design." in p["limitations"]


# --- locus-specific per-copy lookup (the central feature) ---

def test_per_copy_locus_lookup_independent():
    segs = [
        _seg(1, "22", 0, 2000, "TSI"),
        _seg(2, "22", 0, 2000, "GBR"),
    ]
    wl = build_watchlist([_variant(chromosome="22", position_1based=1000)], segs, {"22"})
    e = wl[0]
    assert e["copy1_ancestry"]["ancestry_label"] == "TSI"
    assert e["copy2_ancestry"]["ancestry_label"] == "GBR"
    assert e["copy1_ancestry"]["available"] and e["copy2_ancestry"]["available"]


def test_unprocessed_chromosome_is_not_available_not_extrapolated():
    segs = [_seg(1, "22", 0, 2000, "TSI"), _seg(2, "22", 0, 2000, "GBR")]
    # variant on chr17, only chr22 processed.
    v = _variant(chromosome="17", position_1based=41276045, associated_populations=["AJ"])
    wl = build_watchlist([v], segs, {"22"})
    e = wl[0]
    assert e["copy1_ancestry"]["available"] is False
    assert "ancestry_not_available" in e["copy1_ancestry"]["reason"]
    assert e["population_compatibility"]["status"] == "not_available"


def test_locus_not_whole_chromosome_composition():
    # Two different segments on the same copy; the variant must get the one that
    # overlaps its position, not a chromosome-wide summary.
    segs = [
        _seg(1, "22", 0, 1000, "YRI"),
        _seg(1, "22", 1000, 5000, "TSI"),
        _seg(2, "22", 0, 5000, "GBR"),
    ]
    wl = build_watchlist([_variant(chromosome="22", position_1based=3000)], segs, {"22"})
    assert wl[0]["copy1_ancestry"]["ancestry_label"] == "TSI"  # the overlapping one


# --- population compatibility matching ---

def test_supported_match_when_label_is_associated_population():
    segs = [_seg(1, "22", 0, 2000, "YRI"), _seg(2, "22", 0, 2000, "GBR")]
    v = _variant(chromosome="22", position_1based=1000, associated_populations=["YRI"],
                 founder_variant=True)
    wl = build_watchlist([v], segs, {"22"})
    assert wl[0]["population_compatibility"]["status"] == "supported"
    assert wl[0]["priority_category"] == "ancestry_supported"


def test_within_superpopulation_is_not_treated_as_founder_match():
    # Associated AJ (EUR super-pop); locus label TSI (EUR) is NOT the AJ founder
    # group -> within_superpopulation, not supported.
    segs = [_seg(1, "22", 0, 2000, "TSI"), _seg(2, "22", 0, 2000, "GBR")]
    v = _variant(chromosome="22", position_1based=1000, associated_populations=["AJ"],
                 founder_variant=True)
    wl = build_watchlist([v], segs, {"22"})
    status = wl[0]["population_compatibility"]["status"]
    # AJ maps to no super-pop in our table -> mismatch (not a spurious match).
    assert status in ("within_superpopulation", "mismatch")
    assert status != "supported"


def test_mismatch_does_not_mean_safe():
    segs = [_seg(1, "22", 0, 2000, "CHB"), _seg(2, "22", 0, 2000, "JPT")]
    v = _variant(chromosome="22", position_1based=1000, associated_populations=["YRI"],
                 founder_variant=True)
    wl = build_watchlist([v], segs, {"22"})
    e = wl[0]
    assert e["population_compatibility"]["status"] == "mismatch"
    assert any("not" in l.lower() and ("safe" in l.lower() or "ruled out" in l.lower())
               for l in e["limitations"])


# --- observation integration & guardrails ---

def test_unassayed_without_provenance():
    segs = [_seg(1, "22", 0, 2000, "TSI"), _seg(2, "22", 0, 2000, "GBR")]
    wl = build_watchlist([_variant(chromosome="22", position_1based=1000, rsid="rsZ")],
                         segs, {"22"})
    assert wl[0]["measurement_status"] == "unassayed"
    assert wl[0]["observed_genotype"] is None


def test_observed_finding_prioritized_regardless_of_ancestry():
    segs = []  # no ancestry at all
    v = _variant(chromosome="11", position_1based=5248232, rsid="rs334",
                 variant_id="HBB", alt="A", associated_populations=["YRI"])
    prov = {"rs334": {"rsid": "rs334", "measurement_status": "observed",
                      "genotype": "A/A", "strand_conversion": "none",
                      "call_kind": "measured"}}
    wl = build_watchlist([v], segs, {"22"}, prov, {"HBB": "A"})
    e = wl[0]
    assert e["priority_category"] == "observed_finding"
    assert e["observed_genotype"] == "A/A"


def test_observed_homref_is_not_a_finding():
    # rs334 T/T, clinical allele A -> 0 copies -> not observed_finding.
    segs = []
    v = _variant(chromosome="11", position_1based=5248232, rsid="rs334",
                 variant_id="HBB", alt="A", associated_populations=["YRI"])
    prov = {"rs334": {"rsid": "rs334", "measurement_status": "observed",
                      "genotype": "T/T", "strand_conversion": "none",
                      "call_kind": "measured"}}
    wl = build_watchlist([v], segs, {"22"}, prov, {"HBB": "A"})
    assert wl[0]["priority_category"] != "observed_finding"


def test_no_phase_attribution():
    segs = [_seg(1, "22", 0, 2000, "TSI"), _seg(2, "22", 0, 2000, "GBR")]
    v = _variant(chromosome="22", position_1based=1000, rsid="rsP", variant_id="P", alt="T")
    prov = {"rsP": {"rsid": "rsP", "measurement_status": "observed",
                    "genotype": "A/T", "strand_conversion": "none", "call_kind": "measured"}}
    wl = build_watchlist([v], segs, {"22"}, prov, {"P": "T"})
    assert wl[0]["phase_established"] is False


def test_no_risk_percentage_fields():
    segs = [_seg(1, "22", 0, 2000, "TSI"), _seg(2, "22", 0, 2000, "GBR")]
    wl = build_watchlist([_variant(chromosome="22", position_1based=1000)], segs, {"22"})
    e = wl[0]
    for forbidden in ("risk_percent", "disease_probability", "percentile", "absolute_risk"):
        assert forbidden not in e


def test_real_catalog_builds_with_chr22_only():
    # Smoke test: the real catalog builds with only chr22 processed.
    segs = [_seg(1, "22", 0, 60000000, "TSI"), _seg(2, "22", 0, 60000000, "GBR")]
    wl = build_watchlist(catalog(), segs, {"22"})
    assert len(wl) == len(CATALOG)
    arsa = next(e for e in wl if e["gene"] == "ARSA")
    assert arsa["copy1_ancestry"]["available"] is True  # chr22 locus resolved
