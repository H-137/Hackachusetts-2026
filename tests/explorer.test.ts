/**
 * Step 6 explorer + region-research tests. These encode acceptance criteria
 * from HACKATHON_PROJECT_PLAN.md Section 10 that apply to the integrated UI data
 * layer: valid non-overlapping segments per copy with gaps as unknown, missing
 * frequency distinct from zero, no raw alleles in the research request, and the
 * offline insight never presenting a missing variant as a reassuring negative.
 */
import { describe, expect, it } from "vitest";
import { loadAnalysisBundle } from "../src/adapters/analysisBundle";
import {
  AUTOSOME_ORDER,
  chromLength,
  isCoverageMarker,
  segmentsOverlapping,
  summarizeWindowCoverage,
  variantsIn,
} from "../src/domain/explorer";
import {
  buildRequest,
  offlineProvider,
} from "../src/domain/regionResearch";
import {
  buildAssistantContext,
  offlineAssistant,
} from "../src/domain/assistant";
import {
  carrierStatuses,
  considerations,
  coverageSummary,
  pgsCoverage,
} from "../src/domain/clinical";

const bundle = loadAnalysisBundle();

describe("analysis bundle integrity", () => {
  it("is clearly labeled synthetic", () => {
    expect(bundle.sample.synthetic).toBe(true);
    expect(bundle.sample.source_type).toBe("precomputed");
  });

  it("has two copies per autosome with non-overlapping, in-bounds segments", () => {
    for (const chrom of AUTOSOME_ORDER) {
      const len = chromLength(chrom);
      for (const copy of [1, 2] as const) {
        const segs = bundle.segments
          .filter((s) => s.chromosome === chrom && s.copy_index === copy)
          .sort((a, b) => a.start_0based - b.start_0based);
        expect(segs.length).toBeGreaterThan(0);
        let prevEnd = 0;
        for (const s of segs) {
          // in-bounds, half-open, ordered, non-overlapping
          expect(s.start_0based).toBeGreaterThanOrEqual(0);
          expect(s.end_0based_exclusive).toBeGreaterThan(s.start_0based);
          expect(s.end_0based_exclusive).toBeLessThanOrEqual(len);
          expect(s.start_0based).toBeGreaterThanOrEqual(prevEnd);
          prevEnd = s.end_0based_exclusive;
        }
      }
    }
  });

  it("represents gaps as explicit unknown segments, never silent", () => {
    const unknowns = bundle.segments.filter(
      (s) => s.assignment_status === "unknown",
    );
    for (const u of unknowns) {
      expect(u.ancestry_label).toBe("UNKNOWN");
      expect(u.probabilities).toBeNull();
    }
  });

  it("keeps missing population frequency null, not zero", () => {
    const missing = bundle.frequencies.filter(
      (f) => f.allele_frequency === null,
    );
    expect(missing.length).toBeGreaterThan(0);
    for (const f of missing) {
      expect(f.allele_frequency).not.toBe(0);
      expect(f.allele_count).toBeNull();
      expect(f.allele_number).toBeNull();
    }
  });

  it("retains conflicting clinical interpretations", () => {
    const conflicting = bundle.evidence.filter((e) => e.conflicting === true);
    expect(conflicting.length).toBeGreaterThan(0);
  });

  it("includes an unscorable score with a stated reason", () => {
    const unscorable = bundle.scores.filter((s) => s.raw_score === null);
    expect(unscorable.length).toBeGreaterThan(0);
    for (const s of unscorable) {
      expect(s.unscorable_reason).toBeTruthy();
      expect(s.percentile).toBeNull();
      expect(s.absolute_risk).toBeNull();
    }
  });
});

describe("region overlap helpers", () => {
  it("finds variants within a gene region on the correct chromosome", () => {
    const brca1 = bundle.genes.find((g) => g.gene === "BRCA1");
    expect(brca1).toBeTruthy();
    if (!brca1) return;
    const vs = variantsIn(
      bundle.variants,
      brca1.chromosome,
      brca1.start_0based,
      brca1.end_0based_exclusive,
    );
    for (const v of vs) {
      expect(v.chromosome).toBe(brca1.chromosome);
      expect(v.position_0based).toBeGreaterThanOrEqual(brca1.start_0based);
      expect(v.position_0based).toBeLessThan(brca1.end_0based_exclusive);
    }
  });

  it("reports both copies for a gene region", () => {
    const brca1 = bundle.genes.find((g) => g.gene === "BRCA1")!;
    const segs = segmentsOverlapping(
      bundle.segments,
      brca1.chromosome,
      brca1.start_0based,
      brca1.end_0based_exclusive,
    );
    const copies = new Set(segs.map((s) => s.copy_index));
    expect(copies.has(1)).toBe(true);
    expect(copies.has(2)).toBe(true);
  });
});

describe("region research pipeline (privacy + no fabricated reassurance)", () => {
  it("builds a sanitized request that contains no raw alleles or genotypes", () => {
    const brca1 = bundle.genes.find((g) => g.gene === "BRCA1")!;
    const req = buildRequest(bundle, {
      chromosome: brca1.chromosome,
      start_0based: brca1.start_0based,
      end_0based_exclusive: brca1.end_0based_exclusive,
      gene: "BRCA1",
    });
    expect(req).toBeTruthy();
    const serialized = JSON.stringify(req);
    // No genotype strings like "A/C" or REF/ALT alleles should leak.
    expect(serialized).not.toMatch(/"genotype"/);
    expect(serialized).not.toMatch(/[ACGT]\/[ACGT]/);
    // It should carry gene + ancestry + evidence summaries.
    expect(req!.gene).toBe("BRCA1");
    expect(req!.inferred_ancestry_groups.length).toBeGreaterThan(0);
  });

  it("offline provider stays on-device and never fabricates a reassuring negative", async () => {
    const brca1 = bundle.genes.find((g) => g.gene === "BRCA1")!;
    const req = buildRequest(bundle, {
      chromosome: brca1.chromosome,
      start_0based: brca1.start_0based,
      end_0based_exclusive: brca1.end_0based_exclusive,
      gene: "BRCA1",
    })!;
    const insight = await offlineProvider.analyze(req);
    expect(insight.transmitted_offdevice).toBe(false);
    expect(insight.generated_by).toBe("offline-deterministic");
    // Must always state the ancestry-does-not-establish limitation.
    const limits = insight.does_not_establish.join(" ").toLowerCase();
    expect(limits).toContain("ancestry");
    expect(limits).toContain("not");
    expect(insight.sources.length).toBeGreaterThan(0);
  });
});

describe("window coverage summary (the analytical payoff of zooming)", () => {
  it("has coverage markers tagged and distinct from curated variants", () => {
    const coverage = bundle.variants.filter((v) => isCoverageMarker(v));
    const curated = bundle.variants.filter((v) => !isCoverageMarker(v));
    expect(coverage.length).toBeGreaterThan(100);
    expect(curated.length).toBeGreaterThan(0);
    // Coverage markers carry no disease evidence.
    for (const c of coverage.slice(0, 50)) {
      expect(
        bundle.evidence.some((e) => e.variant_key === c.variant_key),
      ).toBe(false);
    }
  });

  it("reports higher zoom for a narrower window", () => {
    const full = summarizeWindowCoverage(bundle.variants, "17", 0, chromLength("17"));
    const narrow = summarizeWindowCoverage(
      bundle.variants,
      "17",
      40_000_000,
      41_000_000,
    );
    expect(narrow.zoom).toBeGreaterThan(full.zoom);
    expect(full.zoom).toBeCloseTo(1, 1);
  });

  it("flags an engineered coverage gap as no/sparse coverage", () => {
    // The generator leaves a deliberate gap across BRCA1 (~41.15–41.33 Mb).
    const coverageOnly = bundle.variants.filter((v) => isCoverageMarker(v));
    const inGap = summarizeWindowCoverage(
      coverageOnly,
      "17",
      41_180_000,
      41_300_000,
    );
    // Within the gap there should be essentially no coverage markers.
    expect(["none", "sparse"]).toContain(inGap.coverage_level);
    expect(inGap.absence_note.toLowerCase()).toContain("absence");
  });

  it("never implies absence is reassuring", () => {
    const anywhere = summarizeWindowCoverage(
      bundle.variants,
      "1",
      0,
      chromLength("1"),
    );
    // The note must always qualify absence, never present it as negative/clear.
    expect(anywhere.absence_note.toLowerCase()).toMatch(
      /not a reassuring negative|does not rule out|uninformative/,
    );
  });
});

describe("results/methods assistant", () => {
  it("builds a sanitized context with no raw alleles or genotypes", () => {
    const ctx = buildAssistantContext(bundle, "overview");
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toMatch(/"genotype"/);
    expect(serialized).not.toMatch(/[ACGT]\/[ACGT]/);
    expect(ctx.composition.length).toBeGreaterThan(0);
    expect(ctx.conditions.length).toBeGreaterThan(0);
  });

  it("answers an ancestry-composition question from results", async () => {
    const ctx = buildAssistantContext(bundle);
    const reply = await offlineAssistant.answer(
      "what is my ancestry composition?",
      ctx,
    );
    expect(reply.role).toBe("assistant");
    expect(reply.text.toLowerCase()).toContain("composition");
    // Always carries the not-a-diagnosis framing.
    expect(reply.text.toLowerCase()).toContain("ancestry");
    expect(reply.text.toLowerCase()).toMatch(/not .*medical advice|not a diagnosis|cannot rule/);
  });

  it("explains a method step and flags pending (backfill) stages honestly", async () => {
    const ctx = buildAssistantContext(bundle);
    const reply = await offlineAssistant.answer(
      "how does local ancestry inference work?",
      ctx,
    );
    expect(reply.text.toLowerCase()).toContain("rfmix");
    // Step 4 is a backfill stage; the answer must not imply it really ran.
    expect(reply.text.toLowerCase()).toContain("not yet wired");
  });

  it("never fabricates a reassuring negative for risk questions", async () => {
    const ctx = buildAssistantContext(bundle);
    const reply = await offlineAssistant.answer(
      "am I at risk for cystic fibrosis?",
      ctx,
    );
    const t = reply.text.toLowerCase();
    expect(t).toMatch(/unmeasured|not a diagnosis|confirm|does not mean|not a clean bill/);
  });

  it("reports the unscorable score honestly", async () => {
    const ctx = buildAssistantContext(bundle);
    const reply = await offlineAssistant.answer(
      "why is the coronary artery disease score unscorable?",
      ctx,
    );
    expect(reply.text.toLowerCase()).toContain("unscorable");
  });
});

describe("clinician derivations (triage, no fabrication)", () => {
  it("counts clinical-allele copies only where the locus was assayed", () => {
    const rows = carrierStatuses(bundle);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      if (!r.assayed) {
        // Not assayed -> no fabricated copy count, framed as not-a-negative.
        expect(r.clinical_allele_copies).toBeNull();
        expect(r.zygosity).toBe("indeterminate");
        expect(r.interpretation.toLowerCase()).toMatch(/not a negative|not assayed|confirm/);
      } else {
        expect([0, 1, 2]).toContain(r.clinical_allele_copies);
      }
    }
  });

  it("quantifies coverage as assayable-of-total and never claims full coverage implicitly", () => {
    const cov = coverageSummary(bundle);
    expect(cov.total).toBeGreaterThan(0);
    expect(cov.assayable).toBeLessThanOrEqual(cov.total);
    for (const row of cov.rows) {
      expect(row.assayable).toBeLessThanOrEqual(row.total);
    }
  });

  it("PGS coverage never produces a percentile or absolute risk", () => {
    const pgs = pgsCoverage(bundle.scores);
    expect(pgs.length).toBe(bundle.scores.length);
    for (const p of pgs) {
      // The verdict is about coverage, not a calibrated score/percentile.
      expect(p.verdict.toLowerCase()).toMatch(/partial|unscorable|not a calibrated|no percentile/);
    }
  });

  it("sorts considerations by actionability (observed findings first)", () => {
    const items = considerations(bundle);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.actionability).toBeGreaterThanOrEqual(
        items[i]!.actionability,
      );
    }
    // Every action uses consider/confirm framing, never diagnostic/treatment.
    for (const it of items) {
      expect(it.action.toLowerCase()).toMatch(/consider|confirm|not a personal finding|not established/);
      expect(it.action.toLowerCase()).not.toMatch(/\byou have\b|diagnos|prescrib|treatment plan/);
    }
  });
});
