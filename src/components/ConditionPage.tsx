import { useMemo, useState } from "react";
import type { Role } from "../App";
import type { AnalysisBundle } from "../domain/explorer";
import { pgsCoverage } from "../domain/clinical";
import { regionFor } from "../domain/geography";
import type { VariantObservation } from "../domain/types";
import { CarrierStatusTable } from "./CarrierStatusTable";
import { CoveragePanel } from "./CoveragePanel";

interface Props {
  bundle: AnalysisBundle;
  role: Role;
  condition: string;
  onSelectVariant: (v: VariantObservation) => void;
}

/**
 * Condition page, role-aware.
 *  - Clinician: carrier status, per-variant provenance, the full coverage panel,
 *    PGS coverage transparency (replaces the composite score status), a VUS /
 *    low-evidence toggle (default off), and a collapsed condition explainer.
 *  - Patient: the expanded plain-language explainer only; no raw variant tables
 *    or provenance. High-impact findings point to a provider / genetic counselor.
 */
export function ConditionPage({ bundle, role, condition, onSelectVariant }: Props) {
  const man = bundle.conditions.find((c) => c.condition === condition);
  const [showVus, setShowVus] = useState(false);

  const pgs = useMemo(
    () => pgsCoverage(bundle.scores).filter((p) => matchesCondition(p.condition, condition)),
    [bundle.scores, condition],
  );

  if (!man) return <p className="subtitle">Condition not found.</p>;

  const examined = man.examined_variant_keys
    .map((k) => bundle.variants.find((v) => v.variant_key === k))
    .filter((v): v is VariantObservation => Boolean(v));

  // Whether this condition has any observed, high-impact finding (for patients).
  const hasObservedFinding = bundle.evidence.some((e) => {
    if (e.condition !== condition) return false;
    const v = bundle.variants.find((x) => x.variant_key === e.variant_key);
    return v?.measurement_status === "observed";
  });

  // ---------------- Patient view ----------------
  if (role === "patient") {
    return (
      <section aria-label={`Condition: ${condition} (patient view)`} className="condition-page patient">
        <h3>{man.condition}</h3>
        <p className="subtitle">{man.gene} · {man.inheritance}</p>
        <p>{man.rationale}</p>
        <div className="disclaimer" role="note">
          {hasObservedFinding ? (
            <>
              This DNA test looked at a small number of specific spots related to
              this condition. Some results here are worth discussing with your
              healthcare provider or a genetic counselor, who can arrange proper
              confirmatory testing. This is not a diagnosis.
            </>
          ) : (
            <>
              This DNA test checks only a few specific spots for this condition,
              and it did not find them — but that does not rule the condition out,
              because most of it is not measured here. If you have questions or a
              family history, talk with your provider or a genetic counselor.
            </>
          )}
        </div>
      </section>
    );
  }

  // ---------------- Clinician view (default) ----------------
  return (
    <section aria-label={`Condition: ${condition}`} className="condition-page">
      <h3>{man.condition}</h3>
      <p className="subtitle">
        {man.gene} · {man.inheritance}
      </p>

      <h4>Carrier status (observed)</h4>
      <CarrierStatusTable bundle={bundle} condition={condition} />

      <h4>Coverage</h4>
      <CoveragePanel bundle={bundle} />

      <h4>Polygenic score coverage</h4>
      {pgs.length === 0 ? (
        <p className="subtitle">No polygenic score applies to this condition.</p>
      ) : (
        pgs.map((p) => (
          <div key={p.model_id} className="evidence-card">
            <div className="evidence-head">
              <strong>{p.condition}</strong>{" "}
              {p.scorable ? (
                <span className="badge warn">{p.coverage_pct}% markers observed</span>
              ) : (
                <span className="badge bad">unscorable</span>
              )}
            </div>
            <p>{p.verdict}</p>
            <p className="subtitle">{p.limitations}</p>
          </div>
        ))
      )}

      <h4>Founder-variant frequency context</h4>
      <ul className="tight">
        {man.elevated_frequency_groups.map((g) => (
          <li key={g}>
            <span className="seg-dot" style={{ background: regionFor(g).color }} />
            Frequency elevated in {regionFor(g).name}
          </li>
        ))}
      </ul>
      <p className="subtitle">
        A higher allele frequency in a population is a statement about how common
        a founder variant is there — not evidence that ancestry changes the
        variant's effect, and not evidence any individual carries it.
      </p>

      <div className="vus-toggle">
        <label>
          <input
            type="checkbox"
            checked={showVus}
            onChange={(e) => setShowVus(e.target.checked)}
          />{" "}
          Show VUS / low-evidence variants
        </label>
      </div>

      <h4>Curated variants examined ({examined.length})</h4>
      <ul className="tight">
        {examined
          .filter(
            (v) =>
              showVus ||
              !bundle.evidence.some(
                (e) =>
                  e.variant_key === v.variant_key &&
                  (e.classification ?? "").toLowerCase().includes("uncertain"),
              ),
          )
          .map((v) => (
            <li key={v.variant_key}>
              <button className="linklike" onClick={() => onSelectVariant(v)}>
                {v.rsid ?? v.variant_key}
              </button>{" "}
              <span className="subtitle">· {v.measurement_status}</span>
            </li>
          ))}
      </ul>

      <details className="explainer">
        <summary>Condition explainer</summary>
        <p>{man.rationale}</p>
        <p>{man.screening_note}</p>
      </details>

      <div className="sources">
        Sources:{" "}
        {man.source_urls.map((s, i) => (
          <span key={s}>
            {i > 0 && " · "}
            <a href={s} target="_blank" rel="noopener noreferrer">
              {hostOf(s)}
            </a>
          </span>
        ))}
      </div>
    </section>
  );
}

/** Loose match between a score's condition string and a curated condition. */
function matchesCondition(scoreCondition: string, condition: string): boolean {
  const a = scoreCondition.toLowerCase();
  const b = condition.toLowerCase();
  const key = b.split(/[\s/]/)[0] ?? "";
  return a.includes(key) || b.includes((a.split(/[\s(]/)[0] ?? ""));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
