import { useMemo } from "react";
import type { AnalysisBundle, SelectedRegion } from "../domain/explorer";
import {
  isCoverageMarker,
  toDisplayPosition,
  variantsIn,
} from "../domain/explorer";
import { regionFor } from "../domain/geography";
import type { VariantObservation } from "../domain/types";

interface Props {
  bundle: AnalysisBundle;
  chromosome: string;
  /** Visible window (0-based). Rows are scoped to this window. */
  viewStart: number;
  viewEnd: number;
  /** When set, rows for this region are highlighted. */
  selected: SelectedRegion | null;
  onSelectVariant: (v: VariantObservation) => void;
  onSelectRegion: (r: SelectedRegion) => void;
}

const STATUS_CLS: Record<string, string> = {
  observed: "good",
  imputed: "warn",
  not_assayed: "warn",
  no_call: "warn",
  excluded: "bad",
};

/**
 * Linked data table — the accessible, text/keyboard companion to the
 * chromosome track and lollipop chart. Every curated variant in view is a row
 * with its position, status, and locus ancestry stated as text (no color-only
 * encoding). Clicking a row selects that variant/region, keeping the table and
 * the visuals in sync. Rows overlapping the current selection are highlighted.
 */
export function VariantTable({
  bundle,
  chromosome,
  viewStart,
  viewEnd,
  selected,
  onSelectVariant,
}: Props) {
  const rows = useMemo(() => {
    const inWindow = variantsIn(bundle.variants, chromosome, viewStart, viewEnd)
      .filter((v) => !isCoverageMarker(v))
      .sort((a, b) => a.position_0based - b.position_0based);

    return inWindow.map((v) => {
      // Gene (if the variant sits in a curated gene).
      const gene = bundle.genes.find(
        (g) =>
          g.chromosome === v.chromosome &&
          v.position_0based >= g.start_0based &&
          v.position_0based < g.end_0based_exclusive,
      );
      // Evidence classification for this variant (first matching row).
      const ev = bundle.evidence.find((e) => e.variant_key === v.variant_key);
      // Locus ancestry per copy, as text.
      const segs = bundle.segments.filter(
        (s) =>
          s.chromosome === v.chromosome &&
          s.start_0based <= v.position_0based &&
          v.position_0based < s.end_0based_exclusive,
      );
      const ancByCopy = ([1, 2] as const).map((c) => {
        const seg = segs.find((s) => s.copy_index === c);
        return seg
          ? `${regionFor(seg.ancestry_label).name}${seg.assignment_status !== "assigned" ? " (uncertain)" : ""}`
          : "—";
      });
      return { v, gene: gene?.gene ?? "—", classification: ev?.classification ?? "—", ancByCopy };
    });
  }, [bundle, chromosome, viewStart, viewEnd]);

  if (rows.length === 0) {
    return (
      <p className="subtitle">
        No curated variants in view. (Assayed coverage markers are omitted from
        this table; absence here is not a negative result.)
      </p>
    );
  }

  const isSelected = (v: VariantObservation) =>
    selected &&
    selected.chromosome === v.chromosome &&
    v.position_0based >= selected.start_0based &&
    v.position_0based < selected.end_0based_exclusive;

  return (
    <table className="variant-data-table" aria-label="Variants in view">
      <caption className="sr-caption">
        Variants currently in view, with position, measurement status,
        classification, and inferred local ancestry on each chromosome copy.
      </caption>
      <thead>
        <tr>
          <th scope="col">Variant</th>
          <th scope="col">Gene</th>
          <th scope="col">Position (1-based)</th>
          <th scope="col">Status</th>
          <th scope="col">Classification</th>
          <th scope="col">Copy 1 ancestry</th>
          <th scope="col">Copy 2 ancestry</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ v, gene, classification, ancByCopy }) => (
          <tr
            key={v.variant_key}
            className={isSelected(v) ? "selected" : undefined}
            tabIndex={0}
            onClick={() => onSelectVariant(v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectVariant(v);
              }
            }}
          >
            <th scope="row">{v.rsid ?? v.variant_key}</th>
            <td>{gene}</td>
            <td className="num">
              chr{v.chromosome}:{toDisplayPosition(v.position_0based).toLocaleString()}
            </td>
            <td>
              <span className={`badge ${STATUS_CLS[v.measurement_status] ?? ""}`}>
                {v.measurement_status}
              </span>
            </td>
            <td>{classification}</td>
            <td>{ancByCopy[0]}</td>
            <td>{ancByCopy[1]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
