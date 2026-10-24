import { useMemo } from "react";
import type { Role } from "../App";
import type { AnalysisBundle } from "../domain/explorer";
import { regionFor } from "../domain/geography";
import {
  buildWatchlist,
  observedFromBundle,
  summarizeWatchlist,
} from "../domain/watchlist";
import {
  WATCHLIST_CATALOG,
  processedChromosomes,
} from "../domain/watchlistCatalog";
import { coverageSummary } from "../domain/clinical";

interface Props {
  bundle: AnalysisBundle;
  role: Role;
  onOpenCondition: (condition: string) => void;
  onOpenWatchlist: () => void;
}

/**
 * Overview, role-aware.
 *  - Clinician (default): a high-level SUMMARY of all findings — top-line counts
 *    from the watchlist, coverage, and an ancestry snapshot — with links into
 *    the Watchlist (per-variant triage) and Conditions (per-condition detail).
 *    It does not repeat the detailed lists those tabs own.
 *  - Patient: a simplified, plain-language summary. No raw tables or provenance.
 */
export function AncestryOverview({
  bundle,
  role,
  onOpenCondition,
  onOpenWatchlist,
}: Props) {
  const composition = useMemo(() => {
    const bpByLabel = new Map<string, number>();
    let total = 0;
    for (const s of bundle.segments) {
      const bp = s.end_0based_exclusive - s.start_0based;
      bpByLabel.set(s.ancestry_label, (bpByLabel.get(s.ancestry_label) ?? 0) + bp);
      total += bp;
    }
    return Array.from(bpByLabel.entries())
      .filter(([label]) => label !== "UNKNOWN")
      .map(([label, bp]) => ({
        label,
        name: regionFor(label).name,
        color: regionFor(label).color,
        fraction: total > 0 ? bp / total : 0,
      }))
      .sort((a, b) => b.fraction - a.fraction);
  }, [bundle.segments]);

  const compositionBlock = (
    <>
      <h3>Inferred ancestry composition</h3>
      <p className="subtitle">
        Share of inferred ancestry across both chromosome copies, by base pairs.
        A model estimate relative to reference populations, not an intrinsic
        ethnicity.
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
    </>
  );

  // ---------------- Patient view ----------------
  if (role === "patient") {
    return (
      <section aria-label="Overview (patient view)" className="overview patient">
        <div className="sample-head">
          <h2>
            Your ancestry overview{" "}
            <span className="badge warn">
              {bundle.sample.synthetic ? "Example data" : "Your data"}
            </span>
          </h2>
          <p className="subtitle">
            A plain-language summary. This is not a medical result.
          </p>
        </div>

        {compositionBlock}

        <div className="disclaimer" role="note">
          This tool gives ancestry context from a consumer DNA test. It does not
          diagnose anything and does not tell you whether you have or will get a
          condition. If anything here raises a question, discuss it with your
          healthcare provider or a genetic counselor — they can arrange proper
          testing if it is appropriate for you.
        </div>

        <p className="subtitle">
          Switch to the Chromosomes tab to explore the interactive globe and
          chromosome painting.
        </p>
      </section>
    );
  }

  // ---------------- Clinician view (default): findings summary ----------------
  return (
    <AncestryOverviewClinician
      bundle={bundle}
      composition={compositionBlock}
      onOpenCondition={onOpenCondition}
      onOpenWatchlist={onOpenWatchlist}
    />
  );
}

function AncestryOverviewClinician({
  bundle,
  composition,
  onOpenCondition,
  onOpenWatchlist,
}: {
  bundle: AnalysisBundle;
  composition: React.ReactNode;
  onOpenCondition: (condition: string) => void;
  onOpenWatchlist: () => void;
}) {
  const processed = useMemo(
    () => processedChromosomes(bundle.segments),
    [bundle.segments],
  );
  const entries = useMemo(
    () =>
      buildWatchlist(
        WATCHLIST_CATALOG,
        bundle.segments,
        processed,
        observedFromBundle(bundle.variants),
      ),
    [bundle.segments, bundle.variants, processed],
  );
  const summary = useMemo(
    () => summarizeWatchlist(entries, processed),
    [entries, processed],
  );
  const cov = useMemo(() => coverageSummary(bundle), [bundle]);

  // The few highest-priority entries, as a teaser into the Watchlist.
  const topEntries = entries.slice(0, 3);

  return (
    <section aria-label="Overview (clinician view)" className="overview">
      <div className="sample-head">
        <h2>
          Findings summary{" "}
          <span className="badge warn">
            {bundle.sample.synthetic ? "Synthetic demo" : "Local analysis"}
          </span>
        </h2>
        <p className="subtitle">
          sample {bundle.sample.sample_id} · build {bundle.sample.genome_build} ·{" "}
          {bundle.sample.quality_summary.autosomal_records.toLocaleString()}{" "}
          analysis-ready autosomal SNPs · processed chr{" "}
          {[...summary.processed_chromosomes].sort((a, b) => Number(a) - Number(b)).join(", ") || "—"}
        </p>
      </div>

      {/* Top-line counts across all findings. */}
      <div className="summary-cards">
        <SummaryCard
          n={summary.observed}
          label="observed findings"
          tone={summary.observed > 0 ? "bad" : "good"}
          onClick={onOpenWatchlist}
        />
        <SummaryCard
          n={summary.ancestry_supported}
          label="ancestry-supported"
          tone={summary.ancestry_supported > 0 ? "warn" : ""}
          onClick={onOpenWatchlist}
        />
        <SummaryCard
          n={summary.not_assayed}
          label="not assayed (gaps)"
          tone={summary.not_assayed > 0 ? "warn" : ""}
          onClick={onOpenWatchlist}
        />
        <SummaryCard
          n={`${cov.assayable}/${cov.total}`}
          label="curated variants assayable"
          onClick={() => onOpenCondition(bundle.conditions[0]?.condition ?? "")}
        />
      </div>

      {/* Teaser of the highest-priority findings, linking into the Watchlist. */}
      <div className="summary-top">
        <div className="summary-top-head">
          <h3>Highest-priority findings</h3>
          <button className="linklike" onClick={onOpenWatchlist}>
            Open full watchlist →
          </button>
        </div>
        {topEntries.length === 0 ? (
          <p className="subtitle">No catalog variants to prioritize.</p>
        ) : (
          <ul className="summary-top-list">
            {topEntries.map((e) => (
              <li key={e.variant.variant_id}>
                <button
                  className="summary-top-item"
                  onClick={() => onOpenCondition(e.variant.condition)}
                >
                  <strong>{e.variant.gene}</strong>
                  <span className="subtitle"> · {e.variant.condition}</span>
                  <span className="summary-top-why">{e.attention_rationale}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="cons-foot subtitle">
          Triage only · prioritized by observed status and local ancestry · not
          diagnostic. Guideline citations and absolute-risk numbers are omitted
          (no sourced, versioned mapping in this prototype).
        </p>
      </div>

      {composition}
    </section>
  );
}

function SummaryCard({
  n,
  label,
  tone,
  onClick,
}: {
  n: number | string;
  label: string;
  tone?: "good" | "warn" | "bad" | "";
  onClick?: () => void;
}) {
  return (
    <button className="summary-card" onClick={onClick}>
      <span className={`summary-card-n ${tone ?? ""}`}>{n}</span>
      <span className="summary-card-label">{label}</span>
    </button>
  );
}
