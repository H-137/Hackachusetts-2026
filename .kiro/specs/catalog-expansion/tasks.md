# Tasks — Evidence catalog expansion (MCP-assisted curation)

- [ ] 1. Confirm BioMCP connectivity and tool surface
  - With `.kiro/settings/mcp.json` configured, verify the BioMCP server connects
    and the read-only tools (ClinVar via variant lookup, variant annotation,
    literature) respond to a sample query for a known variant (e.g. rs334).
  - Confirm only public identifiers are sent (per mcp-usage.md); no sample data.
  - _Requirements: 4.4_

- [ ] 2. Draft a candidate shortlist
  - Choose a handful of new founder/population-enriched conditions/variants to
    add, favoring entries on processed chromosomes so locus ancestry resolves.
    Note gene, condition, chromosome, and the associated population(s).
  - _Requirements: 1.1, 2.1_

- [ ] 3. Look up real evidence for each candidate via BioMCP
  - For each candidate: pull ClinVar classification + review status + ClinVar id
    + citations, and gnomAD r2.1.1 per-population allele frequency. Capture
    supporting PMIDs where useful.
  - Drop any VUS / benign / unresolved-conflicting candidate.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 4. Add entries to the Python catalog
  - Append each surviving candidate to `CATALOG` in `catalog.py` as a
    `CatalogVariant` with `FrequencyEvidence`, correct `evidence_class`
    (mendelian_pathogenic vs risk_allele), null for any uncertain figure, and a
    real `source_url` per frequency.
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2_

- [ ] 5. Mirror entries into the TypeScript catalog
  - Add the equivalent objects to `WATCHLIST_CATALOG` in
    `src/domain/watchlistCatalog.ts` with matching ids, coordinates, alleles,
    classification, populations, and frequencies.
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 6. Tests: evidence rules + Python/TS parity
  - Extend catalog/watchlist tests: excluded classifications never present, risk
    alleles never labeled Pathogenic, no risk-percentage field, enrichment-gate
    behavior for a below-floor entry.
  - Add/extend a parity assertion comparing ids + chromosome + position +
    associated populations across the two catalogs.
  - _Requirements: 3.1, 3.2, 4.2_

- [ ] 7. Record provenance
  - Write a short note (style of `docs/chr22-catalog-research.md`) listing each
    added variant, its ClinVar id/status, gnomAD dataset version + population AF,
    PMIDs, and the date the evidence was pulled via BioMCP.
  - Update `catalog_provenance()` counts/limitations if the summary changes.
  - _Requirements: 4.1_

- [ ] 8. Run the full verify loop
  - Run `npm run build`, `npm run lint`, `npm test`, and
    `cd pipeline && python -m pytest`; fix any failures before finishing.
  - _Requirements: 4.2, 4.3_
