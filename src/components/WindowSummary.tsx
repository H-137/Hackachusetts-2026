import { useMemo } from "react";
import type { AnalysisBundle } from "../domain/explorer";
import {
  formatBp,
  summarizeWindowCoverage,
  toDisplayPosition,
} from "../domain/explorer";

interface Props {
  bundle: AnalysisBundle;
  chromosome: string;
  viewStart: number;
  viewEnd: number;
}

const LEVEL_LABEL: Record<
  string,
  { text: string; cls: string }
> = {
  none: { text: "No coverage", cls: "bad" },
  sparse: { text: "Sparse coverage", cls: "warn" },
  moderate: { text: "Moderate coverage", cls: "warn" },
  dense: { text: "Denser coverage", cls: "good" },
};

/**
 * Coverage strip for the current zoom window. Framed strictly around LOCAL
 * COVERAGE — marker density and the largest unmeasured gap — which the
 * whole-genome Overview tab cannot show. The payoff of zooming is seeing how
 * well-measured the region you're inspecting actually is, and what that means
 * for reading "no finding" here.
 */
export function WindowSummary({
  bundle,
  chromosome,
  viewStart,
  viewEnd,
}: Props) {
  const c = useMemo(
    () => summarizeWindowCoverage(bundle.variants, chromosome, viewStart, viewEnd),
    [bundle.variants, chromosome, viewStart, viewEnd],
  );

  const level = LEVEL_LABEL[c.coverage_level] ?? LEVEL_LABEL.sparse!;

  return (
    <section className="coverage-strip" aria-label="Coverage at this zoom">
      <div className="cov-top">
        <div className="cov-title">
          <span className="cov-eyebrow">Coverage at this zoom</span>
          <span className="subtitle">
            chr{chromosome}:
            {toDisplayPosition(c.start_0based).toLocaleString()}–
            {c.end_0based_exclusive.toLocaleString()} · {formatBp(c.span_bp)}
          </span>
        </div>
        <span className={`badge ${level.cls}`}>{level.text}</span>
      </div>

      {/* Density meter: how close this window is to a dense array. */}
      <div
        className="cov-meter"
        role="img"
        aria-label={`Marker density ${(c.density_fraction * 100).toFixed(0)} percent of a dense array`}
      >
        <div
          className={`cov-meter-fill ${c.coverage_level}`}
          style={{ width: `${Math.max(2, c.density_fraction * 100).toFixed(0)}%` }}
        />
      </div>

      <div className="cov-facts">
        <span>
          <strong>{c.assayed_markers.toLocaleString()}</strong> assayed markers
        </span>
        <span>
          ·{" "}
          {c.mean_spacing_bp === null
            ? "spacing n/a"
            : `~1 per ${formatBp(c.mean_spacing_bp)}`}
        </span>
        {c.largest_gap_bp !== null && (
          <span>
            · largest unmeasured gap <strong>{formatBp(c.largest_gap_bp)}</strong>
          </span>
        )}
      </div>

      <p className="cov-note">{c.absence_note}</p>
    </section>
  );
}
