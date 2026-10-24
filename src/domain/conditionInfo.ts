/**
 * Plain-language, informational condition summaries for the PATIENT view —
 * GENERATED from the catalog data, not hard-coded per condition. Any condition
 * the pipeline returns populates automatically from its variants' generic
 * fields (gene, inheritance, classification, documented prevalence, population
 * association). No per-condition strings are baked in.
 *
 * These are general educational summaries of what a condition category is —
 * NOT a statement about the individual, not a diagnosis, not medical advice.
 */

import type { CatalogVariant } from "./watchlist";

export interface ResourceLink {
  label: string;
  url: string;
}

export interface ConditionInfo {
  condition: string;
  gene: string;
  /** One-line "what it is", generated. */
  summary: string;
  /** How it is typically inherited, in lay terms, generated. */
  inheritance_plain: string;
  /** A short, non-alarming paragraph of general context, generated. */
  about: string;
  /** Credible further-reading links, derived from the catalog data. */
  resources: ResourceLink[];
}

type InheritanceKind = "recessive" | "dominant" | "xlinked" | "other";

function classifyInheritance(raw: string): InheritanceKind {
  const s = raw.toLowerCase();
  if (s.includes("recessive")) return "recessive";
  if (s.includes("dominant")) return "dominant";
  if (s.includes("x-linked") || s.includes("x linked")) return "xlinked";
  return "other";
}

function inheritancePlain(kind: InheritanceKind): string {
  switch (kind) {
    case "recessive":
      return "Recessive — a person typically needs two gene changes (one from each parent) to be affected; a single change usually means 'carrier' only, which often causes no symptoms.";
    case "dominant":
      return "Dominant — a single inherited gene change can be relevant on its own, though it does not mean a person will definitely develop the condition.";
    case "xlinked":
      return "X-linked — inheritance depends on the X chromosome and can affect family members differently; a clinician can explain what it means in a specific family.";
    default:
      return "How this is inherited varies; a clinician or genetic counselor can explain what it means in a specific family.";
  }
}

/** A short lay descriptor of what kind of thing the condition is, from the gene context. */
function summaryLine(condition: string, kind: InheritanceKind): string {
  const base = `An inherited condition (${condition.toLowerCase()})`;
  switch (kind) {
    case "recessive":
      return `${base} that typically requires two gene changes to cause illness; carrying a single change usually causes no symptoms.`;
    case "dominant":
      return `${base} where a single inherited gene change can increase the chance of related health issues.`;
    default:
      return `${base} with an inherited genetic basis.`;
  }
}

/** Pull a documented prevalence string from the variants' frequency evidence, if any. */
function prevalenceNote(variants: CatalogVariant[]): string | null {
  for (const v of variants) {
    for (const f of v.frequency_evidence) {
      if (f.disease_prevalence) return f.disease_prevalence;
    }
  }
  return null;
}

/** Whether any variant for this condition is a documented founder variant. */
function hasFounder(variants: CatalogVariant[]): boolean {
  return variants.some((v) => v.founder_variant);
}

/** Whether any variant is an indel (not reliably typed by consumer arrays). */
function hasIndel(variants: CatalogVariant[]): boolean {
  return variants.some((v) => v.variant_class === "indel");
}

/** Human-readable label for a known credible domain. */
function labelForUrl(url: string): string {
  try {
    const host = new URL(url).host.replace(/^www\./, "");
    if (host.includes("ncbi.nlm.nih.gov")) {
      if (url.includes("/clinvar")) return "NCBI ClinVar";
      if (url.includes("/books")) return "NCBI Bookshelf (NIH)";
      return "NCBI (NIH)";
    }
    if (host.includes("medlineplus.gov")) return "MedlinePlus (NIH)";
    if (host.includes("omim.org")) return "OMIM";
    if (host.includes("ebi.ac.uk")) return "EMBL-EBI";
    return host;
  } catch {
    return "Source";
  }
}

/**
 * Collect credible further-reading links for a condition from its catalog
 * variants (ClinVar/NCBI citations + documented frequency sources), plus a
 * general MedlinePlus Genetics gene page and an NCBI Gene search derived from
 * the gene symbol. Deduplicated; all point at authoritative NIH/NCBI/EBI
 * domains that come from or are derived from the catalog data.
 */
export function conditionResources(
  gene: string,
  variants: CatalogVariant[],
): ResourceLink[] {
  const seen = new Set<string>();
  const out: ResourceLink[] = [];
  const add = (label: string, url: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ label, url });
  };

  // Prefer one gene-anchored overview (MedlinePlus Genetics, patient-friendly)
  // plus one specific record from the catalog data (ClinVar). One or two links,
  // each with a distinct apparent name.
  if (gene) {
    add(
      `MedlinePlus Genetics: ${gene} gene`,
      `https://medlineplus.gov/genetics/gene/${gene.toLowerCase()}/`,
    );
  }
  // The first ClinVar citation from the catalog, if any (distinct name).
  for (const v of variants) {
    const clinvar = v.citations.find((c) => c.includes("/clinvar"));
    if (clinvar) {
      add("NCBI ClinVar entry", clinvar);
      break;
    }
  }
  // If we still have nothing (no gene + no ClinVar), fall back to one source.
  if (out.length === 0) {
    for (const v of variants) {
      if (v.citations[0]) {
        add(labelForUrl(v.citations[0]), v.citations[0]);
        break;
      }
    }
  }

  return out.slice(0, 2);
}

/**
 * Generate patient-facing info for a condition from all its catalog variants.
 * Works for any condition the pipeline/catalog returns.
 */
export function makeConditionInfo(
  condition: string,
  variants: CatalogVariant[],
): ConditionInfo {
  const kind = classifyInheritance(variants[0]?.inheritance ?? "");
  const gene = variants[0]?.gene ?? "";
  const prevalence = prevalenceNote(variants);
  const founder = hasFounder(variants);
  const indel = hasIndel(variants);

  const aboutParts: string[] = [];
  aboutParts.push(
    kind === "recessive"
      ? "Carrier status (a single gene change) usually causes no symptoms but can be relevant for family planning."
      : kind === "dominant"
        ? "An inherited gene change can raise the chance of related health issues, but it does not guarantee a person will be affected — and not having it does not remove all risk."
        : "The health relevance depends on the specific situation.",
  );
  if (prevalence) {
    aboutParts.push(`Documented occurrence: ${prevalence}.`);
  }
  if (founder) {
    aboutParts.push(
      "Certain changes linked to this condition are more common in some ancestry backgrounds — that is a statement about how common the change is in a group, not about any individual.",
    );
  }
  if (indel) {
    aboutParts.push(
      "Some of the key changes for this condition are not reliably detected by a consumer DNA array, so a doctor-ordered test is what gives a real answer.",
    );
  }
  aboutParts.push(
    "A consumer DNA test checks only a few specific spots, so it cannot confirm or rule this out. A healthcare provider or genetic counselor interprets it properly.",
  );

  return {
    condition,
    gene,
    summary: summaryLine(condition, kind),
    inheritance_plain: inheritancePlain(kind),
    about: aboutParts.join(" "),
    resources: conditionResources(gene, variants),
  };
}
