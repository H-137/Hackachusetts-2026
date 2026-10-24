import { joinAdjacentSegments } from "../domain/segments";
import { useMemo } from "react";
import type { AnalysisBundle, SelectedRegion } from "../domain/explorer";
import { formatBp, segmentsOverlapping, toDisplayPosition } from "../domain/explorer";
import { buildWatchlist, observedFromBundle, panelPopulationsFromSegments } from "../domain/watchlist";
import { WATCHLIST_CATALOG, processedChromosomes } from "../domain/watchlistCatalog";
import { regionFor } from "../domain/geography";

interface Props {
  bundle: AnalysisBundle;
  region: SelectedRegion | null;
  onFocusPopulation?: (population: string) => void;
}

/**
 * Simplified, patient-facing info for the selected chromosome region. Plain
 * language, no variant tables, no provenance — just where this stretch of DNA
 * most resembles (both copies) and a gentle "talk to your provider" note. Shown
 * beside the chromosome in its own panel.
 */
export function PatientRegionInfo({ bundle, region, onFocusPopulation }: Props) {
  const gene = useMemo(
    () =>
      region
        ? region.gene
          ? bundle.genes.find((g) => g.gene === region.gene)
          : bundle.genes.find(
              (g) =>
                g.chromosome === region.chromosome &&
                g.start_0based < region.end_0based_exclusive &&
                g.end_0based_exclusive > region.start_0based,
            )
        : undefined,
    [bundle.genes, region],
  );

  const byCopy = useMemo(() => {
    if (!region) return { 1: [], 2: [] } as Record<1 | 2, ReturnType<typeof segmentsOverlapping>>;
    const segs = segmentsOverlapping(
      joinAdjacentSegments(bundle.segments),
      region.chromosome,
      region.start_0based,
      region.end_0based_exclusive,
    );
    return {
      1: segs.filter((s) => s.copy_index === 1),
      2: segs.filter((s) => s.copy_index === 2),
    } as Record<1 | 2, typeof segs>;
  }, [bundle.segments, region]);

  const locusEntries = useMemo(() => {
    if (!region) return [];
    const catalog = WATCHLIST_CATALOG.filter((v) => v.chromosome === region.chromosome &&
      v.position_1based - 1 >= region.start_0based && v.position_1based - 1 < region.end_0based_exclusive);
    return buildWatchlist(catalog, bundle.segments, processedChromosomes(bundle.segments), observedFromBundle(bundle.variants), panelPopulationsFromSegments(bundle.segments));
  }, [bundle.segments, bundle.variants, region]);
  const ancestryMatches = locusEntries.filter((e) => e.priority_category === "ancestry_supported");
  const observed = locusEntries.filter((e) => e.priority_category === "observed_finding");

  if (!region) {
    return (
      <aside className="patient-region" aria-label="Selected region">
        <h4>What does a segment mean?</h4>
        <p className="subtitle">
          Choose a colored stretch or a row in the segment key to see the reference groups and uncertainty for both chromosome copies.
        </p>
        <p>Colors show which comparison group a stretch most resembles. Hatched areas are less certain; gray areas have no ancestry assignment.</p>
        <p className="patient-hint">These are model estimates, not a health result or a precise location of origin.</p>
      </aside>
    );
  }

  return (
    <aside className="patient-region" aria-label="Selected region">
      <h4>{region.gene ? `${region.gene} gene region` : `Selected stretch · chromosome ${region.chromosome}`}</h4>
      <p className="subtitle">
        chr{region.chromosome}:
        {toDisplayPosition(region.start_0based).toLocaleString()}–
        {region.end_0based_exclusive.toLocaleString()} (
        {formatBp(region.end_0based_exclusive - region.start_0based)})
      </p>

      {gene && <section className="patient-locus-reason" aria-label="Why this locus is highlighted">
        <h4>Why {gene.gene} is highlighted</h4>
        {observed.length > 0 ? <p>A clinically relevant allele was observed at this locus. This is a reason for review regardless of ancestry; it requires clinical confirmation.</p>
          : ancestryMatches.length > 0 ? <>
            <span className="badge warn">Local ancestry supports attention</span>
            <p>The ancestry inferred <strong>at this locus</strong> matches reference populations where a cataloged {gene.gene} variant is documented more frequently. That local match is why this locus receives additional attention.</p>
            <p className="patient-hint">This concerns a potentially more frequent variant in a comparison population. It does not establish that you carry it or quantify your likelihood of disease.</p>
          </> : <p>This marks a cataloged gene location. The loaded run does not currently show a specific local-ancestry match that raises its priority. The highlight alone does not indicate increased likelihood.</p>}
        {ancestryMatches.map((entry) => <div className="patient-locus-match" key={entry.variant.variant_id}>
          <strong>{entry.variant.rsid ?? entry.variant.variant_id} · {entry.variant.condition}</strong>
          {[entry.copy1, entry.copy2].filter((copy) => copy.available && copy.ancestry_label && entry.variant.associated_populations.includes(copy.ancestry_label)).map((copy) => <p key={copy.copy_index}>Copy {copy.copy_index}: {regionFor(copy.ancestry_label as string).name} matches the catalog association{copy.assignment_status !== "assigned" ? " (ancestry estimate is uncertain)" : ""}.</p>)}
          <p className="patient-hint">{entry.measurement_status === "observed" ? "Genotype measured; ancestry is a separate context signal." : "Variant presence is not established by this ancestry match."}</p>
          <details><summary>Population evidence behind the match</summary>{entry.variant.frequency_evidence.map((f, i) => <p key={i}>{f.enrichment_note} {f.allele_frequency !== null ? `Reported allele frequency in ${f.population}: ${(f.allele_frequency * 100).toLocaleString(undefined, {maximumSignificantDigits: 3})}%. ` : ""}<a href={f.source_url} target="_blank" rel="noopener noreferrer">Source</a></p>)}</details>
        </div>)}
      </section>}

      {gene && !region.gene && <p className="patient-hint">This stretch includes the {gene.gene} gene marker. The selected ancestry segment is larger than the gene itself.</p>}
      <p className="patient-hint">{bundle.sample.synthetic ? "Synthetic demonstration: these assignments illustrate the model output." : "These assignments come from the ancestry segments in your loaded analysis."} Each row below links a chromosome copy to its matching map label.</p>

      {([1, 2] as const).map((copy) => {
        const segs = byCopy[copy];
        return (
          <div key={copy} className="patient-copy">
            <span className="patient-copy-label">Copy {copy}</span>
            {segs.length === 0 ? (
              <span className="subtitle">not confidently assigned here</span>
            ) : (
              segs.map((s, i) => {
                const reg = regionFor(s.ancestry_label);
                return (
                  <div key={i} className="patient-copy-evidence">
                    <button className="patient-anc" disabled={!onFocusPopulation || reg.code === "UNKNOWN"} onClick={() => onFocusPopulation?.(s.ancestry_label)}>
                      <span className="seg-dot" style={{ background: reg.color }} />
                      {reg.name} · map label {copy} / {s.ancestry_label} ↗
                    </button>
                    <span className="patient-hint">{s.assignment_status === "assigned" ? "Assigned by the model" : s.assignment_status === "uncertain" ? "Uncertain model assignment" : "No ancestry assignment"} · overlapping segment {(s.start_0based + 1).toLocaleString()}–{s.end_0based_exclusive.toLocaleString()}</span>
                  </div>
                );
              })
            )}
          </div>
        );
      })}

      <details className="patient-support-details"><summary>What supports these labels?</summary>
        <p>The app finds the ancestry segment overlapping this selected position on each copy. The names, assignment status, and segment boundaries above come from that run; the globe places the same reference-group codes on a map.</p>
        <p>“Assigned” is the model's status, not independent confirmation of ancestry. An uncertain label remains tentative. A map marker does not add evidence for a gene variant or any health condition.</p>
      </details>
      <div className="disclaimer" role="note">
        This is a background estimate, not a health result. It does not tell you
        whether you have or will get any condition. If you're curious what it
        means for you, your healthcare provider or a genetic counselor can help.
      </div>
    </aside>
  );
}
