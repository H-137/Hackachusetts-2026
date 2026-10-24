"""Tests for the family-aware Mendelian-consistency layer (Step 3).

Pure logic, no external tools. Verifies Mendelian checks, resolvable trios
recover expected parental inheritance, and genuinely ambiguous sites remain
unresolved (the Step 3 "done when" criterion).
"""

from __future__ import annotations

from ancestry_explorer.family import (
    ParentalOrigin,
    mendelian_consistent,
    resolve_parental_origin,
    summarize_trio,
)


def test_consistent_trio():
    # child A/G, mother A/A, father G/G -> A from mother, G from father.
    assert mendelian_consistent(("A", "G"), ("A", "A"), ("G", "G"))


def test_mendelian_violation_detected():
    # child A/A but neither parent carries A.
    assert not mendelian_consistent(("A", "A"), ("G", "G"), ("C", "T"))


def test_resolvable_trio_recovers_parental_origin():
    # child A/G, mother A/A, father G/G: unambiguous.
    res = resolve_parental_origin(("A", "G"), ("A", "A"), ("G", "G"))
    assert res.mendelian_consistent
    assert res.origin is ParentalOrigin.MOTHER_FATHER
    assert res.ordered == ("A", "G")  # (maternal, paternal)


def test_resolvable_trio_other_orientation():
    # child G/A order, mother A/A, father G/G: maternal=A, paternal=G -> reorder.
    res = resolve_parental_origin(("G", "A"), ("A", "A"), ("G", "G"))
    assert res.origin is ParentalOrigin.FATHER_MOTHER
    assert res.ordered == ("A", "G")


def test_ambiguous_trio_stays_unresolved():
    # Everyone heterozygous A/G: parental origin cannot be determined.
    res = resolve_parental_origin(("A", "G"), ("A", "G"), ("A", "G"))
    assert res.mendelian_consistent
    assert res.origin is ParentalOrigin.UNRESOLVED
    assert res.reason == "ambiguous_both_assignments"


def test_mendelian_error_is_unresolved_and_flagged():
    res = resolve_parental_origin(("A", "A"), ("G", "G"), ("C", "T"))
    assert not res.mendelian_consistent
    assert res.origin is ParentalOrigin.UNRESOLVED


def test_incomplete_trio_is_unresolved_but_checked():
    # One parent only: consistency checkable, origin not resolvable.
    res = resolve_parental_origin(("A", "G"), ("A", "A"), None)
    assert res.mendelian_consistent
    assert res.origin is ParentalOrigin.UNRESOLVED
    assert res.reason == "incomplete_trio"


def test_single_parent_violation():
    # child C/C, only parent A/A -> inconsistent.
    assert not mendelian_consistent(("C", "C"), ("A", "A"), None)


def test_summary_counts():
    sites = [
        (("A", "G"), ("A", "A"), ("G", "G")),  # resolved
        (("A", "G"), ("A", "G"), ("A", "G")),  # unresolved (ambiguous)
        (("A", "A"), ("G", "G"), ("C", "T")),  # mendelian error
    ]
    s = summarize_trio(sites)
    assert s.total_sites == 3
    assert s.resolved == 1
    assert s.unresolved == 2
    assert s.mendelian_errors == 1
