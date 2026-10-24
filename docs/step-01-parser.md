# Step 1 — Repository, schemas, and AncestryDNA parser

Status: complete. This document records the scientific and engineering decisions
made in Step 1 and the assumptions that later steps must respect.

## What Step 1 delivers

- A Vite + React + TypeScript app scaffold with a two-path landing page
  (Upload AncestryDNA text / Explore synthetic demo), an upload screen, and a
  sample-quality report screen.
- A Python preprocessing package (`pipeline/ancestry_explorer`) with the
  authoritative parser and a privacy-safe CLI.
- One normalized data contract expressed as `schemas/normalized.schema.json`
  (Section 8), mirrored by `src/domain/types.ts`.
- An AncestryDNA raw-text parser implemented twice against the shared contract:
  browser-side (`src/domain/parser.ts`) for privacy-first local processing, and
  pipeline-side (`pipeline/ancestry_explorer/parser.py`) for the real
  harmonization pipeline. Shared constants live in `src/domain/ancestrydna.ts`
  and `parser.py` and are kept in sync by mirrored tests.
- Synthetic fixtures in `data/demo/` covering valid files, no-calls,
  conflicting/exact duplicates, malformed records, mixed line endings + BOM,
  unsupported chromosomes, and indels.

## Decisions and rationale

### Coordinate convention

Source positions are 1-based (declared by AncestryDNA). The internal convention
is **0-based, half-open** (Section 8). The parser stores both `position_1based`
and `position_0based` on every record; `position_0based = position_1based - 1`.
Downstream code consumes the 0-based value; UI displays the 1-based value with a
clear label.

### Genome build

AncestryDNA V2.0 declares "human reference build 37.1". We preserve the exact
declared string (`declared_build = "37.1"`) and separately map it to the
internal enum (`normalized_build = "GRCh37"`). The build is parsed, never
assumed. Step 2 must verify compatibility with the selected GRCh37 reference
assets before any normalization.

### Chromosome handling

Autosomes `1`–`22` enter the analysis path. AncestryDNA's numeric non-autosomal
codes are decoded for human-readable exclusion reporting:
`23 → X, 24 → Y, 25 → XY/PAR, 26 → MT`. These are counted in
`quality_summary.excluded_by_chromosome` and retained as records with
`record_kind = "non_autosomal"`, but excluded from the first implementation.

### Allele tokens

- `A/C/G/T` → SNP calls.
- `0` → documented AncestryDNA no-call encoding. A row with `0` in either allele
  column is classified `no_call` and is **never** treated as a reference
  genotype or a reassuring negative (Section 10).
- `D/I` → AncestryDNA indel placeholders. Classified `indel_unsupported` and
  reported with an error code; **not** coerced into SNP alleles.
- Any other token → `unexpected_allele_token` error.

`allele1`/`allele2` are preserved verbatim and are **not** interpreted as
parental copies or as REF/ALT (rule #3). REF/ALT resolution is a Step 2 concern
requiring the reference genome and a variant catalog.

### Duplicate handling

Records are keyed on `chromosome:position:rsid`. A second record with an
identical normalized genotype is `duplicate_exact` (collapsed, counted). A
second record with a different genotype is `duplicate_conflicting` (flagged,
excluded from inference). Counts appear in the quality summary.

### Sufficiency gate (rule #9)

`quality_summary.sufficient_for_inference` is `true` only when the header is
valid and there are at least `MIN_AUTOSOMAL_SNPS_FOR_INFERENCE` (10,000)
analysis-ready autosomal SNPs. This guarantees the four-row parser example — and
any trivially small file — can never be presented as analyzable. This is a
parser-level guard only; the genome-wide thresholds that actually block
phasing/ancestry inference are set with numeric justification in Step 2.

## Privacy invariants (Section 11)

- Errors carry a line number and a code only. No allele value is ever placed in
  an error message, the quality summary, a log line, or an exception. This was
  verified against the real file: the CLI report on a 677k-SNP export contained
  only aggregate counts and metadata.
- The browser parser runs locally; uploads are read in-memory via `FileReader`
  and are never transmitted or persisted. The report screen offers a reset.
- Real genetic files are git-ignored (`AncestryDNA.txt`, `*.vcf`, `/uploads/`,
  `/local-data/`). Only synthetic fixtures are committed.

## Verification performed

- `pipeline`: `pytest` — 12 tests pass.
- UI: `tsc --noEmit` clean, `vitest run` — 11 tests pass, `vite build` succeeds,
  `eslint` clean, dev server serves the app shell.
- Real-data smoke test: the Python CLI parsed the real `AncestryDNA.txt`
  (677,436 data records; 640,594 analysis-ready autosomal SNPs; 1,566 no-calls;
  8,070 unsupported indels; X/Y/XY-PAR/MT excluded) with no allele data in the
  output.

## Open items for later steps

- The 10,000-SNP sufficiency gate is a placeholder guard. Step 2 sets real
  marker-overlap and quality thresholds tied to the chosen phasing workflow.
- REF/ALT resolution, strand/ambiguous-allele handling, and reference-allele
  validation are Step 2 (harmonization).
- The two parser implementations are kept consistent by mirrored test suites.
  If the contract changes, update `schemas/normalized.schema.json`,
  `types.ts`, both parsers, and both test files together.
