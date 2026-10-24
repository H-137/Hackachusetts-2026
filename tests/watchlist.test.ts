/**
 * Tests for the UI watchlist domain logic. Mirrors the pipeline guardrails.
 */
import { describe, expect, it } from "vitest";
import {
  buildWatchlist,
  type CatalogVariant,
  type ObservedProvenance,
} from "../src/domain/watchlist";
import type { AncestrySegment } from "../src/domain/types";

function seg(
  copy: 1 | 2,
  chrom: string,
  start: number,
  end: number,
  label: string,
  status: AncestrySegment["assignment_status"] = "assigned",
): AncestrySegment {
  return {
    sample_id: "s",
    chromosome: chrom,
    start_0based: start,
    end_0based_exclusive: end,
    copy_index: copy,
    ancestry_label: label,
    assignment_status: status,
    method: "RFMix",
    reference_panel: "1000G",
    provenance: { source_type: "ancestrydna_upload", accessed_at: "" },
  };
}

function variant(over: Partial<CatalogVariant> = {}): CatalogVariant {
  return {
    variant_id: "X",
    condition: "C",
    gene: "G",
    inheritance: "autosomal recessive",
    build: "GRCh37",
    chromosome: "22",
    position_1based: 1000,
    hgvs: null,
    rsid: null,
    variant_class: "snp",
    clinical_allele: "T",
    clinical_classification: "Pathogenic",
    review_status: "criteria provided, multiple submitters, no conflicts",
    citations: [],
    associated_populations: [],
    founder_variant: false,
    frequency_evidence: [],
    notes: "",
    ...over,
  };
}

describe("buildWatchlist", () => {
  it("looks up ancestry per copy independently at the locus", () => {
    const segs = [seg(1, "22", 0, 2000, "TSI"), seg(2, "22", 0, 2000, "GBR")];
    const wl = buildWatchlist([variant()], segs, new Set(["22"]));
    expect(wl[0]!.copy1.ancestry_label).toBe("TSI");
    expect(wl[0]!.copy2.ancestry_label).toBe("GBR");
  });

  it("uses the overlapping segment, not a chromosome summary", () => {
    const segs = [
      seg(1, "22", 0, 1000, "YRI"),
      seg(1, "22", 1000, 5000, "TSI"),
      seg(2, "22", 0, 5000, "GBR"),
    ];
    const wl = buildWatchlist([variant({ position_1based: 3000 })], segs, new Set(["22"]));
    expect(wl[0]!.copy1.ancestry_label).toBe("TSI");
  });

  it("marks unprocessed chromosomes ancestry_not_available without extrapolating", () => {
    const segs = [seg(1, "22", 0, 2000, "TSI"), seg(2, "22", 0, 2000, "GBR")];
    const v = variant({ chromosome: "17", position_1based: 41276045, associated_populations: ["AJ"] });
    const wl = buildWatchlist([v], segs, new Set(["22"]));
    expect(wl[0]!.copy1.available).toBe(false);
    expect(wl[0]!.compatibility.status).toBe("not_available");
  });

  it("supports a founder match only on a specific associated population", () => {
    const segs = [seg(1, "22", 0, 2000, "YRI"), seg(2, "22", 0, 2000, "GBR")];
    const v = variant({ associated_populations: ["YRI"], founder_variant: true });
    const wl = buildWatchlist([v], segs, new Set(["22"]));
    expect(wl[0]!.compatibility.status).toBe("supported");
    expect(wl[0]!.priority_category).toBe("ancestry_supported");
  });

  it("does not treat a broad super-population as a founder match", () => {
    // associated EAS-mapped pop vs locus EAS pop -> within_superpopulation, not supported
    const segs = [seg(1, "22", 0, 2000, "CHB"), seg(2, "22", 0, 2000, "JPT")];
    const v = variant({ associated_populations: ["KHV"], founder_variant: true });
    const wl = buildWatchlist([v], segs, new Set(["22"]));
    expect(wl[0]!.compatibility.status).toBe("within_superpopulation");
    expect(wl[0]!.compatibility.status).not.toBe("supported");
  });

  it("flags an observed finding regardless of ancestry, and homref is not a finding", () => {
    const v = variant({
      chromosome: "11",
      position_1based: 5248232,
      rsid: "rs334",
      clinical_allele: "A",
    });
    const carrier: Record<string, ObservedProvenance> = {
      rs334: { measurement_status: "observed", genotype: "A/A" },
    };
    const homref: Record<string, ObservedProvenance> = {
      rs334: { measurement_status: "observed", genotype: "T/T" },
    };
    expect(buildWatchlist([v], [], new Set(["22"]), carrier)[0]!.priority_category).toBe(
      "observed_finding",
    );
    expect(buildWatchlist([v], [], new Set(["22"]), homref)[0]!.priority_category).not.toBe(
      "observed_finding",
    );
  });

  it("never attributes an observed allele to a specific copy", () => {
    const segs = [seg(1, "22", 0, 2000, "TSI"), seg(2, "22", 0, 2000, "GBR")];
    const v = variant({ rsid: "rsP", clinical_allele: "T" });
    const prov: Record<string, ObservedProvenance> = {
      rsP: { measurement_status: "observed", genotype: "A/T" },
    };
    const wl = buildWatchlist([v], segs, new Set(["22"]), prov);
    expect(wl[0]!.phase_established).toBe(false);
  });
});
