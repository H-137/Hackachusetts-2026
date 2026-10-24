# Design — Evidence catalog expansion (MCP-assisted curation)

## Overview

Add new founder/population-enriched variants to the evidence catalog that drives
the watchlist, using BioMCP as a build-time lookup for real ClinVar
classifications and gnomAD frequencies. This is a DATA change: no engine, schema,
or type changes. The catalog already supports everything needed — Mendelian P/LP
entries and honestly-labeled `risk_allele` entries, an enrichment gate, and
distinct allele/carrier/prevalence fields.

## Current structures (the contract to preserve)

- Python: `pipeline/ancestry_explorer/catalog.py`
  - `CatalogVariant` dataclass (variant_id, condition, gene, inheritance,
    source_build, chromosome, position_1based, ref/alt, hgvs, rsid,
    variant_class, clinical_classification, review_status, classification_date,
    clinvar_id, citations, associated_populations, founder_variant,
    frequency_evidence, notes, evidence_class).
  - `FrequencyEvidence` (population, allele_frequency, carrier_frequency,
    disease_prevalence, sample_size_or_denominator, enrichment_note, source_url).
  - `passes_enrichment_gate` + `MIN_ENRICHED_AF` / `MIN_ENRICHED_AF_RECESSIVE`
    / `MIN_ENRICHMENT_RATIO` — the absolute-floor gate for showing an ancestry
    tag.
  - `catalog_provenance()` — summary provenance surfaced to the app.
- TS mirror: `src/domain/watchlistCatalog.ts` (`WATCHLIST_CATALOG`), shape in
  `src/domain/watchlist.ts` (`CatalogVariant`).
- Existing data-mining precedent: `catalog_mine.py` +
  `docs/chr22-catalog-research.md` + `docs/artifacts/chr22-candidates-ranked.json`
  — ClinVar E-utilities P/LP joined to gnomAD r2.1.1 per-population AF. The MCP
  path is the same idea with BioMCP doing the lookups interactively.

## Curation workflow (build-time, with BioMCP)

```
pick candidate gene/condition
      │
      ▼
BioMCP variant_erepo / search  ──► ClinVar: classification, review status, id
BioMCP variant lookup          ──► gnomAD r2.1.1 per-population allele freq
BioMCP variant_articles        ──► supporting PMIDs (optional)
      │  (public identifiers only: gene, rsID/HGVS, coords, pop names)
      ▼
apply selection rules + enrichment gate
      │   exclude VUS/benign/conflicting; keep P/LP and honest risk_allele
      ▼
write entry to catalog.py AND watchlistCatalog.ts (mirrored)
      │
      ▼
record provenance note; run verify loop
```

Only public identifiers leave the machine (gene names, rsIDs/HGVS, coordinates,
population/condition names). No genotype, no sample data — enforced by
`mcp-usage.md`.

## Candidate selection

- Prefer ClinVar expert-panel / practice-guideline, else multiple-submitter
  no-conflicts review status.
- Prioritize documented founder / population-enriched variants; the enrichment
  gate (absolute AF floor, recessive-aware) decides whether an ancestry tag is
  shown. Below the floor the variant still appears, with no ancestry tag.
- Keep at least some additions on already-processed chromosomes (chr22, and any
  chromosome the multi-chromosome spec enables) so locus ancestry resolves;
  entries on unprocessed chromosomes remain `ancestry_not_available` by design.
- Risk alleles use `evidence_class: "risk_allele"` and keep their true ClinVar
  status; never relabeled Pathogenic.

## Data integrity rules

- Coordinates recorded on the source build (GRCh37 here) and harmonized at
  lookup; indel representations vary across sources, so record the ClinVar
  representation and verify ref/alt orientation before committing.
- allele_frequency vs carrier_frequency vs disease_prevalence stay separate;
  uncertain values are `null`.
- Each `FrequencyEvidence` carries a real `source_url` (gnomAD variant page or
  ClinVar) and the dataset/version in `sample_size_or_denominator`.

## Keeping Python and TS in sync

Add each entry to both files in the same change. A lightweight parity check
(existing or new test) compares variant ids, chromosome, position, and
associated populations across the two catalogs. Because the TS file is a manual
mirror, the parity test is the guard against drift.

## Testing strategy

- Extend `pipeline/tests/test_watchlist.py` (and catalog-level assertions) to
  cover new entries: enrichment-gate behavior, excluded classifications never
  present, risk alleles never labeled Pathogenic, no risk-percentage field.
- Parity assertion between `catalog.py` and `watchlistCatalog.ts` (ids +
  coordinates + populations).
- Full verify loop per tech-conventions.md.

## Decisions / trade-offs

- MCP is an authoring aid, not a dependency: the committed catalog must stand on
  its own with sourced values, so the app stays fully offline and reproducible
  without BioMCP present.
- Manual TS mirror (not codegen) is kept to match the existing pattern; the
  parity test absorbs the risk. Generating the TS catalog from the Python one is
  a possible later improvement, out of scope here.
- If BioMCP is unavailable, the same entries can be curated from ClinVar/gnomAD
  web pages directly (the `catalog_mine.py` precedent); the spec's value is the
  sourced, gated, mirrored result, not the specific lookup tool.
