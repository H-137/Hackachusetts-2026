"""Curated condition / variant manifest (Step 5, demo-priority panel).

A small, deliberately curated set of disease-associated loci selected on two
criteria the task requires:
  1. ACTUAL assay coverage: each locus is checkable against consumer SNP-array
     data (either the variant is a SNP that arrays type directly, or we record
     that arrays commonly report it as an unsupported indel -> not_assayed).
  2. Reliable clinical evidence: each locus has well-established ClinVar /
     literature support (recorded by reference, with review context).

Design rules (enforced downstream in annotate.py):
  * Observed-genotype interpretation is kept SEPARATE from experimental local
    ancestry. Ancestry is contextual only.
  * A documented founder-population association is recorded as POPULATION
    FREQUENCY context, explicitly NOT as evidence of an ancestry-dependent
    disease EFFECT and NEVER as evidence a variant is present in a given person.
  * Variants are shown regardless of a person's inferred ancestry.

This manifest contains NO personal genotypes. It is reference/evidence metadata.
Clinical details are cited to public sources; verify current ClinVar status
before any real use. This is a research prototype, not clinical advice.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class CuratedVariant:
    rsid: str
    chromosome: str
    position_1based: int
    gene: str
    # The clinically-relevant allele (risk/pathogenic), on the + strand per the
    # cited source. REF/ALT are resolved against the reference during annotation;
    # this is the biological effect allele, not a REF/ALT assertion.
    clinical_allele: str
    variant_type: str  # "snp" | "indel"
    array_typable: bool  # SNP arrays can type this directly as a SNP
    note: str


@dataclass
class FounderContext:
    """A documented founder/population-frequency association.

    frequency_context ONLY. Records that a variant is observed at elevated
    frequency in a population. This is NOT a statement that ancestry changes the
    variant's disease effect, and NOT evidence the variant is present in anyone.
    """
    population: str
    description: str
    source_url: str


@dataclass
class CuratedCondition:
    condition: str
    gene: str
    inheritance: str
    variants: list[CuratedVariant]
    founder_context: list[FounderContext]
    clinical_evidence_note: str
    source_urls: list[str]
    # The single most important framing line, surfaced in the UI per condition.
    frequency_vs_effect_note: str = (
        "A higher allele frequency in a population is a statement about how COMMON "
        "a variant is there, not evidence that the variant acts differently by "
        "ancestry, and not evidence that any individual carries it."
    )

    def as_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# The curated panel. Positions are GRCh37 (build 37.1), + strand.
# Coverage/typeability reflect what consumer SNP arrays like AncestryDNA V2.0
# actually report; indel-based pathogenic variants are commonly reported as I/D
# placeholders and are therefore not_assayed in a SNP-only pipeline.
# ---------------------------------------------------------------------------

CURATED_CONDITIONS: list[CuratedCondition] = [
    CuratedCondition(
        condition="Sickle cell disease / sickle cell trait",
        gene="HBB",
        inheritance="autosomal recessive",
        variants=[
            CuratedVariant(
                rsid="rs334", chromosome="11", position_1based=5248232, gene="HBB",
                clinical_allele="A",  # HbS (Glu6Val); + strand A relative to ref T
                variant_type="snp", array_typable=True,
                note="HbS sickle allele. A single SNP arrays type directly.",
            ),
        ],
        founder_context=[
            FounderContext(
                "AFR",
                "The HbS allele is observed at elevated frequency in parts of "
                "sub-Saharan Africa and the African diaspora, associated with "
                "historical malaria selection.",
                "https://www.ncbi.nlm.nih.gov/clinvar/variation/15333/",
            ),
        ],
        clinical_evidence_note=(
            "rs334 (HBB Glu6Val, HbS) is a well-established pathogenic variant for "
            "sickle cell disease (recessive); a single copy confers sickle cell "
            "trait. Reliable, long-standing ClinVar/literature support."
        ),
        source_urls=["https://www.ncbi.nlm.nih.gov/clinvar/variation/15333/"],
    ),
    CuratedCondition(
        condition="Hereditary hemochromatosis (HFE-related)",
        gene="HFE",
        inheritance="autosomal recessive (reduced penetrance)",
        variants=[
            CuratedVariant(
                rsid="rs1800562", chromosome="6", position_1based=26093141, gene="HFE",
                clinical_allele="A",  # C282Y
                variant_type="snp", array_typable=True,
                note="HFE C282Y. The principal hemochromatosis risk allele.",
            ),
            CuratedVariant(
                rsid="rs1799945", chromosome="6", position_1based=26091179, gene="HFE",
                clinical_allele="G",  # H63D
                variant_type="snp", array_typable=True,
                note="HFE H63D. Lower-penetrance allele; often compound with C282Y.",
            ),
        ],
        founder_context=[
            FounderContext(
                "EUR",
                "HFE C282Y is observed at elevated frequency in Northern European "
                "ancestry populations.",
                "https://www.ncbi.nlm.nih.gov/clinvar/variation/9/",
            ),
        ],
        clinical_evidence_note=(
            "HFE C282Y (rs1800562) and H63D (rs1799945) are well-characterised "
            "with incomplete penetrance; most homozygotes do not develop clinical "
            "iron overload. Both are directly array-typable SNPs."
        ),
        source_urls=[
            "https://www.ncbi.nlm.nih.gov/clinvar/variation/9/",
            "https://www.ncbi.nlm.nih.gov/clinvar/variation/10/",
        ],
    ),
    CuratedCondition(
        condition="Tay-Sachs disease",
        gene="HEXA",
        inheritance="autosomal recessive",
        variants=[
            CuratedVariant(
                rsid="rs80338720", chromosome="15", position_1based=72638892, gene="HEXA",
                clinical_allele="del",  # 1278insTATC frameshift (indel)
                variant_type="indel", array_typable=False,
                note=(
                    "HEXA c.1274_1277dup (a founder frameshift). INDEL: consumer "
                    "arrays commonly report an I/D placeholder, so this is "
                    "not_assayed in a SNP-only pipeline. Shown to make the "
                    "coverage gap explicit, never a reassuring negative."
                ),
            ),
        ],
        founder_context=[
            FounderContext(
                "AJ",
                "Certain HEXA pathogenic variants are observed at elevated "
                "frequency in Ashkenazi Jewish populations.",
                "https://www.ncbi.nlm.nih.gov/clinvar/variation/3827/",
            ),
        ],
        clinical_evidence_note=(
            "HEXA founder frameshift variants are well-established for Tay-Sachs. "
            "Key variants are indels NOT reliably typed by consumer SNP arrays; "
            "absence in array data must be reported as not_assayed, not negative."
        ),
        source_urls=["https://www.ncbi.nlm.nih.gov/clinvar/variation/3827/"],
    ),
    CuratedCondition(
        condition="Cystic fibrosis",
        gene="CFTR",
        inheritance="autosomal recessive",
        variants=[
            CuratedVariant(
                rsid="rs113993960", chromosome="7", position_1based=117199646, gene="CFTR",
                clinical_allele="delCTT",  # F508del (3-bp deletion)
                variant_type="indel", array_typable=False,
                note=(
                    "CFTR F508del, the most common CF variant. A 3-bp DELETION: "
                    "consumer arrays commonly report an I/D placeholder, so this "
                    "is not_assayed in a SNP-only pipeline. Shown to make the "
                    "coverage gap explicit."
                ),
            ),
        ],
        founder_context=[
            FounderContext(
                "EUR",
                "CFTR F508del is observed at elevated frequency in European "
                "ancestry populations.",
                "https://www.ncbi.nlm.nih.gov/clinvar/variation/7105/",
            ),
        ],
        clinical_evidence_note=(
            "CFTR F508del is the best-characterised CF variant. It is a deletion "
            "not reliably typed by consumer SNP arrays; absence in array data is "
            "not_assayed, never a negative result."
        ),
        source_urls=["https://www.ncbi.nlm.nih.gov/clinvar/variation/7105/"],
    ),
]


def manifest() -> list[dict]:
    """Return the curated condition manifest as plain dicts."""
    return [c.as_dict() for c in CURATED_CONDITIONS]


def all_curated_variants() -> list[CuratedVariant]:
    out: list[CuratedVariant] = []
    for c in CURATED_CONDITIONS:
        out.extend(c.variants)
    return out
