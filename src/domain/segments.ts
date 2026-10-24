import type { AncestrySegment } from "./types";

/** Presentation-only joining. Never bridge gaps, copies, confidence or reference boundaries. */
export function joinAdjacentSegments(segments: AncestrySegment[]): AncestrySegment[] {
  const sorted = [...segments].sort((a, b) =>
    a.chromosome.localeCompare(b.chromosome, undefined, { numeric: true }) ||
    a.copy_index - b.copy_index || a.start_0based - b.start_0based);
  const result: AncestrySegment[] = [];
  for (const segment of sorted) {
    const last = result[result.length - 1];
    if (last && last.sample_id === segment.sample_id && last.chromosome === segment.chromosome &&
        last.copy_index === segment.copy_index && last.ancestry_label === segment.ancestry_label &&
        last.assignment_status === segment.assignment_status && last.method === segment.method &&
        last.reference_panel === segment.reference_panel && last.reference_panel_id === segment.reference_panel_id &&
        last.reference_panel_version === segment.reference_panel_version &&
        last.end_0based_exclusive === segment.start_0based) {
      last.end_0based_exclusive = segment.end_0based_exclusive;
      // Combined display spans do not have a single model probability vector.
      last.probabilities = null;
    } else result.push({ ...segment });
  }
  return result;
}
