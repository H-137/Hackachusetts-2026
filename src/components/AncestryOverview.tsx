import { useMemo } from "react";
import type { AnalysisBundle } from "../domain/explorer";
import { regionFor } from "../domain/geography";

interface Props {
  bundle: AnalysisBundle;
}

/**
 * Comprehensive overview: genome-wide ancestry composition (by base pairs
 * across both copies), assignment-confidence breakdown, flagged elevated-risk
 * findings, and disease-score status. Composition is derived from the
 * synthetic segments and labeled accordingly. It is not a diagnosis.
 */
export function AncestryOverview({ bundle }: Props) {
  const composition = useMemo(() => {
    const bpByLabel = new Map<string, number>();
    let total = 0;
    for (const s of bundle.segments) {
      const bp = s.end_0based_exclusive - s.start_0based;
      bpByLabel.set(s.ancestry_label, (bpByLabel.get(s.ancestry_label) ?? 0) + bp);
      total += bp;
    }
    return Array.from(bpByLabel.entries())
      .map(([label, bp]) => ({
        label,
        name: regionFor(label).name,
        color: regionFor(label).color,
        fraction: total > 0 ? bp / total : 0,
      }))
      .sort((a, b) => b.fraction - a.fraction);
  }, [bundle.segments]);

  const confidence = useMemo(() => {
    const counts = { assigned: 0, uncertain: 0, unknown: 0 };
    for (const s of bundle.segments) counts[s.assignment_status]++;
    return counts;
  }, [bundle.segments]);

  // Flag conditions whose elevated-frequency reference group overlaps any
  // segment AND where a curated pathogenic variant was actually observed, vs.
  // frequency-context-only flags. Never present a missing variant as negative.
  const flags = useMemo(() => {
    const labelsPresent = new Set(bundle.segments.map((s) => s.ancestry_label));
    const observedPathogenicConditions = new Set(
      bundle.evidence
        .filter((e) => {
          const v = bundle.variants.find(
            (x) => x.variant_key === e.variant_key,
          );
          const isPath = (e.classification ?? "")
            .toLowerCase()
            .includes("pathogenic");
          const notConflict = !e.conflicting;
          return (
            isPath && notConflict && v?.measurement_status === "observed"
          );
        })
        .map((e) => e.condition),
    );
    return bundle.conditions.map((c) => {
      const groupOverlap = c.elevated_frequency_groups.filter((g) =>
        labelsPresent.has(g),
      );
      return {
        condition: c.condition,
        gene: c.gene,
        groupOverlap,
        observedPathogenic: observedPathogenicConditions.has(c.condition),
      };
    });
  }, [bundle]);

  return (
    <section aria-label="Overview" className="overview">
      <div className="sample-head">
        <h2>
          Overview{" "}
          <span className="badge warn">
            {bundle.sample.synthetic ? "Synthetic demo" : "Local analysis"}
          </span>
        </h2>
        <p className="subtitle">
          sample {bundle.sample.sample_id} · build {bundle.sample.genome_build} ·
          status {bundle.sample.processing_status} ·{" "}
          {bundle.sample.quality_summary.autosomal_records.toLocaleString()}{" "}
          analysis-ready autosomal SNPs
        </p>
      </div>

      <h3>Inferred ancestry composition</h3>
      <p className="subtitle">
        Share of inferred ancestry across both chromosome copies, by base pairs.
        Local ancestry is a model estimate relative to selected reference
        populations, not an intrinsic ethnicity.
      </p>
      <div className="composition-bar" role="img" aria-label="Ancestry composition bar">
        {composition.map((c) => (
          <div
            key={c.label}
            className="composition-seg"
            style={{ width: `${(c.fraction * 100).toFixed(2)}%`, background: c.color }}
            title={`${c.name}: ${(c.fraction * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <ul className="legend">
        {composition.map((c) => (
          <li key={c.label}>
            <span className="seg-dot" style={{ background: c.color }} />
            {c.name} {(c.fraction * 100).toFixed(1)}%
          </li>
        ))}
      </ul>

      <h3>Assignment confidence</h3>
      <p>
        <span className="badge good">{confidence.assigned} assigned</span>{" "}
        <span className="badge warn">{confidence.uncertain} uncertain</span>{" "}
        <span className="badge">{confidence.unknown} unknown</span>
      </p>

      <h3>Flagged findings</h3>
      <p className="subtitle">
        A flag indicates overlap with an elevated-frequency reference group
        and/or an observed curated variant. It is a prompt to consider
        confirmatory testing, never a diagnosis or a reassurance.
      </p>
      <table className="quality">
        <thead>
          <tr>
            <th>Condition</th>
            <th>Gene</th>
            <th>Ancestry overlap</th>
            <th>Observed curated variant</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.condition}>
              <td>{f.condition}</td>
              <td>{f.gene}</td>
              <td>
                {f.groupOverlap.length > 0 ? (
                  <span className="badge warn">
                    {f.groupOverlap.map((g) => regionFor(g).name).join(", ")}
                  </span>
                ) : (
                  <span className="badge">none</span>
                )}
              </td>
              <td>
                {f.observedPathogenic ? (
                  <span className="badge bad">observed — confirm clinically</span>
                ) : (
                  <span className="badge">not observed (may be unmeasured)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Disease-specific score status</h3>
      {bundle.scores.map((s) => (
        <div key={s.model_id} className="evidence-card">
          <div className="evidence-head">
            <strong>{s.condition}</strong>{" "}
            {s.raw_score === null ? (
              <span className="badge bad">unscorable</span>
            ) : (
              <span className="badge good">score computed</span>
            )}
          </div>
          <ul className="tight">
            {s.raw_score !== null && <li>Raw score: {s.raw_score}</li>}
            {s.unscorable_reason && <li>Reason: {s.unscorable_reason}</li>}
            <li>Marker coverage: {(s.marker_coverage * 100).toFixed(0)}%</li>
            <li>
              Percentile:{" "}
              {s.percentile === null ? "not reported (no validated distribution)" : s.percentile}
            </li>
            <li>
              Absolute risk:{" "}
              {s.absolute_risk === null
                ? "not reported (no calibrated model + clinical inputs)"
                : s.absolute_risk}
            </li>
            <li>Model: {s.model_id} {s.model_version}</li>
            <li>Limitations: {s.limitations}</li>
          </ul>
        </div>
      ))}
    </section>
  );
}
