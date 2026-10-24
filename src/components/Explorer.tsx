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
import { ConditionPage, useConditionGroups } from "./ConditionPage";
import { PatientRegionInfo } from "./PatientRegionInfo";
import { RegionClinicalPanel } from "./RegionClinicalPanel";
import { VariantDetail } from "./VariantDetail";
import { VariantTable } from "./VariantTable";
import { Watchlist } from "./Watchlist";

interface Props {
  bundle: AnalysisBundle;
  role: Role;
  onReset: () => void;
  /** Report the reference regions to highlight on the background globe. */
  onHighlightChange: (highlighted: string[]) => void;
  /** Report the active tab so the globe can render only on Chromosomes. */
  onTabChange: (tab: string) => void;
}

type Tab = "overview" | "chromosomes" | "watchlist" | "conditions";

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
  // A condition to focus in the Watchlist when deep-linked from Conditions.
  const [watchlistCondition, setWatchlistCondition] = useState<string | null>(null);
  // Chromosome tab: chart (track/lollipop) or the accessible linked table.
  const [chromView, setChromView] = useState<"chart" | "table">("chart");

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

  const openWatchlist = (c?: string) => {
    setWatchlistCondition(c ?? null);
    setTab("watchlist");
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

  // Watchlist conditions drive the Conditions tab (companion views, one source).
  const conditionGroups = useConditionGroups(bundle);

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
          Chromosome
        </button>
        <button
          className={tab === "watchlist" ? "tab active" : "tab"}
          onClick={() => setTab("watchlist")}
        >
          Watchlist
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
          onOpenWatchlist={() => openWatchlist()}
        />
      )}

      {tab === "watchlist" && (
        <Watchlist
          bundle={bundle}
          role={role}
          focusCondition={watchlistCondition}
          onOpenCondition={openCondition}
        />
      )}

      {tab === "chromosomes" && (
        <section aria-label="Chromosome explorer" className="chrom-tab">
          {/* Region caption + chart/table view toggle, always visible. */}
          <div className="region-caption-bar">
            <div className="region-caption-text">
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
                {role === "patient"
                  ? "Pick a chromosome, then click a region to map its inferred ancestry onto the globe. Drag the globe to rotate; click to pause or resume its spin."
                  : "Pick a chromosome, then click a region to see its local-ancestry context and any curated carrier status."}
              </span>
            )}
            </div>

            <div className="view-toggle" role="radiogroup" aria-label="View">
              <button
                role="radio"
                aria-checked={chromView === "chart"}
                className={chromView === "chart" ? "vt-btn active" : "vt-btn"}
                onClick={() => setChromView("chart")}
              >
                Chart
              </button>
              <button
                role="radio"
                aria-checked={chromView === "table"}
                className={chromView === "table" ? "vt-btn active" : "vt-btn"}
                onClick={() => setChromView("table")}
              >
                Table
              </button>
            </div>
          </div>

          {role === "patient" ? (
            /* Patient: two thin windows (small chromosome | region info) side by
               side, then an open column where the background globe shows
               through — same as the old single-window-next-to-globe layout, but
               the single window is split into two. */
            <div className="chrom-stage patient-stage">
              <div className="viewer-panel compact">
                <div className="viewer-head">
                  <ChromosomePairMenu value={chrom} onChange={changeChrom} />
                </div>
                <div className="viewer-body">
                  {chromView === "chart" ? (
                    <>
                      <div className="track-scroll">
                        <ChromosomeTrack
                          bundle={bundle}
                          chromosome={chrom}
                          viewStart={view.start}
                          viewEnd={view.end}
                          selected={region}
                          orientation="vertical"
                          onSelectRegion={onSelectRegion}
                          onSelectVariant={onSelectVariant}
                        />
                      </div>
                      <div className="legend small">
                        <span>
                          <span className="seg-dot" style={{ background: "#4b9fe1" }} />{" "}
                          gene
                        </span>
                        <span>hatched = uncertain</span>
                      </div>
                    </>
                  ) : (
                    <div className="table-scroll">
                      <VariantTable
                        bundle={bundle}
                        chromosome={chrom}
                        viewStart={view.start}
                        viewEnd={view.end}
                        selected={region}
                        onSelectVariant={onSelectVariant}
                        onSelectRegion={onSelectRegion}
                      />
                    </div>
                  )}
                </div>
              </div>

              <PatientRegionInfo bundle={bundle} region={region} />

              {/* Open column: the full-page background globe shows through. */}
              <div className="globe-stage" aria-hidden="true" />
            </div>
          ) : (
            /* Clinician: stacked viewer + lollipop/region clinical panel. */
            <div className="chrom-stage clinician">
              <div className="viewer-panel">
                <div className="viewer-head">
                  <ChromosomePairMenu value={chrom} onChange={changeChrom} />
                  <span className="subtitle">
                    full chromosome · {formatBp(chromLength(chrom))}
                  </span>
                </div>

                <div className="viewer-body">
                  {chromView === "chart" ? (
                    <>
                      <div className="track-scroll">
                        <ChromosomeTrack
                          bundle={bundle}
                          chromosome={chrom}
                          viewStart={view.start}
                          viewEnd={view.end}
                          selected={region}
                          orientation="horizontal"
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

                      {!region && (
                        <p className="subtitle">
                          Click a gene region (blue) or an ancestry segment to
                          inspect it. Click a red marker for variant detail.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="table-scroll">
                      <VariantTable
                        bundle={bundle}
                        chromosome={chrom}
                        viewStart={view.start}
                        viewEnd={view.end}
                        selected={region}
                        onSelectVariant={onSelectVariant}
                        onSelectRegion={onSelectRegion}
                      />
                    </div>
                  )}
                </div>
              </div>

              <RegionClinicalPanel
                bundle={bundle}
                region={region}
                onSelectVariant={onSelectVariant}
              />
            </div>
          )}
        </section>
      )}

      {tab === "conditions" && (
        <section aria-label="Conditions">
          <div className="chrom-controls">
            <label>
              Condition{" "}
              <select
                value={condition ?? conditionGroups[0]?.condition ?? ""}
                onChange={(e) => setCondition(e.target.value)}
              >
                {conditionGroups.map((g) => (
                  <option key={g.condition} value={g.condition}>
                    {g.condition}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ConditionPage
            bundle={bundle}
            role={role}
            condition={condition ?? conditionGroups[0]?.condition ?? ""}
            onOpenWatchlist={openWatchlist}
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
