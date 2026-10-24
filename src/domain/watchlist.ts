/**
 * SNPshot core feature (UI domain): ancestry-informed pathogenic-variant
 * watchlist. Mirrors pipeline/ancestry_explorer/watchlist.py.
 *
 * For every catalog variant, local ancestry at THAT VARIANT'S LOCUS is the
 * central lookup, done independently on chromosome copy 1 and copy 2. Whole-
 * genome / whole-chromosome composition is never substituted for the locus
 * segment.
 *
 * Interpretation guardrails (enforced + surfaced), matching the pipeline:
 *  - ancestry contextualizes attention for an unmeasured variant; it never
 *    establishes presence/absence
 *  - population frequency is not disease effect/penetrance/personal risk
 *  - lower documented frequency = weaker evidence, NOT "safe"/"ruled out"
 *  - directly observed findings stay visible regardless of ancestry
 *  - ancestry labels are experimental reference-population similarity, not known
 *    ethnicity; marginal probabilities are never risk percentages
 *  - no observed allele is attributed to a specific copy unless phase is known
 */

import type { AncestrySegment, VariantObservation } from "./types";
import { superPopulationFor } from "./geography";

export interface FrequencyEvidence {
  population: string;
  allele_frequency: number | null;
  carrier_frequency: number | null;
  disease_prevalence: string | null;
  sample_size_or_denominator: string | null;
  enrichment_note: string | null;
  source_url: string;
}

export interface CatalogVariant {
  variant_id: string;
  condition: string;
  gene: string;
  inheritance: string;
  build: string;
  chromosome: string;
  position_1based: number;
  hgvs: string | null;
  rsid: string | null;
  variant_class: "snp" | "indel";
  /** The pathogenic allele (+ strand), for observed-carrier counting. */
  clinical_allele: string | null;
  clinical_classification: string;
  review_status: string;
  citations: string[];
  associated_populations: string[];
  founder_variant: boolean;
  frequency_evidence: FrequencyEvidence[];
  notes: string;
}

export interface CopyAncestry {
  copy_index: 1 | 2;
  available: boolean;
  ancestry_label: string | null;
  assignment_status: string | null;
  segment_start_0based: number | null;
  segment_end_0based_exclusive: number | null;
  marginal_probabilities: Record<string, number> | null;
  reason: string;
}

export type CompatibilityStatus =
  | "supported"
  | "within_superpopulation"
  | "mismatch"
  | "no_association_documented"
  | "ancestry_unresolved"
  | "not_available";

export type PriorityCategory =
  | "observed_finding"
  | "ancestry_supported"
  | "review_status_strong"
  | "context_weak"
  | "ancestry_unresolved"
  | "ancestry_not_available";

/**
 * Relevance to THIS user's data:
 *  - "observed_finding": a clinically relevant allele was directly observed.
 *  - "ancestry_relevant": real local ancestry at the locus matches the
 *    variant's specifically associated population (a data-driven reason).
 *  - "not_relevant": neither applies for this data (e.g. an AJ founder variant
 *    on an unprocessed chromosome with no matching ancestry and no observed
 *    genotype). Kept for the coverage view, excluded from primary insights.
 */
export type Relevance = "observed_finding" | "ancestry_relevant" | "not_relevant";

export interface WatchlistEntry {
  variant: CatalogVariant;
  copy1: CopyAncestry;
  copy2: CopyAncestry;
  compatibility: { status: CompatibilityStatus; detail: string };
  measurement_status: string;
  observed_genotype: string | null;
  phase_established: boolean;
  priority_category: PriorityCategory;
  priority_reasons: string[];
  attention_rationale: string;
  /** Whether this entry is interesting for the handed-in data (see Relevance). */
  relevance: Relevance;
  limitations: string[];
}

const PRIORITY_ORDER: Record<PriorityCategory, number> = {
  observed_finding: 0,
  ancestry_supported: 1,
  review_status_strong: 2,
  context_weak: 3,
  ancestry_unresolved: 4,
  ancestry_not_available: 5,
};

const COMMON_LIMITATIONS = [
  "Local ancestry contextualizes attention; it cannot establish a variant's presence or absence.",
  "Population frequency is not disease effect, penetrance, or personal disease probability.",
  "Lower documented frequency means weaker ancestry-based evidence, not 'safe', 'ruled out', or 'skip screening'.",
  "Ancestry labels are experimental reference-population similarity, not known ethnicity; marginal probabilities are not risk percentages.",
];

function overlappingSegment(
  segments: AncestrySegment[],
  chrom: string,
  pos0: number,
  copy: 1 | 2,
): AncestrySegment | null {
  return (
    segments.find(
      (s) =>
        s.chromosome === chrom &&
        s.copy_index === copy &&
        s.start_0based <= pos0 &&
        pos0 < s.end_0based_exclusive,
    ) ?? null
  );
}

function copyAncestry(
  segments: AncestrySegment[],
  processed: Set<string>,
  chrom: string,
  pos0: number,
  copy: 1 | 2,
): CopyAncestry {
  const base: CopyAncestry = {
    copy_index: copy,
    available: false,
    ancestry_label: null,
    assignment_status: null,
    segment_start_0based: null,
    segment_end_0based_exclusive: null,
    marginal_probabilities: null,
    reason: "",
  };
  if (!processed.has(chrom)) {
    return { ...base, reason: "ancestry_not_available: chromosome not processed" };
  }
  const seg = overlappingSegment(segments, chrom, pos0, copy);
  if (!seg) {
    return { ...base, reason: "no overlapping ancestry segment on this copy" };
  }
  return {
    copy_index: copy,
    available: true,
    ancestry_label: seg.ancestry_label,
    assignment_status: seg.assignment_status,
    segment_start_0based: seg.start_0based,
    segment_end_0based_exclusive: seg.end_0based_exclusive,
    marginal_probabilities: seg.probabilities ?? null,
    reason: "locus-specific segment found",
  };
}

function compatibility(
  assoc: string[],
  c1: CopyAncestry,
  c2: CopyAncestry,
  panelPopulations?: Set<string>,
): { status: CompatibilityStatus; detail: string } {
  if (assoc.length === 0) {
    return {
      status: "no_association_documented",
      detail:
        "No specific founder/population association is documented, so locus ancestry adds little population-frequency context.",
    };
  }
  const labels = [c1, c2]
    .filter((c) => c.available && c.ancestry_label)
    .map((c) => c.ancestry_label as string);
  if (labels.length === 0) {
    return {
      status: "not_available",
      detail:
        "Local ancestry is not available at this locus, so population compatibility is unresolved.",
    };
  }
  // If the active panel has no reference group for the associated population(s)
  // (nor any group in the same super-population), it CANNOT resolve the
  // association. Report "ancestry_unresolved", not "mismatch": a missing
  // reference group is not evidence of conflict. This is the Ashkenazi case
  // until an AJ reference group is in the panel.
  if (panelPopulations && panelPopulations.size > 0) {
    const assocSuperSet = new Set(assoc.map(superPopulationFor));
    const panelSuperSet = new Set([...panelPopulations].map(superPopulationFor));
    const panelCanRepresent =
      assoc.some((p) => panelPopulations.has(p)) ||
      [...assocSuperSet].some((s) => panelSuperSet.has(s) && s !== "UNKNOWN");
    if (!panelCanRepresent) {
      return {
        status: "ancestry_unresolved",
        detail:
          "The active reference panel has no group for the associated population(s) " +
          [...new Set(assoc)].sort().join(", ") +
          ", so local ancestry CANNOT resolve this association. This is " +
          "'unresolved', not a mismatch and not 'irrelevant'.",
      };
    }
  }
  const assocSet = new Set(assoc);
  if (labels.some((l) => assocSet.has(l))) {
    return {
      status: "supported",
      detail:
        "At least one chromosome copy's locus ancestry matches a specifically associated reference population. A reason for additional attention; it does not establish presence.",
    };
  }
  const assocSuper = new Set(assoc.map(superPopulationFor));
  const labelSuper = new Set(labels.map(superPopulationFor));
  if ([...assocSuper].some((s) => labelSuper.has(s) && s !== "UNKNOWN")) {
    return {
      status: "within_superpopulation",
      detail:
        "Locus ancestry is in the same broad super-population as the association but NOT the specific founder group; relevance is weaker and a specific founder match is unresolved.",
    };
  }
  return {
    status: "mismatch",
    detail:
      "Locus ancestry does not match the associated population. The variant is still shown; lower relevance does NOT mean safe, ruled out, or skip screening.",
  };
}

function countClinicalAllele(
  genotype: string,
  clinicalAllele: string,
  strandConversion: "none" | "complement",
): number | null {
  const comp: Record<string, string> = { A: "T", T: "A", C: "G", G: "C" };
  const ca = clinicalAllele.toUpperCase();
  if (!(ca in comp)) return null;
  const target = strandConversion === "complement" ? comp[ca] : ca;
  const sep = genotype.includes("|") ? "|" : "/";
  const parts = genotype.split(sep).map((a) => a.trim().toUpperCase());
  if (parts.length < 2 || parts.some((p) => p === "" || p === ".")) return null;
  return parts.filter((p) => p === target).length;
}

/** Observed-genotype provenance for a catalog variant, from the pipeline. */
export interface ObservedProvenance {
  measurement_status: string;
  genotype: string | null;
  strand_conversion?: "none" | "complement";
}

function assignPriority(
  v: CatalogVariant,
  compat: { status: CompatibilityStatus },
  measurementStatus: string,
  carries: boolean | null,
): { category: PriorityCategory; reasons: string[]; rationale: string } {
  const expert = v.review_status.toLowerCase().includes("expert panel");
  if (measurementStatus === "observed" && carries) {
    return {
      category: "observed_finding",
      reasons: ["A clinically relevant allele was directly observed."],
      rationale:
        "Directly observed finding; visible regardless of ancestry. Confirm with clinical testing.",
    };
  }
  if (compat.status === "supported") {
    return {
      category: "ancestry_supported",
      reasons: [
        `${v.clinical_classification} (${v.review_status}).`,
        "Locus ancestry on at least one copy matches a specifically associated founder population.",
      ],
      rationale:
        "Local ancestry at this locus is a reason for additional attention for an unmeasured/at-risk variant. It does NOT establish presence.",
    };
  }
  if (expert) {
    return {
      category: "review_status_strong",
      reasons: [
        `${v.clinical_classification}, reviewed by expert panel.`,
        "Locus-ancestry support is weaker or unresolved.",
      ],
      rationale:
        "Strong clinical evidence; local-ancestry support is weaker or unresolved here. Lower frequency relevance is not reassurance.",
    };
  }
  if (compat.status === "not_available") {
    return {
      category: "ancestry_not_available",
      reasons: ["Ancestry at this locus is not available (chromosome not processed)."],
      rationale:
        "Cannot use local ancestry here yet. Clinical evidence still stands; absence of ancestry context is not reassurance.",
    };
  }
  if (compat.status === "ancestry_unresolved") {
    return {
      category: "ancestry_unresolved",
      reasons: [
        `${v.clinical_classification} (${v.review_status}).`,
        "The reference panel has no group for the associated population, so ancestry cannot resolve this association.",
      ],
      rationale:
        "The associated population is not resolvable by the active reference panel (e.g. no Ashkenazi reference group). The variant stays visible and its clinical evidence stands; ancestry context is UNRESOLVED, not irrelevant and not reassurance.",
    };
  }
  return {
    category: "context_weak",
    reasons: [`${v.clinical_classification} (${v.review_status}); weak or mismatched local-ancestry relevance.`],
    rationale:
      "Documented pathogenic variant with weaker/mismatched local-ancestry relevance. Weaker evidence is not 'safe' or 'ruled out'.",
  };
}

/**
 * Derive the set of populations the active reference panel can assign, from the
 * labels actually present in the run's segments. This is the data-driven
 * substitute for a hardcoded population list: a panel that lacks an AJ group
 * will have no AJ-labeled segments, so AJ associations become
 * "ancestry_unresolved" rather than "mismatch".
 */
export function panelPopulationsFromSegments(segments: AncestrySegment[]): Set<string> {
  const pops = new Set<string>();
  for (const s of segments) {
    if (s.ancestry_label && s.ancestry_label !== "UNKNOWN") {
      pops.add(s.ancestry_label);
    }
  }
  return pops;
}

export function buildWatchlist(
  catalog: CatalogVariant[],
  segments: AncestrySegment[],
  processedChromosomes: Set<string>,
  observedByRsid: Record<string, ObservedProvenance> = {},
  panelPopulations?: Set<string>,
): WatchlistEntry[] {
  const entries: WatchlistEntry[] = catalog.map((v) => {
    const pos0 = v.position_1based - 1;
    const c1 = copyAncestry(segments, processedChromosomes, v.chromosome, pos0, 1);
    const c2 = copyAncestry(segments, processedChromosomes, v.chromosome, pos0, 2);
    const compat = compatibility(v.associated_populations, c1, c2, panelPopulations);

    const prov = v.rsid ? observedByRsid[v.rsid] : undefined;
    let measurementStatus = "unassayed";
    let observedGenotype: string | null = null;
    let carries: boolean | null = null;
    if (prov) {
      measurementStatus = prov.measurement_status;
      observedGenotype = prov.genotype;
      if (measurementStatus === "observed" && prov.genotype && v.clinical_allele) {
        const copies = countClinicalAllele(
          prov.genotype,
          v.clinical_allele,
          prov.strand_conversion ?? "none",
        );
        carries = copies !== null ? copies > 0 : null;
      }
    }

    const phaseEstablished = false; // never attribute an allele to a copy
    const { category, reasons, rationale } = assignPriority(
      v,
      compat,
      measurementStatus,
      carries,
    );

    // Relevance to THIS data: an observed clinically relevant allele, or a real
    // locus-ancestry match to a specifically associated population. Everything
    // else is not interesting for this user's data (shown only in coverage).
    let relevance: Relevance;
    if (measurementStatus === "observed" && carries) {
      relevance = "observed_finding";
    } else if (compat.status === "supported") {
      relevance = "ancestry_relevant";
    } else {
      relevance = "not_relevant";
    }

    const limitations = [...COMMON_LIMITATIONS];
    if (!phaseEstablished && measurementStatus === "observed") {
      limitations.push(
        "Observed genotype is not attributed to a specific chromosome copy because phase is not established at this locus.",
      );
    }

    return {
      variant: v,
      copy1: c1,
      copy2: c2,
      compatibility: compat,
      measurement_status: measurementStatus,
      observed_genotype: observedGenotype,
      phase_established: phaseEstablished,
      priority_category: category,
      priority_reasons: reasons,
      attention_rationale: rationale,
      relevance,
      limitations,
    };
  });

  return entries.sort(
    (a, b) => PRIORITY_ORDER[a.priority_category] - PRIORITY_ORDER[b.priority_category],
  );
}

/**
 * Build observed-genotype provenance for catalog variants from the bundle's
 * variant observations, matching by rsid. Measurement status and genotype come
 * from the observation; absence yields no entry (never reference by default).
 */
export function observedFromBundle(
  variants: VariantObservation[],
): Record<string, ObservedProvenance> {
  const out: Record<string, ObservedProvenance> = {};
  for (const v of variants) {
    if (!v.rsid) continue;
    out[v.rsid] = {
      measurement_status: v.measurement_status,
      genotype: v.genotype ?? null,
    };
  }
  return out;
}

/** Top-line summary of the watchlist, for the Overview tab. */
export interface WatchlistSummary {
  total: number;
  observed: number;
  ancestry_supported: number;
  strong_evidence: number;
  not_assayed: number;
  conditions: number;
  processed_chromosomes: string[];
}

export function summarizeWatchlist(
  entries: WatchlistEntry[],
  processed: Set<string>,
): WatchlistSummary {
  const conditions = new Set(entries.map((e) => e.variant.condition));
  return {
    total: entries.length,
    observed: entries.filter((e) => e.priority_category === "observed_finding").length,
    ancestry_supported: entries.filter(
      (e) => e.priority_category === "ancestry_supported",
    ).length,
    strong_evidence: entries.filter(
      (e) => e.priority_category === "review_status_strong",
    ).length,
    not_assayed: entries.filter(
      (e) =>
        e.measurement_status === "unassayed" ||
        e.measurement_status === "indel_uninterpretable" ||
        e.measurement_status === "not_assayed",
    ).length,
    conditions: conditions.size,
    processed_chromosomes: [...processed].sort(),
  };
}

export interface ConditionGroup {
  condition: string;
  gene: string;
  inheritance: string;
  entries: WatchlistEntry[];
  observed: number;
  assayable: number;
  total: number;
}

/** Group watchlist entries by condition, for the Conditions tab. */
export function groupByCondition(entries: WatchlistEntry[]): ConditionGroup[] {
  const map = new Map<string, ConditionGroup>();
  for (const e of entries) {
    const key = e.variant.condition;
    const g = map.get(key) ?? {
      condition: e.variant.condition,
      gene: e.variant.gene,
      inheritance: e.variant.inheritance,
      entries: [],
      observed: 0,
      assayable: 0,
      total: 0,
    };
    g.entries.push(e);
    g.total++;
    if (e.measurement_status === "observed") {
      g.assayable++;
      if (e.priority_category === "observed_finding") g.observed++;
    }
    map.set(key, g);
  }
  return Array.from(map.values()).sort((a, b) => b.observed - a.observed || a.condition.localeCompare(b.condition));
}
