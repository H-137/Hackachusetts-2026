import type { ParseResult, Sample } from "../domain/types";

interface Props {
  parse: ParseResult;
  sample: Sample;
  onReset: () => void;
}

/**
 * Sample-quality and coverage overview (demo workflow step 3). Displays only
 * aggregate counts, metadata, and line-numbered error codes. It never renders
 * any allele value.
 */
export function QualityReport({ parse, sample, onReset }: Props) {
  const q = parse.quality_summary;
  const m = parse.metadata;

  const sufficiency = q.sufficient_for_inference ? (
    <span className="badge good">Sufficient for inference path</span>
  ) : (
    <span className="badge warn">Insufficient for inference</span>
  );

  const excludedRows = Object.entries(q.excluded_by_chromosome).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <section aria-label="Sample quality report">
      <h2>
        Quality report{" "}
        {sample.synthetic ? (
          <span className="badge warn">Synthetic demo</span>
        ) : (
          <span className="badge good">Local upload</span>
        )}
      </h2>

      <p className="subtitle">
        Build {m.declared_build || "unknown"} (
        {m.normalized_build}) · strand {m.strand || "?"} · status{" "}
        {sample.processing_status}
      </p>

      <p>{sufficiency}</p>

      {!q.sufficient_for_inference && (
        <div className="disclaimer" role="note">
          This file does not contain enough analysis-ready autosomal SNPs to
          support phasing, ancestry inference, or disease scoring. It parsed
          correctly, but downstream results would be fabricated and are therefore
          withheld. Parser examples and tiny files are expected to land here.
        </div>
      )}

      <table className="quality">
        <tbody>
          <Row label="Total data records" value={q.total_records} />
          <Row label="Parsed records" value={q.parsed_records} />
          <Row label="Analysis-ready autosomal SNPs" value={q.autosomal_records} />
          <Row label="No-call records" value={q.no_call_count} />
          <Row label="Unsupported indel records" value={q.unsupported_indel_count} />
          <Row label="Exact duplicates collapsed" value={q.duplicate_exact_count} />
          <Row
            label="Conflicting duplicates excluded"
            value={q.duplicate_conflicting_count}
          />
          <Row label="Line-level errors" value={q.error_count} />
        </tbody>
      </table>

      {excludedRows.length > 0 && (
        <>
          <h3>Excluded non-autosomal records</h3>
          <table className="quality">
            <thead>
              <tr>
                <th>Chromosome</th>
                <th>Reason</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {excludedRows.map(([label, count]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>Non-autosomal (outside the first autosomal implementation)</td>
                  <td className="num">{count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {parse.errors.length > 0 && (
        <>
          <h3>First parse issues</h3>
          <div className="errors">
            {parse.errors.slice(0, 50).map((e, idx) => (
              <div key={idx}>
                line {e.line_number} [{e.code}] {e.message}
              </div>
            ))}
            {parse.errors.length > 50 && (
              <div>… {parse.errors.length - 50} more</div>
            )}
          </div>
        </>
      )}

      <details className="methods">
        <summary>Methods and provenance</summary>
        <ul>
          <li>Source format: {m.source_format}</li>
          <li>Array version: {m.array_version ?? "—"}</li>
          <li>Converter version: {m.converter_version ?? "—"}</li>
          <li>Declared build: {m.declared_build || "—"}</li>
          <li>Generated at: {m.generated_at ?? "—"}</li>
          <li>Coordinate convention: internal 0-based half-open</li>
          <li>Provenance: {sample.provenance.notes}</li>
        </ul>
        {m.usage_notice && (
          <p className="subtitle">Source notice: {m.usage_notice}</p>
        )}
      </details>

      <div className="toolbar">
        <button className="secondary" onClick={onReset}>
          Reset and clear data
        </button>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{value.toLocaleString()}</td>
    </tr>
  );
}
