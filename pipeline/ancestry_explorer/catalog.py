"""Focused evidence catalog for the SNPshot ancestry-informed watchlist.

A small, well-supported set of pathogenic / likely-pathogenic variants for
specified conditions. The catalog is deliberately NOT restricted to positions
present in the consumer file: unassayed founder variants are included, because
local ancestry at a locus can contextualize attention for a variant we did not
measure (it can never establish presence/absence).

Selection rules (from the task):
  * Prefer ClinVar expert-panel / practice-guideline review status.
  * Exclude VUS, benign/likely-benign, and unresolved conflicting classifications.
  * Prioritize well-documented founder variants / population-enriched variants.
  * Keep allele frequency, carrier frequency, and disease prevalence DISTINCT,
    with source populations and denominators where available.

Frequencies recorded here are documented public estimates with their source and
denominator; where a precise figure is uncertain it is left null rather than
invented. These are reference metadata, not personal data. This is a research
prototype; verify current ClinVar status before any real use.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class FrequencyEvidence:
    """Documented population frequency. Allele vs carrier vs prevalence kept distinct."""
    population: str
    allele_frequency: float | None       # fraction of alleles
    carrier_frequency: float | None       # fraction of individuals who are carriers
    disease_prevalence: str | None         # textual, often per-N births
    sample_size_or_denominator: str | None
    enrichment_note: str | None            # enrichment vs general population, if documented
    source_url: str


@dataclass
class CatalogVariant:
    variant_id: str                 # stable internal id
    condition: str
    gene: str
    inheritance: str                # e.g. "autosomal recessive"
    # Coordinate on the catalog's source build; harmonized to our build at lookup.
    source_build: str               # "GRCh37" | "GRCh38"
    chromosome: str
    position_1based: int
    ref: str | None
    alt: str | None                 # the pathogenic allele representation
    hgvs: str | None
    rsid: str | None
    variant_class: str              # "snp" | "indel"
    # Clinical evidence.
    clinical_classification: str    # "Pathogenic" | "Likely pathogenic"
    review_status: str              # ClinVar review status text
    classification_date: str | None
    clinvar_id: str | None
    citations: list[str]
    # Population association.
    associated_populations: list[str]   # reference-population codes expected to enrich
    founder_variant: bool
    frequency_evidence: list[FrequencyEvidence]
    notes: str = ""

    def as_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# The catalog. Small and well-supported. Positions are recorded on their source
# build and harmonized at lookup. At least one chr22 locus is included so the
# per-copy local-ancestry lookup is exercised on our processed chromosome; the
# rest are strong founder variants on unprocessed chromosomes (which the engine
# marks ancestry_not_available, by design).
# ---------------------------------------------------------------------------

CATALOG: list[CatalogVariant] = [
    # --- chr22: ancestry IS available from our segments ---
    CatalogVariant(
        variant_id="ARSA_c907G_A",
        condition="Metachromatic leukodystrophy",
        gene="ARSA",
        inheritance="autosomal recessive",
        source_build="GRCh37", chromosome="22", position_1based=51064654,
        ref="C", alt="T",  # g. minus-strand gene; recorded + strand ref/alt
        hgvs="NM_000487.6(ARSA):c.907G>A (p.Gly303Arg)",
        rsid=None, variant_class="snp",
        clinical_classification="Pathogenic",
        review_status="criteria provided, multiple submitters, no conflicts",
        classification_date="2023", clinvar_id="RCV003064666",
        citations=["https://www.ncbi.nlm.nih.gov/clinvar/RCV003064666/"],
        associated_populations=[],  # ARSA MLD is pan-ethnic, not a founder enrichment
        founder_variant=False,
        frequency_evidence=[
            FrequencyEvidence(
                population="global", allele_frequency=None, carrier_frequency=None,
                disease_prevalence="~1 in 40,000-160,000 births (MLD overall)",
                sample_size_or_denominator=None,
                enrichment_note="No strong single-population founder enrichment documented.",
                source_url="https://www.ncbi.nlm.nih.gov/books/NBK560744/",
            ),
        ],
        notes=(
            "On processed chr22, so per-copy local ancestry is available. ARSA MLD "
            "is not a strong founder-enrichment case: a useful example of WEAK "
            "population-frequency relevance even when ancestry is known at the locus."
        ),
    ),
    # --- Strong founder variants on unprocessed chromosomes ---
    CatalogVariant(
        variant_id="BRCA1_185delAG",
        condition="Hereditary breast and ovarian cancer",
        gene="BRCA1",
        inheritance="autosomal dominant",
        source_build="GRCh37", chromosome="17", position_1based=41276045,
        ref="CT", alt="C",  # 185delAG / c.68_69del (representation varies)
        hgvs="NM_007294.4(BRCA1):c.68_69del (p.Glu23fs); 185delAG",
        rsid="rs80357914", variant_class="indel",
        clinical_classification="Pathogenic",
        review_status="reviewed by expert panel (ENIGMA)",
        classification_date="2023", clinvar_id="VCV000017662",
        citations=["https://www.ncbi.nlm.nih.gov/clinvar/variation/17662/"],
        associated_populations=["AJ"],  # Ashkenazi Jewish founder
        founder_variant=True,
        frequency_evidence=[
            FrequencyEvidence(
                population="AJ", allele_frequency=None,
                carrier_frequency=0.01,
                disease_prevalence=None,
                sample_size_or_denominator="~1% carrier frequency in Ashkenazi Jewish population",
                enrichment_note="Strongly enriched founder variant in Ashkenazi Jewish ancestry.",
                source_url="https://www.ncbi.nlm.nih.gov/clinvar/variation/17662/",
            ),
        ],
        notes="ENIGMA expert-panel reviewed. AJ founder variant. On chr17 (unprocessed here).",
    ),
    CatalogVariant(
        variant_id="BRCA2_6174delT",
        condition="Hereditary breast and ovarian cancer",
        gene="BRCA2",
        inheritance="autosomal dominant",
        source_build="GRCh37", chromosome="13", position_1based=32914438,
        ref="GT", alt="G",
        hgvs="NM_000059.4(BRCA2):c.5946del (p.Ser1982fs); 6174delT",
        rsid="rs80359550", variant_class="indel",
        clinical_classification="Pathogenic",
        review_status="reviewed by expert panel (ENIGMA)",
        classification_date="2023", clinvar_id="VCV000038122",
        citations=["https://www.ncbi.nlm.nih.gov/clinvar/variation/38122/"],
        associated_populations=["AJ"],
        founder_variant=True,
        frequency_evidence=[
            FrequencyEvidence(
                population="AJ", allele_frequency=None, carrier_frequency=0.013,
                disease_prevalence=None,
                sample_size_or_denominator="~1.3% carrier frequency in Ashkenazi Jewish population",
                enrichment_note="Strongly enriched founder variant in Ashkenazi Jewish ancestry.",
                source_url="https://www.ncbi.nlm.nih.gov/clinvar/variation/38122/",
            ),
        ],
        notes="ENIGMA expert-panel reviewed. AJ founder variant. On chr13 (unprocessed here).",
    ),
    CatalogVariant(
        variant_id="HBB_HbS_rs334",
        condition="Sickle cell disease",
        gene="HBB",
        inheritance="autosomal recessive",
        source_build="GRCh37", chromosome="11", position_1based=5248232,
        ref="T", alt="A",  # HbS; + strand ref T, sickle allele A
        hgvs="NM_000518.5(HBB):c.20A>T (p.Glu7Val); HbS",
        rsid="rs334", variant_class="snp",
        clinical_classification="Pathogenic",
        review_status="criteria provided, multiple submitters, no conflicts",
        classification_date="2022", clinvar_id="VCV000015333",
        citations=["https://www.ncbi.nlm.nih.gov/clinvar/variation/15333/"],
        associated_populations=["YRI", "ESN", "GWD", "MSL", "LWK", "ACB", "ASW"],
        founder_variant=True,
        frequency_evidence=[
            FrequencyEvidence(
                population="AFR", allele_frequency=None, carrier_frequency=None,
                disease_prevalence="Sickle cell trait up to ~1 in 13 African-American births (trait)",
                sample_size_or_denominator=None,
                enrichment_note="Enriched in populations with historical malaria exposure.",
                source_url="https://www.ncbi.nlm.nih.gov/clinvar/variation/15333/",
            ),
        ],
        notes=(
            "Directly array-typable SNP (observed in our data). On chr11 "
            "(unprocessed here), so ancestry context for the LOCUS is not "
            "available even though the genotype is observed."
        ),
    ),
    CatalogVariant(
        variant_id="HEXA_1278insTATC",
        condition="Tay-Sachs disease",
        gene="HEXA",
        inheritance="autosomal recessive",
        source_build="GRCh37", chromosome="15", position_1based=72638892,
        ref="C", alt="CTATC",
        hgvs="NM_000520.6(HEXA):c.1274_1277dup; 1278insTATC",
        rsid="rs387906309", variant_class="indel",
        clinical_classification="Pathogenic",
        review_status="criteria provided, multiple submitters, no conflicts",
        classification_date="2022", clinvar_id="VCV000003827",
        citations=["https://www.ncbi.nlm.nih.gov/clinvar/variation/3827/"],
        associated_populations=["AJ"],
        founder_variant=True,
        frequency_evidence=[
            FrequencyEvidence(
                population="AJ", allele_frequency=None, carrier_frequency=0.03,
                disease_prevalence=None,
                sample_size_or_denominator="~1 in 30 carrier frequency in Ashkenazi Jewish population",
                enrichment_note="Classic Ashkenazi Jewish founder variant.",
                source_url="https://www.ncbi.nlm.nih.gov/clinvar/variation/3827/",
            ),
        ],
        notes="AJ founder frameshift (indel). On chr15 (unprocessed here).",
    ),

    # -----------------------------------------------------------------------
    # chr22 data-mined additions (catalog_mine.py: ClinVar E-utilities P/LP in
    # our real ancestry window, joined to gnomAD r2.1.1 per-population allele
    # frequencies). These are the first chr22 entries selected by DOCUMENTED
    # population enrichment rather than hand-picked names. All fall inside the
    # real chr22 ancestry window, so their locus ancestry resolves on both
    # copies. Their enriched populations are European (FIN/NFE/ASJ), so against
    # this sample's EUR chr22 labels they resolve to within_superpopulation (or
    # supported where the specific 1000G EUR label matches), never fabricated.
    # Frequencies are real gnomAD r2.1.1 values from docs/artifacts/
    # chr22-candidates-ranked.json. Verify current ClinVar/gnomAD before real use.
    # -----------------------------------------------------------------------
    CatalogVariant(
        variant_id="CHEK2_c1100delC",
        condition="CHEK2-related cancer predisposition",
        gene="CHEK2",
        inheritance="autosomal dominant (moderate-penetrance)",
        source_build="GRCh37", chromosome="22", position_1based=29091857,
        ref="AG", alt="A",  # 22-29091856-AG-A in gnomAD
        hgvs="NM_007194.4(CHEK2):c.1100del (p.Thr367fs)",
        rsid="rs555607708", variant_class="indel",
        clinical_classification="Pathogenic",
        review_status="criteria provided, multiple submitters, no conflicts",
        classification_date="2026", clinvar_id="VCV000128042",
        citations=["https://www.ncbi.nlm.nih.gov/clinvar/variation/128042/"],
        associated_populations=["FIN"],  # FIN 0.86%, ASJ 0.69% (gnomAD r2.1.1)
        founder_variant=True,
        frequency_evidence=[
            FrequencyEvidence(
                population="FIN", allele_frequency=0.00863, carrier_frequency=None,
                disease_prevalence=None,
                sample_size_or_denominator="gnomAD r2.1.1 GRCh37 FIN AF 0.86%",
                enrichment_note="European founder (Finnish/Ashkenazi enriched); ~5.3x vs other pops. Breast/colorectal/prostate predisposition.",
                source_url="https://gnomad.broadinstitute.org/variant/22-29091856-AG-A?dataset=gnomad_r2_1",
            ),
            FrequencyEvidence(
                population="ASJ", allele_frequency=0.0069, carrier_frequency=None,
                disease_prevalence=None,
                sample_size_or_denominator="gnomAD r2.1.1 GRCh37 ASJ AF 0.69%",
                enrichment_note="Also enriched in Ashkenazi Jewish ancestry.",
                source_url="https://gnomad.broadinstitute.org/variant/22-29091856-AG-A?dataset=gnomad_r2_1",
            ),
        ],
        notes="Strongest chr22 population-enriched P/LP in the window. In-window (29.09 Mb).",
    ),
    CatalogVariant(
        variant_id="UPB1_c917minus1GA",
        condition="Beta-ureidopropionase deficiency",
        gene="UPB1",
        inheritance="autosomal recessive",
        source_build="GRCh37", chromosome="22", position_1based=24919586,
        ref="G", alt="A",
        hgvs="NM_016327.3(UPB1):c.917-1G>A",
        rsid="rs143493067", variant_class="snp",
        clinical_classification="Pathogenic/Likely pathogenic",
        review_status="criteria provided, multiple submitters, no conflicts",
        classification_date="2026", clinvar_id="VCV000445946",
        citations=["https://www.ncbi.nlm.nih.gov/clinvar/variation/445946/"],
        associated_populations=["ASJ"],  # ASJ 0.34% top (gnomAD r2.1.1)
        founder_variant=True,
        frequency_evidence=[
            FrequencyEvidence(
                population="ASJ", allele_frequency=0.00345, carrier_frequency=None,
                disease_prevalence=None,
                sample_size_or_denominator="gnomAD r2.1.1 GRCh37 ASJ AF 0.34%",
                enrichment_note="~3.3x enrichment, Ashkenazi Jewish. Recessive metabolic disorder.",
                source_url="https://gnomad.broadinstitute.org/variant/22-24919586-G-A?dataset=gnomad_r2_1",
            ),
        ],
        notes="In-window (24.92 Mb). ASJ enrichment (no 1000G AJ reference label -> unresolved against our EUR panel).",
    ),
    CatalogVariant(
        variant_id="ARSA_c542T_G",
        condition="Metachromatic leukodystrophy",
        gene="ARSA",
        inheritance="autosomal recessive",
        source_build="GRCh37", chromosome="22", position_1based=51065404,
        ref="A", alt="C",
        hgvs="NM_000487.6(ARSA):c.542T>G (p.Ile181Ser)",
        rsid="rs74315457", variant_class="snp",
        clinical_classification="Pathogenic/Likely pathogenic",
        review_status="criteria provided, multiple submitters, no conflicts",
        classification_date="2026", clinvar_id="VCV000003057",
        citations=["https://www.ncbi.nlm.nih.gov/clinvar/variation/3057/"],
        associated_populations=["CEU", "GBR", "IBS", "TSI", "FIN"],  # NFE-enriched -> EUR 1000G pops
        founder_variant=False,
        frequency_evidence=[
            FrequencyEvidence(
                population="NFE", allele_frequency=0.00123, carrier_frequency=None,
                disease_prevalence=None,
                sample_size_or_denominator="gnomAD r2.1.1 GRCh37 NFE AF 0.12%",
                enrichment_note="Non-Finnish-European-enriched MLD allele (same gene as the c.907G>A entry).",
                source_url="https://gnomad.broadinstitute.org/variant/22-51065404-A-C?dataset=gnomad_r2_1",
            ),
        ],
        notes="In-window (51.07 Mb). NFE enrichment maps to the EUR 1000G reference pops.",
    ),
    CatalogVariant(
        variant_id="SCO2_c16_17ins",
        condition="Fatal infantile cardioencephalomyopathy (COX deficiency)",
        gene="SCO2",
        inheritance="autosomal recessive",
        source_build="GRCh37", chromosome="22", position_1based=50962824,
        ref="C", alt="CTGAGTCACTGCTGCATGCT",
        hgvs="NM_005138.3(SCO2):c.16_17insAGCATGCAGCAGTGACTCA (p.Arg6fs)",
        rsid="rs749838192", variant_class="indel",
        clinical_classification="Pathogenic/Likely pathogenic",
        review_status="criteria provided, multiple submitters, no conflicts",
        classification_date="2025", clinvar_id="VCV000222816",
        citations=["https://www.ncbi.nlm.nih.gov/clinvar/variation/222816/"],
        associated_populations=["FIN"],  # FIN 1.01% top (gnomAD r2.1.1)
        founder_variant=True,
        frequency_evidence=[
            FrequencyEvidence(
                population="FIN", allele_frequency=0.01008, carrier_frequency=None,
                disease_prevalence=None,
                sample_size_or_denominator="gnomAD r2.1.1 GRCh37 FIN AF 1.01%",
                enrichment_note="Finnish-enriched recessive variant.",
                source_url="https://gnomad.broadinstitute.org/variant/22-50962824-C-CTGAGTCACTGCTGCATGCT?dataset=gnomad_r2_1",
            ),
        ],
        notes="In-window (50.96 Mb). Finnish enrichment; FIN is a 1000G reference pop.",
    ),
    CatalogVariant(
        variant_id="ADA2_c973minus2AG",
        condition="Deficiency of adenosine deaminase 2 (DADA2)",
        gene="ADA2",
        inheritance="autosomal recessive",
        source_build="GRCh37", chromosome="22", position_1based=17669339,
        ref="T", alt="C",
        hgvs="NM_001282225.2(ADA2):c.973-2A>G",
        rsid="rs139750129", variant_class="snp",
        clinical_classification="Pathogenic",
        review_status="criteria provided, multiple submitters, no conflicts",
        classification_date="2026", clinvar_id="VCV000541735",
        citations=["https://www.ncbi.nlm.nih.gov/clinvar/variation/541735/"],
        associated_populations=["FIN"],  # FIN 0.12% top (gnomAD r2.1.1)
        founder_variant=False,
        frequency_evidence=[
            FrequencyEvidence(
                population="FIN", allele_frequency=0.00115, carrier_frequency=None,
                disease_prevalence=None,
                sample_size_or_denominator="gnomAD r2.1.1 GRCh37 FIN AF 0.12%",
                enrichment_note="Finnish-enriched recessive vasculopathy variant.",
                source_url="https://gnomad.broadinstitute.org/variant/22-17669339-T-C?dataset=gnomad_r2_1",
            ),
        ],
        notes="In-window (17.67 Mb). Finnish enrichment; FIN is a 1000G reference pop.",
    ),
]


def catalog() -> list[dict]:
    return [v.as_dict() for v in CATALOG]


def catalog_provenance() -> dict:
    """Summary provenance: size, sources, and documented limitations."""
    pops = sorted({p for v in CATALOG for p in v.associated_populations})
    return {
        "catalog_size": len(CATALOG),
        "conditions": sorted({v.condition for v in CATALOG}),
        "genes": sorted({v.gene for v in CATALOG}),
        "associated_populations": pops,
        "classifications_included": ["Pathogenic", "Likely pathogenic"],
        "classifications_excluded": [
            "VUS", "Benign", "Likely benign", "unresolved conflicting",
        ],
        "sources": ["ClinVar (expert panel / multiple-submitter where available)"],
        "limitations": [
            "Small hand-curated catalog; not exhaustive.",
            "Positions recorded on source build (GRCh37 here) and harmonized at lookup.",
            "Indel representations vary across sources; verify ClinVar before real use.",
            "Only chr22 ancestry is currently available; other loci are "
            "ancestry_not_available by design.",
            "Frequencies are documented public estimates, not personal data; "
            "null where uncertain rather than invented.",
        ],
    }
