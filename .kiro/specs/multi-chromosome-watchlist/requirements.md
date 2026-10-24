# Requirements — Multi-chromosome watchlist ancestry coverage

## Introduction

The SNPshot watchlist (docs/snpshot-watchlist.md) prioritizes clinically
important variants using local ancestry inferred at each variant's specific
locus, independently on chromosome copy 1 and copy 2. Today only chr22 is
processed, so every catalog locus on another chromosome
(BRCA1/chr17, BRCA2/chr13, HBB/chr11, HEXA/chr15) resolves to
`ancestry_not_available`. This feature extends the pipeline to process
additional chromosomes so those loci get real per-copy locus-level ancestry,
and surfaces the result identically in the pipeline and the UI.

This is a non-diagnostic research prototype. All work here is bound by
.kiro/steering/guardrails.md (never fabricate ancestry, no risk percentages,
absence is not a reassuring negative) and .kiro/steering/tech-conventions.md
(normalized schema is the contract; 0-based half-open internal coordinates).

## Requirements

### Requirement 1 — Process additional chromosomes through the ancestry pipeline

**User story:** As a researcher, I want the ancestry pipeline to run on
chromosomes beyond chr22, so that catalog loci on those chromosomes receive
locus-level per-copy ancestry instead of `ancestry_not_available`.

#### Acceptance criteria
1. WHEN the ancestry CLI is given a chromosome other than 22 with a valid query
   VCF and a panel THEN the system SHALL emit per-copy segment JSON for that
   chromosome in the same format as the existing chr22 output.
2. WHEN a chromosome is processed THEN internal coordinates SHALL remain 0-based,
   half-open and the output SHALL conform to the normalized schema
   (schemas/normalized.schema.json).
3. IF a required reference-panel asset for a requested chromosome is missing
   THEN the system SHALL fail with an explicit error naming the chromosome and
   the missing asset, and SHALL NOT fabricate or substitute segments.
4. WHEN multiple chromosomes are processed THEN each SHALL carry its
   `reference_panel_id` / `reference_panel_version` provenance, consistent with
   the existing single-chromosome run.

### Requirement 2 — Watchlist consumes multi-chromosome segments

**User story:** As a researcher, I want the watchlist engine to look up each
catalog variant against the segments for its own chromosome, so that a variant
on a newly processed chromosome shows real per-copy ancestry.

#### Acceptance criteria
1. WHEN the watchlist is built with segments for a catalog variant's chromosome
   THEN the system SHALL resolve copy-1 and copy-2 ancestry independently at the
   variant's exact locus (not a chromosome-wide average).
2. WHEN a catalog variant's chromosome has NOT been processed THEN that entry
   SHALL remain `ancestry_not_available` with no extrapolation.
3. WHEN a locus label equals a specifically associated founder population THEN
   the entry SHALL be classified `supported`; WHEN it shares only the broad
   super-population THEN `within_superpopulation`; otherwise `mismatch` — and the
   variant SHALL remain visible in all cases.
4. WHEN an allele was directly observed THEN the entry SHALL stay
   `observed_finding` regardless of ancestry, and a homozygous-reference
   genotype SHALL NOT be treated as a finding.
5. The system SHALL NOT attribute an observed allele to a specific chromosome
   copy unless phase is established.

### Requirement 3 — Parity between pipeline and UI engines

**User story:** As a developer, I want the TypeScript watchlist engine to mirror
the Python engine for multi-chromosome input, so the browser view matches a
pipeline run.

#### Acceptance criteria
1. WHEN the bundle contains ancestry segments for multiple chromosomes THEN the
   UI watchlist (src/domain/watchlist.ts) SHALL resolve each catalog locus
   against its own chromosome's segments, matching the Python engine's
   classification.
2. WHEN a chromosome is absent from the bundle THEN the UI SHALL show
   `ancestry_not_available` for loci on it, identically to the pipeline.
3. The UI SHALL NOT display any risk percentage or convert marginal
   probabilities to risk, and SHALL keep uncertain/unknown segments visibly
   distinct.

### Requirement 4 — Verification

**User story:** As a developer, I want multi-chromosome behavior covered by
tests and the documented verify loop, so regressions are caught.

#### Acceptance criteria
1. WHEN the Python suite runs THEN it SHALL include tests for multi-chromosome
   segment lookup, per-copy independence on a non-chr22 chromosome, and the
   missing-chromosome `ancestry_not_available` path.
2. WHEN a change is made THEN `npm run build`, `npm run lint`, `npm test`, and
   `cd pipeline && python -m pytest` SHALL all pass.
3. Tests SHALL assert the absence of any risk-percentage field in watchlist
   output.
