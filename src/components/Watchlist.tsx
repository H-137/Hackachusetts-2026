import { useEffect, useMemo, useState } from "react";
import type { Role } from "../App";
import type { AnalysisBundle } from "../domain/explorer";
import {
  buildWatchlist,
  observedFromBundle,
  panelPopulationsFromSegments,
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
  role: Role;
  /** When set, pre-select the first variant for this condition. */
  focusCondition?: string | null;
  /** Jump to the Conditions tab for a condition. */
  onOpenCondition?: (condition: string) => void;
}

const CATEGORY_LABEL: Record<PriorityCategory, string> = {
  observed_finding: "Allele observed",
  ancestry_supported: "Locus ancestry match",
  review_status_strong: "Expert-reviewed evidence",
  context_weak: "Catalog / weaker ancestry context",
  ancestry_unresolved: "Ancestry unresolved (no reference group)",
  ancestry_not_available: "Ancestry not available here",
};

const CATEGORY_BADGE: Record<PriorityCategory, string> = {
  observed_finding: "bad",
  ancestry_supported: "warn",
  review_status_strong: "warn",
  context_weak: "",
  ancestry_unresolved: "",
  ancestry_not_available: "",
};

/**
 * SNPshot ancestry-informed pathogenic-variant watchlist. Each entry is
 * prioritized by local ancestry at the variant's own locus (both copies), with
 * transparent categories and explanations rather than invented risk numbers.
 */
export function Watchlist({
  bundle,
  role,
  focusCondition,
  onOpenCondition,
}: Props) {
  const processed = useMemo(
    () => processedChromosomes(bundle.segments),
    [bundle.segments],
  );
  const observed = useMemo(
    () => observedFromBundle(bundle.variants),
    [bundle.variants],
  );
  const panelPops = useMemo(
    () => panelPopulationsFromSegments(bundle.segments),
    [bundle.segments],
  );
  const entries = useMemo(
    () =>
      buildWatchlist(
        WATCHLIST_CATALOG,
        bundle.segments,
        processed,
        observed,
        panelPops,
      ),
    [bundle.segments, processed, observed, panelPops],
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

  if (role === "patient") return <PatientWatchlist entries={entries} />;

  const active = entries.find((e) => e.variant.variant_id === selected) ?? null;

  return (
    <section aria-label="Ancestry-informed variant watchlist">
      <h2>Ancestry-informed watchlist</h2>
      <p className="subtitle">
        Curated variants, ranked by the evidence in this sample. An entry can be
        listed for an observed allele, a local ancestry match, or catalog evidence alone.
        Being listed does not mean the variant is present.
      </p>
      <div className="watchlist-summary" aria-label="Watchlist evidence summary">
        <span><strong>{entries.filter((e) => e.priority_category === "observed_finding").length}</strong> allele observed</span>
        <span><strong>{entries.filter((e) => e.priority_category === "ancestry_supported").length}</strong> prioritized by locus ancestry</span>
        <span><strong>{entries.filter((e) => !["observed_finding", "ancestry_supported"].includes(e.priority_category)).length}</strong> other catalog entries</span>
      </div>
      <details className="watchlist-scope">
        <summary>Data coverage and ranking</summary>
        <p>Processed chromosomes: {[...processed].sort((a, b) => Number(a) - Number(b)).join(", ") || "none"}.
          {" "}Observed findings rank first, followed by locus ancestry matches, expert-reviewed
          evidence, and entries with weaker or unavailable ancestry context. This is an evidence ranking, not a disease-risk score.</p>
      </details>

      <div className="watchlist-layout">
        <ul className="watchlist-list" aria-label="Catalog variants ranked by evidence">
          {entries.map((e) => (
            <li key={e.variant.variant_id}>
              <button
                className={`watchlist-item${
                  selected === e.variant.variant_id ? " active" : ""
                }`}
                aria-pressed={selected === e.variant.variant_id}
                aria-controls="watchlist-selected-detail"
                onClick={() => setSelected(e.variant.variant_id)}
              >
                <span className={`badge ${CATEGORY_BADGE[e.priority_category]}`}>
                  {CATEGORY_LABEL[e.priority_category]}
                </span>
                <strong>{e.variant.gene} · {e.variant.rsid ?? e.variant.variant_id}</strong>
                <span>{e.variant.condition}</span>
                <span className="watchlist-item-note">{measurementLabel(e.measurement_status)}</span>
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

const MEASUREMENT_LABELS: Record<string, string> = {
  observed: "Genotype measured", imputed: "Genotype imputed",
  unassayed: "Not assayed", not_assayed: "Not assayed",
  indel_uninterpretable: "Indel not interpretable", no_call: "No genotype call",
  excluded: "Excluded from analysis",
};

function measurementLabel(status: string): string {
  return MEASUREMENT_LABELS[status] ?? status.replaceAll("_", " ");
}

function WatchlistDetail({ entry, onOpenCondition }: {
  entry: WatchlistEntry;
  onOpenCondition?: (condition: string) => void;
}) {
  const v = entry.variant;
  const observed = entry.priority_category === "observed_finding";
  const ancestry = entry.priority_category === "ancestry_supported";
  const matchingCopies = [entry.copy1, entry.copy2].filter(
    (copy) => copy.available && copy.ancestry_label && v.associated_populations.includes(copy.ancestry_label),
  );
  return (
    <section className="watchlist-detail" id="watchlist-selected-detail" aria-label={`Evidence for ${v.gene} ${v.rsid ?? v.variant_id}`}>
      <div className="watchlist-detail-head">
        <div><h3>{v.gene} · {v.condition}</h3>
          <p className="watchlist-variant-id">{v.hgvs ?? v.variant_id}{v.rsid ? ` · ${v.rsid}` : ""}</p>
        </div>
        {onOpenCondition && <button className="secondary" onClick={() => onOpenCondition(v.condition)}>About this condition →</button>}
      </div>
      <p className="watchlist-item-note">{v.build} · chr{v.chromosome}:{v.position_1based.toLocaleString()} (1-based) · {v.inheritance}</p>

      <div className="watchlist-reason">
        <span className={`badge ${CATEGORY_BADGE[entry.priority_category]}`}>{CATEGORY_LABEL[entry.priority_category]}</span>
        <h4>Why this variant is on the watchlist</h4>
        <p>{observed
          ? "The sample contains the catalog's clinically relevant allele. This directly observed finding takes priority regardless of local ancestry."
          : ancestry
            ? `Local ancestry at this variant's position matches a documented associated population on ${matchingCopies.map((c) => `copy ${c.copy_index} (${regionDisplayName(c.ancestry_label as string)})`).join(" and ")}. That match raises its priority; it does not show that the allele is present.`
            : entry.attention_rationale}</p>
        <details><summary>Exact ranking reasons</summary><ul className="tight">{entry.priority_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></details>
      </div>

      <h4>1. What this sample measured</h4>
      <div className="watchlist-measurement">
        <span className="badge">{measurementLabel(entry.measurement_status)}</span>
        {["observed", "imputed"].includes(entry.measurement_status) && entry.observed_genotype && entry.observed_genotype !== "." && entry.observed_genotype !== "./." && <span>Genotype: <strong>{entry.observed_genotype}</strong></span>}
        {v.clinical_allele && <span>Catalog clinical allele (+ strand): <strong>{v.clinical_allele}</strong></span>}
      </div>
      <p className="watchlist-item-note">{observed
        ? "Confirm with clinical testing. The observed allele is not assigned to an ancestry copy because phase is not established."
        : ["unassayed", "not_assayed", "indel_uninterpretable", "no_call", "excluded"].includes(entry.measurement_status)
          ? "This sample does not establish whether this variant is present. The entry describes an evidence or coverage gap, not a positive finding."
          : "A measured or imputed genotype alone is not an observed clinical finding. The ranking reason above explains why this entry remains visible."}</p>

      <h4>2. Local ancestry used for this ranking</h4>
      <p className="watchlist-item-note">Ancestry segments overlapping this exact variant position, rather than whole-genome ancestry.</p>
      <div className="copy-grid"><CopyBlock label="Chromosome copy 1" copy={entry.copy1} /><CopyBlock label="Chromosome copy 2" copy={entry.copy2} /></div>
      <p>{entry.compatibility.detail}</p>
      {matchingCopies.some((c) => c.assignment_status !== "assigned") && <p className="badge warn">A matching segment is uncertain. Treat the ancestry match as tentative.</p>}
      <p className="watchlist-item-note">Associated reference populations: {v.associated_populations.map((p) => `${regionDisplayName(p)} (${p})`).join(", ") || "No specific association documented"}{v.founder_variant ? " · documented founder variant" : ""}.</p>

      <h4>3. Clinical evidence for this variant</h4>
      <p><span className={`badge ${v.evidence_class === "risk_allele" ? "" : "warn"}`}>{v.clinical_classification}</span> · {v.review_status}</p>
      {v.evidence_class === "risk_allele" && <p className="watchlist-item-note">This is a susceptibility / risk allele, rather than a Mendelian pathogenic variant.</p>}
      <ul className="tight">{v.citations.map((url, i) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">Clinical evidence source {i + 1}</a></li>)}</ul>

      <details className="methods">
        <summary>Population frequency evidence ({v.frequency_evidence.length} sources)</summary>
        {v.frequency_evidence.length ? <ul className="watchlist-frequency">{v.frequency_evidence.map((f, i) => <li key={i}>
          <strong>{f.population}</strong>
          <ul className="tight">
            <li>Allele frequency: {f.allele_frequency === null ? "not quantified" : `${(f.allele_frequency * 100).toLocaleString(undefined, { maximumSignificantDigits: 3 })}%`}</li>
            <li>Carrier frequency: {f.carrier_frequency === null ? "not quantified" : `${(f.carrier_frequency * 100).toLocaleString(undefined, { maximumSignificantDigits: 3 })}%`}</li>
            {f.disease_prevalence && <li>Disease prevalence: {f.disease_prevalence}</li>}
            {f.sample_size_or_denominator && <li>Sample / denominator: {f.sample_size_or_denominator}</li>}
          </ul>
          {f.enrichment_note && <p>{f.enrichment_note}</p>}
          <a href={f.source_url} target="_blank" rel="noopener noreferrer">Population evidence source {i + 1}</a>
        </li>)}</ul> : <p>No quantitative population frequency evidence is provided.</p>}
        <p className="watchlist-item-note">Allele frequency, carrier frequency, and disease prevalence describe different quantities. None is this patient's disease probability.</p>
      </details>
      <details className="methods"><summary>Interpretation limits</summary><ul>{entry.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></details>
    </section>
  );
}

/**
 * Patient view of the watchlist: a gentle, non-alarming list of topics worth
 * raising with your doctor. It assumes the clinician leads on any next step —
 * it never tells the patient to act, diagnose, or interpret. No raw variants,
 * no ancestry jargon, no priority categories; one plain-language topic per
 * condition.
 */
function PatientWatchlist({ entries }: { entries: WatchlistEntry[] }) {
  // One topic per condition; keep the highest-priority entry's framing.
  const byCondition = new Map<string, WatchlistEntry>();
  for (const e of entries) {
    const existing = byCondition.get(e.variant.condition);
    if (!existing) byCondition.set(e.variant.condition, e);
  }
  const topics = Array.from(byCondition.values());

  return (
    <section aria-label="Topics to discuss with your doctor" className="patient-watchlist">
      <h2>Topics to discuss with your doctor</h2>
      <p className="subtitle">
        Based on this consumer DNA test, here are things that may be worth
        mentioning at your next appointment. This is background for a
        conversation — not a diagnosis, and not a to-do list. Your healthcare
        provider decides whether anything here matters for you and what, if
        anything, to do next.
      </p>

      <ul className="topic-list">
        {topics.map((e) => {
          const observed = e.priority_category === "observed_finding";
          return (
            <li key={e.variant.condition} className="topic-card">
              <div className="topic-head">
                <strong>{e.variant.condition}</strong>
                {observed && (
                  <span className="badge warn">worth asking about</span>
                )}
              </div>
              <p className="topic-text">
                {observed
                  ? "This test looked at a spot related to this condition and found something your provider may want to look into further with proper testing."
                  : "This condition is one where ancestry background can be relevant. Your provider can tell you whether any screening or testing makes sense for you."}
              </p>
              <p className="topic-ask">
                You might ask: “Is there anything about {e.variant.condition.toLowerCase()} I should think about, given my background or family history?”
              </p>
            </li>
          );
        })}
      </ul>

      <div className="disclaimer" role="note">
        A consumer DNA test checks only a few specific spots. Not finding
        something here does not rule it out. Please rely on your healthcare
        provider or a genetic counselor for any decisions — they can arrange
        confirmatory testing if it is appropriate for you.
      </div>
    </section>
  );
}
