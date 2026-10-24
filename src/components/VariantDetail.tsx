import { useMemo } from "react";
import type { AnalysisBundle } from "../domain/explorer";
import { segmentsOverlapping, toDisplayPosition } from "../domain/explorer";
import { regionFor } from "../domain/geography";
import type { VariantObservation } from "../domain/types";

interface Props {
  bundle: AnalysisBundle;
  variant: VariantObservation;
  onClose: () => void;
}

const MEAS_LABEL: Record<string, { text: string; cls: string }> = {
  observed: { text: "Observed in this dataset", cls: "good" },
  imputed: { text: "Imputed (not directly assayed)", cls: "warn" },
  not_assayed: { text: "Not assayed (coverage known)", cls: "warn" },
  no_call: { text: "No call", cls: "warn" },
  excluded: { text: "Excluded", cls: "bad" },
};

/**
 * Variant detail: genotype, segment (local-ancestry) context on both copies,
 * ancestry-group frequency comparison, curated evidence with review status and
 * conflicts, and the measurement status. Missing frequency is shown as missing,
 * never as zero; a no-call/absent record is never a reassuring negative.
 */
export function VariantDetail({ bundle, variant, onClose }: Props) {
  const segs = useMemo(
    () =>
      segmentsOverlapping(
        bundle.segments,
        variant.chromosome,
        variant.position_0based,
        variant.position_0based + 1,
      ),
    [bundle.segments, variant],
  );

  const freqs = useMemo(
    () =>
      bundle.frequencies
        .filter((f) => f.variant_key === variant.variant_key)
        .sort((a, b) => {
          const av = a.allele_frequency ?? -1;
          const bv = b.allele_frequency ?? -1;
          return bv - av;
        }),
    [bundle.frequencies, variant.variant_key],
  );

  const evidence = useMemo(
    () => bundle.evidence.filter((e) => e.variant_key === variant.variant_key),
    [bundle.evidence, variant.variant_key],
  );

  const meas = MEAS_LABEL[variant.measurement_status] ?? {
    text: variant.measurement_status,
    cls: "warn",
  };

  return (
    <section aria-label="Variant detail" className="variant-detail">
      <div className="toolbar between">
        <h3>
          {variant.rsid ?? variant.variant_key}{" "}
          <span className={`badge ${meas.cls}`}>{meas.text}</span>
        </h3>
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="subtitle">
        chr{variant.chromosome}:
        {toDisplayPosition(variant.position_0based).toLocaleString()} (1-based) ·{" "}
        variant key {variant.variant_key}
      </p>

      <table className="quality">
        <tbody>
          <tr>
            <td>Genotype</td>
            <td className="num">{variant.genotype}</td>
          </tr>
          <tr>
            <td>Phased</td>
            <td className="num">{variant.phased ? "yes" : "no"}</td>
          </tr>
          <tr>
            <td>REF / ALT</td>
            <td className="num">
              {variant.ref ?? "—"} / {variant.alt ?? "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <h4>Local-ancestry context (both copies)</h4>
      {segs.length === 0 && (
        <p className="subtitle">
          No ancestry segment overlaps this position (may be an unknown region).
        </p>
      )}
      <ul className="tight">
        {segs.map((s, i) => {
          const reg = regionFor(s.ancestry_label);
          return (
            <li key={i}>
              <span className="seg-dot" style={{ background: reg.color }} /> copy{" "}
              {s.copy_index}: {reg.name} ({s.assignment_status})
            </li>
          );
        })}
      </ul>

      <h4>Ancestry-group frequency comparison</h4>
      <p className="subtitle">
        Whole-person ancestry-group frequencies (gnomAD-style). Missing values
        are shown as “not reported”, which is NOT the same as a frequency of
        zero.
      </p>
      <table className="quality">
        <thead>
          <tr>
            <th>Reference group</th>
            <th>Basis</th>
            <th>Allele frequency</th>
          </tr>
        </thead>
        <tbody>
          {freqs.map((f, i) => (
            <tr key={i}>
              <td>{regionFor(f.ancestry_group).name}</td>
              <td>
                {f.frequency_basis === "local_ancestry"
                  ? "local-ancestry-informed"
                  : "whole-person group"}
              </td>
              <td className="num">
                {f.allele_frequency === null ? (
                  <span className="badge warn">not reported</span>
                ) : (
                  f.allele_frequency.toExponential(2)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Clinical / statistical evidence</h4>
      {evidence.length === 0 && (
        <p className="subtitle">No curated evidence row for this variant.</p>
      )}
      {evidence.map((e, i) => (
        <div key={i} className="evidence-card">
          <div className="evidence-head">
            <strong>{e.condition}</strong>{" "}
            <span className="badge">{e.evidence_type}</span>
            {e.conflicting && (
              <span className="badge bad">conflicting interpretations</span>
            )}
          </div>
          <ul className="tight">
            {e.classification && <li>Classification: {e.classification}</li>}
            {e.review_status && <li>Review status: {e.review_status}</li>}
            {e.inheritance && <li>Inheritance: {e.inheritance}</li>}
            {e.effect_allele && <li>Effect allele: {e.effect_allele}</li>}
            <li>Limitations: {e.limitations}</li>
          </ul>
          <div className="sources">
            <a href={e.source_url} target="_blank" rel="noopener noreferrer">
              source
            </a>{" "}
            · accessed {e.accessed_at}
          </div>
        </div>
      ))}

      {variant.measurement_status !== "observed" && (
        <div className="disclaimer" role="note">
          This variant was not directly observed in the dataset. A missing or
          no-call result is NOT a reassuring negative — the variant may simply
          not be covered. Confirmatory clinical testing is required to establish
          presence or absence.
        </div>
      )}
    </section>
  );
}
