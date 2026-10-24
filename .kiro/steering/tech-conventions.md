# Technical conventions & workflow (always apply)

## Architecture

- The normalized schema is the contract. The UI consumes the SAME normalized
  types (schemas/normalized.schema.json / src/domain/types.ts) whether data is
  synthetic or from the real pipeline. Keep scientific processing (pipeline/)
  separate from presentation (src/).
- Internal coordinates are 0-based, half-open. Display human-facing positions as
  clearly-labeled 1-based.
- Derive clinician figures from facts already in the bundle (carrier status,
  coverage, PGS coverage). Do not add new fabricated fields.
- Make features data-driven, not hard-coded to the current demo bundle. Anything
  keyed on specific condition/gene names should be generated from the data
  (see src/domain/conditionInfo.ts for the pattern) so any pipeline result
  populates correctly.

## Stack

- TypeScript + React + Vite. SVG for chromosome tracks/charts. The 3D globe uses
  react-globe.gl / three with Earth textures vendored locally in public/globe/
  (no CDN — keeps the demo fully offline).

## Verify loop (run after every change)

This environment has no system Node; a local Node lives at
`~/.local/node/node-v24.22.1-darwin-arm64/bin`. Prefix commands with it on PATH:

```sh
export PATH="$HOME/.local/node/node-v24.22.1-darwin-arm64/bin:$PATH"
npm run build   # tsc -b && vite build  (type-check + bundle; runs NO tests)
npm run lint    # eslint .
npm test        # vitest run  (41 tests: parser, explorer, watchlist)
```

- Tests are unit/data-logic only — there are NO component/render tests. The
  build type-checks the UI; it does not verify visual layout. For UI-heavy
  changes, say so and ask the user to eyeball the live dev server.
- Dev server: `npm run dev` (http://localhost:5173), run as a background process.

## Git / collaboration

- This is a shared repo with an active teammate who pushes frequently and edits
  the same UI files (Explorer.tsx, styles.css). Before pushing: commit local
  work, fetch, and if behind, merge on a temporary branch, resolve conflicts
  deliberately (keep both sides where they're additive), verify build+lint+test,
  then fast-forward main and push. Never force-push over the teammate's commits.
- Watch for feature duplication with the teammate (e.g. the watchlist overlapped
  the earlier considerations/carrier panels). Prefer consolidating onto one
  engine over building parallel versions.
