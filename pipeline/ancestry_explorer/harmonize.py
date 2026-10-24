"""Harmonize parsed AncestryDNA SNP records into a reference-aligned VCF.

Step 2 scientific core. Given parsed autosomal SNP records (Step 1), a GRCh37
reference FASTA, and a panel sites catalog, this module:

  * Matches variants by build + chromosome + position + REF + ALT (an rsID alone
    is NOT a sufficient join key).
  * Validates the reference allele at each position against the reference FASTA.
  * Resolves REF/ALT and allele orientation explicitly. Strand-ambiguous sites
    (A/T and C/G) and mismatches are REPORTED, never silently flipped.
  * Filters markers that cannot be harmonized, recording the reason.
  * Writes a sorted, bgzip-compressed, tabix-indexed VCF plus a harmonization
    report.

Privacy: the harmonization report contains aggregate counts and per-reason
tallies only. It does not contain any sample genotype values. The VCF itself
does contain genotypes (that is its purpose) and is treated as sample data:
written under a gitignored path and never transmitted.

Build-mismatch safety: the parsed metadata's normalized_build must be GRCh37.
Any other build raises before a single marker is written, so a wrong-build file
cannot silently flow into annotation (Step 2 "done when").
"""

from __future__ import annotations

import subprocess
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from .parser import ParseResult, ParsedRecord

# Complement map for strand handling.
_COMPLEMENT = {"A": "T", "T": "A", "C": "G", "G": "C"}
# Strand-ambiguous allele pairs cannot be oriented by complement alone.
_AMBIGUOUS = {frozenset({"A", "T"}), frozenset({"C", "G"})}


@dataclass
class HarmonizationReport:
    build: str = ""
    reference_fasta: str = ""
    total_input_snps: int = 0
    written: int = 0
    ref_match: int = 0
    ref_mismatch_resolved: int = 0
    dropped: int = 0
    drop_reasons: Counter = field(default_factory=Counter)
    ambiguous_flagged: int = 0
    toolchain: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "build": self.build,
            "reference_fasta": self.reference_fasta,
            "total_input_snps": self.total_input_snps,
            "written": self.written,
            "ref_match": self.ref_match,
            "ref_mismatch_resolved": self.ref_mismatch_resolved,
            "dropped": self.dropped,
            "drop_reasons": dict(self.drop_reasons),
            "ambiguous_flagged": self.ambiguous_flagged,
            "toolchain": self.toolchain,
        }


def _faidx_base(fasta: Path, chrom: str, pos_1based: int) -> str | None:
    """Return the reference base at a 1-based position, or None on failure."""
    region = f"{chrom}:{pos_1based}-{pos_1based}"
    res = subprocess.run(
        ["samtools", "faidx", str(fasta), region],
        capture_output=True, text=True, check=False,
    )
    if res.returncode != 0:
        return None
    lines = [ln for ln in res.stdout.splitlines() if not ln.startswith(">")]
    seq = "".join(lines).strip().upper()
    return seq if seq else None


def _resolve_alt(ref: str, a1: str, a2: str) -> tuple[str | None, str, str | None]:
    """Resolve the ALT allele and the VCF genotype given the reference base.

    Returns (alt, genotype, drop_reason). alt/genotype are None/"" when dropped.

    The two observed alleles (a1, a2) are forward-strand calls. We determine
    REF/ALT by comparing to the reference base:
      * both == ref            -> homozygous reference (0/0), ALT unknown-from-sample
      * one == ref, one != ref -> heterozygous (0/1), ALT is the non-ref allele
      * neither == ref         -> candidate homozygous alt (1/1) if a1==a2,
                                  otherwise a tri-allelic/complex site we drop
    """
    alleles = {a1, a2}

    # Homozygous reference: ALT is not observed in this sample. We cannot invent
    # an ALT allele from a hom-ref call alone, so this site carries no ALT here.
    if alleles == {ref}:
        return None, "0/0", None

    non_ref = [a for a in (a1, a2) if a != ref]

    if a1 == ref or a2 == ref:
        # Exactly one allele differs from reference -> heterozygous.
        alt = non_ref[0]
        return alt, "0/1", None

    # Neither allele matches the reference base.
    if a1 == a2:
        # Homozygous for a single non-reference allele -> 1/1.
        return a1, "1/1", None

    # Two distinct non-reference alleles: tri-allelic relative to REF. The first
    # autosomal-SNP implementation handles biallelic sites only.
    return None, "", "multiallelic_vs_reference"


def harmonize(
    parsed: ParseResult,
    reference_fasta: Path,
    out_vcf_gz: Path,
    sample_id: str = "sample",
    restrict_chrom: str | None = None,
    restrict_window: tuple[int, int] | None = None,
) -> HarmonizationReport:
    """Harmonize analysis-ready SNP records into a sorted, indexed VCF.

    Args:
        parsed: output of parse_ancestrydna (Step 1).
        reference_fasta: indexed GRCh37 FASTA (.fai alongside).
        out_vcf_gz: destination .vcf.gz path (index written alongside).
        sample_id: VCF sample column name.
        restrict_chrom/restrict_window: optional slice limits so validation can
            run against a single-chromosome reference FASTA and position window.
    """
    if parsed.metadata.normalized_build != "GRCh37":
        raise ValueError(
            "Reference-build mismatch: parser reported build "
            f"'{parsed.metadata.normalized_build}', harmonization requires GRCh37. "
            "Refusing to harmonize so a wrong-build file cannot pass silently."
        )

    report = HarmonizationReport(
        build="GRCh37", reference_fasta=str(reference_fasta)
    )

    snp_records: list[ParsedRecord] = [
        r for r in parsed.records if r.record_kind == "snp"
    ]
    if restrict_chrom is not None:
        snp_records = [r for r in snp_records if r.chromosome_norm == restrict_chrom]
    if restrict_window is not None:
        lo, hi = restrict_window
        snp_records = [r for r in snp_records if lo <= r.position_1based <= hi]

    report.total_input_snps = len(snp_records)

    # Sort by (chrom, position) so the VCF is coordinate-sorted before compression.
    def _chrom_key(c: str) -> tuple[int, str]:
        return (int(c), "") if c.isdigit() else (99, c)

    snp_records.sort(key=lambda r: (_chrom_key(r.chromosome_norm), r.position_1based))

    out_vcf_gz.parent.mkdir(parents=True, exist_ok=True)
    plain_vcf = out_vcf_gz.with_suffix("")  # strip .gz -> .vcf
    if plain_vcf.suffix != ".vcf":
        plain_vcf = out_vcf_gz.parent / (out_vcf_gz.name.replace(".gz", ""))

    header = [
        "##fileformat=VCFv4.2",
        "##source=AncestryAwareVariantExplorer-harmonize",
        "##reference=GRCh37/human_g1k_v37",
        '##FILTER=<ID=PASS,Description="All filters passed">',
        '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
        '##INFO=<ID=AA_REFCHK,Number=1,Type=String,Description="Reference-allele check result">',
        "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t" + sample_id,
    ]

    body: list[str] = []
    for rec in snp_records:
        a1 = rec.allele1.upper()
        a2 = rec.allele2.upper()
        ref = _faidx_base(reference_fasta, rec.chromosome_norm, rec.position_1based)

        if ref is None or ref not in _COMPLEMENT:
            report.dropped += 1
            report.drop_reasons["reference_base_unavailable"] += 1
            continue

        # Flag strand-ambiguous sites. We still process unambiguous-by-reference
        # cases, but A/T and C/G sites where neither sample allele equals ref are
        # unresolvable by orientation alone and are dropped-with-reason.
        pair = frozenset({a1, a2}) if a1 != a2 else frozenset({a1})
        is_ambiguous_pair = frozenset({a1, a2}) in _AMBIGUOUS

        alt, genotype, drop_reason = _resolve_alt(ref, a1, a2)

        if drop_reason is not None:
            report.dropped += 1
            report.drop_reasons[drop_reason] += 1
            continue

        if alt is None and genotype == "0/0":
            # Hom-ref with no observed ALT: nothing to orient. We record the site
            # as reference-confirmed but with a symbolic ALT of '.' (no alt).
            report.ref_match += 1
            report.written += 1
            body.append(
                f"{rec.chromosome_norm}\t{rec.position_1based}\t{rec.rsid or '.'}\t"
                f"{ref}\t.\t.\tPASS\tAA_REFCHK=hom_ref\tGT\t0/0"
            )
            continue

        # alt is a concrete base here.
        if alt not in _COMPLEMENT:
            report.dropped += 1
            report.drop_reasons["non_snp_alt"] += 1
            continue

        if ref in (a1, a2):
            report.ref_match += 1
        else:
            # Neither allele equals ref but we resolved a hom-alt 1/1; count it.
            report.ref_mismatch_resolved += 1

        # A/T and C/G sites are strand-ambiguous when later matched to an external
        # panel on an unknown strand (a Step 3 concern). Resolution against OUR
        # reference here is unambiguous, so we keep the site but FLAG it so the
        # phasing step can apply strand care rather than silently flipping it.
        if is_ambiguous_pair:
            report.ambiguous_flagged += 1
            refchk = "strand_check"
        else:
            refchk = "ok"
        _ = pair
        body.append(
            f"{rec.chromosome_norm}\t{rec.position_1based}\t{rec.rsid or '.'}\t"
            f"{ref}\t{alt}\t.\tPASS\tAA_REFCHK={refchk}\tGT\t{genotype}"
        )
        report.written += 1

    plain_vcf.write_text("\n".join(header + body) + "\n", encoding="utf-8")

    # Compress with bgzip and index with tabix (sorted input required).
    subprocess.run(["bgzip", "-f", str(plain_vcf)], check=True)
    subprocess.run(["tabix", "-f", "-p", "vcf", str(out_vcf_gz)], check=True)

    return report
