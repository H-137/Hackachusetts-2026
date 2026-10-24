import { useMemo } from "react";
import type { AnalysisBundle, SelectedRegion } from "../domain/explorer";
import {
  segmentsOverlapping,
  toDisplayPosition,
  variantsIn,
} from "../domain/explorer";
import { carrierStatuses } from "../domain/clinical";
import { regionFor } from "../domain/geography";
import type { VariantObservation } from "../domain/types";

interface Props {
  bundle: AnalysisBundle;
  region: SelectedRegion | null;
  onSelectVariant: (v: VariantObservation) => void;
}

/** Compact, readable status labels for the variant cards. */
const MEAS: Record<string, { text: string; cls: string }> = {
  observed: { text: "observed", cls: "good" },
  imputed: { text: "imputed", cls: "warn" },
  not_assayed: { text: "not assayed", cls: "warn" },
  no_call: { text: "no call", cls: "warn" },
  excluded: { text: "excluded", cls: "bad" },
};

/**
 * Clinician-facing side panel for the Chromosome View (replaces the globe for
 * clinicians, who don't need the visualization). Shows, for the current
 * selection: the local-ancestry context at the locus and any curated carrier
 * status that falls in the selected region — the relevant triage facts, not a
 * decorative globe. Derived from observed bundle facts; never diagnostic.
 */
export function RegionClinicalPanel({ bundle, region, onSelectVariant }: Props) {
  const genesInRegion = useMemo(() => {
    if (!region) return [];
    return bundle.genes.filter(
      (g) =>
        g.chromosome === region.chromosome &&
        g.end_0based_exclusive > region.start_0based &&
        g.start_0based < region.end_0based_exclusive,
    );
  }, [bundle.genes, region]);

  // Carrier rows whose variant falls inside the selected region.
  const carriersInRegion = useMemo(() => {
    if (!region) return [];
    const inRegion = new Set(
      variantsIn(
        bundle.variants,
        region.chromosome,
        region.start_0based,
        region.end_0based_exclusive,
      ).map((v) => v.variant_key),
    );
    return carrierStatuses(bundle).filter((r) => inRegion.has(r.variant_key));
  }, [bundle, region]);

  const segs = useMemo(() => {
    if (!region) return [];
    return segmentsOverlapping(
      bundle.segments,
      region.chromosome,
      region.start_0based,
      region.end_0based_exclusive,
    );
  }, [bundle.segments, region]);

  const regionVariants = useMemo(() => {
    if (!region) return [];
    return variantsIn(
      bundle.variants,
      region.chromosome,
      region.start_0based,
      region.end_0based_exclusive,
    );
  }, [bundle.variants, region]);

  if (!region) {
    return (
      <aside className="region-clinical" aria-label="Region clinical panel">
        <h4>Region insights</h4>
        <p className="subtitle">
          Select a gene region or an ancestry segment in the track to see its
          local-ancestry context and any curated carrier status here.
        </p>
      </aside>
    );
  }

  return (
    <aside className="region-clinical" aria-label="Region clinical panel">
      <h4>Region insights</h4>

      {genesInRegion.length > 0 && (
        <p className="subtitle">
          Genes in view: {genesInRegion.map((g) => g.gene).join(", ")}
        </p>
      )}

      <h5>Local-ancestry context (both copies)</h5>
      {segs.length === 0 ? (
        <p className="subtitle">No ancestry segment overlaps this region.</p>
      ) : (
        <ul className="tight">
          {segs.map((s, i) => {
            const reg = regionFor(s.ancestry_label);
            const top =
              s.probabilities && Math.max(...Object.values(s.probabilities));
            return (
              <li key={i}>
                <span className="seg-dot" style={{ background: reg.color }} />{" "}
                copy {s.copy_index}: {reg.name} ({s.assignment_status}
                {typeof top === "number" ? `, p≈${top.toFixed(2)}` : ""})
              </li>
            );
          })}
        </ul>
      )}
      <p className="subtitle">
        Local ancestry is a model estimate and is context only — it does not
        establish whether a variant is present.
      </p>

      <h5>Carrier status in this region</h5>
      {carriersInRegion.length === 0 ? (
        <p className="subtitle">
          No curated variant falls in this region. Absence here is not a negative
          result — the array types only selected positions.
        </p>
      ) : (
        <div className="carrier-table">
          {carriersInRegion.map((r) => (
            <div key={r.variant_key + r.condition} className="carrier-row">
              <div className="carrier-head">
                <strong>{r.rsid ?? r.variant_key}</strong>
                {r.gene && <span className="subtitle"> · {r.gene}</span>}
                <span
                  className={`badge ${
                    r.zygosity === "homozygous"
                      ? "bad"
                      : r.zygosity === "heterozygous"
                        ? "warn"
                        : r.zygosity === "absent"
                          ? "good"
                          : ""
                  }`}
                >
                  {r.clinical_allele_copies === null
                    ? "not assayed"
                    : `${r.clinical_allele_copies} copy(ies)`}
                </span>
              </div>
              <div className="carrier-interp">{r.interpretation}</div>
            </div>
          ))}
        </div>
      )}

      <h5>
        Variants in this region{" "}
        {regionVariants.length > 0 && (
          <span className="count-pill">{regionVariants.length}</span>
        )}
      </h5>
      {regionVariants.length === 0 ? (
        <p className="subtitle">No variants fall in this region.</p>
      ) : (
        <div className="variant-cards">
          {regionVariants.map((v) => {
            const m = MEAS[v.measurement_status] ?? {
              text: v.measurement_status,
              cls: "",
            };
            return (
              <button
                key={v.variant_key}
                className="variant-card"
                onClick={() => onSelectVariant(v)}
                aria-label={`View variant ${v.rsid ?? v.variant_key}`}
              >
                <span className="variant-card-id">{v.rsid ?? "variant"}</span>
                <span className="variant-card-pos">
                  chr{v.chromosome}:
                  {toDisplayPosition(v.position_0based).toLocaleString()}
                </span>
                <span className={`badge ${m.cls}`}>{m.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
