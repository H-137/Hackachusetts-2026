/**
 * AncestryDNA format constants, shared by the browser parser and mirrored by the
 * Python pipeline parser (pipeline/ancestry_explorer/parser.py). Keeping these in
 * one documented place prevents the two parsers from drifting apart.
 *
 * Source: HACKATHON_PROJECT_PLAN.md Section 4 "Required input contract", verified
 * against a real AncestryDNA V2.0 export.
 */

export const EXPECTED_HEADER = [
  "rsid",
  "chromosome",
  "position",
  "allele1",
  "allele2",
] as const;

/** Valid single-base SNP allele tokens on the forward strand. */
export const SNP_ALLELES = new Set(["A", "C", "G", "T"]);

/**
 * Documented AncestryDNA missing-call encoding. A no-call is represented by "0"
 * in either allele column. Verified against the source specification and the
 * real export (observed in both allele columns).
 */
export const NO_CALL_TOKEN = "0";

/**
 * AncestryDNA reports indels with D (deletion) / I (insertion) placeholder
 * tokens. These are NOT single-base SNPs; we report them as unsupported for the
 * first implementation rather than coercing them into A/C/G/T.
 */
export const INDEL_TOKENS = new Set(["D", "I"]);

/** Autosomal chromosome codes accepted into the analysis path. */
export const AUTOSOMES = new Set(
  Array.from({ length: 22 }, (_, i) => String(i + 1)),
);

/**
 * AncestryDNA numeric chromosome encoding for non-autosomal records. These are
 * excluded from the first (autosomal) implementation but counted with a
 * human-readable reason, per parser rule #4.
 */
export const NON_AUTOSOMAL_LABELS: Record<string, string> = {
  "23": "X",
  "24": "Y",
  "25": "XY/PAR",
  "26": "MT",
};

/**
 * AncestryDNA array V2.0 declares "human reference build 37.1", which corresponds
 * to GRCh37. We preserve the exact declared string separately and only map it to
 * our internal build enum here.
 */
export function normalizeDeclaredBuild(declared: string): "GRCh37" | "GRCh38" | "unknown" {
  const d = declared.trim();
  if (d.startsWith("37")) return "GRCh37";
  if (d.startsWith("38")) return "GRCh38";
  return "unknown";
}

/** Normalize a raw chromosome code to a display label. */
export function normalizeChromosome(raw: string): {
  norm: string;
  autosomal: boolean;
  label: string;
} {
  const r = raw.trim();
  if (AUTOSOMES.has(r)) {
    return { norm: r, autosomal: true, label: r };
  }
  const nonAuto = NON_AUTOSOMAL_LABELS[r];
  if (nonAuto) {
    return { norm: nonAuto, autosomal: false, label: nonAuto };
  }
  return { norm: r, autosomal: false, label: r };
}
