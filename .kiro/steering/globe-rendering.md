---
inclusion: auto
name: Globe & 3D rendering notes
description: Conventions for the 3D ancestry globe built on react-globe.gl and three.js. Activate when the request involves the globe, geographic map, Earth textures, three.js scene, camera, or WebGL rendering.
---

# Globe & 3D rendering notes

Context for work on the 3D ancestry globe and geographic visualization.

## Stack & offline constraint

- Built on `react-globe.gl` (^2.38) over `three` (^0.186). Types via
  `@types/three`.
- Earth textures are vendored locally in `public/globe/` (see
  `public/globe/README.md`). Never load textures, tiles, or models from a CDN —
  the demo must run fully offline.

## Data-driven, not hard-coded

- Points, arcs, and region overlays are derived from the normalized bundle and
  the ancestry/geography domain modules (e.g. `src/domain/geography.ts`), not
  hard-coded to the current demo. Any pipeline result should populate the globe.

## Scientific framing on the globe (from guardrails.md)

- Local ancestry is an experimental model estimate relative to reference
  populations, not an intrinsic ethnicity. Globe labels and copy must reflect
  this — probabilities are not risk percentages.
- Keep uncertain/unknown ancestry segments visibly distinct (e.g. hatching /
  muted styling), never rendered as a confident call.
- Population frequency shown against a region is context, not a personal
  finding or a causal claim about ancestry.

## Performance

- Dispose three.js geometries/materials/textures on unmount to avoid WebGL
  context leaks across view switches. Prefer reusing texture objects over
  reloading them on re-render.
