# Step 6 — Integrated explorer + region research pipeline

This step delivers the interactive chromosome explorer (plan Section 9, Step 6)
and an AI region-research pipeline. It consumes the **same normalized schema**
(`schemas/normalized.schema.json`, mirrored in `src/domain/types.ts`) that the
real pipeline produces, so demo and real data are interchangeable (Section 7).

Steps 2–5 are assumed complete. Their outputs are represented by a **synthetic
precomputed analysis bundle** (clearly labeled `synthetic: true`). Nothing here
fabricates a result and presents it as real.

## Data layer

- `scripts/make_analysis_bundle.py` — deterministic (seeded) generator for
  `data/demo/analysis_bundle.json`. Produces ancestry segments (two copies per
  autosome, non-overlapping, gaps as explicit `UNKNOWN`), variant observations,
  gnomAD-style frequency annotations (missing frequency stays `null`, never
  `0`), ClinVar/GWAS-style evidence (including a conflicting-interpretation
  variant and a `not_assayed` variant), and two disease scores (one computed,
  one `unscorable` to exercise the data-sufficiency gate).
- `src/adapters/analysisBundle.ts` — loads the JSON at one typed boundary.
- `src/domain/explorer.ts` — explorer-layer types + GRCh37 autosome lengths
  (public reference values, used only to scale track drawing) + overlap/format
  helpers. Internal coordinates stay 0-based half-open; display is 1-based.
- `src/domain/geography.ts` — maps reference-group codes to broad global regions
  with centroid coordinates for the globe. Centroids are visualization anchors,
  **not** origin claims for a person or a variant (Section 2 terminology).

## UI

- `AncestryOverview` — composition bar, assignment-confidence counts, flagged
  findings (ancestry overlap and/or observed curated variant, never a missing
  variant shown as reassuring), and disease-score status.
- `ChromosomeTrack` — SVG two-track-per-autosome view. Uncertain segments use a
  hatch overlay; unknown regions use a distinct hatch fill. Clickable ancestry
  segments, gene regions, and variant markers. Keyboard-focusable with ARIA
  labels.
- `RegionDetail` — both-copy ancestry context, overlapping conditions (flagged
  when they overlap an elevated-frequency reference group), region variants, the
  spinnable globe pointing at the overlapping region, and the research insight.
- `Globe` — realistic 3D WebGL globe (`react-globe.gl` / ThreeJS) with precise
  continents from a NASA Blue Marble texture. Auto-rotates, drag to spin, and
  eases the camera to the first highlighted region on selection. The Earth
  textures are **vendored locally** in `public/globe/` so the demo stays fully
  offline (Section 11). The component is code-split via `React.lazy` so ThreeJS
  only loads when a region detail opens.
- `VariantDetail` — genotype, both-copy local-ancestry context, ancestry-group
  frequency comparison (missing shown as "not reported"), evidence with review
  status and conflicts, and measurement status with an explicit
  "missing is not a reassuring negative" note.
- `ConditionPage` — curated variants examined vs. relevant variants **not
  measured**, elevated-frequency reference groups as population context, and a
  clinician + patient screening note.
- `Explorer` — tabbed shell (Overview / Chromosomes / Conditions) with zoom and
  cross-navigation (variant → condition).

## Region research pipeline (`src/domain/regionResearch.ts`)

Given a selected region, the pipeline:

1. `buildRequest` assembles a **sanitized, non-identifying** payload: gene,
   inferred reference-group labels + assignment status, condition names, and
   frequency/evidence **summaries**. It never includes raw alleles or genotypes.
   (Verified by `tests/explorer.test.ts`.)
2. A `ResearchProvider` turns that into a structured `RegionInsight` with:
   what the data supports, what it does **not** establish, screening
   considerations for clinicians and patients, caveats, and sources.

Providers:

- `offlineProvider` (default) — fully on-device and deterministic, so the demo
  makes no network calls (Section 11). Always includes the
  "ancestry does not establish / cannot rule out a pathogenic variant"
  limitation and never converts ancestry or a founder variant into a personal
  disease probability.
- `createRemoteProvider` — opt-in remote AI provider. Transmits **only** the
  sanitized request, requires an explicit endpoint + key (throws otherwise so it
  can never silently fall back to transmitting), and the call site is
  responsible for obtaining user consent before enabling it. Not wired into the
  default demo.

## Acceptance criteria exercised

- Two valid, non-overlapping segments per copy; gaps render as unknown.
- Population-frequency missingness stays distinct from zero.
- Conflicting clinical interpretations remain visible.
- A score refuses insufficient data (`unscorable`) with a stated reason; no
  percentile/absolute risk without a validated distribution/calibrated model.
- No raw genetic data in logs or request payloads.
- `npm run build`, `npm run lint`, and `npm test` pass.

## Local toolchain note

This environment had no Node runtime. A local, no-sudo Node LTS was installed
under `~/.local/node/node-v24.22.1-darwin-arm64/`. Add its `bin` to `PATH` to
run the npm scripts. The project targets Node 18+.

## Known limitations

- The bundle is synthetic; ancestry calls, probabilities, and scores are
  fabricated-for-demo and must not be read as real inference.
- Gene loci and autosome lengths are approximate GRCh37 reference values for
  drawing, not sample-derived.
- The globe uses coarse continental centroids; it is illustrative.
