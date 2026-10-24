# Design — Multi-chromosome watchlist ancestry coverage

## Overview

Extend the existing single-chromosome (chr22) ancestry + watchlist flow to
accept and resolve multiple chromosomes, so catalog loci on chr11/13/15/17 get
real per-copy locus-level ancestry. No new scientific method is introduced; the
same RFMix-style per-copy segmentation and the same watchlist classification are
applied per chromosome. The normalized schema remains the contract between the
pipeline and the UI.

Referenced contracts:
#[[file:schemas/normalized.schema.json]]

## Architecture

```
query VCF(s) ──> ancestry CLI (per chromosome) ──> segments.chrN.json  ─┐
                                                                         ├─> bundle (ancestry segments keyed by chrom)
raw file ──────> raw_lookup (observed status) ───────────────────────── ┘
                                                                         │
                 watchlist engine (per catalog variant):                 │
                   for variant.chrom: find overlapping segment copy1/copy2│
                   classify compatibility, prioritize ──────────────────-┤
                                                                         ├─> pipeline watchlist (setup_cli watchlist)
                 TS watchlist engine (mirror) ───────────────────────────┘─> UI Watchlist tab
```

### Components touched

- `pipeline/ancestry_explorer/setup_cli.py` / `cli.py` — accept more than one
  `--chrom` / `--segments`, iterate chromosomes, write one segment file each.
  Default behavior (chr22 only) unchanged.
- `pipeline/ancestry_explorer/ancestry.py` — ensure the segmentation path is
  chromosome-parameterized (no chr22 constants); surface an explicit error when
  a chromosome's reference asset is absent (Req 1.3).
- `pipeline/ancestry_explorer/watchlist.py` — look up each catalog variant by
  `variant.chrom` against the provided segment set; chromosomes with no segments
  stay `ancestry_not_available`. Classification logic (`supported` /
  `within_superpopulation` / `mismatch`) is reused unchanged.
- `pipeline/reference/panels.json` + `panels.py` — reference VCF template must
  resolve per chromosome; validate asset presence per requested chromosome.
- `src/domain/watchlist.ts` + `watchlistCatalog.ts` — index bundle ancestry
  segments by chromosome; resolve each catalog locus against its own
  chromosome's segments. Mirror the Python classification exactly.
- `src/components/Watchlist.tsx` — no logic change expected; it renders whatever
  the engine returns. Verify multi-chromosome entries render with per-copy
  segments and that `ancestry_not_available` still renders correctly.

## Data model

No schema change. Ancestry segments are already keyed by chromosome in the
bundle; this feature populates more of that map. Each segment retains:
`reference_panel_id`, `reference_panel_version`, per-copy label, marginal
probabilities, assignment status, and 0-based half-open boundaries.

Watchlist entry fields are unchanged (condition, variant, gene, coord/build,
inheritance, classification, review status, citations, per-copy segment +
uncertainty, attention rationale, measurement status, observed genotype,
testing gap). No new field is added; specifically, no risk-percentage field.

## Error handling

- Missing reference asset for a requested chromosome: raise a typed error naming
  the chromosome and the asset path; the run aborts for that chromosome and
  reports it. Other requested chromosomes still process. No fabricated segment.
- Unprocessed chromosome at watchlist time: `ancestry_not_available`, no
  extrapolation (existing behavior, now exercised across chromosomes).
- Privacy: no allele value enters any error, log, or summary (guardrails.md).

## Testing strategy

- Python unit tests (pipeline/tests/test_watchlist.py and a new ancestry test):
  - per-copy independent lookup on a non-chr22 chromosome,
  - locus-level (not chromosome-average) resolution,
  - compatibility classification across supported / within-superpop / mismatch,
  - missing-chromosome -> `ancestry_not_available`,
  - observed homozygous-reference is not a finding,
  - no phase attribution, no risk-percentage field.
- TS parity: extend watchlist unit tests to feed a bundle with 2+ chromosomes
  and assert classifications match the Python expectations.
- Full verify loop (build + lint + vitest + pytest) per tech-conventions.md.

## Decisions / trade-offs

- Reuse the existing classification engine per chromosome rather than batching,
  keeping the Python and TS engines a line-for-line mirror. Lower risk of the
  two engines diverging.
- Real reference assets for chr11/13/15/17 may not be downloadable in the pilot
  environment. If so, the feature is still delivered as: CLI accepts multiple
  chromosomes, engines resolve per chromosome, and tests use fixture segments.
  The honest limitation (which chromosomes have real panel assets) is recorded,
  consistent with the Step 7 precedent of documenting access/coverage limits.
