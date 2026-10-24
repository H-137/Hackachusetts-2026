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

## Privacy

RFMix inputs/outputs are genetic data under gitignored paths. The run summary is
aggregate counts only; no genotype values. Segment labels are reference-group
codes, not raw genotypes.

## Future work (not implemented)

- Evaluate expanding the reference panel to **HGDP + 1000 Genomes** for broader
  population coverage beyond the 26 1000G groups.
- Benchmark sub-population accuracy using **held-out individuals matched to our
  consumer-array markers** (down-sample known-ancestry reference samples to the
  array's SNP set and measure recovery), to quantify where fine-grain calls are
  and are not trustworthy at array density.

These are explicitly left unimplemented for now.
