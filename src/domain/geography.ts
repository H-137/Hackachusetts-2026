/**
 * Geography model: maps inferred local-ancestry reference-group labels to broad
 * global regions with representative centroid coordinates for the interactive
 * globe (Step 6 UI).
 *
 * This is a DISPLAY registry (names, centroids, colors) only. It is NOT the
 * authoritative population list: the set of labels for a run comes from the
 * reference-panel provenance carried in the results (reference_panel_id /
 * reference_panel_version on each AncestrySegment). Panels can add populations
 * (e.g. an Ashkenazi Jewish group) without touching the pipeline's label
 * handling. Any label not found here renders via UNKNOWN_REGION rather than
 * breaking; add presentation metadata here when a panel introduces a new code.
 * The entries below cover the 1000 Genomes populations plus the Step 7 expanded
 * panel's added groups.
 *
 * IMPORTANT framing (HACKATHON_PROJECT_PLAN.md Section 2 "Terminology"):
 * these are *reference-population* groups used for local genetic ancestry
 * inference. A result means a segment is inferred to be MOST SIMILAR to a
 * reference population among those provided — not a claim that an individual or
 * a variant "comes from" a single point. A centroid is only a visualization
 * anchor. Sub-continental resolution from sparse consumer-array data is not
 * validated; probabilities are model marginals, not calibrated confidence.
 */

export interface GlobalRegion {
  /** Stable code used as the ancestry_label across the normalized schema. */
  code: string;
  /** Human-facing reference-population name. */
  name: string;
  /** Super-population this reference group belongs to. */
  superPopulation: string;
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
  superPopulation: "UNKNOWN",
  description:
    "No confident assignment. Marker overlap or model confidence was insufficient to call a region here.",
  lat: 0,
  lng: 0,
  color: "#4c566a",
};

/** Super-population display names and a shared color per super-population. */
export const SUPER_POPULATIONS: Record<string, { name: string; color: string }> = {
  EUR: { name: "European", color: "#5e81ac" },
  EAS: { name: "East Asian", color: "#ebcb8b" },
  AFR: { name: "African", color: "#a3be8c" },
  AMR: { name: "Admixed American", color: "#8fbcbb" },
  SAS: { name: "South Asian", color: "#b48ead" },
  MID: { name: "Middle Eastern", color: "#bf616a" },
  UNKNOWN: { name: "Unknown", color: "#4c566a" },
};

/**
 * The 26 1000 Genomes Phase 3 reference populations. Codes match exactly what
 * RFMix emits from the sample map (the `pop` column of the 1000G panel).
 * Centroids are approximate representative locations for the sampled cohort,
 * used only for globe placement.
 */
export const GLOBAL_REGIONS: Record<string, GlobalRegion> = {
  // --- European (EUR) ---
  CEU: {
    code: "CEU", name: "Utah residents (CEPH) of N. & W. European ancestry",
    superPopulation: "EUR",
    description: "Utah residents with Northern and Western European ancestry.",
    lat: 40.0, lng: -111.9, color: "#5e81ac",
  },
  GBR: {
    code: "GBR", name: "British (England & Scotland)", superPopulation: "EUR",
    description: "British reference population from England and Scotland.",
    lat: 54.0, lng: -2.0, color: "#81a1c1",
  },
  FIN: {
    code: "FIN", name: "Finnish", superPopulation: "EUR",
    description: "Finnish reference population (notable for its own founder variants).",
    lat: 64.0, lng: 26.0, color: "#88c0d0",
  },
  IBS: {
    code: "IBS", name: "Iberian (Spain)", superPopulation: "EUR",
    description: "Iberian populations in Spain.",
    lat: 40.4, lng: -3.7, color: "#5e81ac",
  },
  TSI: {
    code: "TSI", name: "Toscani (Italy)", superPopulation: "EUR",
    description: "Toscani in Italia.",
    lat: 43.4, lng: 11.0, color: "#81a1c1",
  },

  // --- East Asian (EAS) ---
  CHB: {
    code: "CHB", name: "Han Chinese (Beijing)", superPopulation: "EAS",
    description: "Han Chinese in Beijing, China.",
    lat: 39.9, lng: 116.4, color: "#ebcb8b",
  },
  JPT: {
    code: "JPT", name: "Japanese (Tokyo)", superPopulation: "EAS",
    description: "Japanese in Tokyo, Japan.",
    lat: 35.7, lng: 139.7, color: "#d08770",
  },
  CHS: {
    code: "CHS", name: "Southern Han Chinese", superPopulation: "EAS",
    description: "Southern Han Chinese.",
    lat: 23.1, lng: 113.3, color: "#ebcb8b",
  },
  CDX: {
    code: "CDX", name: "Dai Chinese (Xishuangbanna)", superPopulation: "EAS",
    description: "Chinese Dai in Xishuangbanna, China.",
    lat: 22.0, lng: 100.8, color: "#e5c07b",
  },
  KHV: {
    code: "KHV", name: "Kinh (Ho Chi Minh City)", superPopulation: "EAS",
    description: "Kinh in Ho Chi Minh City, Vietnam.",
    lat: 10.8, lng: 106.7, color: "#d08770",
  },

  // --- African (AFR) ---
  YRI: {
    code: "YRI", name: "Yoruba (Ibadan, Nigeria)", superPopulation: "AFR",
    description: "Yoruba in Ibadan, Nigeria.",
    lat: 7.4, lng: 3.9, color: "#a3be8c",
  },
  LWK: {
    code: "LWK", name: "Luhya (Webuye, Kenya)", superPopulation: "AFR",
    description: "Luhya in Webuye, Kenya.",
    lat: 0.6, lng: 34.8, color: "#8fbc8f",
  },
  GWD: {
    code: "GWD", name: "Gambian (Western Division)", superPopulation: "AFR",
    description: "Gambian in Western Division, The Gambia.",
    lat: 13.4, lng: -16.6, color: "#a3be8c",
  },
  MSL: {
    code: "MSL", name: "Mende (Sierra Leone)", superPopulation: "AFR",
    description: "Mende in Sierra Leone.",
    lat: 8.5, lng: -11.8, color: "#8fbc8f",
  },
  ESN: {
    code: "ESN", name: "Esan (Nigeria)", superPopulation: "AFR",
    description: "Esan in Nigeria.",
    lat: 6.5, lng: 6.0, color: "#a3be8c",
  },
  ASW: {
    code: "ASW", name: "African-American (SW USA)", superPopulation: "AFR",
    description: "Americans of African ancestry in the southwestern USA.",
    lat: 33.4, lng: -112.0, color: "#8fbc8f",
  },
  ACB: {
    code: "ACB", name: "African-Caribbean (Barbados)", superPopulation: "AFR",
    description: "African Caribbeans in Barbados.",
    lat: 13.2, lng: -59.5, color: "#a3be8c",
  },

  // --- Admixed American (AMR) ---
  MXL: {
    code: "MXL", name: "Mexican-American (Los Angeles)", superPopulation: "AMR",
    description: "Mexican ancestry in Los Angeles, USA.",
    lat: 34.1, lng: -118.2, color: "#8fbcbb",
  },
  PUR: {
    code: "PUR", name: "Puerto Rican", superPopulation: "AMR",
    description: "Puerto Ricans in Puerto Rico.",
    lat: 18.2, lng: -66.4, color: "#88c0d0",
  },
  CLM: {
    code: "CLM", name: "Colombian (Medellín)", superPopulation: "AMR",
    description: "Colombians in Medellín, Colombia.",
    lat: 6.2, lng: -75.6, color: "#8fbcbb",
  },
  PEL: {
    code: "PEL", name: "Peruvian (Lima)", superPopulation: "AMR",
    description: "Peruvians in Lima, Peru.",
    lat: -12.0, lng: -77.0, color: "#88c0d0",
  },

  // --- South Asian (SAS) ---
  GIH: {
    code: "GIH", name: "Gujarati Indian (Houston)", superPopulation: "SAS",
    description: "Gujarati Indians in Houston, USA.",
    lat: 22.3, lng: 72.6, color: "#b48ead",
  },
  PJL: {
    code: "PJL", name: "Punjabi (Lahore)", superPopulation: "SAS",
    description: "Punjabi in Lahore, Pakistan.",
    lat: 31.5, lng: 74.3, color: "#a579a0",
  },
  BEB: {
    code: "BEB", name: "Bengali (Bangladesh)", superPopulation: "SAS",
    description: "Bengali in Bangladesh.",
    lat: 23.7, lng: 90.4, color: "#b48ead",
  },
  STU: {
    code: "STU", name: "Sri Lankan Tamil (UK)", superPopulation: "SAS",
    description: "Sri Lankan Tamil in the UK.",
    lat: 7.9, lng: 80.8, color: "#a579a0",
  },
  ITU: {
    code: "ITU", name: "Indian Telugu (UK)", superPopulation: "SAS",
    description: "Indian Telugu in the UK.",
    lat: 16.5, lng: 80.6, color: "#b48ead",
  },

  // --- Super-population roll-ups (used when the pipeline runs at super_pop
  //     level, and by the bundled synthetic demo). Kept so a super-population
  //     code never silently renders as "Unknown". ---
  EUR: {
    code: "EUR", name: "European", superPopulation: "EUR",
    description: "European super-population reference grouping.",
    lat: 48.0, lng: 10.0, color: "#5e81ac",
  },
  EAS: {
    code: "EAS", name: "East Asian", superPopulation: "EAS",
    description: "East Asian super-population reference grouping.",
    lat: 35.0, lng: 115.0, color: "#ebcb8b",
  },
  AFR: {
    code: "AFR", name: "African", superPopulation: "AFR",
    description: "African super-population reference grouping.",
    lat: 1.0, lng: 18.0, color: "#a3be8c",
  },
  AMR: {
    code: "AMR", name: "Admixed American", superPopulation: "AMR",
    description: "Admixed American super-population reference grouping.",
    lat: -14.0, lng: -60.0, color: "#8fbcbb",
  },
  SAS: {
    code: "SAS", name: "South Asian", superPopulation: "SAS",
    description: "South Asian super-population reference grouping.",
    lat: 21.0, lng: 78.0, color: "#b48ead",
  },
  // --- gnomAD-style codes used by the bundled synthetic demo data. ---
  NFE: {
    code: "NFE", name: "Non-Finnish European", superPopulation: "EUR",
    description: "Non-Finnish European reference group (gnomAD-style code).",
    lat: 48.0, lng: 10.0, color: "#5e81ac",
  },
  AJ: {
    code: "AJ", name: "Ashkenazi Jewish", superPopulation: "MID",
    description:
      "Ashkenazi Jewish reference group (West-Eurasian; rolled up under Middle " +
      "Eastern, NOT merged into European, so AJ stays distinguishable from " +
      "1000G European sub-populations). Relevant to several documented founder " +
      "variants. Requires an AJ reference group in the active panel to be " +
      "assignable; see Step 7.",
    lat: 52.2, lng: 19.1, color: "#d08770",
  },

  MID: {
    code: "MID", name: "Middle Eastern", superPopulation: "MID",
    description: "Middle Eastern reference group (gnomAD-style code).",
    lat: 29.0, lng: 45.0, color: "#bf616a",
  },

  UNKNOWN: UNKNOWN_REGION,
};

export function regionFor(label: string): GlobalRegion {
  return GLOBAL_REGIONS[label] ?? UNKNOWN_REGION;
}

export function regionColor(label: string): string {
  return regionFor(label).color;
}

/** Readable "Name (CODE)" for a reference-population label. */
export function regionDisplayName(label: string): string {
  const r = GLOBAL_REGIONS[label];
  return r ? `${r.name} (${r.code})` : UNKNOWN_REGION.name;
}

/** Super-population a reference-population code rolls up to. */
export function superPopulationFor(label: string): string {
  return GLOBAL_REGIONS[label]?.superPopulation ?? "UNKNOWN";
}
