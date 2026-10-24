/**
 * Synthetic demo adapter.
 *
 * Loads a bundled synthetic AncestryDNA-shaped fixture and runs it through the
 * SAME parser the real upload path uses. This keeps demo and real data on one
 * normalized schema (Section 7) while remaining fully offline (Section 11).
 *
 * The fixture is synthetic: it is clearly labeled and must never be presented as
 * a real genome or used to fabricate downstream inference results.
 */

import { parseAncestryDna } from "../domain/parser";
import type { ParseResult, Sample } from "../domain/types";

// Vite ?raw import: the fixture text is bundled at build time.
import demoText from "../../data/demo/synthetic_valid.txt?raw";

export interface DemoLoad {
  parse: ParseResult;
  sample: Sample;
}

export function loadSyntheticDemo(): DemoLoad {
  const parse = parseAncestryDna(demoText);
  const sample: Sample = {
    sample_id: "synthetic-demo-001",
    source_type: "synthetic_demo",
    genome_build: parse.metadata.normalized_build,
    synthetic: true,
    processing_status: parse.quality_summary.sufficient_for_inference
      ? "parsed"
      : "insufficient_data",
    quality_summary: parse.quality_summary,
    provenance: {
      source_type: "synthetic_demo",
      accessed_at: new Date().toISOString(),
      notes:
        "Synthetic fixture for development and demonstration. Not a real genome.",
    },
    source_metadata: parse.metadata,
  };
  return { parse, sample };
}
