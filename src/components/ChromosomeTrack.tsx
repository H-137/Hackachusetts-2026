import { useMemo } from "react";
import type { AnalysisBundle, SelectedRegion } from "../domain/explorer";
import {
  chromLength,
  formatBp,
  isCoverageMarker,
  toDisplayPosition,
} from "../domain/explorer";
import { regionFor } from "../domain/geography";
import type { AncestrySegment, VariantObservation } from "../domain/types";

interface Props {
  bundle: AnalysisBundle;
  chromosome: string;
  /** Visible window in internal 0-based coordinates. */
  viewStart: number;
  viewEnd: number;
  selected: SelectedRegion | null;
  onSelectRegion: (region: SelectedRegion) => void;
  onSelectVariant: (variant: VariantObservation) => void;
}

// Horizontal layout: position runs left -> right. Two copy rows stack; a
// gene/marker lane sits below them; a bp ruler runs along the bottom.
const LEFT = 56; // room for row labels ("copy 1" / "copy 2")
const RIGHT = 16;
const TRACK_W = 760; // horizontal extent of the chromosome
const SVG_W = LEFT + TRACK_W + RIGHT;
const ROW_H = 26;
const ROW_GAP = 8;
const TOP = 8;
const LANE_H = 22; // gene/marker lane height
const RULER_H = 22;
const SVG_H = TOP + ROW_H * 2 + ROW_GAP + 12 + LANE_H + RULER_H;

/**
 * Horizontal ancestry viewer for one autosome. Position runs left to right. The
 * two chromosome copies are stacked horizontal bars, filled by reference-group
 * color; uncertain/unknown segments use an accessible hatch so uncertainty is
 * never shown as a confident call. Genes and variant markers sit in a lane
 * below at their genomic position. Clicking a segment or gene selects a region;
 * clicking a marker opens that variant. The layout is horizontal to flow with
 * the horizontal lollipop chart in the clinician panel.
 */
export function ChromosomeTrack({
  bundle,
  chromosome,
  viewStart,
  viewEnd,
  selected,
  onSelectRegion,
  onSelectVariant,
}: Props) {
  const len = chromLength(chromosome);
  const span = Math.max(1, viewEnd - viewStart);

  // Map a genomic position to a horizontal pixel (left = viewStart).
  const xOf = (pos0: number) => LEFT + ((pos0 - viewStart) / span) * TRACK_W;
  const wOf = (start0: number, end0: number) =>
    Math.max(
      0.5,
      ((Math.min(end0, viewEnd) - Math.max(start0, viewStart)) / span) * TRACK_W,
    );

  const segsByCopy = useMemo(() => {
    const result: Record<1 | 2, AncestrySegment[]> = { 1: [], 2: [] };
    for (const s of bundle.segments) {
      if (s.chromosome !== chromosome) continue;
      if (s.end_0based_exclusive <= viewStart || s.start_0based >= viewEnd)
        continue;
      result[s.copy_index].push(s);
    }
    return result;
  }, [bundle.segments, chromosome, viewStart, viewEnd]);

  const genes = useMemo(
    () =>
      bundle.genes.filter(
        (g) =>
          g.chromosome === chromosome &&
          g.end_0based_exclusive > viewStart &&
          g.start_0based < viewEnd,
      ),
    [bundle.genes, chromosome, viewStart, viewEnd],
  );

  const inWindow = useMemo(
    () =>
      bundle.variants.filter(
        (v) =>
          v.chromosome === chromosome &&
          v.position_0based >= viewStart &&
          v.position_0based < viewEnd,
      ),
    [bundle.variants, chromosome, viewStart, viewEnd],
  );
  const coverageMarkers = useMemo(
    () => inWindow.filter((v) => isCoverageMarker(v)),
    [inWindow],
  );
  const variants = useMemo(
    () => inWindow.filter((v) => !isCoverageMarker(v)),
    [inWindow],
  );

  const ruler = useMemo(() => buildRuler(viewStart, viewEnd), [viewStart, viewEnd]);

  const rowY = (copy: 1 | 2) => TOP + (copy === 1 ? 0 : ROW_H + ROW_GAP);
  const laneY = TOP + ROW_H * 2 + ROW_GAP + 12;
  const rulerY = laneY + LANE_H;

  const copyRow = (copy: 1 | 2) => {
    const y = rowY(copy);
    return segsByCopy[copy].map((s, i) => {
      const region = regionFor(s.ancestry_label);
      const x = xOf(s.start_0based);
      const w = wOf(s.start_0based, s.end_0based_exclusive);
      const uncertain = s.assignment_status !== "assigned";
      const isSel =
        selected &&
        selected.chromosome === chromosome &&
        s.start_0based < selected.end_0based_exclusive &&
        s.end_0based_exclusive > selected.start_0based;
      return (
        <g key={`${copy}-${i}`}>
          <rect
            x={x}
            y={y}
            width={w}
            height={ROW_H}
            rx={3}
            fill={
              s.assignment_status === "unknown"
                ? "url(#hatchUnknown)"
                : region.color
            }
            fillOpacity={uncertain ? 0.55 : 0.92}
            stroke={isSel ? "#fff" : "none"}
            strokeWidth={isSel ? 1.5 : 0}
            tabIndex={0}
            role="button"
            aria-label={`Copy ${copy} ${region.name}, ${s.assignment_status}, ${formatBp(
              s.end_0based_exclusive - s.start_0based,
            )}`}
            style={{ cursor: "pointer" }}
            onClick={() =>
              onSelectRegion({
                chromosome,
                start_0based: s.start_0based,
                end_0based_exclusive: s.end_0based_exclusive,
              })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                onSelectRegion({
                  chromosome,
                  start_0based: s.start_0based,
                  end_0based_exclusive: s.end_0based_exclusive,
                });
            }}
          >
            <title>
              Copy {copy} · {region.name} · {s.assignment_status} ·{" "}
              {formatBp(s.end_0based_exclusive - s.start_0based)}
            </title>
          </rect>
          {uncertain && s.assignment_status === "uncertain" && w > 6 && (
            <rect
              x={x}
              y={y}
              width={w}
              height={ROW_H}
              rx={3}
              fill="url(#hatchUncertain)"
              pointerEvents="none"
            />
          )}
        </g>
      );
    });
  };

  return (
    <svg
      width={SVG_W}
      height={SVG_H}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="chrom-track"
      role="group"
      aria-label={`Chromosome ${chromosome} ancestry tracks (horizontal)`}
    >
      <defs>
        <pattern
          id="hatchUncertain"
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#0f1419" strokeWidth="1.6" />
        </pattern>
        <pattern
          id="hatchUnknown"
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="#2a323c" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#4c566a" strokeWidth="2" />
        </pattern>
      </defs>

      {/* Row labels */}
      <text x={LEFT - 8} y={rowY(1) + ROW_H / 2 + 3} fontSize={11} fill="#9aa7b4" textAnchor="end">
        copy 1
      </text>
      <text x={LEFT - 8} y={rowY(2) + ROW_H / 2 + 3} fontSize={11} fill="#9aa7b4" textAnchor="end">
        copy 2
      </text>

      {copyRow(1)}
      {copyRow(2)}

      {/* Gene/marker lane below the copies, at genomic position. */}
      {/* Coverage markers: thin vertical ticks. */}
      {coverageMarkers.map((v) => {
        const x = xOf(v.position_0based);
        return (
          <line
            key={v.variant_key}
            x1={x}
            y1={laneY}
            x2={x}
            y2={laneY + 8}
            stroke="#5e7488"
            strokeWidth={1}
          >
            <title>assayed marker · coverage only</title>
          </line>
        );
      })}

      {/* Genes: a labeled bracket at the gene's position. */}
      {genes.map((g) => {
        const x1 = xOf(Math.max(g.start_0based, viewStart));
        const x2 = xOf(Math.min(g.end_0based_exclusive, viewEnd));
        const w = Math.max(3, x2 - x1);
        return (
          <g key={g.gene}>
            <rect
              x={x1}
              y={laneY + 11}
              width={w}
              height={6}
              rx={2}
              fill="#4b9fe1"
              tabIndex={0}
              role="button"
              aria-label={`Gene ${g.gene}, select region`}
              style={{ cursor: "pointer" }}
              onClick={() =>
                onSelectRegion({
                  chromosome,
                  start_0based: g.start_0based,
                  end_0based_exclusive: g.end_0based_exclusive,
                  gene: g.gene,
                })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  onSelectRegion({
                    chromosome,
                    start_0based: g.start_0based,
                    end_0based_exclusive: g.end_0based_exclusive,
                    gene: g.gene,
                  });
              }}
            >
              <title>{g.gene}</title>
            </rect>
            <text x={x1} y={laneY + 8} fontSize={10} fill="#4b9fe1">
              {g.gene}
            </text>
          </g>
        );
      })}

      {/* Curated, disease-annotated variants: red dots on the lane. */}
      {variants.map((v) => {
        const x = xOf(v.position_0based);
        return (
          <circle
            key={v.variant_key}
            cx={x}
            cy={laneY + 4}
            r={5}
            fill="#e5534b"
            stroke="#0f1419"
            strokeWidth={1}
            tabIndex={0}
            role="button"
            aria-label={`Variant ${v.rsid ?? v.variant_key} at position ${toDisplayPosition(
              v.position_0based,
            )}`}
            style={{ cursor: "pointer" }}
            onClick={() => onSelectVariant(v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectVariant(v);
            }}
          >
            <title>
              {v.rsid ?? v.variant_key} ({v.measurement_status})
            </title>
          </circle>
        );
      })}

      {/* bp ruler along the bottom (1-based, human-facing). */}
      {ruler.map((t) => {
        const x = xOf(t);
        return (
          <g key={t}>
            <line x1={x} y1={rulerY} x2={x} y2={rulerY + 4} stroke="#5e6b78" strokeWidth={1} />
            <text x={x} y={rulerY + 15} fontSize={9} fill="#9aa7b4" textAnchor="middle">
              {formatBp(toDisplayPosition(t))}
            </text>
          </g>
        );
      })}
      <text x={SVG_W - RIGHT} y={rulerY + 15} fontSize={9} fill="#64727f" textAnchor="end">
        of {formatBp(len)}
      </text>
    </svg>
  );
}

/** Build ~8 evenly spaced "nice" ruler ticks across the visible window. */
function buildRuler(start: number, end: number): number[] {
  const span = Math.max(1, end - start);
  const rough = span / 8;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 5, 10].map((m) => m * pow);
  const step = candidates.find((c) => c >= rough) ?? pow * 10;
  const ticks: number[] = [];
  const first = Math.ceil(start / step) * step;
  for (let t = first; t < end; t += step) ticks.push(t);
  return ticks;
}
