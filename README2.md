# Ancestry-Aware Variant Explorer

A hackathon **research prototype** that combines consumer SNP data, inferred
local genetic ancestry, and curated disease-variant evidence in an interactive
chromosome explorer.

> This is not a diagnostic tool and is not a replacement for clinical genetic
> testing. Ancestry does not establish whether someone carries a pathogenic
> variant, and an ancestry estimate cannot rule one out. See
> `HACKATHON_PROJECT_PLAN.md` for scope and boundaries.

## Current status

- **Step 1** — repository scaffold, normalized schema contract, and the
  AncestryDNA raw-text parser (browser + Python), with synthetic fixtures and
  upload/quality-report screens. See `docs/step-01-parser.md`.
- **Step 6 (integrated explorer)** — the interactive chromosome explorer plus an
  AI region-research pipeline, rendering a synthetic precomputed analysis bundle
  (the assumed Steps 2–5 outputs) through the same normalized schema. Overview
  statistics, zoomable two-track-per-autosome views with uncertainty shading,
  clickable regions/variants, a spinnable globe, condition coverage pages, and
  clinician + patient screening framing. See `docs/step-06-explorer.md`.

> Steps 2–5 (reference assets, phasing, local ancestry inference, and the real
> annotation/scoring extracts) are represented by the clearly-labeled synthetic
> bundle so the explorer can be demonstrated offline. They remain to be wired to
> real tooling.

## Project layout

```
schemas/            Language-neutral normalized data contract (JSON Schema)
src/
  domain/           Normalized TS types, parser, explorer types, geography,
                    region-research pipeline
  adapters/         Synthetic demo loader + precomputed analysis-bundle loader
  components/       Upload/quality screens + explorer (tracks, globe, panels)
data/demo/          Synthetic fixtures + analysis_bundle.json (committed)
scripts/            Fixture + analysis-bundle generators
pipeline/
  ancestry_explorer/  Authoritative Python parser + privacy-safe CLI
  tests/            Python parser tests
tests/              TypeScript parser tests
docs/               Methods and decisions per step
```

## Prerequisites

- Node.js 18+ (developed on Node 26; verified on Node 24 LTS)
- Python 3.10+ (developed on 3.12)

If no Node runtime is available, a no-sudo install works: download the official
Node LTS tarball for your platform, extract it, and put its `bin` on `PATH`.

## Explorer walkthrough

1. `npm run dev`, open the app, choose **Explore synthetic analysis**.
2. **Overview** — ancestry composition, assignment confidence, flagged
   findings, and disease-score status.
3. **Chromosomes** — pick an autosome, click a gene region (e.g. BRCA1 on
   chr17), zoom in, and read the region detail: both-copy ancestry, conditions,
   the spinnable globe, and the generated research insight.
4. Click a red variant marker for genotype, frequency comparison, and evidence.
5. **Conditions** — curated variants examined vs. relevant variants not
   measured, with a clinician + patient screening note.

The bundle regenerates with `python3 scripts/make_analysis_bundle.py`.

## Setup and run

```sh
# UI
npm install
npm run dev          # http://localhost:5173

# UI checks
npm run build        # type-check + production build
npm test             # vitest
npm run lint

# Python pipeline
cd pipeline
python3 -m pip install -e ".[dev]"   # or: pip install pytest
PYTHONPATH=. python3 -m pytest
```

### Parse a file from the command line (privacy-safe)

The CLI prints only aggregate counts, metadata, and error codes — never allele
values.

```sh
cd pipeline
PYTHONPATH=. python3 -m ancestry_explorer.cli path/to/AncestryDNA.txt
```

Exit code `0` means the file is sufficient for the inference path; `3` means it
parsed but is insufficient (e.g. too few markers).

## Privacy

- The default experience uses synthetic data. Loading a personal file is an
  explicit action.
- Browser uploads are parsed locally and are never transmitted or persisted.
- Real genetic files are git-ignored and must never be committed.

## Input format

AncestryDNA raw text: `#` comment/metadata lines, then five tab-delimited
columns `rsid  chromosome  position  allele1  allele2`, build 37.1 (GRCh37),
forward strand, 1-based positions. See `docs/step-01-parser.md` for the full
parser contract.
