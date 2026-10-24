/**
 * Clinician-facing derivations over the normalized bundle.
 *
 * These compute TRIAGE-oriented figures from facts already in the bundle — they
 * never fabricate risk numbers, percentiles, or guideline recommendations. The
 * language is "consider"/"confirm", never diagnostic or treatment advice.
 *
 * Derived here:
 *  - per-locus carrier status (copies of the clinical/effect allele, zygosity)
 *  - a quantified coverage ratio (assayable vs not) for the curated panel
 *  - PGS coverage transparency (how much of a score's markers were observed)
 *  - a "suggested considerations" list built only from observed facts
 *
 * Everything is scoped to the curated conditions in the bundle; absence of a
 * finding is never presented as a reassuring negative.
 */

import type { AnalysisBundle } from "./explorer";
import type { DiseaseEvidence, ScoreResult } from "./types";

export type Zygosity =
  | "homozygous"
  | "heterozygous"
  | "absent"
  | "indeterminate";

export interface CarrierStatus {
  variant_key: string;
  rsid: string | null;
  gene: string | null;
  condition: string;
  inheritance: string | null;
  classification: string | null;
  review_status: string | null;
  conflicting: boolean;
  measurement_status: string;
  /** True only when the position was directly observed/imputed. */
  assayed: boolean;
  /** Copies of the clinical/effect allele (0/1/2), or null when not assayed. */
  clinical_allele_copies: number | null;
  zygosity: Zygosity;
  /** Plain "consider/confirm" interpretation line. Never a diagnosis. */
  interpretation: string;
}

const ASSAYED = new Set(["observed", "imputed"]);

/** Count copies of an effect allele within a genotype string like "T/TC". */
function countAllele(genotype: string, allele: string | null | undefined): number | null {
  if (!allele) return null;
  const sep = genotype.includes("|") ? "|" : "/";
  const parts = genotype.split(sep).map((a) => a.trim());
  if (parts.length < 2 || parts.some((p) => p === "" || p === ".")) return null;
  return parts.filter((p) => p.toUpperCase() === allele.toUpperCase()).length;
}

function zygosityOf(copies: number | null): Zygosity {
  if (copies === null) return "indeterminate";
  if (copies >= 2) return "homozygous";
  if (copies === 1) return "heterozygous";
  return "absent";
}

/**
 * Per-locus carrier status for every curated evidence row, pairing it with the
 * observed variant and counting clinical-allele copies where assayed.
 */
export function carrierStatuses(bundle: AnalysisBundle): CarrierStatus[] {
  const variantByKey = new Map(bundle.variants.map((v) => [v.variant_key, v]));
  const geneByCondition = new Map(
    bundle.conditions.map((c) => [c.condition, c.gene]),
  );

  return bundle.evidence.map((e: DiseaseEvidence) => {
    const v = variantByKey.get(e.variant_key);
    const assayed = v ? ASSAYED.has(v.measurement_status) : false;
    const copies =
      v && assayed ? countAllele(v.genotype, e.effect_allele) : null;
    const zygosity = zygosityOf(copies);
    return {
      variant_key: e.variant_key,
      rsid: v?.rsid ?? null,
      gene: geneByCondition.get(e.condition) ?? null,
      condition: e.condition,
      inheritance: e.inheritance ?? null,
      classification: e.classification ?? null,
      review_status: e.review_status ?? null,
      conflicting: e.conflicting ?? false,
      measurement_status: v?.measurement_status ?? "not_assayed",
      assayed,
      clinical_allele_copies: copies,
      zygosity,
      interpretation: interpret(e, assayed, copies),
    };
  });
}

function interpret(
  e: DiseaseEvidence,
  assayed: boolean,
  copies: number | null,
): string {
  if (!assayed || copies === null) {
    return "Not assayed at this position. Absence is not a negative result; confirmatory testing is required to assess it.";
  }
  const recessive = (e.inheritance ?? "").toLowerCase().includes("recessive");
  if (copies === 0) {
    return "Clinical allele not observed at this position. This covers only this curated variant, not the whole gene.";
  }
  if (copies === 1) {
    return recessive
      ? "One copy of the clinical allele observed — consistent with carrier status for a recessive condition. Consider confirmatory testing and, where relevant, partner screening and counseling."
      : "One copy of a curated clinical allele observed. Consider confirmatory clinical genetic testing and genetic counseling. This is not a diagnosis.";
  }
  return recessive
    ? "Two copies of the clinical allele observed. Consider confirmatory clinical testing and specialist referral. This is not a diagnosis."
    : "Two copies of a curated clinical allele observed. Consider confirmatory clinical testing and specialist referral. This is not a diagnosis.";
}

export interface CoverageRow {
  condition: string;
  gene: string;
  assayable: number;
  total: number;
  not_assayed: string[];
}

export interface CoverageSummary {
  rows: CoverageRow[];
  assayable: number;
  total: number;
}

/**
 * Quantified "what was NOT tested" coverage for the curated panel: per
 * condition, how many of its curated variants were actually assayed vs total.
 */
export function coverageSummary(bundle: AnalysisBundle): CoverageSummary {
  const variantByKey = new Map(bundle.variants.map((v) => [v.variant_key, v]));
  let assayable = 0;
  let total = 0;
  const rows: CoverageRow[] = bundle.conditions.map((c) => {
    const keys = c.examined_variant_keys;
    let rowAssayable = 0;
    const notAssayed: string[] = [];
    for (const k of keys) {
      const v = variantByKey.get(k);
      if (v && ASSAYED.has(v.measurement_status)) {
        rowAssayable++;
      } else {
        notAssayed.push(v?.rsid ?? k);
      }
    }
    assayable += rowAssayable;
    total += keys.length;
    return {
      condition: c.condition,
      gene: c.gene,
      assayable: rowAssayable,
      total: keys.length,
      not_assayed: notAssayed,
    };
  });
  return { rows, assayable, total };
}

export interface PgsCoverage {
  model_id: string;
  condition: string;
  coverage_pct: number;
  scorable: boolean;
  /** Honest one-line verdict for a clinician. */
  verdict: string;
  limitations: string;
}

/**
 * PGS coverage transparency: surface how much of a score's markers were
 * observed, and state plainly that a partial/low-coverage score is not an
 * interpretable, calibrated result. No percentile, no absolute risk.
 */
export function pgsCoverage(scores: ScoreResult[]): PgsCoverage[] {
  return scores.map((s: ScoreResult) => {
    const pct = Math.round((s.marker_coverage ?? 0) * 100);
    const scorable = s.raw_score !== null;
    const verdict = !scorable
      ? `Unscorable — ${s.unscorable_reason ?? "insufficient marker coverage"}. No score is produced.`
      : `${pct}% of model markers observed. Reported as a partial weighted sum only — not a calibrated score, no percentile, no absolute risk.`;
    return {
      model_id: s.model_id,
      condition: s.condition,
      coverage_pct: pct,
      scorable,
      verdict,
      limitations: s.limitations,
    };
  });
}

export interface Consideration {
  /** The observed finding (fact). */
  finding: string;
  /** The suggested next step, in "consider/confirm" language. */
  action: string;
  /** How actionable (3 = observed clinical allele, 1 = context only). */
  actionability: number;
  condition: string;
  gene: string | null;
}

/**
 * Suggested considerations for triage, built ONLY from observed facts, sorted
 * by actionability (not risk magnitude). Observed clinical alleles rank highest;
 * coverage gaps and population-frequency context rank lower. Never diagnostic.
 */
export function considerations(bundle: AnalysisBundle): Consideration[] {
  const items: Consideration[] = [];
  const statuses = carrierStatuses(bundle);
  const labelsPresent = new Set(bundle.segments.map((s) => s.ancestry_label));

  for (const st of statuses) {
    if (st.assayed && (st.clinical_allele_copies ?? 0) > 0) {
      items.push({
        finding: `${st.rsid ?? st.variant_key}: ${st.clinical_allele_copies} copy(ies) of the clinical allele observed (${st.condition})`,
        action: st.conflicting
          ? "Interpretation is conflicting — consider clinical review before acting; confirmatory testing recommended."
          : "Consider confirmatory clinical genetic testing and genetic-counseling referral.",
        actionability: 3,
        condition: st.condition,
        gene: st.gene,
      });
    } else if (!st.assayed) {
      items.push({
        finding: `${st.rsid ?? st.variant_key}: not assayed by this array (${st.condition})`,
        action: "A negative is not established — if clinically indicated, consider targeted testing that covers this variant.",
        actionability: 2,
        condition: st.condition,
        gene: st.gene,
      });
    }
  }

  // Population-frequency context (lowest actionability), only where an
  // elevated-frequency reference group overlaps the inferred ancestry.
  for (const c of bundle.conditions) {
    const overlap = c.elevated_frequency_groups.some((g) => labelsPresent.has(g));
    if (overlap) {
      items.push({
        finding: `Founder-variant frequency elevated in an overlapping reference group (${c.condition})`,
        action: "Population-frequency context only — not a personal finding. May inform whether targeted screening is offered per local guidelines.",
        actionability: 1,
        condition: c.condition,
        gene: c.gene,
      });
    }
  }

  // Sort by actionability (desc), then condition for stability.
  return items.sort(
    (a, b) =>
      b.actionability - a.actionability ||
      a.condition.localeCompare(b.condition),
  );
}
