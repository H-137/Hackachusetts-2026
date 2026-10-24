# Ancestry-Aware Variant Explorer

A hackathon **research prototype** that combines consumer SNP data, inferred
local genetic ancestry, and curated disease-variant evidence in an interactive
chromosome explorer.

> This is not a diagnostic tool and is not a replacement for clinical genetic
> testing. Ancestry does not establish whether someone carries a pathogenic
> variant, and an ancestry estimate cannot rule one out. See
> `HACKATHON_PROJECT_PLAN.md` for scope and boundaries.

## Current status

**Step 1 of 7 complete** — repository scaffold, normalized schema contract, and
the AncestryDNA raw-text parser (browser + Python), with synthetic fixtures and
upload/quality-report screens. See `docs/step-01-parser.md`.

## Project layout

```
schemas/            Language-neutral normalized data contract (JSON Schema)
src/
  domain/           Normalized TS types, shared constants, browser parser
  adapters/         Synthetic demo loader
  components/       Upload + quality-report screens
data/demo/          Synthetic fixtures (committed) + generator script output
scripts/            Fixture generators
pipeline/
  ancestry_explorer/  Authoritative Python parser + privacy-safe CLI
  tests/            Python parser tests
tests/              TypeScript parser tests
docs/               Methods and decisions per step
```

## Prerequisites

- Node.js 18+ (developed on Node 26)
- Python 3.10+ (developed on 3.12)

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
