"""Tests for raw-row provenance lookup of curated variants (Step 5)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ancestry_explorer.raw_lookup import lookup_raw_rows


@dataclass
class V:
    rsid: str
    chromosome: str
    position_1based: int
    clinical_allele: str
    variant_type: str
    expected_build: str = "GRCh37"


RAW = (
    "#AncestryDNA raw data download\n"
    "#human reference build 37.1 coordinates on the forward (+) strand.\n"
    "rsid\tchromosome\tposition\tallele1\tallele2\n"
    "rsSNP\t11\t5248232\tT\tT\n"       # observed SNP, hom T
    "rsCOMP\t6\t26093141\tG\tG\n"      # observed; clinical allele A (complement of... T? here test direct absence)
    "rsNOCALL\t1\t100\t0\t0\n"         # no-call
    "rsINDEL\t7\t117199646\tI\tI\n"    # indel placeholder
    # rsABSENT intentionally not present
)


def _write(tmp: Path) -> Path:
    p = tmp / "raw.txt"
    p.write_text(RAW, encoding="utf-8")
    return p


def test_metadata_build_and_strand(tmp_path: Path):
    raw = _write(tmp_path)
    prov = lookup_raw_rows(raw, [V("rsSNP", "11", 5248232, "T", "snp")])
    p = prov["rsSNP"]
    assert p.genome_build == "GRCh37"
    assert p.declared_strand == "+"
    assert p.build_matches_expected is True


def test_observed_snp_row(tmp_path: Path):
    raw = _write(tmp_path)
    prov = lookup_raw_rows(raw, [V("rsSNP", "11", 5248232, "T", "snp")])
    p = prov["rsSNP"]
    assert p.found is True
    assert p.measurement_status == "observed"
    assert p.genotype == "T/T"
    assert p.raw_allele1 == "T" and p.raw_allele2 == "T"
    assert p.position_matches_expected is True
    assert p.call_kind == "measured"


def test_no_spurious_complement_flip(tmp_path: Path):
    # clinical allele C, reported G/G on the declared + strand. Even though C is
    # the complement of G, we must NOT flip: C is simply absent (0 copies). This
    # is the rs334 trap guard.
    raw = _write(tmp_path)
    prov = lookup_raw_rows(raw, [V("rsCOMP", "6", 26093141, "C", "snp")])
    p = prov["rsCOMP"]
    assert p.measurement_status == "observed"
    assert p.strand_conversion == "none"
    assert any("absent" in n.lower() for n in p.notes)


def test_no_call_row(tmp_path: Path):
    raw = _write(tmp_path)
    prov = lookup_raw_rows(raw, [V("rsNOCALL", "1", 100, "A", "snp")])
    assert prov["rsNOCALL"].measurement_status == "no_call"


def test_indel_is_uninterpretable_not_absent(tmp_path: Path):
    raw = _write(tmp_path)
    prov = lookup_raw_rows(raw, [V("rsINDEL", "7", 117199646, "delCTT", "indel")])
    p = prov["rsINDEL"]
    assert p.found is True  # the site IS on the array
    assert p.measurement_status == "indel_uninterpretable"
    assert p.raw_allele1 == "I"


def test_absent_rsid_is_not_observed(tmp_path: Path):
    raw = _write(tmp_path)
    prov = lookup_raw_rows(raw, [V("rsABSENT", "9", 999, "A", "snp")])
    p = prov["rsABSENT"]
    assert p.found is False
    assert p.measurement_status == "not_observed"
    assert any("hom" in n.lower() or "absence" in n.lower() for n in p.notes)


def test_position_mismatch_flagged(tmp_path: Path):
    raw = _write(tmp_path)
    # Expected a wrong position -> should flag mismatch but use the raw row.
    prov = lookup_raw_rows(raw, [V("rsSNP", "11", 9999999, "T", "snp")])
    p = prov["rsSNP"]
    assert p.position_matches_expected is False
    assert p.raw_position_1based == 5248232
    assert any("differs" in n for n in p.notes)
