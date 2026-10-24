import { useEffect, useMemo, useState } from "react";
import type { AnalysisBundle, SelectedRegion } from "../domain/explorer";
import {
  formatBp,
  segmentsOverlapping,
  toDisplayPosition,
  variantsIn,
} from "../domain/explorer";
import { regionFor } from "../domain/geography";
import {
  buildRequest,
  offlineProvider,
  type RegionInsight,
} from "../domain/regionResearch";
import type { VariantObservation } from "../domain/types";

interface Props {
  bundle: AnalysisBundle;
  region: SelectedRegion;
  onSelectVariant: (v: VariantObservation) => void;
}

/** Compact, readable status labels for the variant cards. */
const MEAS: Record<string, { text: string; cls: string }> = {
  observed: { text: "observed", cls: "good" },
  imputed: { text: "imputed", cls: "warn" },
  not_assayed: { text: "not assayed", cls: "warn" },
  no_call: { text: "no call", cls: "warn" },
  excluded: { text: "excluded", cls: "bad" },
};

/**
 * Region detail: inferred ancestry on BOTH copies, overlapping gene/conditions,
 * curated evidence, an AI-synthesized research insight, and the globe pointing
 * at the overlapping reference region. Frames findings for clinicians and
 * patients as "consider confirmatory testing," never as a diagnosis.
 */
export function RegionDetail({ bundle, region, onSelectVariant }: Props) {
  const gene = useMemo(
    () =>
      region.gene
        ? bundle.genes.find((g) => g.gene === region.gene)
        : bundle.genes.find(
            (g) =>
              g.chromosome === region.chromosome &&
              g.start_0based < region.end_0based_exclusive &&
              g.end_0based_exclusive > region.start_0based,
          ),
    [bundle.genes, region],
  );

  const overlapping = useMemo(
    () =>
      segmentsOverlapping(
        bundle.segments,
        region.chromosome,
        region.start_0based,
        region.end_0based_exclusive,
      ),
    [bundle.segments, region],
  );

  const regionVariants = useMemo(
    () =>
      variantsIn(
        bundle.variants,
        region.chromosome,
        region.start_0based,
        region.end_0based_exclusive,
      ),
    [bundle.variants, region],
  );

  const highlighted = useMemo(
    () => Array.from(new Set(overlapping.map((s) => s.ancestry_label))),
    [overlapping],
  );

  const [insight, setInsight] = useState<RegionInsight | null>(null);
  const [loading, setLoading] = useState(false);

  // Run the offline research pipeline whenever the region (with a gene) changes.
  useEffect(() => {
    setInsight(null);
    const req = buildRequest(bundle, region);
    if (!req) return;
    setLoading(true);
    let cancelled = false;
    offlineProvider.analyze(req).then((res) => {
      if (!cancelled) {
        setInsight(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bundle, region]);

  const byCopy = (copy: 1 | 2) =>
    overlapping
      .filter((s) => s.copy_index === copy)
      .sort((a, b) => a.start_0based - b.start_0based);

  return (
    <section aria-label="Region detail" className="region-detail">
      <div className="region-body">
        <div>
          <h3>
            {gene ? gene.gene : `chr${region.chromosome} region`}{" "}
            <span className="subtitle">
              chr{region.chromosome}:{toDisplayPosition(region.start_0based).toLocaleString()}–
              {region.end_0based_exclusive.toLocaleString()} (
              {formatBp(region.end_0based_exclusive - region.start_0based)}, 1-based)
            </span>
          </h3>

          {gene && <p className="subtitle">{gene.summary}</p>}

          <h4>Inferred local ancestry (both copies)</h4>
          {[1, 2].map((c) => {
            const copy = c as 1 | 2;
            const segs = byCopy(copy);
            return (
              <div key={copy} className="copy-row">
                <span className="copy-label">copy {copy}</span>
                {segs.length === 0 && (
                  <span className="badge warn">no overlapping segment</span>
                )}
                {segs.map((s, i) => {
                  const reg = regionFor(s.ancestry_label);
                  const top =
                    s.probabilities &&
                    Math.max(...Object.values(s.probabilities));
                  return (
                    <span
                      key={i}
                      className="seg-chip"
                      style={{ borderColor: reg.color }}
                    >
                      <span
                        className="seg-dot"
                        style={{ background: reg.color }}
                      />
                      {reg.name}
                      <span className="subtitle">
                        {" "}
                        · {s.assignment_status}
                        {typeof top === "number"
                          ? ` · p≈${top.toFixed(2)}`
                          : ""}
                      </span>
                    </span>
                  );
                })}
              </div>
            );
          })}

          {gene && gene.conditions.length > 0 && (
            <>
              <h4>Curated conditions in this region</h4>
              <ul className="tight">
                {gene.conditions.map((c) => {
                  const man = bundle.conditions.find((x) => x.condition === c);
                  const elevatedHere =
                    man &&
                    man.elevated_frequency_groups.some((g) =>
                      highlighted.includes(g),
                    );
                  return (
                    <li key={c}>
                      {c}{" "}
                      {elevatedHere ? (
                        <span className="badge warn">
                          overlaps an elevated-frequency reference group
                        </span>
                      ) : (
                        <span className="badge">
                          no overlapping elevated-frequency group here
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {regionVariants.length > 0 && (
            <>
              <h4>
                Variants in this region{" "}
                <span className="count-pill">{regionVariants.length}</span>
              </h4>
              <div className="variant-cards">
                {regionVariants.map((v) => {
                  const m = MEAS[v.measurement_status] ?? {
                    text: v.measurement_status,
                    cls: "",
                  };
                  return (
                    <button
                      key={v.variant_key}
                      className="variant-card"
                      onClick={() => onSelectVariant(v)}
                      aria-label={`View variant ${v.rsid ?? v.variant_key}`}
                    >
                      <span className="variant-card-id">
                        {v.rsid ?? "variant"}
                      </span>
                      <span className="variant-card-pos">
                        chr{v.chromosome}:
                        {toDisplayPosition(v.position_0based).toLocaleString()}
                      </span>
                      <span className={`badge ${m.cls}`}>{m.text}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="insight">
        <h4>
          Research insight{" "}
          {insight && (
            <span className="badge">
              {insight.transmitted_offdevice
                ? `AI: ${insight.generated_by}`
                : "generated offline on-device"}
            </span>
          )}
        </h4>
        {loading && <p className="subtitle">Analyzing region…</p>}
        {!loading && !insight && (
          <p className="subtitle">
            Select a gene region to generate a research insight.
          </p>
        )}
        {insight && (
          <>
            <p className="insight-headline">{insight.headline}</p>
            <InsightList title="What the data supports" items={insight.supports} tone="support" />
            <InsightList
              title="What it does NOT establish"
              items={insight.does_not_establish}
              tone="limit"
            />
            <InsightList
              title="Screening considerations (clinician + patient)"
              items={insight.screening_considerations}
              tone="action"
            />
            <InsightList title="Caveats" items={insight.caveats} tone="caveat" />
            <div className="sources">
              Sources:{" "}
              {insight.sources.map((s, i) => (
                <span key={s}>
                  {i > 0 && " · "}
                  <a href={s} target="_blank" rel="noopener noreferrer">
                    {hostOf(s)}
                  </a>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function InsightList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "support" | "limit" | "action" | "caveat";
}) {
  if (items.length === 0) return null;
  return (
    <div className={`insight-block tone-${tone}`}>
      <div className="insight-title">{title}</div>
      <ul className="tight">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
