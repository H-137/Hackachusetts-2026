"""Tests for PGS000057 scoring and curated-locus annotation (Step 5).

The scoring test is an ARITHMETIC FIXTURE: it verifies our weighted-sum code on
known inputs. Per the plan, this is explicitly NOT the same as independently
reproducing the published cohort result, and neither establishes clinical
validity. These tests only check code correctness and the guardrails.
"""

from __future__ import annotations

from pathlib import Path

from ancestry_explorer.annotate import annotate_all
from ancestry_explorer.conditions import CURATED_CONDITIONS
from ancestry_explorer.pgs import parse_scoring_file, score_pgs000057


def _write_scorefile(tmp: Path) -> Path:
    p = tmp / "mini.txt"
    p.write_text(
        "#pgs_id=TEST\n"
        "rsID\teffect_allele\teffect_weight\n"
        "rs1\tA\t0.10\n"   # effect allele direct
        "rs2\tT\t0.20\n"   # complement strand case
        "rs3\tC\t0.30\n"   # missing from sample
        "rs4\tG\t0.40\n",  # strand-ambiguous (sample is A/A)
        encoding="utf-8",
    )
    return p


def test_arithmetic_fixture_weighted_sum(tmp_path: Path):
    sf = _write_scorefile(tmp_path)
    observed = {
        "rs1": ("A", "G"),   # 1 copy of A -> 1 * 0.10 = 0.10 (direct)
        "rs2": ("A", "A"),   # effect T; complement of T is A -> 2 copies -> 2*0.20 = 0.40
        # rs3 absent -> missing
        "rs4": ("T", "T"),   # effect G; neither G nor C(comp) present -> ambiguous, skipped
    }
    r = score_pgs000057(sf, observed).as_dict()
    assert r["total_variants"] == 4
    assert r["scored_variants"] == 2            # rs1, rs2
    assert r["missing_variants"] == 2           # rs3 (absent) + rs4 (ambiguous)
    assert r["ambiguous_skipped"] == 1          # rs4
    assert abs(r["partial_sum_over_observed"] - 0.50) < 1e-9  # 0.10 + 0.40
    assert r["is_complete_published_score"] is False


def test_complete_score_flag(tmp_path: Path):
    sf = _write_scorefile(tmp_path)
    observed = {
        "rs1": ("A", "A"), "rs2": ("A", "T"), "rs3": ("C", "G"), "rs4": ("G", "G"),
    }
    r = score_pgs000057(sf, observed).as_dict()
    assert r["scored_variants"] == 4
    assert r["is_complete_published_score"] is True


def test_no_probability_or_percentile_in_output(tmp_path: Path):
    sf = _write_scorefile(tmp_path)
    r = score_pgs000057(sf, {"rs1": ("A", "A")}).as_dict()
    # The result must not contain any risk/percentile/probability field.
    for forbidden in ("percentile", "absolute_risk", "probability", "risk"):
        assert forbidden not in r
    assert r["provenance"]["ancestry_adjustment"] == "none — this is a standard, ancestry-free PGS"


def test_partial_sum_is_labeled_not_the_published_score(tmp_path: Path):
    sf = _write_scorefile(tmp_path)
    r = score_pgs000057(sf, {"rs1": ("A", "A")}).as_dict()
    joined = " ".join(r["limitations"]).lower()
    assert "partial sum" in joined
    assert "not the published" in joined


def test_real_scoring_file_parses_57():
    sf = Path(__file__).resolve().parents[1] / "reference/assets/pgs/PGS000057.txt.gz"
    if not sf.exists():
        import pytest
        pytest.skip("PGS000057 scoring file not downloaded")
    variants = parse_scoring_file(sf)
    assert len(variants) == 57
    assert all(v.effect_allele in {"A", "C", "G", "T"} for v in variants)


# ---- annotation assembler guardrails ----

def test_locus_shown_even_when_ancestry_mismatches():
    # Sickle cell (HBB founder context AFR) but ancestry says EUR -> still shown.
    segs = [{
        "chromosome": "11", "start_0based": 0, "end_0based_exclusive": 300000000,
        "copy_index": 1, "ancestry_label": "GBR", "assignment_status": "assigned",
    }, {
        "chromosome": "11", "start_0based": 0, "end_0based_exclusive": 300000000,
        "copy_index": 2, "ancestry_label": "TSI", "assignment_status": "assigned",
    }]
    out = annotate_all({}, {}, segs, {}, {})
    hbb = [a for a in out if a["gene"] == "HBB"]
    assert hbb, "curated HBB locus must be shown regardless of ancestry"
    # Ancestry context is attached, but the locus is present.
    assert hbb[0]["ancestry_context"]["copy1_label"] == "GBR"


def test_unmeasured_variant_not_inferred_present_from_ancestry():
    # No observed genotype for HBB; ancestry AFR must NOT imply presence.
    segs = [{
        "chromosome": "11", "start_0based": 0, "end_0based_exclusive": 300000000,
        "copy_index": 1, "ancestry_label": "YRI", "assignment_status": "assigned",
    }]
    out = annotate_all({}, {}, segs, {}, {})
    hbb = next(a for a in out if a["gene"] == "HBB")
    obs = hbb["observation"]
    assert obs["measurement_status"] in ("not_assayed", "no_call")
    assert obs["carries_clinical_allele"] is None  # never inferred
    assert any("not" in lim.lower() for lim in hbb["limitations"])


def test_indel_locus_is_not_assayed():
    # CFTR F508del is an indel; with no observation it must be not_assayed.
    out = annotate_all({}, {}, [], {}, {})
    cftr = next(a for a in out if a["gene"] == "CFTR")
    assert cftr["observation"]["measurement_status"] == "not_assayed"
    assert cftr["variant_type"] == "indel"


def test_frequency_vs_effect_note_present_on_every_locus():
    out = annotate_all({}, {}, [], {}, {})
    assert out
    for a in out:
        assert "frequency" in a["frequency_vs_effect_note"].lower()


def test_observed_carrier_counting():
    # rs334 observed as A/A (homozygous HbS, clinical allele A) -> 2 copies.
    gts = {"rs334": "A/A"}
    status = {"rs334": "observed"}
    out = annotate_all(gts, status, [], {}, {})
    hbb = next(a for a in out if a["rsid"] == "rs334")
    assert hbb["observation"]["measurement_status"] == "observed"
    assert hbb["observation"]["clinical_allele_copies"] == 2
    assert hbb["observation"]["carries_clinical_allele"] is True
