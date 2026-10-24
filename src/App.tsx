import { useCallback, useRef, useState } from "react";
import { parseAncestryDna } from "./domain/parser";
import { loadSyntheticDemo } from "./adapters/demo";
import { loadAnalysisBundle } from "./adapters/analysisBundle";
import type { AnalysisBundle } from "./domain/explorer";
import type { ParseResult, Sample } from "./domain/types";
import { downloadReportHtml, printReport } from "./domain/report";
import { UploadScreen } from "./components/UploadScreen";
import { QualityReport } from "./components/QualityReport";
import { Explorer } from "./components/Explorer";
import { ErrorBoundary } from "./components/ErrorBoundary";


export type Role = "clinician" | "patient";

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
  const bundleInput = useRef<HTMLInputElement>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [view, setView] = useState<View>({ kind: "landing" });
  // Clinician-first by default; a simplified patient view is the secondary layer.
  const [role, setRole] = useState<Role>("clinician");

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

  // Load a REAL run bundle produced by the pipeline (make_real_bundle.py). The
  // file is read locally in the browser and never uploaded, stored, or
  // committed. This renders the user's actual ancestry segments and genotypes.
  const handleRealBundle = useCallback((file: File) => {
    setBundleError(null);
    setBundleBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bundle = JSON.parse(String(reader.result)) as AnalysisBundle;
        if (!bundle || typeof bundle !== "object" || !bundle.sample ||
            typeof bundle.sample.sample_id !== "string" || !bundle.sample.quality_summary ||
            !["segments", "variants", "frequencies", "evidence", "genes", "conditions", "scores"]
              .every((key) => Array.isArray((bundle as unknown as Record<string, unknown>)[key]))) {
          throw new Error("Invalid bundle structure");
        }
        setView({ kind: "explorer", bundle });
      } catch {
        setBundleError("Could not open this analysis bundle. Choose a valid real_bundle.json produced by the pipeline.");
      } finally {
        setBundleBusy(false);
      }
    };
    reader.onerror = () => {
      setBundleBusy(false);
      setBundleError("Could not read the file. Please try again.");
    };
    reader.readAsText(file);
  }, []);

  const reset = useCallback(() => {
    setBundleError(null);
    setView({ kind: "landing" });
  }, []);

  return (
    <>
      <main className="app">
      <div className="app-header">
        <div>
          <h1>Ancestry-Aware Variant Explorer</h1>
          <p className="subtitle">
            Research prototype — triage context for confirmatory testing,
            referral, or screening. Not diagnostic.
          </p>
        </div>
        {view.kind === "explorer" && (
          <div className="role-toggle" role="radiogroup" aria-label="View mode">
            <button
              role="radio"
              aria-checked={role === "clinician"}
              className={role === "clinician" ? "role-btn active" : "role-btn"}
              onClick={() => setRole("clinician")}
            >
              Clinician
            </button>
            <button
              role="radio"
              aria-checked={role === "patient"}
              className={role === "patient" ? "role-btn active" : "role-btn"}
              onClick={() => setRole("patient")}
            >
              Patient
            </button>
          </div>
        )}
      </div>

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
            <h3>Open your real run</h3>
            <p className="subtitle">
              Load a bundle produced by the pipeline (real_bundle.json) to
              visualize your actual local-ancestry segments and genotypes. Read
              locally in your browser; never uploaded or stored.
            </p>
            <button className="file-button" disabled={bundleBusy} onClick={() => bundleInput.current?.click()}>
              {bundleBusy ? "Reading bundle…" : "Open real_bundle.json"}
            </button>
              <input
                ref={bundleInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) handleRealBundle(f);
                }}
              />
            {bundleError && <p role="alert" className="badge bad">{bundleError}</p>}
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
          <ErrorBoundary onReset={reset}>
            <Explorer
              bundle={view.bundle}
              onDownloadHtml={() => downloadReportHtml(view.bundle)}
              onPrintPdf={() => printReport(view.bundle)}
              role={role}
              onReset={reset}
            />
          </ErrorBoundary>
        )}
      </main>
    </>
  );
}
