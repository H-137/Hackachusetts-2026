# Requirements — Evidence catalog expansion (MCP-assisted curation)

## Introduction

The SNPshot watchlist is driven by a small, hand-curated evidence catalog of
Pathogenic / Likely-pathogenic variants (and a few honestly-labeled risk
alleles) defined in `pipeline/ancestry_explorer/catalog.py` and mirrored in
`src/domain/watchlistCatalog.ts`. The documented next step in
`docs/snpshot-watchlist.md` is to expand that catalog beyond the initial small
set with more conditions and founder/population-enriched variants.

This feature expands the catalog using the BioMCP MCP server (ClinVar,
variant annotation with gnomAD frequencies, and literature) as a BUILD-TIME
curation aid, following `.kiro/steering/mcp-usage.md`. Every added entry is
written into the versioned catalog files with real ClinVar classifications,
real gnomAD r2.1.1 per-population frequencies, and sourced citations — not
invented. The existing selection rules, enrichment gate, and scientific
guardrails are preserved exactly.

Binding constraints: `.kiro/steering/guardrails.md` (no fabrication, no risk
percentages, absence is not reassurance), `.kiro/steering/tech-conventions.md`
(normalized schema is the contract; Python and TS engines must agree), and
`.kiro/steering/mcp-usage.md` (MCP is build-time only, public identifiers only,
never raw genotypes).

## Requirements

### Requirement 1 — Add well-supported catalog entries via sourced lookup

**User story:** As a curator, I want to add new founder/population-enriched P/LP
variants to the catalog with real classifications and frequencies, so the
watchlist covers more conditions without any fabricated evidence.

#### Acceptance criteria
1. WHEN a candidate variant is added THEN its `clinical_classification`,
   `review_status`, `clinvar_id`, and `citations` SHALL come from a ClinVar
   lookup (via BioMCP) and SHALL be recorded with their source, never invented.
2. WHEN population frequency is recorded THEN it SHALL be a real gnomAD value
   with the dataset version and the population, and allele frequency / carrier
   frequency / disease prevalence SHALL be kept distinct with denominators.
3. IF a precise frequency is not available THEN the field SHALL be `null`, never
   a placeholder or estimated number.
4. WHEN a candidate is VUS, benign/likely-benign, or an unresolved conflicting
   classification THEN it SHALL NOT be added (existing selection rules).
5. WHEN a candidate is a susceptibility/risk allele rather than Mendelian P/LP
   THEN it SHALL be added with `evidence_class: "risk_allele"` and its real
   ClinVar status, never labeled "Pathogenic".

### Requirement 2 — Respect the enrichment gate and ancestry honesty

**User story:** As a curator, I want new entries to obey the existing enrichment
gate and ancestry-resolution rules, so population context is only shown when it
is actually supported.

#### Acceptance criteria
1. WHEN an entry's best documented allele frequency clears the absolute floor
   (`passes_enrichment_gate` in catalog.py) THEN it MAY carry an ancestry tag;
   otherwise it SHALL appear on clinical-evidence grounds with NO ancestry tag.
2. WHEN an associated population has no matching reference-panel label for the
   analyzed sample THEN the entry SHALL resolve as ancestry-unresolved (not
   mismatch, not "safe"), consistent with current behavior.
3. The system SHALL NOT convert any frequency or marginal probability into a
   risk percentage.

### Requirement 3 — Python and TypeScript catalogs stay in sync

**User story:** As a developer, I want every catalog addition reflected
identically in the Python and TS catalogs, so the pipeline and UI watchlists
agree.

#### Acceptance criteria
1. WHEN an entry is added to `catalog.py` THEN an equivalent entry SHALL be
   added to `watchlistCatalog.ts` with matching ids, coordinates, alleles,
   classification, populations, and frequencies.
2. WHEN the two catalogs are compared THEN variant ids, chromosomes, positions,
   and associated populations SHALL match exactly.
3. The normalized schema and existing `CatalogVariant` shapes SHALL be
   unchanged by the additions (data-only change).

### Requirement 4 — Provenance and verification

**User story:** As a developer, I want the expansion documented and verified, so
reviewers can trace every added entry to a source and the suite still passes.

#### Acceptance criteria
1. WHEN entries are added THEN a short provenance note SHALL record the BioMCP
   sources used (ClinVar, gnomAD version, any PMIDs) and when they were pulled,
   in the style of `docs/chr22-catalog-research.md`.
2. WHEN the Python suite runs THEN catalog tests SHALL still pass, including
   no-risk-percentage and classification-exclusion assertions.
3. WHEN a change is made THEN `npm run build`, `npm run lint`, `npm test`, and
   `cd pipeline && python -m pytest` SHALL all pass.
4. The MCP server SHALL be used only for build-time lookups; no raw genotype or
   identifying data SHALL be sent to it (per mcp-usage.md).
