/**
 * Tests for the UI watchlist domain logic. Mirrors the pipeline guardrails.
 */
import { describe, expect, it } from "vitest";
import {
  buildWatchlist,
  passesEnrichmentGate,
  type CatalogVariant,
  type ObservedProvenance,
} from "../src/domain/watchlist";
import { WATCHLIST_CATALOG } from "../src/domain/watchlistCatalog";
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

  it("marks relevance only for observed findings or ancestry matches", () => {
    const segs = [seg(1, "22", 0, 2000, "YRI"), seg(2, "22", 0, 2000, "GBR")];
    // ancestry-relevant: locus YRI matches associated YRI
    const match = variant({ associated_populations: ["YRI"], founder_variant: true });
    // not relevant: associated AJ, no match, unobserved
    const noMatch = variant({ variant_id: "Y", associated_populations: ["AJ"], founder_variant: true });
    const wl = buildWatchlist([match, noMatch], segs, new Set(["22"]));
    const byId = Object.fromEntries(wl.map((e) => [e.variant.variant_id, e]));
    expect(byId["X"]!.relevance).toBe("ancestry_relevant");
    expect(byId["Y"]!.relevance).toBe("not_relevant");
  });

  it("observed carrier is relevant as an observed finding", () => {
    const v = variant({ rsid: "rs334", clinical_allele: "A" });
    const prov: Record<string, ObservedProvenance> = {
      rs334: { measurement_status: "observed", genotype: "A/A" },
    };
    const wl = buildWatchlist([v], [], new Set(["22"]), prov);
    expect(wl[0]!.relevance).toBe("observed_finding");
  });

  it("observed homozygous-reference is NOT relevant", () => {
    const v = variant({ rsid: "rs334", clinical_allele: "A" });
    const prov: Record<string, ObservedProvenance> = {
      rs334: { measurement_status: "observed", genotype: "T/T" },
    };
    const wl = buildWatchlist([v], [], new Set(["22"]), prov);
    expect(wl[0]!.relevance).toBe("not_relevant");
  });
});

describe("chr22 catalog expansion", () => {
  it("includes the threshold-A chr22 set plus risk alleles", () => {
    const ids = new Set(WATCHLIST_CATALOG.map((v) => v.variant_id));
    for (const id of [
      "CHEK2_c1100delC", "UPB1_c917minus1GA", "SCO2_c16_17ins",
      "ADA2_c973minus2AG", "LZTR1_c1407G_A", "ARSA_c542T_G",
      "APOL1_G1_rs73885319", "PNPLA3_I148M_rs738409",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("every chr22 catalog variant falls in the real ancestry window", () => {
    for (const v of WATCHLIST_CATALOG.filter((v) => v.chromosome === "22")) {
      expect(v.position_1based).toBeGreaterThanOrEqual(16_000_000);
      expect(v.position_1based).toBeLessThanOrEqual(51_300_000);
    }
  });

  it("risk alleles are flagged as risk_allele and never pathogenic", () => {
    const risk = WATCHLIST_CATALOG.filter((v) => v.evidence_class === "risk_allele");
    expect(risk.map((v) => v.gene).sort()).toEqual(["APOL1", "PNPLA3"]);
    for (const v of risk) {
      expect(v.clinical_classification.toLowerCase()).not.toContain("pathogenic");
    }
  });

  it("enrichment gate tags real enrichment but not a pan-ethnic entry", () => {
    const byId = Object.fromEntries(WATCHLIST_CATALOG.map((v) => [v.variant_id, v]));
    expect(passesEnrichmentGate(byId["CHEK2_c1100delC"]!)).toBe(true);
    expect(passesEnrichmentGate(byId["APOL1_G1_rs73885319"]!)).toBe(true);
    expect(passesEnrichmentGate(byId["ARSA_c907G_A"]!)).toBe(false);
  });
});

describe("ARSA locus explanation", () => {
  it("prioritizes the population-associated ARSA variant for GBR/IBS ancestry at the locus", () => {
    const segments = [seg(1, "22", 51000000, 51304566, "GBR"), seg(2, "22", 51000000, 51304566, "IBS")];
    const entries = buildWatchlist(WATCHLIST_CATALOG.filter((v) => v.gene === "ARSA"), segments, new Set(["22"]));
    const match = entries.find((e) => e.variant.rsid === "rs74315457");
    expect(match?.priority_category).toBe("ancestry_supported");
    expect(match?.observed_genotype).toBeNull();
    expect(entries.find((e) => e.variant.variant_id === "ARSA_c907G_A")?.priority_category).not.toBe("ancestry_supported");
  });
});
