# SNPshot core feature — ancestry-informed pathogenic-variant watchlist

The central feature: a focused watchlist of clinically important variants,
prioritized using **local ancestry inferred at each variant's specific genomic
locus** (independently on chromosome copy 1 and copy 2), including variants the
consumer array did not measure.

The segmented, two-copy local-ancestry model is the central lookup. Whole-genome
ancestry percentages and chr22 composition are explicitly NOT substituted for
locus-level ancestry.

## 1. Focused evidence catalog (`catalog.py`)

A small, well-supported set of Pathogenic / Likely-pathogenic variants:

| Variant | Gene | Condition | Chr | Assoc. pop | Review |
| --- | --- | --- | --- | --- | --- |
| ARSA c.907G>A | ARSA | Metachromatic leukodystrophy | 22 | (none — pan-ethnic) | multi-submitter |
| 185delAG | BRCA1 | HBOC | 17 | AJ founder | expert panel (ENIGMA) |
| 6174delT | BRCA2 | HBOC | 13 | AJ founder | expert panel (ENIGMA) |
| HbS (rs334) | HBB | Sickle cell disease | 11 | AFR | multi-submitter |
| 1278insTATC | HEXA | Tay-Sachs | 15 | AJ founder | multi-submitter |

Rules: VUS, benign/likely-benign, and unresolved conflicting classifications are
excluded. Founder/population-enriched variants are prioritized. Allele
frequency, carrier frequency, and disease prevalence are kept distinct with
source populations and denominators; uncertain figures are null, not invented.
The catalog is NOT restricted to array positions — unassayed founder variants
are included. The chr22 ARSA locus is included specifically so the per-copy
local-ancestry lookup is exercised on our processed chromosome.

## 2. Local ancestry as the central lookup (`watchlist.py`)

Per catalog variant: harmonize to GRCh37, then find the overlapping ancestry
segment on copy 1 and copy 2 **independently**, retrieving each copy's segment
boundaries, reference-population label, marginal probabilities, and assignment
status. Population compatibility is then classified:

- `supported` — a copy's locus label is one of the specifically associated
  populations (a reason for additional attention).
- `within_superpopulation` — same broad super-population but NOT the specific
  founder group; a broad/neighboring group is never treated as the founder
  population (marked unresolved for a specific match).
- `mismatch` — locus ancestry does not match; the variant is still shown.
- `no_association_documented` / `not_available` — handled explicitly.

Unprocessed chromosomes yield `ancestry_not_available` with no extrapolation.

## 3. Explainable prioritization

Transparent categories, not invented numeric risk weights:

1. `observed_finding` — a clinically relevant allele was directly observed.
2. `ancestry_supported` — unmeasured + locus ancestry supports attention.
3. `review_status_strong` — expert-panel variant, weaker/unresolved locus
   support.
4. `context_weak` — documented but weak/mismatched locus-ancestry relevance.
5. `ancestry_not_available` — ancestry at the locus could not be determined.

Each entry carries: condition, variant, gene, coordinate/build, inheritance;
classification + review status + citations; population enrichment/founder and
frequency evidence; the overlapping segment and uncertainty for each copy; an
attention rationale; the measurement status (observed / no_call /
indel_uninterpretable / unassayed) and observed genotype where available; and
the testing gap.

## 4. Interpretation guardrails (enforced and surfaced)

- Local ancestry contextualizes the likelihood of an unmeasured variant; it
  cannot establish presence or absence.
- Population frequency is not disease effect, penetrance, or personal risk.
- Lower documented frequency = weaker ancestry-based evidence, NOT "safe",
  "ruled out", or "skip screening".
- Directly observed clinically relevant findings stay visible regardless of
  ancestry.
- Ancestry labels are experimental reference-population similarity, not known
  ethnicity; marginal probabilities are never converted to risk percentages.
- No observed allele is attributed to a specific copy unless phase is
  established (it is not, at catalog loci, so none is attributed).
- The existing PGS stays separate (no published ancestry-aware model).

## Real-data run (chr22 processed)

| Entry | Priority | copy1 / copy2 | compatibility | observed |
| --- | --- | --- | --- | --- |
| ARSA (chr22) | context_weak | TSI / GBR (assigned) | no_association_documented | unassayed |
| BRCA1 (chr17) | review_status_strong | n/a | not_available | indel_uninterpretable |
| BRCA2 (chr13) | review_status_strong | n/a | not_available | indel_uninterpretable |
| HBB (chr11) | ancestry_not_available | n/a | not_available | observed (T/T = 0 copies HbS) |
| HEXA (chr15) | ancestry_not_available | n/a | not_available | indel_uninterpretable |

The ARSA chr22 locus demonstrates the central feature: real per-copy ancestry
(copy1 TSI, copy2 GBR) resolved at the variant's coordinate, not a
chromosome-wide average. HBB correctly shows the observed homozygous-reference
genotype (0 copies of the sickle allele), preserving the strand-correct
observation from the raw file.

## 5. Explorer integration

`setup_cli watchlist` builds the watchlist from segment JSON(s) + the raw file
and is reusable for additional chromosomes (pass more `--segments` and extend
`--chroms`). Loci on unprocessed chromosomes are `ancestry_not_available`.

## Verification

- 15 watchlist tests + the full suite (76 Python tests) pass. Tests cover
  coordinate matching, independent per-copy lookup, locus-not-chromosome lookup,
  population-label compatibility (supported / within-superpop / mismatch),
  missing coverage, observed-finding prioritization, homozygous-reference =
  not-a-finding, no phase attribution, and absence of risk-percentage fields.

## Future work (not implemented)

- Expand the catalog beyond the initial small set (more conditions/founder
  variants).
- Process additional chromosomes so more catalog loci get locus-specific
  ancestry instead of ancestry_not_available.
- A UI watchlist view (select variant -> inspect per-copy segments -> evidence
  -> observed genotype/testing gap) wiring this engine into the explorer.
