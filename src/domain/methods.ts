/**
 * Methods knowledge base — plain-language descriptions of the analysis pipeline
 * steps (HACKATHON_PROJECT_PLAN.md Section 9) that the in-app assistant draws on
 * to explain HOW results were produced.
 *
 * Each step has a `status`:
 *  - "implemented": the real pipeline stage exists in this repo.
 *  - "backfill": not yet wired to the real tooling here; the description is the
 *    intended method and is clearly labeled as pending so the assistant never
 *    implies a stage ran when it did not.
 *
 * Update `status` (and refine `detail`) as each step is completed. Keeping this
 * here means the assistant's explanations stay in sync with reality instead of
 * overstating what the prototype actually did.
 */

export type MethodStatus = "implemented" | "backfill";

export interface MethodStep {
  id: number;
  key: string;
  title: string;
  status: MethodStatus;
  /** One-line summary. */
  summary: string;
  /** Fuller explanation in plain language. */
  detail: string;
  /** Techniques/tools named for this step. */
  techniques: string[];
  /** Honest limitations to surface alongside any explanation. */
  limitations: string[];
  /** Keywords the assistant matches against a question. */
  keywords: string[];
}

export const METHOD_STEPS: MethodStep[] = [
  {
    id: 1,
    key: "parse",
    title: "Parsing & quality control",
    status: "implemented",
    summary:
      "Reads the AncestryDNA raw text, validates it, and reports a quality summary.",
    detail:
      "The uploaded file is parsed locally in your browser. We read the metadata (array version, genome build 37.1 / GRCh37, forward strand), validate the five-column format, convert 1-based positions to internal 0-based coordinates, and classify each row (SNP, no-call, unsupported indel, duplicate, non-autosomal). A file with too few analysis-ready autosomal SNPs is marked insufficient rather than analyzed.",
    techniques: [
      "Local (in-browser) parsing",
      "Format/column validation",
      "1-based → 0-based coordinate conversion",
      "Duplicate and no-call detection",
    ],
    limitations: [
      "A consumer SNP array only genotypes selected positions; it is not a full genome sequence.",
      "Absence of a variant from the file is not evidence it is absent in the person.",
    ],
    keywords: ["parse", "parsing", "upload", "format", "quality", "coordinates", "build", "snp array", "step 1"],
  },
  {
    id: 2,
    key: "harmonize",
    title: "Harmonization to a reference",
    status: "backfill",
    summary:
      "Aligns variants to a reference genome and writes a standardized VCF.",
    detail:
      "Variants are matched to a pinned GRCh37 reference by build, chromosome, position, and alleles (an rsID alone is not a sufficient key). Reference alleles are validated, strand/ambiguous-allele issues are handled explicitly, unsupported markers are filtered, and a sorted, indexed VCF plus a harmonization report are produced. A reference-build mismatch is blocked rather than silently accepted.",
    techniques: [
      "Reference-allele validation against a pinned GRCh37 FASTA",
      "Position + allele matching (not rsID alone)",
      "Explicit strand / ambiguous-allele handling",
      "VCF normalization and indexing",
    ],
    limitations: [
      "Only autosomal biallelic SNPs enter the first analysis path.",
      "Markers that cannot be confidently aligned are reported, not forced.",
    ],
    keywords: ["harmoniz", "vcf", "reference", "allele", "strand", "liftover", "normalize", "step 2"],
  },
  {
    id: 3,
    key: "phasing",
    title: "Statistical phasing",
    status: "backfill",
    summary:
      "Estimates which alleles sit together on the same chromosome copy.",
    detail:
      "Phasing estimates haplotypes — which alleles are inherited together on one physical chromosome copy — using a phased reference panel and a genetic map with an established tool (e.g. Beagle or a SHAPEIT workflow). When parental files are supplied, a family-aware path checks Mendelian consistency. Without evidence of parental origin, the two copies are labeled copy 1 and copy 2. Phasing errors can switch which copy a stretch belongs to.",
    techniques: [
      "Reference-panel statistical phasing (Beagle / SHAPEIT-style)",
      "Genetic map",
      "Optional family-aware (trio) phasing with Mendelian checks",
    ],
    limitations: [
      "Copy 1 / copy 2 are not 'mother' / 'father' unless parental data supports it.",
      "Switch errors mean a copy's identity can flip along a chromosome.",
    ],
    keywords: ["phas", "haplotype", "beagle", "shapeit", "copy 1", "copy 2", "parental", "trio", "family", "mendelian", "step 3"],
  },
  {
    id: 4,
    key: "ancestry",
    title: "Local ancestry inference",
    status: "backfill",
    summary:
      "Infers, along each chromosome copy, which reference population a segment most resembles.",
    detail:
      "Local ancestry inference (e.g. RFMix) compares your phased markers to documented reference populations and assigns each chromosome segment a most-likely reference group, with a probability. Regions with too little marker overlap or low confidence are left as 'uncertain' or 'unknown' rather than guessed. This is ancestry relative to selected reference panels — a model estimate, not an intrinsic ethnicity, and a gene can straddle a boundary between two inferred segments.",
    techniques: [
      "RFMix (or equivalent) local-ancestry inference",
      "Documented reference-population panel",
      "Per-segment probabilities with assigned / uncertain / unknown states",
    ],
    limitations: [
      "Probabilities are model estimates, not calibrated certainties.",
      "Fine-scale ancestry beyond what the reference panel supports is not fabricated.",
      "Ancestry near a gene does not establish that a person carries any particular variant.",
    ],
    keywords: ["ancestry", "local ancestry", "rfmix", "segment", "reference population", "region", "admix", "uncertain", "unknown", "step 4"],
  },
  {
    id: 5,
    key: "evidence",
    title: "Variant evidence, frequencies & disease scoring",
    status: "backfill",
    summary:
      "Annotates variants with population frequencies and clinical evidence, and runs one published disease-specific model where the data qualifies.",
    detail:
      "Observed variants are annotated with ancestry-group allele frequencies (gnomAD-style) and submitted clinical interpretations (ClinVar-style: classification, review status, conflicts). Population frequency is context, not a personal risk coefficient; missing-from-a-database is kept distinct from a frequency of zero. One published disease-specific score is implemented exactly as specified and returns an explicit 'unscorable' result when a sample does not meet the model's documented requirements — it does not fabricate a number.",
    techniques: [
      "gnomAD-style ancestry-group allele frequencies",
      "ClinVar-style clinical interpretations with review status",
      "One published disease-specific scoring model with data-sufficiency gates",
    ],
    limitations: [
      "Elevated population frequency of a founder variant is not a per-person diagnosis.",
      "A polygenic score reflects statistical susceptibility, separate from high-impact Mendelian variants.",
      "No percentile or absolute risk is reported without a validated distribution / calibrated model.",
    ],
    keywords: ["evidence", "frequency", "gnomad", "clinvar", "score", "scoring", "pathogenic", "polygenic", "pgs", "risk model", "percentile", "step 5", "variant"],
  },
];

export function stepByKeyword(q: string): MethodStep[] {
  const lower = q.toLowerCase();
  return METHOD_STEPS.filter((s) =>
    s.keywords.some((k) => lower.includes(k)),
  );
}

/** True if any part of the question is asking "how"/"method"/"technique". */
export function asksHow(q: string): boolean {
  return /\b(how|method|methodolog|technique|work|works|computed|calculated|derived|infer|determine|analy[sz])/i.test(
    q,
  );
}
