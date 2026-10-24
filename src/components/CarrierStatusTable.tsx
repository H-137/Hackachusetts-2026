import { useMemo } from "react";
import type { AnalysisBundle } from "../domain/explorer";
import { carrierStatuses, type CarrierStatus } from "../domain/clinical";

interface Props {
  bundle: AnalysisBundle;
  /** Limit to one condition (Conditions tab) or show all (not used in patient view). */
  condition?: string;
}

const ZYG_BADGE: Record<string, { text: string; cls: string }> = {
  homozygous: { text: "2 copies", cls: "bad" },
  heterozygous: { text: "1 copy", cls: "warn" },
  absent: { text: "0 copies", cls: "good" },
  indeterminate: { text: "not assayed", cls: "" },
};

/**
 * Per-locus carrier status for clinicians: the clinical-allele copy count and
 * zygosity for each curated variant, with the "consider/confirm" interpretation.
 * This is the most actionable triage figure and is derived from observed facts.
 */
export function CarrierStatusTable({ bundle, condition }: Props) {
  const rows = useMemo(() => {
    const all = carrierStatuses(bundle);
    return condition ? all.filter((r) => r.condition === condition) : all;
  }, [bundle, condition]);

  if (rows.length === 0) {
    return <p className="subtitle">No curated loci for this selection.</p>;
  }

  return (
    <div className="carrier-table">
      {rows.map((r) => (
        <CarrierRow key={r.variant_key + r.condition} r={r} />
      ))}
    </div>
  );
}

function CarrierRow({ r }: { r: CarrierStatus }) {
  const zyg = ZYG_BADGE[r.zygosity] ?? ZYG_BADGE.indeterminate!;
  return (
    <div className="carrier-row">
      <div className="carrier-head">
        <strong>{r.rsid ?? r.variant_key}</strong>
        {r.gene && <span className="subtitle"> · {r.gene}</span>}
        <span className={`badge ${zyg.cls}`}>{zyg.text}</span>
        {!r.assayed && <span className="badge">not assayed</span>}
        {r.conflicting && (
          <span className="badge bad">conflicting interpretation</span>
        )}
      </div>
      <div className="carrier-interp">{r.interpretation}</div>
      <div className="carrier-meta subtitle">
        {r.classification && <>Classification: {r.classification}. </>}
        {r.review_status && <>Review: {r.review_status}. </>}
        {r.inheritance && <>Inheritance: {r.inheritance}.</>}
      </div>
    </div>
  );
}
