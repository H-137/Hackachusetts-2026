import { Suspense, lazy, useMemo, useState } from "react";
import type { AnalysisBundle, SelectedRegion } from "../domain/explorer";
import {
  AUTOSOME_ORDER,
  chromLength,
  formatBp,
  segmentsOverlapping,
} from "../domain/explorer";
import { regionFor } from "../domain/geography";
import type { VariantObservation } from "../domain/types";
import { AncestryOverview } from "./AncestryOverview";
import { ChromosomeTrack } from "./ChromosomeTrack";
import { ConditionPage } from "./ConditionPage";
import { RegionDetail } from "./RegionDetail";
import { VariantDetail } from "./VariantDetail";

// ThreeJS/WebGL globe is heavy; load it only when the chromosomes tab renders.
const Globe = lazy(() => import("./Globe"));

interface Props {
  bundle: AnalysisBundle;
  onReset: () => void;
}

type Tab = "overview" | "chromosomes" | "conditions";

/**
 * Integrated explorer (plan Step 6). Tabs for a comprehensive overview, the
 * zoomable chromosome tracks, and the condition pages. Selecting a region opens
 * the region detail (ancestry + evidence + AI insight + globe); selecting a
 * marker opens the variant detail.
 */
export function Explorer({ bundle, onReset }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const firstChrom = AUTOSOME_ORDER[0] ?? "1";
  const [chrom, setChrom] = useState<string>(firstChrom);
  const [view, setView] = useState<{ start: number; end: number }>({
    start: 0,
    end: chromLength(firstChrom),
  });
  const [region, setRegion] = useState<SelectedRegion | null>(null);
  const [variant, setVariant] = useState<VariantObservation | null>(null);
  const [condition, setCondition] = useState<string | null>(null);

  const changeChrom = (c: string) => {
    setChrom(c);
    setView({ start: 0, end: chromLength(c) });
    setRegion(null);
    setVariant(null);
  };

  const zoomToRegion = (r: SelectedRegion) => {
    // Pad the region by 25% on each side for context, clamped to the chromosome.
    const pad = Math.round((r.end_0based_exclusive - r.start_0based) * 0.25) || 1;
    const len = chromLength(r.chromosome);
    setView({
      start: Math.max(0, r.start_0based - pad),
      end: Math.min(len, r.end_0based_exclusive + pad),
    });
  };

  const onSelectRegion = (r: SelectedRegion) => {
    setRegion(r);
    setVariant(null);
  };

  const onSelectVariant = (v: VariantObservation) => {
    setVariant(v);
  };

  const resetZoom = () =>
    setView({ start: 0, end: chromLength(chrom) });

  const openCondition = (c: string) => {
    setCondition(c);
    setTab("conditions");
  };

  // Reference regions overlapping the current selection drive the hero globe.
  const highlighted = useMemo(() => {
    if (!region) return [];
    const segs = segmentsOverlapping(
      bundle.segments,
      region.chromosome,
      region.start_0based,
      region.end_0based_exclusive,
    );
    return Array.from(new Set(segs.map((s) => s.ancestry_label)));
  }, [bundle.segments, region]);

  const activeRegionNames = highlighted
    .filter((h) => h !== "UNKNOWN")
    .map((h) => regionFor(h).name);

  return (
    <div className="explorer">
      <nav className="tabs" aria-label="Explorer sections">
        <button
          className={tab === "overview" ? "tab active" : "tab"}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          className={tab === "chromosomes" ? "tab active" : "tab"}
          onClick={() => setTab("chromosomes")}
        >
          Chromosomes
        </button>
        <button
          className={tab === "conditions" ? "tab active" : "tab"}
          onClick={() => setTab("conditions")}
        >
          Conditions
        </button>
        <span className="tab-spacer" />
        <button className="secondary" onClick={onReset}>
          Reset and clear data
        </button>
      </nav>

      {tab === "overview" && <AncestryOverview bundle={bundle} />}

      {tab === "chromosomes" && (
        <section aria-label="Chromosome explorer" className="chrom-tab">
          {/* Hero globe: the centerpiece of this tab. */}
          <div className="globe-hero">
            <Suspense
              fallback={<div className="globe-hero-loading">Loading globe…</div>}
            >
              <Globe highlighted={highlighted} size={420} />
            </Suspense>
            <div className="globe-hero-caption">
              {activeRegionNames.length > 0 ? (
                <>
                  <span className="subtitle">Local ancestry here maps to</span>
                  <div className="region-pills">
                    {highlighted
                      .filter((h) => h !== "UNKNOWN")
                      .map((h) => {
                        const reg = regionFor(h);
                        return (
                          <span
                            key={h}
                            className="region-pill"
                            style={{ borderColor: reg.color }}
                          >
                            <span
                              className="seg-dot"
                              style={{ background: reg.color }}
                            />
                            {reg.name}
                          </span>
                        );
                      })}
                  </div>
                </>
              ) : (
                <span className="subtitle">
                  Select a chromosome and click a region below to map its
                  inferred ancestry onto the globe.
                </span>
              )}
            </div>
          </div>

          {/* Aesthetic chromosome selector: a grid of chips. */}
          <div className="chrom-picker" role="radiogroup" aria-label="Chromosome">
            {AUTOSOME_ORDER.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={c === chrom}
                className={c === chrom ? "chrom-chip active" : "chrom-chip"}
                onClick={() => changeChrom(c)}
              >
                <span className="chrom-chip-num">{c}</span>
                <span className="chrom-chip-label">chr</span>
              </button>
            ))}
          </div>

          <div className="chrom-viewbar">
            <div>
              <strong>chr{chrom}</strong>{" "}
              <span className="subtitle">
                viewing {formatBp(view.start + 1)}–{formatBp(view.end)} of{" "}
                {formatBp(chromLength(chrom))}
              </span>
            </div>
            <div className="chrom-viewbar-actions">
              {region && (
                <button
                  className="secondary"
                  onClick={() => zoomToRegion(region)}
                >
                  Zoom to selection
                </button>
              )}
              <button className="secondary" onClick={resetZoom}>
                Full chromosome
              </button>
            </div>
          </div>

          <div className="track-scroll">
            <ChromosomeTrack
              bundle={bundle}
              chromosome={chrom}
              viewStart={view.start}
              viewEnd={view.end}
              selected={region}
              onSelectRegion={onSelectRegion}
              onSelectVariant={onSelectVariant}
            />
          </div>

          <div className="legend small">
            <span>
              <span className="seg-dot" style={{ background: "#4b9fe1" }} /> gene
              region
            </span>
            <span>
              <span className="seg-dot" style={{ background: "#e5534b" }} />{" "}
              variant marker
            </span>
            <span>hatched = uncertain / unknown ancestry</span>
          </div>

          {region && (
            <RegionDetail
              bundle={bundle}
              region={region}
              onSelectVariant={onSelectVariant}
            />
          )}

          {!region && (
            <p className="subtitle">
              Click a gene region (blue) or an ancestry segment to inspect it,
              then zoom in. Click a red marker for variant detail.
            </p>
          )}
        </section>
      )}

      {tab === "conditions" && (
        <section aria-label="Conditions">
          <div className="chrom-controls">
            <label>
              Condition{" "}
              <select
                value={condition ?? bundle.conditions[0]?.condition ?? ""}
                onChange={(e) => setCondition(e.target.value)}
              >
                {bundle.conditions.map((c) => (
                  <option key={c.condition} value={c.condition}>
                    {c.condition}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ConditionPage
            bundle={bundle}
            condition={condition ?? bundle.conditions[0]?.condition ?? ""}
            onSelectVariant={onSelectVariant}
          />
        </section>
      )}

      {variant && (
        <div className="drawer" role="dialog" aria-label="Variant detail">
          <VariantDetail
            bundle={bundle}
            variant={variant}
            onClose={() => setVariant(null)}
          />
          <div className="toolbar">
            {bundle.evidence
              .filter((e) => e.variant_key === variant.variant_key)
              .map((e) => e.condition)
              .filter((c, i, arr) => arr.indexOf(c) === i)
              .map((c) => (
                <button key={c} className="secondary" onClick={() => openCondition(c)}>
                  Open condition: {c}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
