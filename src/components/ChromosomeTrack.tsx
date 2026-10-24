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

// Vertical layout: position runs top -> bottom. Two copy columns sit side by
// side; a marker/gene lane runs to their right; a bp ruler runs down the left.
const SVG_W = 360; // extra right-side room so gene-lane labels never clip
const TRACK_H = 520; // vertical extent of the chromosome
const TOP = 24; // headroom for copy labels
const RULER_W = 44;
const COPY_W = 46;
const COPY_GAP = 14;
const COPY1_X = RULER_W + 10;
const COPY2_X = COPY1_X + COPY_W + COPY_GAP;
const LANE_X = COPY2_X + COPY_W + 16; // marker/gene lane

/**
 * Vertical ancestry viewer for one autosome. Position runs top to bottom. The
 * two chromosome copies are drawn as side-by-side vertical columns, filled by
 * reference-group color; uncertain/unknown segments use an accessible hatch so
 * uncertainty is never shown as a confident call. Genes and variant markers sit
 * in a lane to the right at their genomic position. Clicking a segment or gene
 * selects a region; clicking a marker opens that variant.
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

  // Map a genomic position to a vertical pixel (top = viewStart).
  const yOf = (pos0: number) => TOP + ((pos0 - viewStart) / span) * TRACK_H;
  const hOf = (start0: number, end0: number) =>
    Math.max(
      0.5,
      ((Math.min(end0, viewEnd) - Math.max(start0, viewStart)) / span) * TRACK_H,
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

  const svgH = TOP + TRACK_H + 20;

  const copyColumn = (copy: 1 | 2, x: number) =>
    segsByCopy[copy].map((s, i) => {
      const region = regionFor(s.ancestry_label);
      const y = yOf(s.start_0based);
      const h = hOf(s.start_0based, s.end_0based_exclusive);
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
            width={COPY_W}
            height={h}
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
          {uncertain && s.assignment_status === "uncertain" && h > 6 && (
            <rect
              x={x}
              y={y}
              width={COPY_W}
              height={h}
              rx={3}
              fill="url(#hatchUncertain)"
              pointerEvents="none"
            />
          )}
        </g>
      );
    });

  return (
    <svg
      width={SVG_W}
      height={svgH}
      viewBox={`0 0 ${SVG_W} ${svgH}`}
      className="chrom-track"
      role="group"
      aria-label={`Chromosome ${chromosome} ancestry tracks (vertical)`}
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

      {/* Column headers */}
      <text x={COPY1_X + COPY_W / 2} y={16} fontSize={11} fill="#9aa7b4" textAnchor="middle">
        copy 1
      </text>
      <text x={COPY2_X + COPY_W / 2} y={16} fontSize={11} fill="#9aa7b4" textAnchor="middle">
        copy 2
      </text>

      {/* bp ruler down the left side (1-based, human-facing) */}
      {ruler.map((t) => {
        const y = yOf(t);
        return (
          <g key={t}>
            <line
              x1={RULER_W - 2}
              y1={y}
              x2={RULER_W + 4}
              y2={y}
              stroke="#5e6b78"
              strokeWidth={1}
            />
            <text x={RULER_W - 6} y={y + 3} fontSize={9} fill="#9aa7b4" textAnchor="end">
              {formatBp(toDisplayPosition(t))}
            </text>
          </g>
        );
      })}

      {copyColumn(1, COPY1_X)}
      {copyColumn(2, COPY2_X)}

      {/* Marker/gene lane to the right, at genomic position. */}
      {/* Coverage markers: thin horizontal ticks. */}
      {coverageMarkers.map((v) => {
        const y = yOf(v.position_0based);
        return (
          <line
            key={v.variant_key}
            x1={LANE_X}
            y1={y}
            x2={LANE_X + 10}
            y2={y}
            stroke="#5e7488"
            strokeWidth={1}
          >
            <title>assayed marker · coverage only</title>
          </line>
        );
      })}

      {/* Genes: a labeled bracket at the gene's position. */}
      {genes.map((g) => {
        const y1 = yOf(Math.max(g.start_0based, viewStart));
        const y2 = yOf(Math.min(g.end_0based_exclusive, viewEnd));
        const h = Math.max(3, y2 - y1);
        return (
          <g key={g.gene}>
            <rect
              x={LANE_X + 14}
              y={y1}
              width={6}
              height={h}
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
            <text
              x={LANE_X + 24}
              y={y1 + Math.min(h / 2, 10) + 3}
              fontSize={11}
              fill="#4b9fe1"
            >
              {g.gene}
            </text>
          </g>
        );
      })}

      {/* Curated, disease-annotated variants: red dots. */}
      {variants.map((v) => {
        const y = yOf(v.position_0based);
        return (
          <circle
            key={v.variant_key}
            cx={LANE_X + 5}
            cy={y}
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

      <text x={RULER_W - 6} y={svgH - 2} fontSize={9} fill="#64727f" textAnchor="end">
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
