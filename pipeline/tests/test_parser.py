"""Meaningful parser tests tied to Step 1 acceptance criteria.

These verify the behaviors in HACKATHON_PROJECT_PLAN.md Section 9 "Done when":
the supplied format parses deterministically, positions convert correctly,
metadata is retained, and inadequate or invalid input yields clear errors.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from ancestry_explorer.parser import parse_ancestrydna

DEMO = Path(__file__).resolve().parents[2] / "data" / "demo"


def read(name: str) -> str:
    return (DEMO / name).read_text(encoding="utf-8")


def read_bytes_as_text(name: str) -> str:
    # Mirror how a browser/file reader would decode UTF-8, preserving a BOM.
    return (DEMO / name).read_bytes().decode("utf-8")


def test_four_row_example_parses_but_is_insufficient():
    """Rule #9: the four-row example parses but must not be analyzable."""
    result = parse_ancestrydna(read("parser_example_four_rows.txt"))
    assert result.quality_summary.total_records == 4
    assert result.quality_summary.autosomal_records == 4
    assert result.quality_summary.error_count == 0
    assert result.quality_summary.sufficient_for_inference is False


def test_metadata_is_retained():
    """Rule #1: array/converter versions, build, strand are parsed, not guessed."""
    result = parse_ancestrydna(read("parser_example_four_rows.txt"))
    m = result.metadata
    assert m.array_version == "V2.0"
    assert m.converter_version == "V1.0"
    assert m.declared_build == "37.1"
    assert m.normalized_build == "GRCh37"
    assert m.strand == "+"
    assert "genealogical" in m.usage_notice.lower()
    assert m.generated_at == "10/08/2026 12:30:57 UTC"


def test_position_is_converted_1based_to_0based():
    """Section 4: 1-based source positions convert to 0-based internal."""
    result = parse_ancestrydna(read("parser_example_four_rows.txt"))
    first = result.records[0]
    assert first.position_1based == 752721
    assert first.position_0based == 752720


def test_no_calls_are_counted_not_treated_as_reference():
    result = parse_ancestrydna(read("no_calls.txt"))
    q = result.quality_summary
    # Three rows contain a "0" token.
    assert q.no_call_count == 3
    # Two clean SNP rows remain analysis-ready.
    assert q.autosomal_records == 2
    kinds = [r.record_kind for r in result.records]
    assert kinds.count("no_call") == 3


def test_indels_reported_unsupported_not_coerced():
    result = parse_ancestrydna(read("indels.txt"))
    q = result.quality_summary
    assert q.unsupported_indel_count == 3
    assert q.autosomal_records == 2
    codes = {e.code for e in result.errors}
    assert "unsupported_indel" in codes


def test_exact_and_conflicting_duplicates():
    """Rule #6: collapse exact duplicates; flag conflicting ones."""
    result = parse_ancestrydna(read("conflicting_duplicates.txt"))
    q = result.quality_summary
    assert q.duplicate_exact_count == 1
    assert q.duplicate_conflicting_count == 1
    kinds = [r.record_kind for r in result.records]
    assert "duplicate_exact" in kinds
    assert "duplicate_conflicting" in kinds


def test_unsupported_chromosomes_counted_with_labels():
    """Rule #4: non-autosomal records excluded and counted by human label."""
    result = parse_ancestrydna(read("unsupported_chromosomes.txt"))
    excluded = result.quality_summary.excluded_by_chromosome
    assert excluded == {"X": 1, "Y": 1, "XY/PAR": 1, "MT": 1}
    # The two autosomal rows are analysis-ready.
    assert result.quality_summary.autosomal_records == 2


def test_malformed_records_yield_clear_errors():
    result = parse_ancestrydna(read("malformed_records.txt"))
    codes = [e.code for e in result.errors]
    assert "non_integer_position" in codes
    assert "bad_column_count" in codes
    assert "non_positive_position" in codes
    assert "unexpected_allele_token" in codes
    # No allele value should leak into any message.
    for e in result.errors:
        assert "Z" not in e.message


def test_mixed_line_endings_and_bom():
    """Rule #2: support CRLF/LF and an optional UTF-8 BOM."""
    result = parse_ancestrydna(read_bytes_as_text("mixed_line_endings.txt"))
    assert result.quality_summary.total_records == 4
    assert result.quality_summary.error_count == 0
    assert result.metadata.array_version == "V2.0"


def test_large_valid_fixture_is_sufficient():
    result = parse_ancestrydna(read("synthetic_valid.txt"))
    assert result.quality_summary.sufficient_for_inference is True
    assert result.quality_summary.autosomal_records >= 10_000


def test_parsing_is_deterministic():
    text = read("synthetic_valid.txt")
    a = parse_ancestrydna(text)
    b = parse_ancestrydna(text)
    assert a.quality_summary == b.quality_summary
    assert len(a.records) == len(b.records)


def test_missing_header_is_reported():
    text = "#only a comment\nrs1\t1\t100\tA\tG\n"
    result = parse_ancestrydna(text)
    # First non-comment line is treated as the (invalid) header.
    assert any(e.code == "bad_header" for e in result.errors)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
