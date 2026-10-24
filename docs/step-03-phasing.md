# Step 3 — Phasing and parental-data path

Status: complete (single-sample real path working; family-aware layer
implemented and fixture-tested).

## Tool choice: Beagle 5.5

Pinned **Beagle 5.5** (`27Feb25.75f`, GPLv3) for statistical phasing, with its
PLINK-format GRCh37 genetic maps and the 1000 Genomes Phase 3 reference panel.
Chosen over SHAPEIT because Beagle is a single self-contained JAR that runs on
the JVM (Temurin OpenJDK 21 here) with no build step, and ships a compatible
genetic map — a clean fit for macOS without a cluster.

### Beagle does not do trio phasing

Beagle 5.x **does not model parent-offspring relationships** (that capability
was removed after Beagle 4.0). So the family-aware path is **not** delegated to
the tool. Instead it is an explicit, auditable Mendelian-consistency layer
(`family.py`) applied on top of single-sample phasing. This is more transparent
than relying on hidden trio logic and matches the plan's requirement to "check
Mendelian inconsistencies" and leave ambiguous sites unresolved.

## Single-sample phasing (`phasing.py`)

Per chromosome:

1. **Filter to phasing-informative sites.** Hom-ref sites written with `ALT='.'`
   carry no phasing information (both copies are reference regardless of phase)
   and Beagle requires a concrete ALT. They are dropped; their phase is
   trivially `0|0`.
2. **Phase with Beagle** against the panel using the chromosome's genetic map
   (`impute=false`, fixed seed for reproducibility).
3. **Verify allele counts are preserved.** The multiset of allele *bases* per
   shared site must be identical before and after phasing — phasing only
   reorders alleles across the two copies; it must never add, drop, or change an
   allele. A violation raises.

### Why no conform-gt

`conform-gt` aligns a target VCF's alleles/strand to a reference VCF. Step 2
harmonization already made our REF/ALT consistent with GRCh37 (verified by
`bcftools norm --check-ref`: 0 mismatches), so conform-gt is redundant. We feed
the harmonized VCF directly to Beagle, which matches target to panel via
`gt=`/`ref=`. (conform-gt was tried first and rejected every marker as
`NOT_IN_REFERENCE` despite exact position/allele matches; the direct Beagle path
is both simpler and correct given our already-harmonized input.)

### Track labelling

Without evidence of parental origin the two haplotypes are **copy 1 / copy 2**
(Beagle's phase order). Parental origin is assigned only by the family-aware
layer when a trio supports it.

## Family-aware Mendelian layer (`family.py`)

Given a proband genotype and zero, one, or two parental genotypes at a shared
site:

- **Consistency check**: the child's two alleles must be drawable one from each
  available parent (or, with one parent, at least one child allele present in
  it).
- **Origin resolution**: where a complete trio makes the assignment unambiguous,
  assign which copy is maternal and which is paternal.
- **Ambiguity preserved**: when both assignments are possible (e.g. proband and
  both parents all heterozygous for the same pair), the site is left
  **unresolved** rather than guessed. Mendelian errors are flagged and left
  unresolved.

The layer works on allele *values*, independent of VCF 0/1 indexing, so it
composes with harmonized/phased VCFs without assuming REF/ALT order.

## Verification performed

- Python suite: 27 tests pass (12 parser + 5 harmonization + 9 family + 1
  phasing). The phasing test runs Beagle against a synthetic panel; it is
  skipped where the jar/toolchain is absent. Family tests are pure logic and
  always run.
- **Real-data single-sample phasing** on the chr22:20–22M window:
  369 input markers -> 182 phasable (hom-ref dropped) -> 181 phased,
  **allele counts preserved**, no warnings. Output genotypes are phased
  (`|` separator), e.g. `1/1` -> `1|1`, `0/1` -> `0|1`.
- **Family fixtures**: resolvable trios recover the expected parental copy
  assignment; all-heterozygous trios stay unresolved; Mendelian violations are
  detected.

## Privacy

- Phasing logs record marker counts, parameters, and tool versions — never
  genotype values.
- The family layer returns in-memory genotype structures for the pipeline;
  callers surface only aggregate counts.
- Phased VCFs and all phasing assets (Beagle jar, maps, panel) live under
  gitignored paths.

## Scope and open items

- Real phasing was validated on the chr22 window (consistent with approach B).
  Full-genome phasing needs the full per-chromosome 1000G panels (tens of GB),
  left as an on-demand download. The `setup --mode phasing` command fetches the
  tool and maps; panel chromosomes are fetched as needed.
- Phase-switch error can flip copy identity along a chromosome; this is recorded
  as a known limitation and matters for how Step 4 interprets segment copies.
