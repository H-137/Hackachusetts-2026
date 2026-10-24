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
  segmentsOverlapping,
  variantsIn,
} from "../src/domain/explorer";
import {
  buildRequest,
  offlineProvider,
} from "../src/domain/regionResearch";

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
