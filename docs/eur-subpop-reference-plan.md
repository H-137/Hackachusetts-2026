# Expanding European reference subpopulations (open SNP-array data)

Goal: add European (and Europe-adjacent) reference groups our 1000G panel lacks,
so local-ancestry assignment on chr22 can resolve finer EUR identity and the
catalog's EUR-enriched founder variants can reach a specific-group match instead
of only a broad super-population match.

## What 1000G already gives us (EUR)
CEU, GBR, FIN, IBS, TSI — Northwest + Tuscan + Iberian + Finnish only.

## Missing EUR / EUR-adjacent groups and OPEN sources

Focused first-wave additions (biggest real gaps, strongest founder relevance):

| Group | Why | Open source |
| --- | --- | --- |
| Ashkenazi Jewish (ASJ) | Huge share of documented founder variants; absent from 1000G | GEO GSE21478 (Behar 2010), Illumina bead arrays, public |
| Sardinian | Major European isolate, distinct from TSI; own founder variants | HGDP 650K (Jakobsson 2008), Rosenberg lab, public |
| French Basque | Strong European isolate | HGDP 650K |
| Russian | Fills the Eastern/Slavic gap entirely | HGDP 650K |

Deferred second wave (add only if first wave assigns reliably): Orcadian, French,
Adygei, Tuscan(HGDP), plus MID neighbors (Druze, Bedouin, Palestinian) which
matter because ASJ/Sephardi overlie them in PCA.

## Confirmed open sources (no controlled access)

1. HGDP genome-wide SNP data (Jakobsson/Scholz et al. 2008): "525,910 SNPs and
   1428 CNV loci in 485 individuals from 29 populations", Illumina 650K.
   Rosenberg lab, Stanford (open download). Also mirrored at reichdata (Harvard)
   and hgdp.uchicago.edu. Includes Sardinian, French, French Basque, Orcadian,
   Russian, Tuscan, Adygei, Druze, Bedouin, Palestinian.
   NOTE: the small Rosenberg "2810 SNP" / chr21-only files are AIM subsets — too
   sparse for chr22 local ancestry. Use the 525,910-SNP genome-wide set.
2. Behar 2010 Jewish Diaspora: GEO GSE21478, 466 samples, series matrices +
   raw genotype matrices (610/650/660K). Includes Ashkenazi + Sephardi + Mizrahi
   + comparison groups. Public.
3. gnomAD `asj` (and `nfe`, `fin`) allele frequencies — already used for the
   CATALOG EVIDENCE layer (documenting enrichment), separate from the RFMix
   reference-panel layer here.

## Build pipeline (same path we already have, per added population)
download -> extract the population's samples -> harmonize to GRCh37 (lift if the
array build is hg18) -> confirm chr22 marker overlap with the 1000G panel AND the
AncestryDNA sample markers -> phase with Beagle against 1000G -> merge into the
RFMix reference VCF with the population label -> add label to the unified
population vocabulary + super-pop crosswalk.

## Known tradeoff (must manage, not ignore)
Adding many closely-related EUR labels (TSI/IBS/French/Sardinian/CEU/GBR are
genetically close) REDUCES RFMix assignment stability: segments flip between
near-identical labels and marginal probabilities fall. The restored chr22 run
already showed only ~30% assignment agreement between runs. Mitigations:
  - keep the first wave to genuinely distinct groups (ASJ, Sardinian, Basque,
    Russian), not every EUR micro-label;
  - surface "within_superpopulation (EUR) — specific group unresolved" honestly
    rather than forcing a specific call;
  - report assignment stability alongside any finer EUR assignment.

## Feasibility gate (run BEFORE committing to phase/merge)
1. Confirm HGDP genome-wide file downloads and parses; count European samples
   per target population.
2. Confirm GSE21478 Ashkenazi sample count and array build.
3. Measure chr22 marker overlap between each new panel and (a) the 1000G chr22
   panel and (b) the AncestryDNA sample. If overlap in 16.8M-51.2M is too thin,
   the finer EUR labels will not assign reliably -> adjust granularity.

## Privacy / licensing
All sources are open/public human population-reference data. Record citation +
license + intended research use in manifest.json. Keep raw genotypes under a
gitignored path; never commit them; never ship them in the demo bundle.
