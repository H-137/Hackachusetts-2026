/**
 * Geography model: maps inferred local-ancestry reference-group labels to broad
 * global regions with representative centroid coordinates for the interactive
 * globe (Step 6 UI).
 *
 * IMPORTANT framing (HACKATHON_PROJECT_PLAN.md Section 2 "Terminology"):
 * these are *reference-population* regions used for local genetic ancestry
 * inference. A centroid is a visualization anchor, NOT a claim that an
 * individual or a variant "comes from" a single point. Ancestry is inferred for
 * chromosome segments relative to selected reference populations; it is not an
 * intrinsic ethnicity attached to a gene.
 */

export interface GlobalRegion {
  /** Stable code used as the ancestry_label across the normalized schema. */
  code: string;
  /** Human-facing region name. */
  name: string;
  /** Short description of the reference grouping. */
  description: string;
  /** Representative centroid for globe placement (degrees). */
  lat: number;
  lng: number;
  /** Accessible, colorblind-aware fill for tracks and globe markers. */
  color: string;
}

/** Fallback region for unassigned / unknown-coverage labels. */
export const UNKNOWN_REGION: GlobalRegion = {
  code: "UNKNOWN",
  name: "Unknown / insufficient coverage",
  description:
    "No confident assignment. Marker overlap or model confidence was insufficient to call a region here.",
  lat: 0,
  lng: 0,
  color: "#4c566a",
};

/**
 * Broad continental-scale reference groups. Kept deliberately coarse: the plan
 * forbids fabricating fine-scale ancestry unsupported by a reference panel
 * (Section 6C). Codes mirror common gnomAD / 1000 Genomes super-population
 * conventions where reasonable.
 */
export const GLOBAL_REGIONS: Record<string, GlobalRegion> = {
  AJ: {
    code: "AJ",
    name: "Ashkenazi Jewish",
    description:
      "Ashkenazi Jewish reference group. Relevant to several well-documented founder variants.",
    lat: 52.2,
    lng: 19.1,
    color: "#d08770",
  },
  NFE: {
    code: "NFE",
    name: "Non-Finnish European",
    description: "Non-Finnish European reference group.",
    lat: 48.0,
    lng: 10.0,
    color: "#5e81ac",
  },
  FIN: {
    code: "FIN",
    name: "Finnish",
    description: "Finnish reference group (notable for its own founder variants).",
    lat: 64.0,
    lng: 26.0,
    color: "#81a1c1",
  },
  AFR: {
    code: "AFR",
    name: "African / African-American",
    description: "African and African-American reference grouping.",
    lat: 1.0,
    lng: 18.0,
    color: "#a3be8c",
  },
  EAS: {
    code: "EAS",
    name: "East Asian",
    description: "East Asian reference group.",
    lat: 35.0,
    lng: 115.0,
    color: "#ebcb8b",
  },
  SAS: {
    code: "SAS",
    name: "South Asian",
    description: "South Asian reference group.",
    lat: 21.0,
    lng: 78.0,
    color: "#b48ead",
  },
  AMR: {
    code: "AMR",
    name: "Admixed American",
    description: "Admixed American reference grouping.",
    lat: -14.0,
    lng: -60.0,
    color: "#8fbcbb",
  },
  MID: {
    code: "MID",
    name: "Middle Eastern",
    description: "Middle Eastern reference group.",
    lat: 29.0,
    lng: 45.0,
    color: "#bf616a",
  },
  UNKNOWN: UNKNOWN_REGION,
};

export function regionFor(label: string): GlobalRegion {
  return GLOBAL_REGIONS[label] ?? UNKNOWN_REGION;
}

export function regionColor(label: string): string {
  return regionFor(label).color;
}
