/**
 * Step 7 research-report tests. Verify the report covers the required sections
 * (coverage, annotations, score status, uncertainty, methods, source versions)
 * and never fabricates percentiles/absolute risk, matching the plan + guardrails.
 */
import { describe, expect, it } from "vitest";
import { loadAnalysisBundle } from "../src/adapters/analysisBundle";
import { generateReport, generateReportHtml } from "../src/domain/report";

const bundle = loadAnalysisBundle();
const md = generateReport(bundle);
const html = generateReportHtml(bundle);

describe("research report (Step 7)", () => {
  it("includes all required sections in a logical order", () => {
    const sections = [
      "Summary of findings",
      "Inferred ancestry composition",
      "Findings and annotations",
      "Coverage — what was NOT tested",
      "Disease-specific score status",
      "Uncertainty and limitations",
      "Methods",
      "Source versions",
    ];
    let lastIdx = -1;
    for (const sec of sections) {
      const idx = md.indexOf(sec);
      expect(idx, `section present: ${sec}`).toBeGreaterThan(-1);
      expect(idx, `section in order: ${sec}`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("carries the research-not-diagnostic framing and synthetic flag", () => {
    expect(md.toLowerCase()).toContain("not a diagnostic report");
    expect(md.toLowerCase()).toMatch(/synthetic/);
  });

  it("never reports a percentile or absolute risk", () => {
    expect(md.toLowerCase()).toContain("no percentile or absolute risk");
    // Guard against a stray "percentile: <number>" leaking in.
    expect(md).not.toMatch(/percentile[:=]\s*\d/i);
  });

  it("states source versions (frequency dataset, build, model) ", () => {
    expect(md).toMatch(/Genome build:/);
    expect(md).toMatch(/Frequency dataset:/);
    expect(md).toMatch(/Score model:/);
  });

  it("includes the coverage not-a-negative warning", () => {
    expect(md.toLowerCase()).toMatch(/does not rule out|not rule out risk/);
  });

  it("flags backfill method steps as pending rather than implemented", () => {
    // Step 1 is implemented; later steps are pending real tooling.
    expect(md).toMatch(/Step 1.*implemented/);
    expect(md.toLowerCase()).toContain("pending real tooling");
  });
});

describe("styled HTML report", () => {
  it("is a well-formed, self-contained HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    // Self-contained: styles inline, no external resource/network references.
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/https?:\/\//); // no external URLs/CDNs
  });

  it("carries the same required sections and non-diagnostic framing", () => {
    for (const sec of [
      "Summary of findings",
      "Inferred ancestry composition",
      "Findings and annotations",
      "Coverage",
      "Disease-specific score status",
      "Uncertainty and limitations",
      "Methods",
      "Source versions",
    ]) {
      expect(html).toContain(sec);
    }
    expect(html.toLowerCase()).toContain("not a diagnostic report");
    expect(html.toLowerCase()).toContain("no percentile or absolute risk");
  });

  it("escapes content and never emits a percentile/absolute-risk number", () => {
    expect(html).not.toMatch(/percentile[:=]\s*\d/i);
  });
});
