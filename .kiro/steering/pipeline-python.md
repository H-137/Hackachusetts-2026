---
inclusion: fileMatch
fileMatchPattern: 'pipeline/**'
---

# Python pipeline conventions (loads when editing pipeline/**)

Applies to the scientific processing side in `pipeline/`. Keep this separate
from the React/Vite presentation layer in `src/`.

## The schema is the contract

- The pipeline's output MUST conform to the normalized schema. The browser and
  pipeline parsers must agree on it.
  #[[file:schemas/normalized.schema.json]]
- The Python parser (`pipeline/ancestry_explorer/parser.py`) mirrors the browser
  parser (`src/domain/parser.ts`). A change to parsing rules on one side must be
  reflected on the other.

## Coordinates & data rules

- Internal coordinates are 0-based, half-open. Only convert to 1-based at a
  clearly-labeled human-facing boundary.
- `allele1` / `allele2` are preserved verbatim and are NOT interpreted as
  parental copies or as REF/ALT.
- "Missing from a database" is `null`, never a frequency of `0`.
- A sub-threshold file (e.g. the four-row example) parses successfully but must
  report `quality_summary.sufficient_for_inference == False`. Never present
  trivially small inputs as analyzable.

## Privacy invariants (enforced in code)

- No allele value is ever written into an error message, log line, quality
  summary, or exception. Parser errors carry a line number and a code only.

## Environment & verify loop

- Python >= 3.10. No runtime dependencies; dev dependency is `pytest>=7.4`.
- `testpaths = ["tests"]`. Run the suite from `pipeline/`:

```sh
cd pipeline && python -m pytest
```

- Pipeline tests are unit/data-logic only. Add or update a test alongside any
  change to parsing, harmonization, phasing, ancestry, scoring, or watchlist
  logic.
