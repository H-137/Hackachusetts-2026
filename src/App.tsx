import { useCallback, useState } from "react";
import { parseAncestryDna } from "./domain/parser";
import { loadSyntheticDemo } from "./adapters/demo";
import { loadAnalysisBundle } from "./adapters/analysisBundle";
import type { AnalysisBundle } from "./domain/explorer";
import type { ParseResult, Sample } from "./domain/types";
import { UploadScreen } from "./components/UploadScreen";
import { QualityReport } from "./components/QualityReport";
import { Explorer } from "./components/Explorer";

type View =
  | { kind: "landing" }
  | { kind: "upload" }
  | { kind: "report"; parse: ParseResult; sample: Sample }
  | { kind: "explorer"; bundle: AnalysisBundle };

function buildUploadSample(parse: ParseResult): Sample {
  return {
    sample_id: "local-upload",
    source_type: "ancestrydna_upload",
    genome_build: parse.metadata.normalized_build,
    synthetic: false,
    processing_status: parse.quality_summary.sufficient_for_inference
      ? "parsed"
      : "insufficient_data",
    quality_summary: parse.quality_summary,
    provenance: {
      source_type: "ancestrydna_upload",
      accessed_at: new Date().toISOString(),
      notes:
        "Parsed locally in the browser. Raw upload is not persisted or transmitted.",
    },
    source_metadata: parse.metadata,
  };
}

export function App() {
  const [view, setView] = useState<View>({ kind: "landing" });

  const handleParsed = useCallback((text: string) => {
    const parse = parseAncestryDna(text);
    setView({ kind: "report", parse, sample: buildUploadSample(parse) });
  }, []);

  const handleDemo = useCallback(() => {
    const { parse, sample } = loadSyntheticDemo();
    setView({ kind: "report", parse, sample });
  }, []);

  const handleExplorer = useCallback(() => {
    setView({ kind: "explorer", bundle: loadAnalysisBundle() });
  }, []);

  const reset = useCallback(() => setView({ kind: "landing" }), []);

  return (
    <main className="app">
      <h1>Ancestry-Aware Variant Explorer</h1>
      <p className="subtitle">
        Research prototype — chromosome-level ancestry, variant evidence, and
        coverage, with visible uncertainty
      </p>

      <div className="disclaimer" role="note">
        This is a research prototype using synthetic data by default. It is not a
        diagnostic tool and is not a replacement for clinical genetic testing.
        Ancestry does not establish whether someone carries a pathogenic variant,
        and an ancestry estimate cannot rule one out.
      </div>

      {view.kind === "landing" && (
        <section className="choices" aria-label="Choose a data source">
          <div className="card">
            <h3>Explore synthetic analysis</h3>
            <p className="subtitle">
              A precomputed synthetic bundle (ancestry, variants, evidence,
              scores) rendered in the interactive explorer. Fully offline.
            </p>
            <button onClick={handleExplorer}>Open explorer</button>
          </div>
          <div className="card">
            <h3>Upload AncestryDNA text</h3>
            <p className="subtitle">
              Parsed locally in your browser. The file is not uploaded, stored,
              or transmitted.
            </p>
            <button className="secondary" onClick={() => setView({ kind: "upload" })}>
              Upload a file
            </button>
          </div>
          <div className="card">
            <h3>Parse-only demo</h3>
            <p className="subtitle">
              A small synthetic fixture run through the parser and quality
              report (Step 1).
            </p>
            <button className="secondary" onClick={handleDemo}>
              Parse demo
            </button>
          </div>
        </section>
      )}

      {view.kind === "upload" && (
        <UploadScreen onParsed={handleParsed} onCancel={reset} />
      )}

      {view.kind === "report" && (
        <QualityReport parse={view.parse} sample={view.sample} onReset={reset} />
      )}

      {view.kind === "explorer" && (
        <Explorer bundle={view.bundle} onReset={reset} />
      )}
    </main>
  );
}
