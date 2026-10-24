/**
 * In-app assistant (chatbot) engine.
 *
 * Answers questions about the user's results and about HOW the analysis was
 * done (the pipeline steps in methods.ts), with honest framing about
 * implications and risk elevation.
 *
 * PRIVACY (HACKATHON_PROJECT_PLAN.md Section 11), consistent with
 * regionResearch.ts:
 *  - The assistant reasons over an AGGREGATE, non-identifying summary of the
 *    bundle (ancestry composition, flagged conditions, score status, method
 *    descriptions). It never reads or transmits raw alleles/genotypes.
 *  - The default engine is fully OFFLINE and deterministic, so the demo needs
 *    no network. An opt-in remote provider may be enabled; it receives only the
 *    sanitized summary + the question.
 *
 * It is NOT a diagnostic tool. Answers preserve uncertainty and never convert
 * ancestry or a founder variant into a personal disease probability.
 */

import type { AnalysisBundle } from "./explorer";
import { regionDisplayName } from "./geography";
import { METHOD_STEPS, asksHow, stepByKeyword, type MethodStep } from "./methods";

export interface AssistantMessage {
  role: "user" | "assistant";
  text: string;
  /** Optional source links shown under an assistant answer. */
  sources?: string[];
}

/** Sanitized, non-identifying snapshot the assistant reasons over. */
export interface AssistantContext {
  synthetic: boolean;
  sample_id: string;
  genome_build: string;
  processing_status: string;
  /** Top inferred ancestry reference groups by share (name + %). */
  composition: { name: string; pct: number }[];
  assignment: { assigned: number; uncertain: number; unknown: number };
  /** Curated conditions and whether an observed pathogenic variant was seen. */
  conditions: {
    condition: string;
    gene: string;
    elevated_here: boolean;
    observed_pathogenic: boolean;
  }[];
  scores: {
    condition: string;
    scored: boolean;
    reason: string | null;
  }[];
  /** The tab the user is currently on, for light context. */
  activeTab?: string;
}

/** Build the sanitized context from the bundle. No raw alleles/genotypes. */
export function buildAssistantContext(
  bundle: AnalysisBundle,
  activeTab?: string,
): AssistantContext {
  const bpByLabel = new Map<string, number>();
  let total = 0;
  const assignment = { assigned: 0, uncertain: 0, unknown: 0 };
  for (const s of bundle.segments) {
    const bp = s.end_0based_exclusive - s.start_0based;
    bpByLabel.set(s.ancestry_label, (bpByLabel.get(s.ancestry_label) ?? 0) + bp);
    total += bp;
    assignment[s.assignment_status]++;
  }
  const composition = Array.from(bpByLabel.entries())
    .filter(([label]) => label !== "UNKNOWN")
    .map(([label, bp]) => ({
      name: regionDisplayName(label),
      pct: total > 0 ? (bp / total) * 100 : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  const labelsPresent = new Set(bundle.segments.map((s) => s.ancestry_label));
  const observedPathogenic = new Set(
    bundle.evidence
      .filter((e) => {
        const v = bundle.variants.find((x) => x.variant_key === e.variant_key);
        return (
          (e.classification ?? "").toLowerCase().includes("pathogenic") &&
          !e.conflicting &&
          v?.measurement_status === "observed"
        );
      })
      .map((e) => e.condition),
  );

  const conditions = bundle.conditions.map((c) => ({
    condition: c.condition,
    gene: c.gene,
    elevated_here: c.elevated_frequency_groups.some((g) => labelsPresent.has(g)),
    observed_pathogenic: observedPathogenic.has(c.condition),
  }));

  const scores = bundle.scores.map((s) => ({
    condition: s.condition,
    scored: s.raw_score !== null,
    reason: s.unscorable_reason ?? null,
  }));

  return {
    synthetic: bundle.sample.synthetic,
    sample_id: bundle.sample.sample_id,
    genome_build: bundle.sample.genome_build,
    processing_status: bundle.sample.processing_status,
    composition,
    assignment,
    conditions,
    scores,
    activeTab,
  };
}

const DISCLAIMER =
  "This is a research prototype, not medical advice. Ancestry does not establish whether someone carries a pathogenic variant, and an estimate cannot rule one out. Confirmatory clinical testing is required for any health decision.";

const SOURCES = [
  "https://www.ncbi.nlm.nih.gov/clinvar/",
  "https://gnomad.broadinstitute.org/",
];

export interface AssistantProvider {
  id: string;
  remote: boolean;
  answer(question: string, ctx: AssistantContext): Promise<AssistantMessage>;
}

/**
 * Offline deterministic assistant. Classifies the question (methods, results,
 * risk/implications, or general) and composes an answer from the sanitized
 * context and the methods knowledge base. No network, no raw genetic data.
 */
export const offlineAssistant: AssistantProvider = {
  id: "offline-deterministic",
  remote: false,
  async answer(question: string, ctx: AssistantContext): Promise<AssistantMessage> {
    const q = question.trim();
    if (!q) {
      return {
        role: "assistant",
        text: "Ask me about your results (ancestry composition, flagged conditions, the disease score) or how any analysis step works.",
      };
    }
    const lower = q.toLowerCase();
    const parts: string[] = [];

    // 1) Method / "how does X work" questions. Only route to a methods
    // explanation when the user is actually asking HOW something works (or
    // about the pipeline/steps), so result questions that merely mention a
    // method keyword (e.g. "my ancestry composition") stay on the results path.
    const methodHits = stepByKeyword(q);
    const wantsHow = asksHow(q);
    const wantsPipeline = /\b(pipeline|all steps|every step|overall process|how.*analy[sz])\b/i.test(lower);
    const methodsMode =
      (wantsHow && methodHits.length > 0) ||
      /\bstep\s*[1-5]\b/i.test(lower);
    if (methodsMode) {
      for (const step of methodHits.slice(0, 2)) parts.push(describeStep(step));
    } else if (wantsPipeline) {
      parts.push(describePipeline());
    }

    // 2) Results questions (skipped only when we answered in methods mode).
    if (
      !methodsMode &&
      /\b(ancestry|composition|background|where.*from|origin|population|region)\b/i.test(lower)
    ) {
      parts.push(describeComposition(ctx));
    }
    if (/\b(risk|elevat|predispos|chance|likel|suscept|carrier)\b/i.test(lower)) {
      parts.push(describeRisk(ctx, lower));
    }
    if (/\b(condition|disease|cancer|brca|tay|sickle|cystic|which)\b/i.test(lower)) {
      parts.push(describeConditions(ctx, lower));
    }
    if (/\b(score|polygenic|pgs|percentile)\b/i.test(lower)) {
      parts.push(describeScores(ctx));
    }
    if (/\b(uncertain|confiden|unknown|reliab|accura|trust)\b/i.test(lower)) {
      parts.push(describeUncertainty(ctx));
    }

    // 3) Fallback: offer orientation.
    if (parts.length === 0) {
      parts.push(orientation(ctx));
    }

    parts.push(DISCLAIMER);

    return {
      role: "assistant",
      text: parts.join("\n\n"),
      sources: SOURCES,
    };
  },
};

function describeStep(step: MethodStep): string {
  const pending =
    step.status === "backfill"
      ? " (Note: in this prototype this stage is not yet wired to real tooling — the description is the intended method.)"
      : "";
  const lims = step.limitations.length
    ? ` Caveats: ${step.limitations.join(" ")}`
    : "";
  return `Step ${step.id} — ${step.title}.${pending} ${step.detail} Techniques: ${step.techniques.join(", ")}.${lims}`;
}

function describePipeline(): string {
  const lines = METHOD_STEPS.map(
    (s) =>
      `${s.id}. ${s.title}${s.status === "backfill" ? " (pending real tooling)" : ""} — ${s.summary}`,
  );
  return `The analysis runs in ordered stages:\n${lines.join("\n")}`;
}

function describeComposition(ctx: AssistantContext): string {
  if (ctx.composition.length === 0) {
    return "No confident ancestry composition is available for this sample.";
  }
  const top = ctx.composition
    .map((c) => `${c.name} ${c.pct.toFixed(0)}%`)
    .join(", ");
  return `Across both chromosome copies, the inferred local-ancestry composition is approximately: ${top}. This is a model estimate relative to selected reference populations (Step 4), not an intrinsic ethnicity, and individual chromosome segments can be uncertain.`;
}

function describeRisk(ctx: AssistantContext, lower: string): string {
  // If a specific condition is named, scope to it.
  const named = ctx.conditions.find((c) =>
    lower.includes(c.condition.toLowerCase().split(" ")[0] ?? "") ||
    lower.includes(c.gene.toLowerCase()),
  );
  const pool = named ? [named] : ctx.conditions;
  const elevated = pool.filter((c) => c.elevated_here);
  const observed = pool.filter((c) => c.observed_pathogenic);

  const bits: string[] = [];
  if (observed.length > 0) {
    bits.push(
      `An observed curated pathogenic variant was seen for: ${observed
        .map((c) => `${c.condition} (${c.gene})`)
        .join(", ")}. That is an observed genotype in this dataset and warrants confirmatory clinical genetic testing — it is not a diagnosis.`,
    );
  }
  if (elevated.length > 0) {
    bits.push(
      `Your inferred ancestry overlaps reference groups with documented elevated population frequency of founder variants for: ${elevated
        .map((c) => `${c.condition} (${c.gene})`)
        .join(", ")}. Elevated population frequency is a reason a clinician might consider targeted screening; it does not mean you personally carry the variant.`,
    );
  }
  if (bits.length === 0) {
    bits.push(
      "For the curated conditions here, no overlapping elevated-frequency reference group and no observed curated pathogenic variant were found. That is not a clean bill of health: a consumer array measures only a few positions, so most variants are simply unmeasured.",
    );
  }
  return bits.join(" ");
}

function describeConditions(ctx: AssistantContext, lower: string): string {
  const named = ctx.conditions.find((c) =>
    lower.includes(c.gene.toLowerCase()) ||
    c.condition.toLowerCase().split(/\s|\//).some((w) => w.length > 3 && lower.includes(w)),
  );
  const list = named ? [named] : ctx.conditions;
  const rows = list.map((c) => {
    const flags: string[] = [];
    if (c.observed_pathogenic) flags.push("observed curated variant — confirm clinically");
    if (c.elevated_here) flags.push("overlaps an elevated-frequency reference group");
    return `• ${c.condition} (${c.gene}): ${flags.length ? flags.join("; ") : "no flag (may simply be unmeasured)"}`;
  });
  return `Curated conditions examined:\n${rows.join("\n")}`;
}

function describeScores(ctx: AssistantContext): string {
  if (ctx.scores.length === 0) return "No disease-specific score is available.";
  const rows = ctx.scores.map((s) =>
    s.scored
      ? `• ${s.condition}: a score was computed. No percentile or absolute risk is reported without a validated comparison distribution and a calibrated model.`
      : `• ${s.condition}: unscorable${s.reason ? ` — ${s.reason}` : ""}. The model refuses to fabricate a number when the data does not meet its requirements.`,
  );
  return `Disease-specific scoring (Step 5):\n${rows.join("\n")}\nA polygenic score reflects statistical susceptibility and is separate from high-impact Mendelian variants.`;
}

function describeUncertainty(ctx: AssistantContext): string {
  const a = ctx.assignment;
  return `Ancestry assignment confidence across segments: ${a.assigned} assigned, ${a.uncertain} uncertain, ${a.unknown} unknown. Uncertain/unknown regions are shown with hatching and are not presented as confident calls. Probabilities are model estimates, not calibrated certainties.`;
}

function orientation(ctx: AssistantContext): string {
  const synth = ctx.synthetic ? " (synthetic demo data)" : "";
  return `I can explain your results${synth} and how the analysis works. Try: "what's my ancestry composition?", "am I at elevated risk for breast cancer?", "which conditions were flagged?", "how does local ancestry inference work?", or "why is the CAD score unscorable?".`;
}

/**
 * Opt-in remote provider. NOT used by default. Transmits only the sanitized
 * context + question (never raw alleles). Throws without an endpoint/key so it
 * can never silently fall back to transmitting. The caller must obtain consent.
 */
export function createRemoteAssistant(opts: {
  id: string;
  endpoint: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): AssistantProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    id: opts.id,
    remote: true,
    async answer(question, ctx): Promise<AssistantMessage> {
      const res = await doFetch(opts.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({ task: "assistant", question, context: ctx }),
      });
      if (!res.ok) throw new Error(`Assistant provider error: ${res.status}`);
      const data = (await res.json()) as { text?: string; sources?: string[] };
      return {
        role: "assistant",
        text:
          (data.text ?? "No answer returned.") +
          "\n\n" +
          "Generated with a remote AI provider from a sanitized, non-identifying summary (no raw genotypes).\n\n" +
          DISCLAIMER,
        sources: data.sources ?? SOURCES,
      };
    },
  };
}
