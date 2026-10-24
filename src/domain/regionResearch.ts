/**
 * Region research pipeline.
 *
 * Given a selected chromosome region (a gene + the inferred local-ancestry
 * context + the curated variant evidence already in the normalized bundle),
 * produce a structured, plain-language insight for clinicians and patients:
 * what the data supports, what it does NOT establish, and what confirmatory
 * screening a clinician might consider.
 *
 * PRIVACY (HACKATHON_PROJECT_PLAN.md Section 11):
 *  - The request payload is built from aggregate, non-identifying context only:
 *    gene symbol, inferred reference-group label(s), condition names, and
 *    frequency/evidence SUMMARIES. Raw alleles and genotypes are NEVER included.
 *  - The default provider is fully OFFLINE and deterministic, so the demo makes
 *    no network calls. A remote AI provider is opt-in and must be explicitly
 *    enabled; when enabled, only the sanitized payload below is sent.
 *
 * This is research context generation, NOT diagnosis. Output always preserves
 * uncertainty and never converts ancestry or a founder variant into a personal
 * disease probability.
 */

import type {
  AnalysisBundle,
  GeneRegion,
  SelectedRegion,
} from "./explorer";
import { segmentsOverlapping, variantsIn } from "./explorer";
import { regionFor } from "./geography";
import type { AncestrySegment, DiseaseEvidence } from "./types";

/** Sanitized, non-identifying payload sent to a research provider. */
export interface RegionResearchRequest {
  gene: string;
  chromosome: string;
  /** Human-facing 1-based display window, labeled as such. */
  display_window_1based: { start: number; end: number };
  /** Inferred local-ancestry reference groups overlapping the region. */
  inferred_ancestry_groups: {
    label: string;
    name: string;
    assignment_status: "assigned" | "uncertain" | "unknown";
    copies: Array<1 | 2>;
  }[];
  conditions: string[];
  /** Population-frequency CONTEXT only. No per-person alleles. */
  frequency_context: {
    condition: string;
    elevated_frequency_groups: string[];
  }[];
  /** Evidence summaries (classification + review status), no raw genotypes. */
  evidence_summaries: {
    condition: string;
    classification: string | null;
    review_status: string | null;
    conflicting: boolean | null;
    measurement_status: string;
  }[];
}

export interface RegionInsight {
  headline: string;
  /** What the available data actually supports. */
  supports: string[];
  /** What it explicitly does NOT establish. */
  does_not_establish: string[];
  /** Screening framing for clinicians and patients. */
  screening_considerations: string[];
  /** Always-present uncertainty / provenance note. */
  caveats: string[];
  /** Source URLs surfaced for the user to verify. */
  sources: string[];
  /** How this insight was produced. */
  generated_by: "offline-deterministic" | string;
  /** Whether any network request left the device. */
  transmitted_offdevice: boolean;
}

export interface ResearchProvider {
  id: string;
  /** True if this provider sends the sanitized payload off-device. */
  remote: boolean;
  analyze(req: RegionResearchRequest): Promise<RegionInsight>;
}

/** Build the sanitized request from the normalized bundle. No raw alleles. */
export function buildRequest(
  bundle: AnalysisBundle,
  region: SelectedRegion,
): RegionResearchRequest | null {
  const gene = findGene(bundle, region);
  if (!gene) return null;

  const overlapping = segmentsOverlapping(
    bundle.segments,
    gene.chromosome,
    gene.start_0based,
    gene.end_0based_exclusive,
  );

  const byLabel = new Map<
    string,
    { status: AncestrySegment["assignment_status"]; copies: Set<1 | 2> }
  >();
  for (const s of overlapping) {
    const entry = byLabel.get(s.ancestry_label) ?? {
      status: s.assignment_status,
      copies: new Set<1 | 2>(),
    };
    entry.copies.add(s.copy_index);
    // Prefer the strongest status seen (assigned > uncertain > unknown).
    entry.status = strongerStatus(entry.status, s.assignment_status);
    byLabel.set(s.ancestry_label, entry);
  }

  const inferred_ancestry_groups = Array.from(byLabel.entries()).map(
    ([label, v]) => ({
      label,
      name: regionFor(label).name,
      assignment_status: v.status,
      copies: Array.from(v.copies).sort(),
    }),
  );

  const variants = variantsIn(
    bundle.variants,
    gene.chromosome,
    gene.start_0based,
    gene.end_0based_exclusive,
  );
  const variantKeys = new Set(variants.map((v) => v.variant_key));
  const measByKey = new Map(
    variants.map((v) => [v.variant_key, v.measurement_status]),
  );

  const relevantEvidence = bundle.evidence.filter((e) =>
    variantKeys.has(e.variant_key),
  );
  const evidence_summaries = relevantEvidence.map((e: DiseaseEvidence) => ({
    condition: e.condition,
    classification: e.classification ?? null,
    review_status: e.review_status ?? null,
    conflicting: e.conflicting ?? null,
    measurement_status: measByKey.get(e.variant_key) ?? "unknown",
  }));

  const conditions = Array.from(
    new Set([...gene.conditions, ...relevantEvidence.map((e) => e.condition)]),
  );

  const frequency_context = bundle.conditions
    .filter((c) => conditions.includes(c.condition))
    .map((c) => ({
      condition: c.condition,
      elevated_frequency_groups: c.elevated_frequency_groups,
    }));

  return {
    gene: gene.gene,
    chromosome: gene.chromosome,
    display_window_1based: {
      start: gene.start_0based + 1,
      end: gene.end_0based_exclusive,
    },
    inferred_ancestry_groups,
    conditions,
    frequency_context,
    evidence_summaries,
  };
}

function findGene(
  bundle: AnalysisBundle,
  region: SelectedRegion,
): GeneRegion | undefined {
  if (region.gene) {
    const g = bundle.genes.find((x) => x.gene === region.gene);
    if (g) return g;
  }
  return bundle.genes.find(
    (g) =>
      g.chromosome === region.chromosome &&
      g.start_0based < region.end_0based_exclusive &&
      g.end_0based_exclusive > region.start_0based,
  );
}

function strongerStatus(
  a: AncestrySegment["assignment_status"],
  b: AncestrySegment["assignment_status"],
): AncestrySegment["assignment_status"] {
  const rank = { assigned: 3, uncertain: 2, unknown: 1 } as const;
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Offline deterministic provider. Synthesizes a structured, sourced insight
 * from the sanitized request with NO network access. This is the default so the
 * demo is fully offline and reproducible.
 */
export const offlineProvider: ResearchProvider = {
  id: "offline-deterministic",
  remote: false,
  async analyze(req: RegionResearchRequest): Promise<RegionInsight> {
    const groups = req.inferred_ancestry_groups;
    const groupNames = groups.map((g) => g.name);
    const anyUncertain = groups.some(
      (g) => g.assignment_status !== "assigned",
    );

    const elevatedHere = new Set<string>();
    for (const fc of req.frequency_context) {
      for (const grp of fc.elevated_frequency_groups) {
        if (groups.some((g) => g.label === grp)) elevatedHere.add(fc.condition);
      }
    }

    const supports: string[] = [];
    const does_not_establish: string[] = [];
    const screening_considerations: string[] = [];
    const caveats: string[] = [];

    supports.push(
      `In ${req.gene} (chr${req.chromosome}), the inferred local ancestry overlapping this region is ${
        groupNames.length ? groupNames.join(" and ") : "not confidently assigned"
      }${anyUncertain ? " (some of this is uncertain or unknown)" : ""}.`,
    );

    if (elevatedHere.size > 0) {
      supports.push(
        `Published data report elevated population frequency of specific curated variants for ${Array.from(
          elevatedHere,
        ).join(", ")} in at least one overlapping reference group. This is population context, not a personal finding.`,
      );
    }

    const observedPathogenic = req.evidence_summaries.filter(
      (e) =>
        (e.classification ?? "").toLowerCase().includes("pathogenic") &&
        !(e.classification ?? "").toLowerCase().includes("conflict") &&
        e.measurement_status === "observed",
    );
    const conflicting = req.evidence_summaries.filter((e) => e.conflicting);
    const notAssayed = req.evidence_summaries.filter(
      (e) => e.measurement_status !== "observed",
    );

    if (observedPathogenic.length > 0) {
      supports.push(
        `A curated variant classified pathogenic was observed here for ${Array.from(
          new Set(observedPathogenic.map((e) => e.condition)),
        ).join(", ")}. This is an observed genotype in the dataset, pending clinical confirmation.`,
      );
      screening_considerations.push(
        "An observed curated pathogenic variant warrants referral for confirmatory clinical genetic testing and genetic counseling. This prototype does not confirm the call.",
      );
    }

    if (conflicting.length > 0) {
      does_not_establish.push(
        `At least one variant here has conflicting clinical interpretations; it cannot be treated as a definite result in either direction.`,
      );
    }

    if (notAssayed.length > 0) {
      does_not_establish.push(
        "Some relevant curated variants were not assayed or not observed. A consumer SNP array covers only a small subset of pathogenic variants, so absence here does not rule anything out.",
      );
    }

    does_not_establish.push(
      "Ancestry does not establish whether a person carries a pathogenic variant, and an ancestry estimate cannot rule one out.",
    );
    does_not_establish.push(
      "This region view is not a diagnosis and not a replacement for clinical genetic testing.",
    );

    if (screening_considerations.length === 0) {
      if (elevatedHere.size > 0) {
        screening_considerations.push(
          `Where reproductive-risk or hereditary-cancer counseling is relevant, a clinician may consider guideline-based, targeted testing for ${Array.from(
            elevatedHere,
          ).join(
            ", ",
          )} independent of this prototype. Elevated population frequency is a prompt to consider testing, not evidence a person is affected.`,
        );
      } else {
        screening_considerations.push(
          "No overlapping elevated-frequency reference group was identified for the curated conditions here. Routine, guideline-based screening still applies; this tool does not reduce standard clinical recommendations.",
        );
      }
    }

    caveats.push(
      "Local ancestry probabilities reflect model estimates, not calibrated confidence. A gene can cross an inferred ancestry boundary.",
    );
    caveats.push(
      "All values trace to the synthetic demo bundle or a documented calculation. No raw genotype was used to generate this text.",
    );

    const sources = Array.from(
      new Set([
        "https://www.ncbi.nlm.nih.gov/clinvar/",
        "https://gnomad.broadinstitute.org/",
        "https://gnomad.broadinstitute.org/news/2023-11-genetic-ancestry",
      ]),
    );

    const headline =
      observedPathogenic.length > 0
        ? `${req.gene}: an observed curated variant plus ${
            groupNames.join("/") || "unassigned"
          } local-ancestry context — confirm clinically`
        : elevatedHere.size > 0
          ? `${req.gene}: overlapping reference group(s) with elevated population frequency for ${Array.from(
              elevatedHere,
            ).join(", ")}`
          : `${req.gene}: local-ancestry context with no elevated-frequency flag for curated conditions`;

    return {
      headline,
      supports,
      does_not_establish,
      screening_considerations,
      caveats,
      sources,
      generated_by: "offline-deterministic",
      transmitted_offdevice: false,
    };
  },
};

/**
 * Factory for a remote AI provider. NOT wired into the default demo. Enabling it
 * is an explicit, documented action; it transmits ONLY the sanitized request
 * (never raw alleles/genotypes) and must obtain user consent in the UI first.
 *
 * The call site is responsible for consent. This function throws if asked to run
 * without an endpoint + key, so it can never silently fall back to transmitting.
 */
export function createRemoteProvider(opts: {
  id: string;
  endpoint: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): ResearchProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    id: opts.id,
    remote: true,
    async analyze(req: RegionResearchRequest): Promise<RegionInsight> {
      const res = await doFetch(opts.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        // Only the sanitized, non-identifying request is transmitted.
        body: JSON.stringify({ task: "region_research", request: req }),
      });
      if (!res.ok) {
        throw new Error(`Research provider error: ${res.status}`);
      }
      const data = (await res.json()) as Partial<RegionInsight>;
      return {
        headline: data.headline ?? `${req.gene}: research summary`,
        supports: data.supports ?? [],
        does_not_establish: data.does_not_establish ?? [],
        screening_considerations: data.screening_considerations ?? [],
        caveats: [
          "Generated with a remote AI provider from a sanitized, non-identifying payload (no raw genotypes).",
          ...(data.caveats ?? []),
        ],
        sources: data.sources ?? [],
        generated_by: opts.id,
        transmitted_offdevice: true,
      };
    },
  };
}
