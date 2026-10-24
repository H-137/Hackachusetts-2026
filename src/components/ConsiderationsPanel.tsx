import { useMemo } from "react";
import type { AnalysisBundle } from "../domain/explorer";
import { considerations } from "../domain/clinical";

interface Props {
  bundle: AnalysisBundle;
  /** Deep-link into the Conditions tab for a condition. */
  onOpenCondition: (condition: string) => void;
}

const TIER_LABEL: Record<number, { text: string; cls: string }> = {
  3: { text: "Observed", cls: "bad" },
  2: { text: "Coverage gap", cls: "warn" },
  1: { text: "Context", cls: "" },
};

/**
 * Suggested considerations (clinician triage). Each row is finding → suggested
 * action, sorted by actionability (not risk magnitude). Built only from observed
 * facts in the bundle; "consider"/"confirm" language only, never a diagnosis.
 */
export function ConsiderationsPanel({ bundle, onOpenCondition }: Props) {
  const items = useMemo(() => considerations(bundle), [bundle]);

  return (
    <section className="considerations" aria-label="Suggested considerations">
      <div className="cons-head">
        <h3>Suggested considerations</h3>
        <span className="subtitle">
          Triage only · sorted by actionability · not diagnostic
        </span>
      </div>

      {items.length === 0 ? (
        <p className="subtitle">
          No observed curated findings or coverage flags for this sample. This is
          not a clean bill of health — a consumer array measures only selected
          positions.
        </p>
      ) : (
        <ul className="cons-list">
          {items.map((it, i) => {
            const tier = TIER_LABEL[it.actionability] ?? TIER_LABEL[1]!;
            return (
              <li key={i} className="cons-item">
                <span className={`badge ${tier.cls}`}>{tier.text}</span>
                <div className="cons-body">
                  <div className="cons-finding">{it.finding}</div>
                  <div className="cons-action">→ {it.action}</div>
                  <button
                    className="linklike"
                    onClick={() => onOpenCondition(it.condition)}
                  >
                    View {it.condition}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="cons-foot subtitle">
        Guideline citations (e.g. NCCN/USPSTF) are intentionally not shown: this
        synthetic prototype has no sourced, versioned guideline mapping. Actions
        are generic triage prompts, not recommendations.
      </p>
    </section>
  );
}
