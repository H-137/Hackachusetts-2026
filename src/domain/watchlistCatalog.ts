/**
 * Focused evidence catalog for the SNPshot watchlist (UI copy).
 *
 * Mirrors pipeline/ancestry_explorer/catalog.py. Pathogenic / Likely-pathogenic
 * variants only; VUS, benign/likely-benign, and unresolved conflicting
 * classifications excluded. Founder / population-enriched variants prioritized.
 * Includes unassayed variants (not restricted to array positions). Positions are
 * GRCh37 (+ strand). This is reference/evidence metadata, not personal data;
 * verify current ClinVar status before any real use.
 */

import type { CatalogVariant } from "./watchlist";

export const WATCHLIST_CATALOG: CatalogVariant[] = [
  {
    variant_id: "ARSA_c907G_A",
    condition: "Metachromatic leukodystrophy",
    gene: "ARSA",
    inheritance: "autosomal recessive",
    build: "GRCh37",
    chromosome: "22",
    position_1based: 51064654,
    hgvs: "NM_000487.6(ARSA):c.907G>A (p.Gly303Arg)",
    rsid: null,
    variant_class: "snp",
    clinical_allele: "T",
    clinical_classification: "Pathogenic",
    review_status: "criteria provided, multiple submitters, no conflicts",
    citations: ["https://www.ncbi.nlm.nih.gov/clinvar/RCV003064666/"],
    associated_populations: [],
    founder_variant: false,
    frequency_evidence: [
      {
        population: "global",
        allele_frequency: null,
        carrier_frequency: null,
        disease_prevalence: "~1 in 40,000-160,000 births (MLD overall)",
        sample_size_or_denominator: null,
        enrichment_note: "No strong single-population founder enrichment documented.",
        source_url: "https://www.ncbi.nlm.nih.gov/books/NBK560744/",
      },
    ],
    notes:
      "On processed chr22, so per-copy local ancestry is available. A useful example of WEAK population-frequency relevance even when ancestry is known at the locus.",
  },
  {
    variant_id: "BRCA1_185delAG",
    condition: "Hereditary breast and ovarian cancer",
    gene: "BRCA1",
    inheritance: "autosomal dominant",
    build: "GRCh37",
    chromosome: "17",
    position_1based: 41276045,
    hgvs: "NM_007294.4(BRCA1):c.68_69del (p.Glu23fs); 185delAG",
    rsid: "rs80357914",
    variant_class: "indel",
    clinical_allele: null,
    clinical_classification: "Pathogenic",
    review_status: "reviewed by expert panel (ENIGMA)",
    citations: ["https://www.ncbi.nlm.nih.gov/clinvar/variation/17662/"],
    associated_populations: ["AJ"],
    founder_variant: true,
    frequency_evidence: [
      {
        population: "AJ",
        allele_frequency: null,
        carrier_frequency: 0.01,
        disease_prevalence: null,
        sample_size_or_denominator: "~1% carrier frequency in Ashkenazi Jewish population",
        enrichment_note: "Strongly enriched founder variant in Ashkenazi Jewish ancestry.",
        source_url: "https://www.ncbi.nlm.nih.gov/clinvar/variation/17662/",
      },
    ],
    notes: "ENIGMA expert-panel reviewed. AJ founder variant. On chr17 (unprocessed here).",
  },
  {
    variant_id: "BRCA2_6174delT",
    condition: "Hereditary breast and ovarian cancer",
    gene: "BRCA2",
    inheritance: "autosomal dominant",
    build: "GRCh37",
    chromosome: "13",
    position_1based: 32914438,
    hgvs: "NM_000059.4(BRCA2):c.5946del (p.Ser1982fs); 6174delT",
    rsid: "rs80359550",
    variant_class: "indel",
    clinical_allele: null,
    clinical_classification: "Pathogenic",
    review_status: "reviewed by expert panel (ENIGMA)",
    citations: ["https://www.ncbi.nlm.nih.gov/clinvar/variation/38122/"],
    associated_populations: ["AJ"],
    founder_variant: true,
    frequency_evidence: [
      {
        population: "AJ",
        allele_frequency: null,
        carrier_frequency: 0.013,
        disease_prevalence: null,
        sample_size_or_denominator: "~1.3% carrier frequency in Ashkenazi Jewish population",
        enrichment_note: "Strongly enriched founder variant in Ashkenazi Jewish ancestry.",
        source_url: "https://www.ncbi.nlm.nih.gov/clinvar/variation/38122/",
      },
    ],
    notes: "ENIGMA expert-panel reviewed. AJ founder variant. On chr13 (unprocessed here).",
  },
  {
    variant_id: "HBB_HbS_rs334",
    condition: "Sickle cell disease",
    gene: "HBB",
    inheritance: "autosomal recessive",
    build: "GRCh37",
    chromosome: "11",
    position_1based: 5248232,
    hgvs: "NM_000518.5(HBB):c.20A>T (p.Glu7Val); HbS",
    rsid: "rs334",
    variant_class: "snp",
    clinical_allele: "A",
    clinical_classification: "Pathogenic",
    review_status: "criteria provided, multiple submitters, no conflicts",
    citations: ["https://www.ncbi.nlm.nih.gov/clinvar/variation/15333/"],
    associated_populations: ["YRI", "ESN", "GWD", "MSL", "LWK", "ACB", "ASW"],
    founder_variant: true,
    frequency_evidence: [
      {
        population: "AFR",
        allele_frequency: null,
        carrier_frequency: null,
        disease_prevalence: "Sickle cell trait up to ~1 in 13 African-American births (trait)",
        sample_size_or_denominator: null,
        enrichment_note: "Enriched in populations with historical malaria exposure.",
        source_url: "https://www.ncbi.nlm.nih.gov/clinvar/variation/15333/",
      },
    ],
    notes:
      "Directly array-typable SNP. On chr11 (unprocessed here): locus ancestry unavailable even when the genotype is observed.",
  },
  {
    variant_id: "HEXA_1278insTATC",
    condition: "Tay-Sachs disease",
    gene: "HEXA",
    inheritance: "autosomal recessive",
    build: "GRCh37",
    chromosome: "15",
    position_1based: 72638892,
    hgvs: "NM_000520.6(HEXA):c.1274_1277dup; 1278insTATC",
    rsid: "rs387906309",
    variant_class: "indel",
    clinical_allele: null,
    clinical_classification: "Pathogenic",
    review_status: "criteria provided, multiple submitters, no conflicts",
    citations: ["https://www.ncbi.nlm.nih.gov/clinvar/variation/3827/"],
    associated_populations: ["AJ"],
    founder_variant: true,
    frequency_evidence: [
      {
        population: "AJ",
        allele_frequency: null,
        carrier_frequency: 0.03,
        disease_prevalence: null,
        sample_size_or_denominator: "~1 in 30 carrier frequency in Ashkenazi Jewish population",
        enrichment_note: "Classic Ashkenazi Jewish founder variant.",
        source_url: "https://www.ncbi.nlm.nih.gov/clinvar/variation/3827/",
      },
    ],
    notes: "AJ founder frameshift (indel). On chr15 (unprocessed here).",
  },
];

/** Chromosomes for which the current bundle has local ancestry segments. */
export function processedChromosomes(
  segments: { chromosome: string }[],
): Set<string> {
  return new Set(segments.map((s) => s.chromosome));
}
