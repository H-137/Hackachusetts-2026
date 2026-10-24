/**
 * Browser-parser tests mirroring pipeline/tests/test_parser.py so the two
 * parsers stay behaviorally consistent. Encodes the Step 1 acceptance criteria.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAncestryDna } from "../src/domain/parser";

const here = dirname(fileURLToPath(import.meta.url));
const DEMO = resolve(here, "../data/demo");

function read(name: string): string {
  return readFileSync(resolve(DEMO, name), "utf-8");
}

describe("parseAncestryDna", () => {
  it("parses the four-row example but marks it insufficient", () => {
    const r = parseAncestryDna(read("parser_example_four_rows.txt"));
    expect(r.quality_summary.total_records).toBe(4);
    expect(r.quality_summary.autosomal_records).toBe(4);
    expect(r.quality_summary.error_count).toBe(0);
    expect(r.quality_summary.sufficient_for_inference).toBe(false);
  });

  it("retains source metadata", () => {
    const { metadata } = parseAncestryDna(read("parser_example_four_rows.txt"));
    expect(metadata.array_version).toBe("V2.0");
    expect(metadata.converter_version).toBe("V1.0");
    expect(metadata.declared_build).toBe("37.1");
    expect(metadata.normalized_build).toBe("GRCh37");
    expect(metadata.strand).toBe("+");
    expect(metadata.usage_notice.toLowerCase()).toContain("genealogical");
  });

  it("converts 1-based positions to 0-based", () => {
    const r = parseAncestryDna(read("parser_example_four_rows.txt"));
    expect(r.records[0]?.position_1based).toBe(752721);
    expect(r.records[0]?.position_0based).toBe(752720);
  });

  it("counts no-calls without treating them as reference", () => {
    const r = parseAncestryDna(read("no_calls.txt"));
    expect(r.quality_summary.no_call_count).toBe(3);
    expect(r.quality_summary.autosomal_records).toBe(2);
  });

  it("reports indels as unsupported rather than coercing", () => {
    const r = parseAncestryDna(read("indels.txt"));
    expect(r.quality_summary.unsupported_indel_count).toBe(3);
    expect(r.quality_summary.autosomal_records).toBe(2);
    expect(r.errors.some((e) => e.code === "unsupported_indel")).toBe(true);
  });

  it("collapses exact duplicates and flags conflicting ones", () => {
    const r = parseAncestryDna(read("conflicting_duplicates.txt"));
    expect(r.quality_summary.duplicate_exact_count).toBe(1);
    expect(r.quality_summary.duplicate_conflicting_count).toBe(1);
  });

  it("excludes and labels non-autosomal chromosomes", () => {
    const r = parseAncestryDna(read("unsupported_chromosomes.txt"));
    expect(r.quality_summary.excluded_by_chromosome).toEqual({
      X: 1,
      Y: 1,
      "XY/PAR": 1,
      MT: 1,
    });
    expect(r.quality_summary.autosomal_records).toBe(2);
  });

  it("produces clear errors for malformed records without leaking alleles", () => {
    const r = parseAncestryDna(read("malformed_records.txt"));
    const codes = r.errors.map((e) => e.code);
    expect(codes).toContain("non_integer_position");
    expect(codes).toContain("bad_column_count");
    expect(codes).toContain("non_positive_position");
    expect(codes).toContain("unexpected_allele_token");
    for (const e of r.errors) expect(e.message).not.toContain("Z");
  });

  it("handles mixed CRLF/LF and a UTF-8 BOM", () => {
    const r = parseAncestryDna(read("mixed_line_endings.txt"));
    expect(r.quality_summary.total_records).toBe(4);
    expect(r.quality_summary.error_count).toBe(0);
    expect(r.metadata.array_version).toBe("V2.0");
  });

  it("marks the large synthetic fixture as sufficient", () => {
    const r = parseAncestryDna(read("synthetic_valid.txt"));
    expect(r.quality_summary.sufficient_for_inference).toBe(true);
    expect(r.quality_summary.autosomal_records).toBeGreaterThanOrEqual(10_000);
  });

  it("is deterministic", () => {
    const text = read("synthetic_valid.txt");
    const a = parseAncestryDna(text);
    const b = parseAncestryDna(text);
    expect(a.quality_summary).toEqual(b.quality_summary);
    expect(a.records.length).toBe(b.records.length);
  });
});
