# Step 5 — Variant evidence, ancestry context, and disease-model selection

Status: curated observed-variant panel implemented (demo priority); PGS000057
investigated and implemented as a standalone, ancestry-free partial score with
honest coverage gating.

## Goal framing

The deliverable is **ancestry-contextualized genetic risk information**: for each
curated disease-associated locus, five independent layers are composed without
one contaminating another.

1. Observed genotype + assay status (fact).
2. Local ancestry for both chromosome copies, with uncertainty (context only).
3. Published disease-association evidence.
4. Population-specific allele frequencies + documented founder associations.
5. An explicit distinction between population frequency differences and evidence
   of ancestry-dependent disease effects.

### Hard guardrails (enforced in `annotate.py` and tested)

- A curated locus is **always shown**, regardless of the person's inferred
  ancestry. Ancestry never gates whether an observed variant is displayed.
- Inferred ancestry is **never** used as evidence that an unmeasured variant is
  present. A `not_assayed` / `no_call` locus stays that way.
- Founder/population associations are recorded as **frequency context**,
  explicitly not as evidence of an ancestry-dependent disease effect, and never
  as a personal finding.
- Observed-genotype interpretation is kept **separate** from experimental local
  ancestry.
- **No** disease probability or percentile is produced.

## Curated observed-variant panel (`conditions.py`)

Selected on actual assay coverage and reliable clinical evidence:

| Condition | Gene | Variant | Array-typable? | Evidence |
| --- | --- | --- | --- | --- |
| Sickle cell | HBB | rs334 (HbS) | yes (SNP) | ClinVar 15333 |
| Hereditary hemochromatosis | HFE | rs1800562 (C282Y), rs1799945 (H63D) | yes (SNP) | ClinVar 9, 10 |
| Tay-Sachs | HEXA | founder frameshift | **no (indel)** | ClinVar 3827 |
| Cystic fibrosis | CFTR | F508del | **no (indel)** | ClinVar 7105 |

The two indel loci are included deliberately: consumer SNP arrays report them as
I/D placeholders, so they are `not_assayed` here and shown as a coverage gap,
never a reassuring negative. All four conditions were verified against the real
input: rs334, rs1800562, rs1799945 are present as SNP calls; the Tay-Sachs and
CFTR variants appear as indel placeholders (not_assayed), as expected.

## PGS000057 investigation and verdict

| Requirement | Finding |
| --- | --- |
| Original publication | Natarajan P et al., *Circulation* 2017; PMID 28223407; doi 10.1161/CIRCULATIONAHA.116.024436 |
| Usable weights | yes — 57 variants, `rsID / effect_allele / effect_weight / OR` |
| GRCh37 compatibility | yes — declared `genome_build=hg19` |
| Effect-allele handling | requires strand/allele reconciliation (verified a case, rs602633, where the array allele is the complement) |
| License | PGS Catalog / EBI Terms of Use; cite authors |
| Marker overlap (real sample) | 42/57 by rsID; **33/57 actually scorable** after strand reconciliation and excluding no-calls/indels |
| Published scoring requirements | plain weighted sum; **no ancestry term** |

**Verdict: usable as a standalone, ancestry-free PGS**, implemented in `pgs.py`
with two firm constraints.

### Coverage gating (no silent dropping)

On the real sample: 33 of 57 variants scored, 24 missing, 9 strand/allele
ambiguous (skipped, **not** scored as 0). The output reports a **partial sum
over observed markers = 3.99** with `is_complete_published_score = false`. This
is explicitly **not** "the PGS000057 score." Missing and ambiguous variants are
listed, never silently dropped.

### Ancestry separation

PGS000057 is ancestry-free. Local ancestry is **not** incorporated into the
weights or the sum, and reference-population similarity is never converted into
disease risk. Any ancestry shown beside the score in the UI is contextual only.
We did not invent an ancestry-adjusted variant of this score, because the
published model does not define one.

### Two kinds of verification (kept distinct)

- **Arithmetic fixture** (`test_pgs.py`): verifies our weighted-sum code
  (dosage x weight, strand reconciliation, coverage gating) on known inputs.
  This checks *our code*.
- **Independent reproduction of a published expected result**: NOT claimed. The
  PGS Catalog publishes cohort-level performance, not a single per-individual
  expected score to reproduce; reproducing the cohort result would require the
  original study data. We state this gap rather than overclaim.
- **Neither** establishes clinical validity for any individual sample.

## No disease probability / percentile

No percentile (no appropriate comparison distribution for this sample) and no
absolute risk (no calibrated model with required clinical inputs). The score is
a raw partial weighted sum with explicit coverage, nothing more.

## Verification performed

- Python suite: Step 5 adds 10 tests (arithmetic fixture, complete-score flag,
  no-probability guardrail, partial-sum labeling, real-file parse of 57
  variants, and annotation guardrails: locus-shown-despite-ancestry-mismatch,
  no-inference-from-ancestry, indel = not_assayed, frequency-vs-effect note on
  every locus, observed-carrier counting).
- Real-data run: curated panel resolved against the real input (HBB/HFE SNPs
  observed, HEXA/CFTR indels not_assayed); PGS000057 partial sum computed with
  33/57 coverage.

## Future work (not implemented)

- Independent reproduction against original-cohort data to move beyond the
  arithmetic fixture.
- gnomAD/ClinVar live annotation extracts with versioned snapshots (currently
  evidence is attached from the curated manifest and the demo bundle; a
  versioned local gnomAD/ClinVar extract is the next enrichment).
