/**
 * Research report generator (plan Step 7).
 *
 * Produces a comprehensive-yet-concise research report from the AnalysisBundle,
 * following a logical path: provenance → findings summary → ancestry →
 * per-variant findings/annotations → coverage → score status → uncertainty →
 * methods → source versions.
 *
 * Every value traces to the bundle or a documented derivation (clinical.ts /
 * watchlist.ts / methods.ts). Nothing is fabricated: no percentiles, no absolute
 * risk, no guideline citations. The report is explicitly a RESEARCH document,
 * not a diagnostic or clinical report, and preserves uncertainty throughout.
 *
 * Output is Markdown — portable, readable, diff-able, and easy to convert to PDF
 * downstream. No raw genetic data beyond the genotypes already shown in the UI.
 */

import type { AnalysisBundle } from "./explorer";
import { chromLength, formatBp, toDisplayPosition } from "./explorer";
import {
  carrierStatuses,
  coverageSummary,
  pgsCoverage,
} from "./clinical";
import {
  buildWatchlist,
  observedFromBundle,
  summarizeWatchlist,
} from "./watchlist";
import { WATCHLIST_CATALOG, processedChromosomes } from "./watchlistCatalog";
import { regionFor, superPopulationFor } from "./geography";
import { METHOD_STEPS } from "./methods";

function h(level: number, text: string): string {
  return `${"#".repeat(level)} ${text}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Inferred ancestry composition rolled up to broad regions (by span). */
function compositionLines(bundle: AnalysisBundle): string[] {
  const bp = new Map<string, number>();
  const conf = { assigned: 0, uncertain: 0, unknown: 0 };
  let total = 0;
  for (const s of bundle.segments) {
    conf[s.assignment_status]++;
    if (s.ancestry_label === "UNKNOWN") continue;
    const span = s.end_0based_exclusive - s.start_0based;
    bp.set(s.ancestry_label, (bp.get(s.ancestry_label) ?? 0) + span);
    total += span;
  }
  const rows = Array.from(bp.entries())
    .map(([label, v]) => ({
      name: regionFor(label).name,
      sp: superPopulationFor(label),
      pct: total > 0 ? (v / total) * 100 : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .map((r) => `- ${r.name} (${r.sp}): ${r.pct.toFixed(1)}%`);
  rows.push(
    `- Assignment confidence across segments: ${conf.assigned} assigned, ${conf.uncertain} uncertain, ${conf.unknown} unknown.`,
  );
  return rows;
}

/**
 * Build the full report as a Markdown string.
 */
export function generateReport(bundle: AnalysisBundle): string {
  const s = bundle.sample;
  const meta = s.source_metadata;
  const out: string[] = [];

  // --- 1. Header & provenance ---
  out.push(h(1, "Ancestry-Aware Variant Explorer — Research Report"));
  out.push(
    "> **Research prototype. Not a diagnostic report and not medical advice.** " +
      "Ancestry does not establish whether a person carries a pathogenic variant, " +
      "and an ancestry estimate cannot rule one out. All findings require " +
      "confirmatory clinical testing. Values are triage context only.",
  );
  out.push("");
  out.push(`- Report generated: ${nowIso()}`);
  out.push(`- Sample: ${s.sample_id}`);
  out.push(`- Data type: ${s.synthetic ? "SYNTHETIC / demo" : "local analysis"} (${s.source_type})`);
  out.push(`- Genome build: ${s.genome_build}`);
  out.push(`- Processing status: ${s.processing_status}`);
  if (meta) {
    out.push(
      `- Source: ${meta.source_format}, array ${meta.array_version ?? "—"}, ` +
        `converter ${meta.converter_version ?? "—"}, declared build ${meta.declared_build}, ` +
        `strand ${meta.strand}, generated ${meta.generated_at ?? "—"}`,
    );
    if (meta.usage_notice) out.push(`- Source notice: ${meta.usage_notice}`);
  }
  out.push(`- Provenance: ${s.provenance.notes ?? s.provenance.source_type}`);
  out.push("");

  // --- 2. Summary of findings (watchlist top line) ---
  const processed = processedChromosomes(bundle.segments);
  const entries = buildWatchlist(
    WATCHLIST_CATALOG,
    bundle.segments,
    processed,
    observedFromBundle(bundle.variants),
  );
  const sum = summarizeWatchlist(entries, processed);
  out.push(h(2, "1. Summary of findings"));
  out.push(`- Catalog variants evaluated: ${sum.total}`);
  out.push(`- Directly observed findings: ${sum.observed}`);
  out.push(`- Ancestry-supported (attention) entries: ${sum.ancestry_supported}`);
  out.push(`- Strong clinical evidence (ancestry weak/unresolved): ${sum.strong_evidence}`);
  out.push(`- Not assayed by this array: ${sum.not_assayed}`);
  out.push(`- Conditions covered: ${sum.conditions}`);
  out.push(
    `- Chromosomes with local-ancestry processed: ${sum.processed_chromosomes.join(", ") || "none"}`,
  );
  out.push("");

  // --- 3. Ancestry composition ---
  out.push(h(2, "2. Inferred ancestry composition"));
  out.push(
    "Local-ancestry is a model estimate relative to reference populations across " +
      "both chromosome copies, by base pairs. It is not an intrinsic ethnicity.",
  );
  out.push(...compositionLines(bundle));
  out.push("");

  // --- 4. Findings & annotations (per curated variant) ---
  out.push(h(2, "3. Findings and annotations"));
  const carriers = carrierStatuses(bundle);
  if (carriers.length === 0) {
    out.push("No curated variant findings for this sample.");
  } else {
    for (const c of carriers) {
      out.push(h(3, `${c.rsid ?? c.variant_key}${c.gene ? ` — ${c.gene}` : ""}`));
      out.push(`- Condition: ${c.condition}`);
      out.push(`- Measurement status: ${c.measurement_status}`);
      out.push(
        `- Clinical-allele copies: ${c.clinical_allele_copies === null ? "not assayed" : c.clinical_allele_copies} (${c.zygosity})`,
      );
      if (c.classification) out.push(`- Classification: ${c.classification}`);
      if (c.review_status) out.push(`- Review status: ${c.review_status}`);
      if (c.inheritance) out.push(`- Inheritance: ${c.inheritance}`);
      if (c.conflicting) out.push(`- NOTE: conflicting clinical interpretations.`);
      out.push(`- Interpretation: ${c.interpretation}`);
      out.push("");
    }
  }

  // --- 5. Coverage ("what was not tested") ---
  out.push(h(2, "4. Coverage — what was NOT tested"));
  const cov = coverageSummary(bundle);
  out.push(
    `Of ${cov.total} curated variants, ${cov.assayable} are directly assayable by this array.`,
  );
  for (const r of cov.rows) {
    const na = r.not_assayed.length ? ` — not assayed: ${r.not_assayed.join(", ")}` : "";
    out.push(`- ${r.condition} (${r.gene}): ${r.assayable}/${r.total} assayable${na}`);
  }
  out.push(
    "> A negative or not-assayed result does NOT rule out risk. This array types " +
      "only selected positions; confirmatory clinical testing is required to " +
      "establish presence or absence.",
  );
  out.push("");

  // --- 6. Disease-specific score status ---
  out.push(h(2, "5. Disease-specific score status"));
  const pgs = pgsCoverage(bundle.scores);
  if (pgs.length === 0) {
    out.push("No disease-specific score was applicable.");
  } else {
    for (const p of pgs) {
      out.push(`- **${p.condition}** (${p.model_id}): ${p.verdict}`);
      out.push(`  - Limitations: ${p.limitations}`);
    }
  }
  out.push(
    "No percentile or absolute risk is reported: no validated comparison " +
      "distribution or calibrated model is available for this sample.",
  );
  out.push("");

  // --- 7. Uncertainty & limitations ---
  out.push(h(2, "6. Uncertainty and limitations"));
  out.push("- Local-ancestry probabilities are model estimates, not calibrated confidence.");
  out.push("- Uncertain / unknown ancestry segments are not confident calls.");
  out.push("- Population frequency is context, not a per-person risk; missing frequency is not zero.");
  out.push("- A consumer SNP array measures only selected positions; most variation is unmeasured.");
  out.push("- Observed genotypes are not attributed to a specific chromosome copy unless phase is established.");
  if (s.synthetic) {
    out.push("- **This report is built from SYNTHETIC demo data and does not describe a real person.**");
  }
  out.push("");

  // --- 8. Methods ---
  out.push(h(2, "7. Methods"));
  for (const step of METHOD_STEPS) {
    const status = step.status === "implemented" ? "implemented" : "pending real tooling";
    out.push(`- **Step ${step.id}, ${step.title}** (${status}): ${step.summary}`);
  }
  out.push("");

  // --- 9. Source versions ---
  out.push(h(2, "8. Source versions"));
  const freqVersions = Array.from(
    new Set(bundle.frequencies.map((f) => f.dataset_version)),
  );
  const evAccessed = Array.from(
    new Set(bundle.evidence.map((e) => e.accessed_at)),
  );
  out.push(`- Genome build: ${s.genome_build}`);
  for (const v of freqVersions) out.push(`- Frequency dataset: ${v}`);
  out.push(`- Clinical evidence source: ClinVar (accessed ${evAccessed.join(", ") || "—"})`);
  for (const sc of bundle.scores) {
    out.push(`- Score model: ${sc.model_id} ${sc.model_version}`);
  }
  out.push(
    `- Autosomes referenced for track scaling: GRCh37 lengths (e.g. chr1 = ${formatBp(chromLength("1"))}).`,
  );
  out.push("");

  out.push("---");
  out.push(
    `_Generated by Ancestry-Aware Variant Explorer (research prototype). ` +
      `Position ${toDisplayPosition(0)} = 1-based display convention. ` +
      `Not for clinical use._`,
  );

  return out.join("\n");
}

/** Trigger a browser download of the report as a Markdown file. */
export function downloadReport(bundle: AnalysisBundle): void {
  const md = generateReport(bundle);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `ancestry-explorer-report_${bundle.sample.sample_id}_${stamp}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Styled HTML report (colorful, organized, print-friendly). Same traced content
// as the Markdown version — only the presentation differs. Self-contained
// (inline CSS), offline, deterministic. No LLM, no network, no fabrication.
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type Tone = "good" | "warn" | "bad" | "muted";

function badge(text: string, tone: Tone = "muted"): string {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

function statusTone(status: string): Tone {
  if (status === "observed") return "good";
  if (status === "excluded") return "bad";
  return "warn";
}

/** Build the report as a self-contained, styled HTML document string. */
export function generateReportHtml(bundle: AnalysisBundle): string {
  const s = bundle.sample;
  const meta = s.source_metadata;

  const processed = processedChromosomes(bundle.segments);
  const entries = buildWatchlist(
    WATCHLIST_CATALOG,
    bundle.segments,
    processed,
    observedFromBundle(bundle.variants),
  );
  const sum = summarizeWatchlist(entries, processed);
  const carriers = carrierStatuses(bundle);
  const cov = coverageSummary(bundle);
  const pgs = pgsCoverage(bundle.scores);

  // Ancestry composition (by span, broad regions).
  const bp = new Map<string, number>();
  const conf = { assigned: 0, uncertain: 0, unknown: 0 };
  let total = 0;
  for (const seg of bundle.segments) {
    conf[seg.assignment_status]++;
    if (seg.ancestry_label === "UNKNOWN") continue;
    const span = seg.end_0based_exclusive - seg.start_0based;
    bp.set(seg.ancestry_label, (bp.get(seg.ancestry_label) ?? 0) + span);
    total += span;
  }
  const comp = Array.from(bp.entries())
    .map(([label, v]) => ({
      label,
      name: regionFor(label).name,
      color: regionFor(label).color,
      pct: total > 0 ? (v / total) * 100 : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  const freqVersions = Array.from(
    new Set(bundle.frequencies.map((f) => f.dataset_version)),
  );
  const evAccessed = Array.from(new Set(bundle.evidence.map((e) => e.accessed_at)));

  const compBar = comp
    .map(
      (c) =>
        `<div class="seg" style="width:${c.pct.toFixed(2)}%;background:${c.color}" title="${esc(c.name)}: ${c.pct.toFixed(1)}%"></div>`,
    )
    .join("");
  const compLegend = comp
    .map(
      (c) =>
        `<li><span class="dot" style="background:${c.color}"></span>${esc(c.name)} ${c.pct.toFixed(1)}%</li>`,
    )
    .join("");

  const summaryCards = [
    { n: sum.observed, label: "observed findings", tone: sum.observed > 0 ? "bad" : "good" },
    { n: sum.ancestry_supported, label: "ancestry-supported", tone: sum.ancestry_supported > 0 ? "warn" : "muted" },
    { n: sum.not_assayed, label: "not assayed (gaps)", tone: sum.not_assayed > 0 ? "warn" : "muted" },
    { n: `${cov.assayable}/${cov.total}`, label: "variants assayable", tone: "muted" },
  ]
    .map(
      (c) =>
        `<div class="card"><div class="card-n ${c.tone}">${esc(String(c.n))}</div><div class="card-l">${esc(c.label)}</div></div>`,
    )
    .join("");

  const findingRows = carriers
    .map((c) => {
      const copies =
        c.clinical_allele_copies === null
          ? badge("not assayed", "warn")
          : badge(`${c.clinical_allele_copies} copy(ies) · ${c.zygosity}`, c.clinical_allele_copies > 0 ? "bad" : "good");
      return `<tr>
        <th scope="row">${esc(c.rsid ?? c.variant_key)}</th>
        <td>${esc(c.gene ?? "—")}</td>
        <td>${esc(c.condition)}</td>
        <td>${badge(c.measurement_status, statusTone(c.measurement_status))}</td>
        <td>${copies}</td>
        <td>${esc(c.classification ?? "—")}${c.conflicting ? " " + badge("conflicting", "bad") : ""}</td>
      </tr>`;
    })
    .join("");

  const coverageRows = cov.rows
    .map(
      (r) => `<tr>
        <th scope="row">${esc(r.condition)}</th>
        <td>${esc(r.gene)}</td>
        <td>${r.assayable}/${r.total}</td>
        <td>${r.not_assayed.length ? esc(r.not_assayed.join(", ")) : "—"}</td>
      </tr>`,
    )
    .join("");

  const scoreRows = pgs.length
    ? pgs
        .map(
          (p) =>
            `<li><strong>${esc(p.condition)}</strong> (${esc(p.model_id)}) ${p.scorable ? badge(`${p.coverage_pct}% markers`, "warn") : badge("unscorable", "bad")}<div class="muted-text">${esc(p.verdict)}</div></li>`,
        )
        .join("")
    : "<li>No disease-specific score was applicable.</li>";

  const methodRows = METHOD_STEPS.map(
    (step) =>
      `<li><strong>Step ${step.id} — ${esc(step.title)}</strong> ${step.status === "implemented" ? badge("implemented", "good") : badge("pending real tooling", "warn")}<div class="muted-text">${esc(step.summary)}</div></li>`,
  ).join("");

  const sourceItems = [
    `Genome build: <strong>${esc(s.genome_build)}</strong>`,
    ...freqVersions.map((v) => `Frequency dataset: ${esc(v)}`),
    `Clinical evidence: ClinVar (accessed ${esc(evAccessed.join(", ") || "—")})`,
    ...bundle.scores.map((sc) => `Score model: ${esc(sc.model_id)} ${esc(sc.model_version)}`),
  ]
    .map((x) => `<li>${x}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ancestry-Aware Variant Explorer — Research Report (${esc(s.sample_id)})</title>
<style>
  :root{
    --bg:#ffffff;--ink:#1a2230;--muted:#5b6b7c;--line:#e2e8f0;--panel:#f6f8fb;
    --accent:#2f6fb0;--good:#2e7d4f;--warn:#b7791f;--bad:#c0392b;
  }
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);margin:0;line-height:1.5;}
  .page{max-width:900px;margin:0 auto;padding:2.5rem 2rem 4rem;}
  h1{font-size:1.6rem;margin:0 0 .25rem;}
  h2{font-size:1.15rem;margin:2rem 0 .6rem;padding-bottom:.3rem;border-bottom:2px solid var(--accent);color:var(--accent);}
  h3{font-size:1rem;margin:1rem 0 .3rem;}
  .sub{color:var(--muted);font-size:.9rem;}
  .banner{background:#fff7ed;border:1px solid #f0c99a;border-left:4px solid var(--warn);border-radius:8px;padding:.8rem 1rem;margin:1rem 0;font-size:.9rem;color:#7a5410;}
  .synthetic{background:#eef2ff;border-color:#c7d2fe;border-left-color:var(--accent);color:#2b3a67;}
  .meta{list-style:none;padding:0;margin:0;font-size:.9rem;color:var(--muted);}
  .meta li{margin:.15rem 0;}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin:.8rem 0;}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:.7rem .9rem;}
  .card-n{font-size:1.5rem;font-weight:800;}
  .card-l{font-size:.78rem;color:var(--muted);}
  .card-n.good{color:var(--good)}.card-n.warn{color:var(--warn)}.card-n.bad{color:var(--bad)}.card-n.muted{color:var(--ink)}
  .comp-bar{display:flex;height:22px;border-radius:6px;overflow:hidden;border:1px solid var(--line);}
  .comp-bar .seg{height:100%;}
  ul.legend{list-style:none;display:flex;flex-wrap:wrap;gap:.4rem 1rem;padding:0;margin:.5rem 0;font-size:.85rem;color:var(--muted);}
  ul.legend li{display:inline-flex;align-items:center;gap:.35rem;}
  .dot{width:11px;height:11px;border-radius:3px;display:inline-block;}
  table{width:100%;border-collapse:collapse;font-size:.88rem;margin:.4rem 0;}
  th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid var(--line);vertical-align:top;}
  thead th{background:var(--panel);color:var(--muted);font-size:.76rem;text-transform:uppercase;letter-spacing:.04em;}
  .badge{display:inline-block;padding:.1rem .5rem;border-radius:999px;font-size:.76rem;font-weight:700;}
  .badge.good{background:#e6f4ec;color:var(--good);}
  .badge.warn{background:#fdf0da;color:var(--warn);}
  .badge.bad{background:#fbe6e3;color:var(--bad);}
  .badge.muted{background:#eef2f6;color:var(--muted);}
  .muted-text{color:var(--muted);font-size:.84rem;}
  ul.plain{padding-left:1.1rem;}
  ul.plain li{margin:.25rem 0;}
  .footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.8rem;color:var(--muted);}
  @media print{body{background:#fff}.page{padding:0}h2{break-after:avoid}table,li{break-inside:avoid}}
</style>
</head>
<body>
<div class="page">
  <h1>Ancestry-Aware Variant Explorer — Research Report</h1>
  <p class="sub">Generated ${esc(nowIso())} · Sample ${esc(s.sample_id)} · Build ${esc(s.genome_build)}</p>

  <div class="banner">
    <strong>Research prototype. Not a diagnostic report and not medical advice.</strong>
    Ancestry does not establish whether a person carries a pathogenic variant, and an
    ancestry estimate cannot rule one out. All findings require confirmatory clinical
    testing. Values are triage context only.
  </div>
  ${s.synthetic ? `<div class="banner synthetic"><strong>Synthetic / demo data.</strong> This report does not describe a real person.</div>` : ""}

  <ul class="meta">
    <li>Data type: ${esc(s.synthetic ? "synthetic / demo" : "local analysis")} (${esc(s.source_type)}) · status ${esc(s.processing_status)}</li>
    ${meta ? `<li>Source: ${esc(meta.source_format)}, array ${esc(meta.array_version ?? "—")}, build ${esc(meta.declared_build)}, strand ${esc(meta.strand)}</li>` : ""}
    ${meta?.usage_notice ? `<li>Source notice: ${esc(meta.usage_notice)}</li>` : ""}
    <li>Provenance: ${esc(s.provenance.notes ?? s.provenance.source_type)}</li>
  </ul>

  <h2>1. Summary of findings</h2>
  <div class="cards">${summaryCards}</div>
  <p class="sub">${sum.conditions} conditions · local ancestry processed on chr ${esc(sum.processed_chromosomes.join(", ") || "none")}.</p>

  <h2>2. Inferred ancestry composition</h2>
  <p class="sub">Across both chromosome copies, by base pairs. A model estimate relative to reference populations, not an intrinsic ethnicity.</p>
  <div class="comp-bar">${compBar}</div>
  <ul class="legend">${compLegend}</ul>
  <p class="sub">Assignment confidence: ${badge(`${conf.assigned} assigned`, "good")} ${badge(`${conf.uncertain} uncertain`, "warn")} ${badge(`${conf.unknown} unknown`, "muted")}</p>

  <h2>3. Findings and annotations</h2>
  ${
    carriers.length
      ? `<table><thead><tr><th>Variant</th><th>Gene</th><th>Condition</th><th>Status</th><th>Clinical allele</th><th>Classification</th></tr></thead><tbody>${findingRows}</tbody></table>`
      : "<p>No curated variant findings for this sample.</p>"
  }

  <h2>4. Coverage — what was NOT tested</h2>
  <p class="sub">Of ${cov.total} curated variants, ${cov.assayable} are directly assayable by this array.</p>
  <table><thead><tr><th>Condition</th><th>Gene</th><th>Assayable</th><th>Not assayed</th></tr></thead><tbody>${coverageRows}</tbody></table>
  <div class="banner">A negative or not-assayed result does <strong>not</strong> rule out risk. This array types only selected positions; confirmatory clinical testing is required to establish presence or absence.</div>

  <h2>5. Disease-specific score status</h2>
  <ul class="plain">${scoreRows}</ul>
  <p class="sub">No percentile or absolute risk is reported: no validated comparison distribution or calibrated model is available for this sample.</p>

  <h2>6. Uncertainty and limitations</h2>
  <ul class="plain">
    <li>Local-ancestry probabilities are model estimates, not calibrated confidence.</li>
    <li>Uncertain / unknown ancestry segments are not confident calls.</li>
    <li>Population frequency is context, not a per-person risk; missing frequency is not zero.</li>
    <li>A consumer SNP array measures only selected positions; most variation is unmeasured.</li>
    <li>Observed genotypes are not attributed to a specific chromosome copy unless phase is established.</li>
    ${s.synthetic ? "<li><strong>This report is built from synthetic demo data and does not describe a real person.</strong></li>" : ""}
  </ul>

  <h2>7. Methods</h2>
  <ul class="plain">${methodRows}</ul>

  <h2>8. Source versions</h2>
  <ul class="plain">${sourceItems}</ul>

  <div class="footer">Generated by Ancestry-Aware Variant Explorer (research prototype). Human-facing positions use the 1-based convention. Not for clinical use.</div>
</div>
</body>
</html>`;
}

/** Download the styled HTML report (openable in a browser, printable to PDF). */
export function downloadReportHtml(bundle: AnalysisBundle): void {
  const html = generateReportHtml(bundle);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `ancestry-explorer-report_${bundle.sample.sample_id}_${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Open the styled report in a new tab and invoke the browser print dialog. */
export function printReport(bundle: AnalysisBundle): void {
  const html = generateReportHtml(bundle);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  // Give the new document a moment to render before printing.
  w.onload = () => w.print();
}
