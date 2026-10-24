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

/** True for a plain coverage-only marker (establishes assay coverage, no evidence). */
export function isCoverageMarker(v: VariantObservation): boolean {
  return v.quality_flags.includes("coverage_only");
}

/**
 * Coverage-focused summary of the current zoom window. Deliberately scoped to
 * LOCAL COVERAGE facts that the genome-wide Overview tab cannot show: marker
 * density, the largest unmeasured gap, and what that implies for interpreting
 * absence of a finding here. It intentionally omits ancestry-composition and
 * assignment-confidence counts, which are the Overview's job.
 */
export interface WindowCoverage {
  chromosome: string;
  start_0based: number;
  end_0based_exclusive: number;
  span_bp: number;
  /** Zoom factor vs. the full chromosome (1 = whole chromosome). */
  zoom: number;
  /** Assayed markers (coverage + curated) with a position in the window. */
  assayed_markers: number;
  /** Mean bp between assayed markers in the window (null if <2 markers). */
  mean_spacing_bp: number | null;
  /** Largest gap between consecutive assayed markers in the window (bp). */
  largest_gap_bp: number | null;
  /** 0–1 density relative to a typical dense array (~1 per 5 kb). */
  density_fraction: number;
  /** One of: none | sparse | moderate | dense. */
  coverage_level: "none" | "sparse" | "moderate" | "dense";
  /** Plain-language verdict on interpreting absence of a finding here. */
  absence_note: string;
}

/** Reference density: a dense consumer array is roughly 1 marker per ~5 kb. */
const DENSE_ARRAY_SPACING_BP = 5_000;

/**
 * Summarize COVERAGE in the current zoom window. This is the analytical payoff
 * of zooming and is intentionally distinct from the whole-genome Overview.
 */
export function summarizeWindowCoverage(
  variants: VariantObservation[],
  chromosome: string,
  start_0based: number,
  end_0based_exclusive: number,
): WindowCoverage {
  const span = Math.max(1, end_0based_exclusive - start_0based);
  const full = GRCH37_AUTOSOME_LENGTHS[chromosome] ?? span;

  const inWindow = variants
    .filter(
      (v) =>
        v.chromosome === chromosome &&
        v.position_0based >= start_0based &&
        v.position_0based < end_0based_exclusive,
    )
    .sort((a, b) => a.position_0based - b.position_0based);

  let meanSpacing: number | null = null;
  let largestGap: number | null = null;
  if (inWindow.length >= 2) {
    let total = 0;
    let maxGap = 0;
    for (let i = 1; i < inWindow.length; i++) {
      const gap =
        (inWindow[i]?.position_0based ?? 0) -
        (inWindow[i - 1]?.position_0based ?? 0);
      total += gap;
      if (gap > maxGap) maxGap = gap;
    }
    meanSpacing = Math.round(total / (inWindow.length - 1));
    largestGap = maxGap;
  }

  const density_fraction =
    meanSpacing === null
      ? 0
      : Math.max(0, Math.min(1, DENSE_ARRAY_SPACING_BP / meanSpacing));

  let coverage_level: WindowCoverage["coverage_level"];
  let absence_note: string;
  if (inWindow.length === 0) {
    coverage_level = "none";
    absence_note =
      "No assayed markers here — this region is effectively unmeasured at this resolution, so absence of any finding is uninformative.";
  } else if (meanSpacing !== null && meanSpacing > 100_000) {
    coverage_level = "sparse";
    absence_note =
      "Sparse coverage: markers are far apart, so most variation between them is unmeasured. Absence of a finding is not a reassuring negative.";
  } else if (meanSpacing !== null && meanSpacing > 20_000) {
    coverage_level = "moderate";
    absence_note =
      "Moderate coverage: the array samples this region but still skips most positions. Absence does not rule out unmeasured variants.";
  } else {
    coverage_level = "dense";
    absence_note =
      "Denser coverage here, but a consumer array measures only genotyped positions. Absence still does not rule out unmeasured variants.";
  }

  return {
    chromosome,
    start_0based,
    end_0based_exclusive,
    span_bp: span,
    zoom: full / span,
    assayed_markers: inWindow.length,
    mean_spacing_bp: meanSpacing,
    largest_gap_bp: largestGap,
    density_fraction,
    coverage_level,
    absence_note,
  };
}
