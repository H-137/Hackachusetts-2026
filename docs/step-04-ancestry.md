# Step 4 — Local ancestry inference (RFMix)

Status: pipeline working on real chr22 data at the 26 sub-population level.

## Tool: RFMix 2.03 (built from source)

RFMix has no Homebrew formula and ships no macOS binary, so it is built from
source (`slowkoni/rfmix`): `autoreconf && ./configure && make`. Two fixes were
needed on Apple Silicon:

- installed `automake` (provides `aclocal`, required by autoreconf);
- removed the hardcoded x86 flag `-march=core2` from `Makefile.am` (clang on ARM
  rejects it; it is an optimization hint, not functionally required).

RFMix is licensed for **non-commercial academic research use only** (Bustamante
Lab, Stanford). Suitable for this research prototype; not for commercial or
clinical deployment. Build provenance is recorded in the manifest.

## Reference-group granularity: 26 1000 Genomes sub-populations

This workflow uses the **26 fine-grain 1000 Genomes reference populations**
(the `pop` column), not the 5 super-populations. `build_sample_map` defaults to
`level="pop"`; `level="super_pop"` remains available.

The label set and ordering are **always read from RFMix output metadata**
(`_parse_msp_header` parses the `#Subpopulation order/codes:` line), never
hardcoded. The UI resolves each code to a readable reference-population name via
`src/domain/geography.ts` (e.g. `TSI` -> "Toscani (Italy)", `CLM` -> "Colombian
(Medellín)"), each rolled up to its super-population. Super-population and
gnomAD-style codes also resolve, so no label silently renders as "Unknown".

### Honest framing and uncertainty

- Results are described as **inferred similarity to reference populations**, not
  as intrinsic ethnicity and not as a claim a segment "comes from" a place.
- Marginal probabilities are preserved; existing uncertainty handling
  (assigned / uncertain / unknown) is unchanged. Probabilities are model
  marginals and are **not** described as calibrated confidence.
- Sub-continental resolution from sparse consumer-array data is **not
  validated** here. At array density in a 2 Mb window, fine-grain calls are
  expected to be noisy (e.g. one copy TSI, the other CLM/KHV). This finer
  resolution is offered as suggestive context, not a validated result.

## Workflow (`ancestry.py`)

Per chromosome:

1. Convert the Beagle PLINK map (`chrom . cM bp`) to the RFMix map
   (`chrom bp cM`).
2. Build the sample map (`sample_id -> pop`) restricted to samples present in
   the reference VCF.
3. Run RFMix with the phased query VCF, the full 1000G panel as reference, the
   sample map, and the genetic map.
4. Parse `<out>.msp.tsv` into normalized `AncestrySegment` records: one per copy
   per window, converting 1-based inclusive ranges to 0-based half-open, with
   labels resolved from the RFMix metadata order.

Track labelling remains copy 1 / copy 2 (phase order), not parental.

## Verification performed

- Python suite: 32 tests pass (added ancestry parsing, map/sample-map builders,
  pop-vs-super_pop level). Parsing is granularity-agnostic: it reads the label
  set from RFMix output.
- UI: tsc clean, vitest passes, eslint clean. The 26 sub-populations plus
  super-population and gnomAD-style fallbacks all resolve to readable names.
- **Real-data run** (chr22:20-22M, phased sample vs the full 2,504-sample
  panel, 17.7 s): RFMix produced 2 windows -> 4 segments with fine-grain labels
  reaching the segments file (TSI, CLM, KHV). Reference-group order read
  correctly from RFMix metadata (26 codes, alphabetical index order).

## Performance note

RFMix cost scales with query marker count. A sparse consumer-array query
(~hundreds of markers per window) runs in seconds. A full-density reference
sample used as a query (tens of thousands of markers in the same window) is
orders of magnitude slower and should be thinned to array density before use.

## Marker restoration for ancestry (chr22)

Phasing drops observed homozygous-reference sites (`ALT='.'`) because they carry
no phase information and Beagle needs a concrete ALT. But those sites are
informative for ancestry. Feeding only the phased het/hom-alt subset to RFMix
discarded ~half the usable chr22 markers.

`restore_markers.py` rebuilds an ancestry VCF from the phased het/hom-alt calls
(kept exactly) plus observed hom-ref sites re-expressed as phased `0|0` using the
reference panel's REF/ALT at each position. Strict rules: a hom-ref site is
restored only if the panel has a biallelic SNP at the same position with a
matching REF; missing/not-assayed sites are never turned into `0|0`; hets are
never arbitrarily phased. Output is sorted, de-duplicated, and tabix-indexed.

Restoration result on chr22 (reported honestly — not all ~10.9k survive):

| quantity | count |
| --- | --- |
| phased markers (het + hom-alt) | 4,999 |
| hom-ref candidates | 5,808 |
| hom-ref **restored** (survive panel intersection) | 5,193 |
| dropped: not a biallelic-SNP panel site | 615 |
| dropped: REF mismatch | 0 |
| **merged ancestry markers** | **10,192** |

The merged VCF passes `bcftools norm --check-ref` with 0 REF mismatches.

## Composition math audit

The earlier report's broad-group percentages summed to ~102%. The cause was a
**display rounding artifact**: 22 sub-population values each rounded to one
decimal summed to 100.2%. RFMix's own diploid `.Q` output sums to exactly 1.0;
there was no overlapping-count or normalization bug.

`composition.py` now computes composition **by genomic span across both
chromosome copies**, with an explicit denominator (total assigned span) and
separate tracking of uncertain / unknown / gap span. Label fractions sum to
100% of assigned span by construction, verified by a reconciliation check and a
unit test. This is labeled a **chr22 composition, not whole-genome ancestry**.

## Baseline vs restored-marker comparison (chr22)

| metric | baseline (phased only) | restored markers |
| --- | --- | --- |
| usable markers | 4,999 | 10,192 |
| RFMix windows | 114 | 12 |
| mean SNPs/window | 43.9 | 849.3 |
| analyzed span | ~68.3 Mb (x2 copies) | ~68.7 Mb (x2 copies) |
| runtime | ~8.5 min | ~11.5 min |
| super-pop (by span) | EUR 66.7, SAS 14.1, AMR 12.9, AFR 4.3, EAS 2.0 | EUR 97.5, AMR 2.5 |

**Per-base-pair assignment agreement between the two runs: ~30%** (about 70% of
positions received a different label). The restored run, with ~19x more evidence
per window, merged into 12 long segments and the baseline's minor SAS/AMR/AFR/EAS
fractions largely disappeared.

**Interpretation — stated carefully.** Higher agreement or higher marginal
probabilities do **not** demonstrate accuracy; this comparison measures
stability, not correctness. Two runs can agree and both be wrong. What the
comparison does show is that the baseline's fine-grained minor fractions were
**highly unstable to marker density** and should not have been read as genuine
minor ancestry. The restored run's near-even spread across four European
reference groups (TSI/IBS/CEU/GBR) reflects **limited discrimination among
genetically similar reference populations**, not an established European
sub-ancestry breakdown.

We make **no claim** that the European-dominant result is correct, validated, or
trustworthy, and **no claim** that the small non-European fractions are either
genuine ancestry or definitively noise. Establishing accuracy requires the
held-out benchmark listed under future work.

## Privacy

RFMix inputs/outputs are genetic data under gitignored paths. The run summary is
aggregate counts only; no genotype values. Segment labels are reference-group
codes, not raw genotypes.

## Larger-window experiment (not run)

The optional follow-up was to try a larger RFMix inference window (`-c` CRF
spacing / `-r` RF window size, which the installed v2.03 supports) *if calls
remained unstable*. After marker restoration the calls did not remain unstable:
the restored run collapsed to 12 long, internally-consistent segments at ~849
SNPs/window. The tradeoff of a larger window is more evidence per window but
coarser segment boundaries. We deliberately did **not** run it here: the stated
goal is not to reach a particular expected ancestry, and tuning the window
further after the result already looks European-dominant would risk selecting a
setting for its output. If pursued later it must be saved as a separate labeled
experiment and judged on segment-boundary quality, not on whether it yields an
expected composition.

## Future work (not implemented)

- Evaluate expanding the reference panel to **HGDP + 1000 Genomes** for broader
  population coverage beyond the 26 1000G groups.
- Benchmark sub-population accuracy using **held-out individuals matched to our
  consumer-array markers** (down-sample known-ancestry reference samples to the
  array's SNP set and measure recovery), to quantify where fine-grain calls are
  and are not trustworthy at array density.

These are explicitly left unimplemented for now.
