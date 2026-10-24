import { useMemo } from "react";
import type { AnalysisBundle, SelectedRegion } from "../domain/explorer";
import { chromLength, formatBp, toDisplayPosition } from "../domain/explorer";
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

const TRACK_W = 860;
const TRACK_H = 26;
const GAP = 10;
const LEFT = 48;

/**
 * Two ancestry tracks (copy 1 / copy 2) for one autosome, drawn as SVG. Each
 * segment is filled by its reference-group color; uncertain/unknown segments use
 * an accessible hatch pattern so uncertainty is never shown as a confident call.
 * Variant markers sit on a lane below. Clicking a segment or a gene selects a
 * region; clicking a marker opens that variant.
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

  const xOf = (pos0: number) =>
    LEFT + ((pos0 - viewStart) / span) * TRACK_W;
  const wOf = (start0: number, end0: number) =>
    Math.max(0.5, ((Math.min(end0, viewEnd) - Math.max(start0, viewStart)) / span) * TRACK_W);

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

  const variants = useMemo(
    () =>
      bundle.variants.filter(
        (v) =>
          v.chromosome === chromosome &&
          v.position_0based >= viewStart &&
          v.position_0based < viewEnd,
      ),
    [bundle.variants, chromosome, viewStart, viewEnd],
  );

  const svgH = TRACK_H * 2 + GAP + 70;

  const copyLane = (copy: 1 | 2, y: number) =>
    segsByCopy[copy].map((s, i) => {
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
            height={TRACK_H}
            fill={s.assignment_status === "unknown" ? "url(#hatchUnknown)" : region.color}
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
              height={TRACK_H}
              fill="url(#hatchUncertain)"
              pointerEvents="none"
            />
          )}
        </g>
      );
    });

  const geneY = TRACK_H * 2 + GAP + 8;

  return (
    <svg
      width={TRACK_W + LEFT + 12}
      height={svgH}
      viewBox={`0 0 ${TRACK_W + LEFT + 12} ${svgH}`}
      className="chrom-track"
      role="group"
      aria-label={`Chromosome ${chromosome} ancestry tracks`}
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

      <text x={0} y={TRACK_H - 8} fontSize={11} fill="#9aa7b4">
        copy 1
      </text>
      {copyLane(1, 0)}

      <text x={0} y={TRACK_H * 2 + GAP - 8} fontSize={11} fill="#9aa7b4">
        copy 2
      </text>
      {copyLane(2, TRACK_H + GAP)}

      {/* Gene region markers + variant lane */}
      {genes.map((g) => {
        const x = xOf(Math.max(g.start_0based, viewStart));
        const w = wOf(g.start_0based, g.end_0based_exclusive);
        return (
          <g key={g.gene}>
            <rect
              x={x}
              y={geneY}
              width={Math.max(w, 2)}
              height={12}
              rx={2}
              fill="#4b9fe1"
              fillOpacity={0.9}
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
            <text x={x} y={geneY + 28} fontSize={11} fill="#4b9fe1">
              {g.gene}
            </text>
          </g>
        );
      })}

      {variants.map((v) => {
        const x = xOf(v.position_0based);
        return (
          <g key={v.variant_key}>
            <circle
              cx={x}
              cy={geneY + 6}
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
          </g>
        );
      })}

      {/* Scale labels (1-based, human-facing) */}
      <text x={LEFT} y={svgH - 4} fontSize={10} fill="#9aa7b4">
        {formatBp(toDisplayPosition(viewStart))}
      </text>
      <text
        x={LEFT + TRACK_W}
        y={svgH - 4}
        fontSize={10}
        fill="#9aa7b4"
        textAnchor="end"
      >
        {formatBp(viewEnd)} / {formatBp(len)}
      </text>
    </svg>
  );
}
