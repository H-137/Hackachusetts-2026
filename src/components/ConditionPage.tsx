import type { AnalysisBundle } from "../domain/explorer";
import { regionFor } from "../domain/geography";
import type { VariantObservation } from "../domain/types";

interface Props {
  bundle: AnalysisBundle;
  condition: string;
  onSelectVariant: (v: VariantObservation) => void;
}

/**
 * Condition page (Section 5): the curated variants actually examined for this
 * condition AND the relevant variants that are NOT in the dataset. Absence is
 * explicitly framed as "not measured", never as a reassuring negative.
 */
export function ConditionPage({ bundle, condition, onSelectVariant }: Props) {
  const man = bundle.conditions.find((c) => c.condition === condition);
  if (!man) return <p className="subtitle">Condition not found.</p>;

  const examined = man.examined_variant_keys
    .map((k) => bundle.variants.find((v) => v.variant_key === k))
    .filter((v): v is VariantObservation => Boolean(v));

  const examinedButMissingFromData = man.examined_variant_keys.filter(
    (k) => !bundle.variants.some((v) => v.variant_key === k),
  );

  return (
    <section aria-label={`Condition: ${condition}`} className="condition-page">
      <h3>{man.condition}</h3>
      <p className="subtitle">
        {man.gene} · {man.inheritance}
      </p>

      <p>{man.rationale}</p>

      <h4>Elevated-frequency reference groups (population context)</h4>
      <ul className="tight">
        {man.elevated_frequency_groups.map((g) => (
          <li key={g}>
            <span
              className="seg-dot"
              style={{ background: regionFor(g).color }}
            />
            {regionFor(g).name}
          </li>
        ))}
      </ul>
      <p className="subtitle">
        Elevated population frequency is not a per-person risk. It is a reason a
        clinician might consider targeted testing, independent of this tool.
      </p>

      <h4>Curated variants examined ({examined.length})</h4>
      {examined.length === 0 && examinedButMissingFromData.length === 0 && (
        <p className="subtitle">
          No specific SNP-array variant is curated for this condition. The
          clinical standard for this condition is not represented by consumer
          SNP genotypes.
        </p>
      )}
      <ul className="tight">
        {examined.map((v) => (
          <li key={v.variant_key}>
            <button className="linklike" onClick={() => onSelectVariant(v)}>
              {v.rsid ?? v.variant_key}
            </button>{" "}
            <span className="subtitle">· {v.measurement_status}</span>
          </li>
        ))}
        {examinedButMissingFromData.map((k) => (
          <li key={k}>
            <span className="subtitle">
              {k} — curated for this condition but not present in this dataset
            </span>
          </li>
        ))}
      </ul>

      <h4>Relevant variants NOT measured</h4>
      <div className="disclaimer" role="note">
        <ul className="tight">
          {man.not_measured.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
        Absence of these from the dataset does not rule out a pathogenic variant.
      </div>

      <h4>Screening note (clinician + patient)</h4>
      <p>{man.screening_note}</p>

      <div className="sources">
        Sources:{" "}
        {man.source_urls.map((s, i) => (
          <span key={s}>
            {i > 0 && " · "}
            <a href={s} target="_blank" rel="noopener noreferrer">
              {hostOf(s)}
            </a>
          </span>
        ))}
      </div>
    </section>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
