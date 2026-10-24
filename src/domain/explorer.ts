/**
 * Explorer-layer types and reference constants for the Step 6 integrated UI.
 *
 * These sit ON TOP of the normalized schema in types.ts / normalized.schema.json
 * and do not replace it. The UI consumes the SAME normalized records whether
 * they originate from the synthetic bundle or a real pipeline run (Section 7).
 */

import type {
  AncestrySegment,
  DiseaseEvidence,
  FrequencyAnnotation,
  Sample,
  ScoreResult,
  VariantObservation,
} from "./types";

/**
 * GRCh37 (build 37.1) autosome lengths in base pairs. Public reference values
 * for the primary assembly. Used only to scale chromosome track drawing; they
 * are not sample data. Internal coordinates remain 0-based half-open.
 */
export const GRCH37_AUTOSOME_LENGTHS: Record<string, number> = {
  "1": 249250621,
  "2": 243199373,
  "3": 198022430,
  "4": 191154276,
  "5": 180915260,
  "6": 171115067,
  "7": 159138663,
  "8": 146364022,
  "9": 141213431,
  "10": 135534747,
  "11": 135006516,
  "12": 133851895,
  "13": 115169878,
  "14": 107349540,
  "15": 102531392,
  "16": 90354753,
  "17": 81195210,
  "18": 78077248,
  "19": 59128983,
  "20": 63025520,
  "21": 48129895,
  "22": 51304566,
};

export const AUTOSOME_ORDER = Object.keys(GRCH37_AUTOSOME_LENGTHS);

/**
 * A curated gene region of interest (GRCh37 coordinates, 0-based half-open).
 * Positions are approximate reference locations used for region selection and
 * display; they are not sample-derived.
 */
export interface GeneRegion {
  gene: string;
  chromosome: string;
  start_0based: number;
  end_0based_exclusive: number;
  /** Conditions curated as associated with variants in/near this gene. */
  conditions: string[];
  summary: string;
}

/**
 * A curated condition entry (Section 5 "condition page"). Lists the variants we
 * actually examine and declares relevant variants that are NOT in a consumer
 * SNP dataset, so absence is never shown as a reassuring negative.
 */
export interface ConditionManifest {
  condition: string;
  gene: string;
  inheritance: string;
  /**
   * Ancestry reference-group codes with documented elevated frequency of
   * curated pathogenic/founder variants for this condition. This is population
   * frequency context, NOT a per-person risk assignment.
   */
  elevated_frequency_groups: string[];
  rationale: string;
  /** variant_keys examined by this prototype for this condition. */
  examined_variant_keys: string[];
  /** Human-readable descriptions of relevant variants NOT in the dataset. */
  not_measured: string[];
  /** Plain-language screening framing for clinicians AND patients. */
  screening_note: string;
  source_urls: string[];
}

/**
 * The composite analysis bundle: the assumed outputs of plan Steps 2-6 for one
 * sample, all expressed in the normalized schema. This is the single object the
 * explorer renders.
 */
export interface AnalysisBundle {
  sample: Sample;
  segments: AncestrySegment[];
  variants: VariantObservation[];
  frequencies: FrequencyAnnotation[];
  evidence: DiseaseEvidence[];
  genes: GeneRegion[];
  conditions: ConditionManifest[];
  scores: ScoreResult[];
}

/** A region the user has selected in the explorer (internal 0-based). */
export interface SelectedRegion {
  chromosome: string;
  start_0based: number;
  end_0based_exclusive: number;
  /** Optional gene this selection corresponds to. */
  gene?: string;
}

export function chromLength(chrom: string): number {
  return GRCH37_AUTOSOME_LENGTHS[chrom] ?? 0;
}

/** Segments overlapping a half-open interval on either copy. */
export function segmentsOverlapping(
  segments: AncestrySegment[],
  chromosome: string,
  start_0based: number,
  end_0based_exclusive: number,
): AncestrySegment[] {
  return segments.filter(
    (s) =>
      s.chromosome === chromosome &&
      s.start_0based < end_0based_exclusive &&
      s.end_0based_exclusive > start_0based,
  );
}

/** Variants whose 0-based position falls within a half-open interval. */
export function variantsIn(
  variants: VariantObservation[],
  chromosome: string,
  start_0based: number,
  end_0based_exclusive: number,
): VariantObservation[] {
  return variants.filter(
    (v) =>
      v.chromosome === chromosome &&
      v.position_0based >= start_0based &&
      v.position_0based < end_0based_exclusive,
  );
}

/** Human-facing 1-based position label from an internal 0-based coordinate. */
export function toDisplayPosition(position_0based: number): number {
  return position_0based + 1;
}

/** Format a base-pair count compactly (e.g. 1.2 Mb). */
export function formatBp(bp: number): string {
  if (bp >= 1_000_000) return `${(bp / 1_000_000).toFixed(2)} Mb`;
  if (bp >= 1_000) return `${(bp / 1_000).toFixed(1)} kb`;
  return `${bp} bp`;
}
