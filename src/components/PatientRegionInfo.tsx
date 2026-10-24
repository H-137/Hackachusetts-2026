import { useMemo } from "react";
import type { AnalysisBundle, SelectedRegion } from "../domain/explorer";
import { formatBp, segmentsOverlapping, toDisplayPosition } from "../domain/explorer";
import { regionFor } from "../domain/geography";

interface Props {
  bundle: AnalysisBundle;
  region: SelectedRegion | null;
}

/**
 * Simplified, patient-facing info for the selected chromosome region. Plain
 * language, no variant tables, no provenance — just where this stretch of DNA
 * most resembles (both copies) and a gentle "talk to your provider" note. Shown
 * beside the chromosome in its own panel.
 */
export function PatientRegionInfo({ bundle, region }: Props) {
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
      bundle.segments,
      region.chromosome,
      region.start_0based,
      region.end_0based_exclusive,
    );
    return {
      1: segs.filter((s) => s.copy_index === 1),
      2: segs.filter((s) => s.copy_index === 2),
    } as Record<1 | 2, typeof segs>;
  }, [bundle.segments, region]);

  if (!region) {
    return (
      <aside className="patient-region" aria-label="Selected region">
        <h4>Selected region</h4>
        <p className="subtitle">
          Tap a colored block on the chromosome to see what that stretch of your
          DNA most resembles.
        </p>
      </aside>
    );
  }

  return (
    <aside className="patient-region" aria-label="Selected region">
      <h4>{gene ? gene.gene : `chr${region.chromosome} region`}</h4>
      <p className="subtitle">
        chr{region.chromosome}:
        {toDisplayPosition(region.start_0based).toLocaleString()}–
        {region.end_0based_exclusive.toLocaleString()} (
        {formatBp(region.end_0based_exclusive - region.start_0based)})
      </p>

      <p>
        For this stretch of DNA, here's the reference background it most
        resembles on each of your two chromosome copies:
      </p>

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
                  <span key={i} className="patient-anc">
                    <span className="seg-dot" style={{ background: reg.color }} />
                    {reg.name}
                    {s.assignment_status !== "assigned" ? " (uncertain)" : ""}
                  </span>
                );
              })
            )}
          </div>
        );
      })}

      <div className="disclaimer" role="note">
        This is a background estimate, not a health result. It does not tell you
        whether you have or will get any condition. If you're curious what it
        means for you, your healthcare provider or a genetic counselor can help.
      </div>
    </aside>
  );
}
