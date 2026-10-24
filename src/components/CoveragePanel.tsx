import { useMemo } from "react";
import type { AnalysisBundle } from "../domain/explorer";
import { coverageSummary } from "../domain/clinical";

interface Props {
  bundle: AnalysisBundle;
  /** Compact badge variant (for the Overview) vs. full panel (Conditions). */
  compact?: boolean;
  onOpenCoverage?: () => void;
}

/**
 * "What was NOT tested" coverage. Quantifies, per curated condition, how many of
 * the curated variants this array can actually assay vs. total, with the
 * explicit "a negative result does not rule out risk" warning.
 */
export function CoveragePanel({ bundle, compact, onOpenCoverage }: Props) {
  const cov = useMemo(() => coverageSummary(bundle), [bundle]);

  if (compact) {
    return (
      <button className="coverage-badge" onClick={onOpenCoverage}>
        <span className="coverage-badge-num">
          {cov.assayable}/{cov.total}
        </span>
        <span className="coverage-badge-label">
          curated variants assayable by this array
        </span>
      </button>
    );
  }

  return (
    <section className="coverage-panel" aria-label="Coverage: what was not tested">
      <h4>Coverage — what was NOT tested</h4>
      <p className="subtitle">
        Of {cov.total} curated variants across the panel, {cov.assayable} are
        directly assayable by this array.
      </p>
      <table className="quality">
        <thead>
          <tr>
            <th>Condition</th>
            <th>Gene</th>
            <th>Assayable</th>
            <th>Not assayed</th>
          </tr>
        </thead>
        <tbody>
          {cov.rows.map((r) => (
            <tr key={r.condition}>
              <td>{r.condition}</td>
              <td>{r.gene}</td>
              <td className="num">
                {r.assayable}/{r.total}
              </td>
              <td>
                {r.not_assayed.length === 0 ? (
                  <span className="subtitle">—</span>
                ) : (
                  r.not_assayed.join(", ")
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="disclaimer" role="note">
        A negative or not-assayed result does NOT rule out risk. This array types
        only selected positions; indels and most pathogenic variants are not
        covered. Confirmatory clinical testing is required to establish presence
        or absence.
      </div>
    </section>
  );
}
