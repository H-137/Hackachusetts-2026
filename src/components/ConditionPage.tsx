import { useMemo } from "react";
import type { Role } from "../App";
import type { AnalysisBundle } from "../domain/explorer";
import { toDisplayPosition } from "../domain/explorer";
import {
  buildWatchlist,
  groupByCondition,
  observedFromBundle,
  type ConditionGroup,
  type WatchlistEntry,
} from "../domain/watchlist";
import {
  WATCHLIST_CATALOG,
  processedChromosomes,
} from "../domain/watchlistCatalog";
import { regionDisplayName } from "../domain/geography";
import { conditionResources, makeConditionInfo } from "../domain/conditionInfo";

interface Props {
  bundle: AnalysisBundle;
  role: Role;
  condition: string;
  /** Jump to this condition's entry in the Watchlist tab. */
  onOpenWatchlist: (condition: string) => void;
}

/**
 * Conditions page — the condition-level companion to the Watchlist. Both read
 * the same watchlist catalog: the Watchlist is per-variant triage; Conditions
 * groups those same variants by condition and explains each one (coverage,
 * carrier/observed status, founder-frequency context), cross-linked back to the
 * Watchlist. Role-aware: clinicians get detail, patients get the plain-language
 * explainer only.
 */
export function ConditionPage({
  bundle,
  role,
  condition,
  onOpenWatchlist,
}: Props) {
  const groups = useMemo(() => {
    const processed = processedChromosomes(bundle.segments);
    const entries = buildWatchlist(
      WATCHLIST_CATALOG,
      bundle.segments,
      processed,
      observedFromBundle(bundle.variants),
    );
    return groupByCondition(entries);
  }, [bundle.segments, bundle.variants]);

  const group =
    groups.find((g) => g.condition === condition) ?? groups[0] ?? null;

  if (!group) return <p className="subtitle">No conditions available.</p>;

  // ---------------- Patient view (informational) ----------------
  if (role === "patient") {
    // Generated from the condition's catalog variants — works for any condition.
    const info = makeConditionInfo(
      group.condition,
      group.entries.map((e) => e.variant),
    );
    return (
      <section className="condition-page patient" aria-label={`Condition: ${group.condition}`}>
        <h3>{group.condition}</h3>
        <p className="condition-summary">{info.summary}</p>
        <h4>How it's inherited</h4>
        <p>{info.inheritance_plain}</p>
        <h4>About this condition</h4>
        <p>{info.about}</p>

        {info.resources.length > 0 && (
          <>
            <ul className="resource-list">
              {info.resources.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="subtitle">
              General references from public health and genetics databases (NIH /
              NCBI). They describe the condition in general, not you.
            </p>
          </>
        )}

        <div className="disclaimer" role="note">
          This is general information, not a statement about you and not a
          diagnosis. A consumer DNA test checks only a few specific spots, so it
          cannot confirm or rule this out. Your healthcare provider or a genetic
          counselor is the right person to tell you whether any of this applies to
          you.
        </div>
      </section>
    );
  }

  // ---------------- Clinician view (default) ----------------
  return (
    <section className="condition-page" aria-label={`Condition: ${group.condition}`}>
      <div className="condition-head">
        <div>
          <h3>{group.condition}</h3>
          <p className="subtitle">
            {group.gene} · {group.inheritance}
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => onOpenWatchlist(group.condition)}
        >
          View in watchlist →
        </button>
      </div>

      <div className="condition-stats">
        <span className="badge bad">{group.observed} observed</span>
        <span className="badge">
          {group.assayable}/{group.total} variants assayable
        </span>
        <span className="badge warn">
          {group.total - group.assayable} not assayed
        </span>
      </div>

      <h4>Catalog variants for this condition</h4>
      <div className="condition-variants">
        {group.entries.map((e) => (
          <ConditionVariantRow
            key={e.variant.variant_id}
            entry={e}
            onOpenWatchlist={() => onOpenWatchlist(group.condition)}
          />
        ))}
      </div>

      <div className="disclaimer" role="note">
        A not-assayed variant is not a negative result. This array types only
        selected positions; indels and most pathogenic variants are not covered.
        Confirmatory clinical testing is required to establish presence or
        absence.
      </div>

      {(() => {
        const resources = conditionResources(
          group.gene,
          group.entries.map((e) => e.variant),
        );
        if (resources.length === 0) return null;
        return (
          <>
            <h4>Further reading (credible sources)</h4>
            <ul className="resource-list">
              {resources.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </>
        );
      })()}
    </section>
  );
}

function ConditionVariantRow({
  entry,
  onOpenWatchlist,
}: {
  entry: WatchlistEntry;
  onOpenWatchlist: () => void;
}) {
  const v = entry.variant;
  const observed = entry.measurement_status === "observed";
  const assoc = v.associated_populations.map(regionDisplayName).join(", ");
  return (
    <div className="condition-variant">
      <div className="condition-variant-head">
        <strong>{v.rsid ?? v.variant_id}</strong>
        <span className="subtitle">
          {v.hgvs ? ` · ${v.hgvs}` : ""} · chr{v.chromosome}:
          {toDisplayPosition(v.position_1based - 1).toLocaleString()}
        </span>
        <span className={`badge ${observed ? "bad" : "warn"}`}>
          {entry.measurement_status}
        </span>
      </div>
      <div className="condition-variant-body">
        <span className="badge warn">{v.clinical_classification}</span>{" "}
        <span className="subtitle">{v.review_status}</span>
        {assoc && (
          <div className="subtitle">
            Founder-variant frequency elevated in: {assoc}
            {v.founder_variant ? " (founder variant)" : ""} — population context,
            not a personal finding.
          </div>
        )}
        <div className="condition-variant-why">{entry.attention_rationale}</div>
      </div>
      <button className="linklike" onClick={onOpenWatchlist}>
        Details in watchlist
      </button>
    </div>
  );
}

export function useConditionGroups(bundle: AnalysisBundle): ConditionGroup[] {
  return useMemo(() => {
    const processed = processedChromosomes(bundle.segments);
    const entries = buildWatchlist(
      WATCHLIST_CATALOG,
      bundle.segments,
      processed,
      observedFromBundle(bundle.variants),
    );
    return groupByCondition(entries);
  }, [bundle.segments, bundle.variants]);
}
