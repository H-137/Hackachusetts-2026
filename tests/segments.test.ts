import { describe, expect, it } from "vitest";
import { joinAdjacentSegments } from "../src/domain/segments";
import type { AncestrySegment } from "../src/domain/types";
function segment(start: number, end: number, overrides: Partial<AncestrySegment> = {}): AncestrySegment {
  return { sample_id: "test", chromosome: "1", copy_index: 1, start_0based: start,
    end_0based_exclusive: end, ancestry_label: "YRI", assignment_status: "assigned",
    method: "test", reference_panel: "test", provenance: { source_type: "synthetic_demo", accessed_at: "" }, ...overrides };
}
describe("patient segment joining", () => {
  it("joins a sorted continuous run without mutating source data", () => {
    const input = [segment(20, 30), segment(0, 10), segment(10, 20)];
    expect(joinAdjacentSegments(input)).toMatchObject([{ start_0based: 0, end_0based_exclusive: 30 }]);
    expect(input[1]?.end_0based_exclusive).toBe(10);
  });
  it("never bridges gaps or overlaps", () => {
    expect(joinAdjacentSegments([segment(0, 10), segment(11, 20)])).toHaveLength(2);
    expect(joinAdjacentSegments([segment(0, 10), segment(9, 20)])).toHaveLength(2);
  });
  it.each([
    { copy_index: 2 as const }, { chromosome: "2" }, { ancestry_label: "ESN" },
    { assignment_status: "uncertain" as const }, { reference_panel: "different" },
    { reference_panel_version: "v2" }, { method: "different" }, { sample_id: "other" },
  ])("preserves distinct data boundaries: %o", (change) => {
    expect(joinAdjacentSegments([segment(0, 10), segment(10, 20, change)])).toHaveLength(2);
  });
});
