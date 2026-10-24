import { useEffect, useMemo, useState } from "react";
import type { AnalysisBundle } from "../domain/explorer";
import {
  buildWatchlist,
  observedFromBundle,
  type PriorityCategory,
  type WatchlistEntry,
} from "../domain/watchlist";
import {
  WATCHLIST_CATALOG,
  processedChromosomes,
} from "../domain/watchlistCatalog";
import { regionDisplayName, regionColor } from "../domain/geography";
import { formatBp, toDisplayPosition } from "../domain/explorer";

interface Props {
  bundle: AnalysisBundle;
  /** When set, pre-select the first variant for this condition. */
  focusCondition?: string | null;
  /** Jump to the Conditions tab for a condition. */
  onOpenCondition?: (condition: string) => void;
}

const CATEGORY_LABEL: Record<PriorityCategory, string> = {
  observed_finding: "Observed finding",
  ancestry_supported: "Ancestry supports attention",
  review_status_strong: "Strong clinical evidence",
  context_weak: "Weak local-ancestry relevance",
  ancestry_not_available: "Ancestry not available here",
};

const CATEGORY_BADGE: Record<PriorityCategory, string> = {
  observed_finding: "bad",
  ancestry_supported: "warn",
  review_status_strong: "warn",
  context_weak: "",
  ancestry_not_available: "",
};

/**
 * SNPshot ancestry-informed pathogenic-variant watchlist. Each entry is
 * prioritized by local ancestry at the variant's own locus (both copies), with
 * transparent categories and explanations rather than invented risk numbers.
 */
export function Watchlist({ bundle, focusCondition, onOpenCondition }: Props) {
  const processed = useMemo(
    () => processedChromosomes(bundle.segments),
    [bundle.segments],
  );
  const observed = useMemo(
    () => observedFromBundle(bundle.variants),
    [bundle.variants],
  );
  const entries = useMemo(
    () => buildWatchlist(WATCHLIST_CATALOG, bundle.segments, processed, observed),
    [bundle.segments, processed, observed],
  );

  const focusId = focusCondition
    ? entries.find((e) => e.variant.condition === focusCondition)?.variant.variant_id
    : undefined;
  const [selected, setSelected] = useState<string | null>(
    focusId ?? entries[0]?.variant.variant_id ?? null,
  );

  // When deep-linked from Conditions, jump the selection to that condition.
  useEffect(() => {
    if (focusId) setSelected(focusId);
  }, [focusId]);

  const active = entries.find((e) => e.variant.variant_id === selected) ?? null;

  return (
    <section aria-label="Ancestry-informed variant watchlist">
      <h2>Ancestry-informed watchlist</h2>
      <p className="subtitle">
        Clinically important variants prioritized using local ancestry inferred
        at each variant's own location, on both chromosome copies. Local ancestry
        can suggest where to pay more attention; it cannot establish that a
        variant is present or absent. Processed chromosomes:{" "}
        {[...processed].sort().join(", ") || "none"}.
      </p>

      <div className="watchlist-layout">
        <ul className="watchlist-list" role="listbox" aria-label="Variants">
          {entries.map((e) => (
            <li key={e.variant.variant_id}>
              <button
                className={`watchlist-item${
                  selected === e.variant.variant_id ? " active" : ""
                }`}
                role="option"
                aria-selected={selected === e.variant.variant_id}
                onClick={() => setSelected(e.variant.variant_id)}
              >
                <span className={`badge ${CATEGORY_BADGE[e.priority_category]}`}>
                  {CATEGORY_LABEL[e.priority_category]}
                </span>
                <strong>{e.variant.gene}</strong> · {e.variant.condition}
                <span className="subtitle">
                  {" "}
                  chr{e.variant.chromosome}:{toDisplayPosition(e.variant.position_1based - 1)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {active && (
          <WatchlistDetail entry={active} onOpenCondition={onOpenCondition} />
        )}
      </div>
    </section>
  );
}

function CopyBlock({
  label,
  copy,
}: {
  label: string;
  copy: WatchlistEntry["copy1"];
}) {
  if (!copy.available) {
    return (
      <div className="copy-block">
        <h4>{label}</h4>
        <p className="subtitle">{copy.reason}</p>
      </div>
    );
  }
  const anc = copy.ancestry_label as string;
  return (
    <div className="copy-block">
      <h4>{label}</h4>
      <p>
        <span className="seg-dot" style={{ background: regionColor(anc) }} />
        {regionDisplayName(anc)}{" "}
        <span className="badge">{copy.assignment_status}</span>
      </p>
      {copy.segment_start_0based !== null &&
        copy.segment_end_0based_exclusive !== null && (
          <p className="subtitle">
            Segment {toDisplayPosition(copy.segment_start_0based).toLocaleString()}–
            {copy.segment_end_0based_exclusive.toLocaleString()} (
            {formatBp(copy.segment_end_0based_exclusive - copy.segment_start_0based)})
          </p>
        )}
    </div>
  );
}

function WatchlistDetail({
  entry,
  onOpenCondition,
}: {
  entry: WatchlistEntry;
  onOpenCondition?: (condition: string) => void;
}) {
  const v = entry.variant;
  return (
    <div className="watchlist-detail">
      <div className="watchlist-detail-head">
        <h3>
          {v.gene} — {v.condition}
        </h3>
        {onOpenCondition && (
          <button
            className="secondary"
            onClick={() => onOpenCondition(v.condition)}
          >
            About this condition →
          </button>
        )}
      </div>
      <p className="subtitle">
        {v.hgvs ?? v.variant_id} · {v.build} chr{v.chromosome}:
        {toDisplayPosition(v.position_1based - 1).toLocaleString()} ·{" "}
        {v.inheritance}
      </p>

      <h4>Clinical evidence</h4>
      <p>
        <span className="badge warn">{v.clinical_classification}</span>{" "}
        {v.review_status}
      </p>
      <ul className="tight">
        {v.citations.map((c) => (
          <li key={c}>
            <a href={c} target="_blank" rel="noreferrer">
              {c}
            </a>
          </li>
        ))}
      </ul>

      <h4>Documented population association</h4>
      {v.associated_populations.length > 0 ? (
        <p>
          Associated populations: {v.associated_populations.join(", ")}
          {v.founder_variant ? " (founder variant)" : ""}
        </p>
      ) : (
        <p className="subtitle">No specific founder/population association documented.</p>
      )}
      <ul className="tight">
        {v.frequency_evidence.map((f, i) => (
          <li key={i}>
            {f.population}:{" "}
            {f.carrier_frequency !== null
              ? `carrier freq ~${(f.carrier_frequency * 100).toFixed(1)}%`
              : f.disease_prevalence ?? "frequency not quantified"}
            {f.enrichment_note ? ` — ${f.enrichment_note}` : ""}
          </li>
        ))}
      </ul>
      <p className="subtitle">
        Allele frequency, carrier frequency, and disease prevalence are distinct;
        population frequency is not disease effect, penetrance, or personal risk.
      </p>

      <h4>Local ancestry at this locus</h4>
      <div className="copy-grid">
        <CopyBlock label="Chromosome copy 1" copy={entry.copy1} />
        <CopyBlock label="Chromosome copy 2" copy={entry.copy2} />
      </div>
      <p className="subtitle">{entry.compatibility.detail}</p>

      <h4>Measurement</h4>
      <p>
        Status: <span className="badge">{entry.measurement_status}</span>
        {entry.observed_genotype ? ` · observed genotype ${entry.observed_genotype}` : ""}
      </p>
      {entry.measurement_status === "unassayed" ||
      entry.measurement_status === "indel_uninterpretable" ? (
        <p className="subtitle">
          Testing gap: this variant was not interpretable from the consumer array;
          confirmatory testing would be required to assess it.
        </p>
      ) : null}

      <h4>Why this entry</h4>
      <p>{entry.attention_rationale}</p>
      <ul className="tight">
        {entry.priority_reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      <details className="methods">
        <summary>Interpretation limits</summary>
        <ul>
          {entry.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
