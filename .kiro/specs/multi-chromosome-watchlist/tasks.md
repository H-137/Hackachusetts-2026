# Tasks — Multi-chromosome watchlist ancestry coverage

- [ ] 1. Parameterize the ancestry pipeline by chromosome
  - Audit `pipeline/ancestry_explorer/ancestry.py` and `cli.py`/`setup_cli.py`
    for any chr22-specific constants; make the segmentation path accept an
    arbitrary chromosome.
  - Add an explicit typed error when a requested chromosome's reference asset is
    absent (name the chromosome + asset path; fabricate nothing).
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Accept multiple chromosomes in the CLI
  - Allow repeated `--chrom` / `--segments` (or a comma list) and iterate,
    writing one `segments.chrN.json` per chromosome. Keep chr22-only default.
  - Ensure each output carries panel provenance
    (`reference_panel_id` / `reference_panel_version`).
  - _Requirements: 1.1, 1.4_

- [ ] 3. Validate per-chromosome reference assets in the panel registry
  - In `panels.py` / `pipeline/reference/panels.json`, resolve the reference VCF
    template per chromosome and validate presence before a run.
  - _Requirements: 1.3_

- [ ] 4. Multi-chromosome lookup in the Python watchlist engine
  - In `watchlist.py`, resolve each catalog variant against the segment set for
    `variant.chrom`; independent copy-1/copy-2 lookup at the exact locus.
  - Chromosomes without segments stay `ancestry_not_available`; no extrapolation.
  - Preserve `observed_finding` precedence; hom-ref is not a finding; no
    per-copy allele attribution without phase.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 5. Python tests for multi-chromosome behavior
  - Add tests: non-chr22 per-copy independence, locus-not-chromosome lookup,
    compatibility classes, missing-chromosome path, hom-ref-not-a-finding,
    no-risk-percentage assertion.
  - _Requirements: 4.1, 4.3_

- [ ] 6. Mirror multi-chromosome lookup in the TS engine
  - In `src/domain/watchlist.ts` (+ `watchlistCatalog.ts`), index bundle
    ancestry segments by chromosome and resolve each locus against its own
    chromosome; match the Python classification exactly.
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 7. Verify UI rendering and parity
  - Confirm `src/components/Watchlist.tsx` renders multi-chromosome entries with
    per-copy segments and still renders `ancestry_not_available` correctly.
  - Extend TS watchlist tests with a 2+ chromosome bundle; assert parity with
    Python expectations and absence of any risk field.
  - _Requirements: 3.1, 3.2, 3.3, 4.3_

- [ ] 8. Run the full verify loop and record coverage limitations
  - Run `npm run build`, `npm run lint`, `npm test`, and
    `cd pipeline && python -m pytest`; fix any failures.
  - Document which chromosomes have real panel assets vs fixture-only, in the
    honest-limitations style of docs/step-07.
  - _Requirements: 4.1, 4.2, 4.3_
