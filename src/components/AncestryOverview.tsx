import { useMemo } from "react";
import type { Role } from "../App";
import type { AnalysisBundle } from "../domain/explorer";
import { regionFor } from "../domain/geography";
import { ConsiderationsPanel } from "./ConsiderationsPanel";
import { CoveragePanel } from "./CoveragePanel";

interface Props {
  bundle: AnalysisBundle;
  role: Role;
  onOpenCondition: (condition: string) => void;
}

/**
 * Overview, role-aware.
 *  - Clinician (default): triage-first. Suggested considerations on top, a
 *    coverage badge, ancestry composition with an assignment-confidence audit.
 *  - Patient: a simplified, plain-language summary. No raw tables or provenance.
 */
export function AncestryOverview({ bundle, role, onOpenCondition }: Props) {
  const composition = useMemo(() => {
    const bpByLabel = new Map<string, number>();
    let total = 0;
    for (const s of bundle.segments) {
      const bp = s.end_0based_exclusive - s.start_0based;
      bpByLabel.set(s.ancestry_label, (bpByLabel.get(s.ancestry_label) ?? 0) + bp);
      total += bp;
    }
    return Array.from(bpByLabel.entries())
      .filter(([label]) => label !== "UNKNOWN")
      .map(([label, bp]) => ({
        label,
        name: regionFor(label).name,
        color: regionFor(label).color,
        fraction: total > 0 ? bp / total : 0,
      }))
      .sort((a, b) => b.fraction - a.fraction);
  }, [bundle.segments]);

  const confidence = useMemo(() => {
    const counts = { assigned: 0, uncertain: 0, unknown: 0 };
    for (const s of bundle.segments) counts[s.assignment_status]++;
    return counts;
  }, [bundle.segments]);

  const compositionBlock = (
    <>
      <h3>Inferred ancestry composition</h3>
      <p className="subtitle">
        Share of inferred ancestry across both chromosome copies, by base pairs.
        Local ancestry is a model estimate relative to selected reference
        populations, not an intrinsic ethnicity.
      </p>
      <div className="composition-bar" role="img" aria-label="Ancestry composition bar">
        {composition.map((c) => (
          <div
            key={c.label}
            className="composition-seg"
            style={{ width: `${(c.fraction * 100).toFixed(2)}%`, background: c.color }}
            title={`${c.name}: ${(c.fraction * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <ul className="legend">
        {composition.map((c) => (
          <li key={c.label}>
            <span className="seg-dot" style={{ background: c.color }} />
            {c.name} {(c.fraction * 100).toFixed(1)}%
          </li>
        ))}
      </ul>
    </>
  );

  // ---------------- Patient view ----------------
  if (role === "patient") {
    return (
      <section aria-label="Overview (patient view)" className="overview patient">
        <div className="sample-head">
          <h2>
            Your ancestry overview{" "}
            <span className="badge warn">
              {bundle.sample.synthetic ? "Example data" : "Your data"}
            </span>
          </h2>
          <p className="subtitle">
            A plain-language summary. This is not a medical result.
          </p>
        </div>

        {compositionBlock}

        <div className="disclaimer" role="note">
          This tool gives ancestry context from a consumer DNA test. It does not
          diagnose anything and does not tell you whether you have or will get a
          condition. If anything here raises a question, discuss it with your
          healthcare provider or a genetic counselor — they can arrange proper
          testing if it is appropriate for you.
        </div>

        <p className="subtitle">
          Switch to the Chromosomes tab to explore the interactive globe and
          chromosome painting.
        </p>
      </section>
    );
  }

  // ---------------- Clinician view (default) ----------------
  return (
    <section aria-label="Overview (clinician view)" className="overview">
      <div className="sample-head">
        <h2>
          Overview{" "}
          <span className="badge warn">
            {bundle.sample.synthetic ? "Synthetic demo" : "Local analysis"}
          </span>
        </h2>
        <p className="subtitle">
          sample {bundle.sample.sample_id} · build {bundle.sample.genome_build} ·
          status {bundle.sample.processing_status} ·{" "}
          {bundle.sample.quality_summary.autosomal_records.toLocaleString()}{" "}
          analysis-ready autosomal SNPs
        </p>
      </div>

      {/* Triage first. */}
      <ConsiderationsPanel bundle={bundle} onOpenCondition={onOpenCondition} />

      <div className="overview-row">
        <CoveragePanel
          bundle={bundle}
          compact
          onOpenCoverage={() => onOpenCondition(bundle.conditions[0]?.condition ?? "")}
        />
        <div className="confidence-badge">
          <span className="subtitle">Ancestry assignment</span>
          <div>
            <span className="badge good">{confidence.assigned} assigned</span>{" "}
            <span className="badge warn">{confidence.uncertain} uncertain</span>{" "}
            <span className="badge">{confidence.unknown} unknown</span>
          </div>
        </div>
      </div>

      {compositionBlock}
    </section>
  );
}
