import { useMemo, useState } from "react";
import type { AnalysisBundle, SelectedRegion } from "../domain/explorer";
import {
  formatBp,
  isCoverageMarker,
  toDisplayPosition,
  variantsIn,
} from "../domain/explorer";
import type { VariantObservation } from "../domain/types";

interface Props {
  bundle: AnalysisBundle;
  region: SelectedRegion;
  onSelectVariant: (v: VariantObservation) => void;
}

// Measurement status drives the lollipop color and relative stem height.
const STATUS_STYLE: Record<
  string,
  { color: string; label: string; height: number }
> = {
  observed: { color: "#e5534b", label: "observed", height: 1.0 },
  imputed: { color: "#e0a106", label: "imputed", height: 0.75 },
  not_assayed: { color: "#8a93a0", label: "not assayed", height: 0.5 },
  no_call: { color: "#8a93a0", label: "no call", height: 0.5 },
  excluded: { color: "#4c566a", label: "excluded", height: 0.4 },
};

const W = 460;
const H = 190;
const PAD_L = 16;
const PAD_R = 16;
const BASE_Y = 150; // baseline (genomic axis)
const MAX_STEM = 96; // tallest lollipop stem

/**
 * Interactive horizontal lollipop chart of the variants in a selected region.
 * The baseline is a genomic axis (left→right); each curated variant is a
 * "lollipop" — a stem topped by a circle at its position. Color + stem height
 * encode measurement status (observed highest, not-assayed lowest). Coverage
 * markers appear as small ticks on the baseline for density context. Hovering
 * highlights a lollipop and shows its details; clicking opens the full variant.
 */
export function LollipopChart({ bundle, region, onSelectVariant }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const start = region.start_0based;
  const end = region.end_0based_exclusive;
  const span = Math.max(1, end - start);

  const xOf = (pos0: number) =>
    PAD_L + ((pos0 - start) / span) * (W - PAD_L - PAD_R);

  const all = useMemo(
    () => variantsIn(bundle.variants, region.chromosome, start, end),
    [bundle.variants, region.chromosome, start, end],
  );
  const lollipops = useMemo(() => all.filter((v) => !isCoverageMarker(v)), [all]);
  const coverage = useMemo(() => all.filter((v) => isCoverageMarker(v)), [all]);

  const active = hover
    ? lollipops.find((v) => v.variant_key === hover) ?? null
    : null;

  if (lollipops.length === 0) {
    return (
      <div className="lollipop-empty">
        <p className="subtitle">
          No curated variants fall in this region.{" "}
          {coverage.length > 0
            ? `${coverage.length} assayed marker(s) cover it for context.`
            : "This region is effectively unmeasured at this resolution — absence is not a negative result."}
        </p>
      </div>
    );
  }

  return (
    <div className="lollipop">
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={`Lollipop chart of ${lollipops.length} variants in the selected region`}
        className="lollipop-svg"
      >
        {/* baseline / genomic axis */}
        <line x1={PAD_L} y1={BASE_Y} x2={W - PAD_R} y2={BASE_Y} stroke="#3b4652" strokeWidth={1.5} />
        <text x={PAD_L} y={BASE_Y + 16} fontSize={9} fill="#9aa7b4">
          {formatBp(toDisplayPosition(start))}
        </text>
        <text x={W - PAD_R} y={BASE_Y + 16} fontSize={9} fill="#9aa7b4" textAnchor="end">
          {formatBp(end)}
        </text>

        {/* coverage markers: small ticks on the baseline for density context */}
        {coverage.map((v) => (
          <line
            key={v.variant_key}
            x1={xOf(v.position_0based)}
            y1={BASE_Y - 4}
            x2={xOf(v.position_0based)}
            y2={BASE_Y + 4}
            stroke="#5e7488"
            strokeWidth={1}
          >
            <title>assayed marker · coverage only</title>
          </line>
        ))}

        {/* lollipops */}
        {lollipops.map((v) => {
          const st = STATUS_STYLE[v.measurement_status] ?? STATUS_STYLE.not_assayed!;
          const x = xOf(v.position_0based);
          const top = BASE_Y - MAX_STEM * st.height;
          const isHover = hover === v.variant_key;
          return (
            <g
              key={v.variant_key}
              className="lollipop-g"
              onMouseEnter={() => setHover(v.variant_key)}
              onMouseLeave={() => setHover((h) => (h === v.variant_key ? null : h))}
              onClick={() => onSelectVariant(v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelectVariant(v);
              }}
              tabIndex={0}
              role="button"
              aria-label={`Variant ${v.rsid ?? v.variant_key}, ${st.label}, at ${toDisplayPosition(v.position_0based)}`}
              style={{ cursor: "pointer" }}
            >
              <line x1={x} y1={BASE_Y} x2={x} y2={top} stroke={st.color} strokeWidth={isHover ? 3 : 2} />
              <circle
                cx={x}
                cy={top}
                r={isHover ? 9 : 7}
                fill={st.color}
                stroke={isHover ? "#fff" : "#0f1419"}
                strokeWidth={isHover ? 2 : 1}
              />
              {/* rsID label above the candy */}
              <text x={x} y={top - 12} fontSize={9} fill="#e6edf3" textAnchor="middle">
                {v.rsid ?? ""}
              </text>
            </g>
          );
        })}
      </svg>

      {/* hover detail / prompt */}
      <div className="lollipop-detail">
        {active ? (
          <>
            <strong>{active.rsid ?? active.variant_key}</strong>{" "}
            <span className="badge" style={{ borderColor: (STATUS_STYLE[active.measurement_status] ?? STATUS_STYLE.not_assayed!).color }}>
              {(STATUS_STYLE[active.measurement_status] ?? STATUS_STYLE.not_assayed!).label}
            </span>
            <div className="subtitle">
              chr{active.chromosome}:
              {toDisplayPosition(active.position_0based).toLocaleString()} ·
              genotype {active.genotype}
            </div>
            <button className="linklike" onClick={() => onSelectVariant(active)}>
              Open full variant detail
            </button>
          </>
        ) : (
          <span className="subtitle">
            Hover a lollipop for details; click to open the full variant. Stem
            height and color encode measurement status.
          </span>
        )}
      </div>

      <div className="lollipop-legend">
        {Object.entries(STATUS_STYLE)
          .filter(([k]) => k !== "excluded" && k !== "no_call")
          .map(([k, s]) => (
            <span key={k}>
              <span className="seg-dot" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
      </div>
    </div>
  );
}
