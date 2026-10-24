/**
 * Normalized domain types — TypeScript mirror of schemas/normalized.schema.json
 * (HACKATHON_PROJECT_PLAN.md Section 8).
 *
 * Internal coordinate convention: 0-based, half-open intervals.
 * Privacy: raw allele data must never reach logs, analytics, error reports, or URLs.
 */

export type GenomeBuild = "GRCh37" | "GRCh38" | "unknown";

export type MeasurementStatus =
  | "observed"
  | "imputed"
  | "not_assayed"
  | "no_call"
  | "excluded";

export type ProcessingStatus =
  | "parsed"
  | "insufficient_data"
  | "invalid_input"
  | "harmonized"
  | "phased"
  | "ancestry_inferred"
  | "annotated"
  | "scored"
  | "blocked";

export type RecordKind =
  | "snp"
  | "no_call"
  | "indel_unsupported"
  | "duplicate_exact"
  | "duplicate_conflicting"
  | "non_autosomal";

export type ParseErrorCode =
  | "bad_column_count"
  | "bad_header"
  | "non_integer_position"
  | "non_positive_position"
  | "unexpected_allele_token"
  | "unsupported_indel"
  | "unknown_chromosome"
  | "empty_line";

export interface QualitySummary {
  total_records: number;
  parsed_records: number;
  autosomal_records: number;
  no_call_count: number;
  unsupported_indel_count: number;
  duplicate_exact_count: number;
  duplicate_conflicting_count: number;
  /** Map of human-readable chromosome label -> excluded record count. */
  excluded_by_chromosome: Record<string, number>;
  error_count: number;
  sufficient_for_inference: boolean;
}

export interface SourceMetadata {
  source_format: string;
  array_version: string | null;
  converter_version: string | null;
  declared_build: string;
  normalized_build: GenomeBuild;
  strand: string;
  generated_at: string | null;
  usage_notice: string;
}

export interface Provenance {
  source_type: "ancestrydna_upload" | "synthetic_demo" | "precomputed";
  accessed_at: string;
  notes?: string;
  source_url?: string | null;
}

export interface Sample {
  sample_id: string;
  source_type: "ancestrydna_upload" | "synthetic_demo" | "precomputed";
  genome_build: GenomeBuild;
  synthetic: boolean;
  processing_status: ProcessingStatus;
  quality_summary: QualitySummary;
  provenance: Provenance;
  source_metadata?: SourceMetadata;
}

export interface ParsedRecord {
  rsid: string;
  chromosome_raw: string;
  chromosome_norm: string;
  position_1based: number;
  position_0based: number;
  /** Raw observed allele. NOT a parental copy and NOT REF/ALT. */
  allele1: string;
  /** Raw observed allele. NOT a parental copy and NOT REF/ALT. */
  allele2: string;
  record_kind: RecordKind;
}

export interface ParseError {
  line_number: number;
  code: ParseErrorCode;
  /** Human-readable. MUST NOT contain allele values. */
  message: string;
}

export interface ParseResult {
  records: ParsedRecord[];
  metadata: SourceMetadata;
  quality_summary: QualitySummary;
  errors: ParseError[];
}

export interface VariantObservation {
  variant_key: string;
  chromosome: string;
  position_0based: number;
  ref: string | null;
  alt: string | null;
  rsid?: string | null;
  genotype: string;
  phased: boolean;
  phase_set?: string | null;
  measurement_status: MeasurementStatus;
  quality_flags: string[];
}

export interface AncestrySegment {
  sample_id: string;
  chromosome: string;
  start_0based: number;
  end_0based_exclusive: number;
  copy_index: 1 | 2;
  ancestry_label: string;
  probabilities?: Record<string, number> | null;
  assignment_status: "assigned" | "uncertain" | "unknown";
  method: string;
  reference_panel: string;
  parental_origin?: string | null;
  provenance: Provenance;
}

export interface FrequencyAnnotation {
  variant_key: string;
  dataset_version: string;
  ancestry_group: string;
  frequency_basis: "global_group" | "local_ancestry";
  allele_count: number | null;
  allele_number: number | null;
  /** May be null. NEVER substitute zero for missing data. */
  allele_frequency: number | null;
  filters: string[] | null;
  source_url: string;
}

export interface DiseaseEvidence {
  variant_key: string;
  condition: string;
  evidence_type: "clinvar" | "gwas" | "curated_score_weight";
  classification?: string | null;
  review_status?: string | null;
  conflicting?: boolean | null;
  inheritance?: string | null;
  effect_allele?: string | null;
  effect_size?: number | null;
  effect_metric?: string | null;
  study_population?: string | null;
  source_url: string;
  accessed_at: string;
  limitations: string;
}

export interface ScoreResult {
  model_id: string;
  model_version: string;
  condition: string;
  raw_score: number | null;
  unscorable_reason?: string | null;
  marker_coverage: number;
  missing_data_method: string;
  reference_distribution?: string | null;
  percentile?: number | null;
  absolute_risk?: number | null;
  validation_populations: string[];
  limitations: string;
  provenance: Provenance;
}
