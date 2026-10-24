import { useEffect, useMemo, useState } from "react";
import type { Role } from "../App";
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
import { Assistant } from "./Assistant";
import { ChromosomePairMenu } from "./ChromosomePairMenu";
import { ChromosomeTrack } from "./ChromosomeTrack";
import { ConditionPage } from "./ConditionPage";
import { RegionDetail } from "./RegionDetail";
import { VariantDetail } from "./VariantDetail";

interface Props {
  bundle: AnalysisBundle;
  role: Role;
  onReset: () => void;
  /** Report the reference regions to highlight on the background globe. */
  onHighlightChange: (highlighted: string[]) => void;
  /** Report the active tab so the globe can render only on Chromosomes. */
  onTabChange: (tab: string) => void;
}

type Tab = "overview" | "chromosomes" | "conditions";

/**
 * Integrated explorer (plan Step 6). Tabs for a comprehensive overview, the
 * zoomable chromosome tracks, and the condition pages. Selecting a region opens
 * the region detail (ancestry + evidence + AI insight + globe); selecting a
 * marker opens the variant detail.
 */
export function Explorer({
  bundle,
  role,
  onReset,
  onHighlightChange,
  onTabChange,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const firstChrom = AUTOSOME_ORDER[0] ?? "1";
  const [chrom, setChrom] = useState<string>(firstChrom);
  const [region, setRegion] = useState<SelectedRegion | null>(null);
  const [variant, setVariant] = useState<VariantObservation | null>(null);
  const [condition, setCondition] = useState<string | null>(null);

  // No zoom for now: the viewer always shows the full selected chromosome.
  const view = { start: 0, end: chromLength(chrom) };

  const changeChrom = (c: string) => {
    setChrom(c);
    setRegion(null);
    setVariant(null);
  };

  const onSelectRegion = (r: SelectedRegion) => {
    setRegion(r);
    setVariant(null);
  };

  const onSelectVariant = (v: VariantObservation) => {
    setVariant(v);
  };

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

  // Drive the background globe: highlight the selection's regions only while the
  // chromosomes tab is active; clear it elsewhere so the globe idles.
  useEffect(() => {
    onHighlightChange(tab === "chromosomes" ? highlighted : []);
  }, [tab, highlighted, onHighlightChange]);

  // Report the active tab so the globe renders only on the Chromosomes tab.
  useEffect(() => {
    onTabChange(tab);
  }, [tab, onTabChange]);

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

      {tab === "overview" && (
        <AncestryOverview
          bundle={bundle}
          role={role}
          onOpenCondition={openCondition}
        />
      )}

      {tab === "chromosomes" && (
        <section aria-label="Chromosome explorer" className="chrom-tab">
          <div className="chrom-stage">
            {/* Left: the viewer panel (menu + track + detail), self-scrolling
                so the page stays a one-pager over the background globe. */}
            <div className="viewer-panel">
              <div className="viewer-head">
                <ChromosomePairMenu
                  value={chrom}
                  onChange={changeChrom}
                />
                <span className="subtitle">
                  full chromosome · {formatBp(chromLength(chrom))}
                </span>
              </div>

              <div className="viewer-body">
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
                    <span className="seg-dot" style={{ background: "#4b9fe1" }} />{" "}
                    gene region
                  </span>
                  <span>
                    <span className="seg-dot" style={{ background: "#e5534b" }} />{" "}
                    curated variant
                  </span>
                  <span>thin ticks = assayed markers</span>
                  <span>hatched = uncertain / unknown</span>
                </div>

                {region ? (
                  <RegionDetail
                    bundle={bundle}
                    region={region}
                    onSelectVariant={onSelectVariant}
                  />
                ) : (
                  <p className="subtitle">
                    Click a gene region (blue) or an ancestry segment to inspect
                    it. Click a red marker for variant detail.
                  </p>
                )}
              </div>
            </div>

            {/* Right: open column — the full-page background globe shows
                through. Only the caption overlays here. */}
            <div className="globe-stage">
              <div className="globe-hero-caption">
                {activeRegionNames.length > 0 ? (
                  <>
                    <span className="globe-caption-lead">
                      Local ancestry here maps to
                    </span>
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
                    Pick a chromosome, then click a region to map its inferred
                    ancestry onto the globe. Drag the globe to rotate; click to
                    pause or resume its spin.
                  </span>
                )}
              </div>
            </div>
          </div>
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
            role={role}
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

      {/* Assistant: present across all three tabs. */}
      <Assistant bundle={bundle} activeTab={tab} />
    </div>
  );
}
