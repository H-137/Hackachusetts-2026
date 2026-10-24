import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisBundle, SelectedRegion } from "../domain/explorer";
import { AUTOSOME_ORDER, chromLength, formatBp } from "../domain/explorer";
import { regionDisplayName, regionColor } from "../domain/geography";
import { joinAdjacentSegments } from "../domain/segments";
import type { VariantObservation } from "../domain/types";
import { ChromosomeTrack } from "./ChromosomeTrack";
import { PatientRegionInfo } from "./PatientRegionInfo";
import { ErrorBoundary } from "./ErrorBoundary";
const Globe = lazy(() => import("./Globe"));

interface Props {
  bundle: AnalysisBundle;
  chromosome: string;
  region: SelectedRegion | null;
  onChangeChromosome: (chromosome: string) => void;
  onSelectRegion: (region: SelectedRegion) => void;
  onSelectVariant: (variant: VariantObservation) => void;
}

export function PatientChromosomeView({ bundle, chromosome, region, onChangeChromosome, onSelectRegion, onSelectVariant }: Props) {
  const globeHost = useRef<HTMLDivElement>(null);
  const [globeSize, setGlobeSize] = useState(460);
  const [focusedPopulation, setFocusedPopulation] = useState<string | null>(null);
  const segments = useMemo(() => joinAdjacentSegments(bundle.segments.filter((s) => s.chromosome === chromosome)), [bundle.segments, chromosome]);
  const populations = [...new Set(segments.map((s) => s.ancestry_label))];
  const selectedPopulations = region ? [...new Set(segments.filter((s) => s.start_0based < region.end_0based_exclusive && s.end_0based_exclusive > region.start_0based).map((s) => s.ancestry_label))] : populations;
  const highlighted = selectedPopulations;
  const populationLabels = Object.fromEntries(selectedPopulations.map((code) => {
    const copies = region ? [...new Set(segments.filter((s) => s.ancestry_label === code && s.start_0based < region.end_0based_exclusive && s.end_0based_exclusive > region.start_0based).map((s) => s.copy_index))] : [];
    return [code, copies.length ? `${copies.join(" & ")} / ${code}` : code];
  }));
  useEffect(() => { setFocusedPopulation(null); }, [chromosome, region]);
  useEffect(() => {
    const host = globeHost.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setGlobeSize(Math.max(180, Math.min(640, Math.floor(entry.contentRect.width)))); });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="patient-chromosome">
      <section className="patient-chrom-selector" aria-label="Choose a chromosome pair">
        <div className="patient-section-heading"><div><h3>Your chromosome pairs</h3><p>Choose a pair to explore its ancestry. Each pair has two copies; copy numbers do not identify a parent.</p></div>
          <span className="badge">Pair {chromosome} · {formatBp(chromLength(chromosome))}</span></div>
        <div className="patient-chrom-grid">{AUTOSOME_ORDER.map((c) => {
          const available = bundle.segments.some((s) => s.chromosome === c);
          return <button key={c} aria-pressed={c === chromosome} aria-label={`Chromosome ${c}${available ? "" : ", no ancestry data"}`} className={c === chromosome ? "active" : ""} onClick={() => onChangeChromosome(c)}>{c}{!available && <span aria-hidden="true"> —</span>}</button>;
        })}</div>
      </section>
      <div className="patient-chrom-layout">
        <section className="patient-track-card" aria-label="Chromosome segments and key">
          <h3>Chromosome {chromosome}</h3>
          <p className="patient-hint">Tap a colored stretch or a segment below. Matching neighboring segments are joined when their confidence and reference source agree.</p>
          {segments.length ? <ChromosomeTrack bundle={bundle} chromosome={chromosome} viewStart={0} viewEnd={chromLength(chromosome)} selected={region} orientation="vertical" onSelectRegion={onSelectRegion} onSelectVariant={onSelectVariant} /> : <p>No ancestry data for this chromosome. Choose another pair.</p>}
          <div className="patient-track-key"><span><i className="key-hatched" /> Hatched: uncertain estimate</span><span><i className="key-unknown" /> Gray: unassigned / missing</span><span><i style={{background: "#4b9fe1"}} /> Blue label: gene</span><span><i style={{background: "#e5534b"}} /> Red dot: curated variant</span></div>
          <details className="patient-segment-list" open><summary>Segment key · {segments.length} stretches</summary>
            {([1, 2] as const).map((copy) => <div key={copy}><h4>Copy {copy}</h4>{segments.filter((s) => s.copy_index === copy).map((s) => <button key={`${copy}-${s.start_0based}`} className={region && s.start_0based < region.end_0based_exclusive && s.end_0based_exclusive > region.start_0based ? "selected" : ""} onClick={() => onSelectRegion({chromosome, start_0based:s.start_0based, end_0based_exclusive:s.end_0based_exclusive})}>
              <span className="seg-dot" style={{background:regionColor(s.ancestry_label)}} /><span><strong>{regionDisplayName(s.ancestry_label)}</strong><small>{(s.start_0based + 1).toLocaleString()}–{s.end_0based_exclusive.toLocaleString()} · {s.assignment_status === "assigned" ? "assigned estimate" : s.assignment_status === "uncertain" ? "uncertain estimate" : "unassigned"}</small></span></button>)}</div>)}
          </details>
        </section>
          <section className="patient-globe-card" aria-label="Ancestry reference map">
            <h3>{region ? "Reference groups for your selected stretch" : "Reference groups on this chromosome"}</h3>
            <p className="patient-hint">Drag to look around. Use the controls to zoom or reset. Select a group below to center it on the globe.</p>
            <div ref={globeHost} className="patient-globe-host"><ErrorBoundary><Suspense fallback={<p role="status">Loading your reference map…</p>}><Globe highlighted={highlighted} size={globeSize} populationLabels={populationLabels} focusedPopulation={focusedPopulation} /></Suspense></ErrorBoundary></div>
            <div className="patient-population-key" aria-label="Reference population color key">{selectedPopulations.map((code) => <button key={code} aria-pressed={focusedPopulation === code} onClick={() => setFocusedPopulation(focusedPopulation === code ? null : code)}><span className="seg-dot" style={{background:regionColor(code)}} />{regionDisplayName(code)}</button>)}</div>
            <p className="patient-hint">Locations represent comparison groups used by the model, not where a person or a DNA variant came from. Ancestry estimates do not establish health risk.</p>
          </section>
          <PatientRegionInfo bundle={bundle} region={region} onFocusPopulation={setFocusedPopulation} />
      </div>
    </div>
  );
}
