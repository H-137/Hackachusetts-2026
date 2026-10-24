# chr22 ancestry-informed watchlist — catalog expansion research

Working notes for the chr22 catalog expansion. Every population tag below is
backed by a recorded query (ClinVar E-utilities for pathogenicity/coordinate/
review status; gnomAD r2.1.1 GraphQL for per-population allele frequency;
GeneReviews/OMIM for documented founder effects). Nothing here is asserted from
memory. This is reference/evidence metadata, not personal data. Research
prototype — verify current ClinVar/gnomAD status before any real use.

## Reproducible search method (the funnel)

Keyword web search alone under-samples (recall is limited to names you already
know, and prose rarely states chromosome + coordinate + classification + review
status + population together). The structured funnel used instead:

1. ClinVar E-utilities — enumerate chr22 variants inside our real ancestry
   coverage window and filter by classification + review status + coordinate.
   Endpoint: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi`
   Field tags that work: `[chromosome]`, `[chrpos37]` (position range on
   GRCh37), `"clinsig pathogenic"[Properties]`, `"<status>"[Review status]`.
2. gnomAD r2.1.1 (GRCh37) GraphQL — the actual source of population enrichment.
   A variant earns a population tag ONLY if gnomAD shows real per-population
   allele-frequency skew. Endpoint: `https://gnomad.broadinstitute.org/api`.
3. GeneReviews / OMIM founder tables — corroborate documented founder effects.

Our real chr22 ancestry coverage (restored RFMix run,
`local-out/ancestry_restored/segments.chr22.json`): chr22 16,869,886 →
51,213,613 (0-based), both copies. Labels present: TSI, CEU, IBS, GBR (all EUR
super-pop) and one PEL (AMR) window. No AFR / EAS / SAS / AJ label anywhere on
chr22 in this run — a hard constraint on which associations can be `supported`.

## ClinVar funnel results (chr22, window 16,000,000–51,300,000, GRCh37)

| Filter | Count |
| --- | --- |
| P/LP (`clinsig pathogenic`) in window | 5,897 |
| ...reviewed by expert panel | 10 |
| ...practice guideline | 0 |
| ...multiple submitters, no conflicts | 1,601 |

So chr22 has MANY pathogenic variants, but the clinically strongest tier is
small, and — critically — review status does not encode population enrichment.

The 10 expert-panel P/LP variants in the window are all **GP1BB** (~19.71 Mb,
Bernard–Soulier / platelet disorder) and **LZTR1** (~21.33–21.35 Mb,
schwannomatosis / Noonan). Neither gene has documented single-population founder
enrichment; they are pan-ethnic. This confirms: chr22's highest-confidence P/LP
variants are NOT population-enriched. Population signal lives in gnomAD frequency
skew, not in ClinVar's review tier.

## Population-enrichment candidates (gnomAD r2.1.1, GRCh37) — real frequencies

Allele frequency = AC/AN per population, computed from recorded gnomAD responses.

### PNPLA3 I148M — rs738409 — 22-44324727-C-G (in window)
Condition: steatotic liver disease (MASLD/NAFLD) susceptibility. ClinVar
aggregate: **risk factor / association** (NOT Mendelian P/LP). Enriched in
Admixed American/Hispanic ancestry.

| Pop | AC/AN | AF |
| --- | --- | --- |
| AMR | 425/846 | 50.2% |
| EAS | 589/1544 | 38.2% |
| ASJ | 69/288 | 24.0% |
| FIN | 786/3470 | 22.7% |
| NFE | 3437/15324 | 22.4% |
| AFR | 1209/8692 | 13.9% |

AMR ≫ AFR: genuine enrichment. Our chr22 has a real PEL (AMR) window at
~35.53–37.24 Mb; the variant at 44.32 Mb sits in a TSI/GBR (EUR) region, so for
THIS sample the AMR association is a documented-enrichment note, while the
sample's locus ancestry here is European → population match unresolved for the
specifically associated AMR group (within/again different super-pop), not
"supported". Shown as a risk allele, never as pathogenic.

### APOL1 G1 — rs73885319 — 22-36661906-A-G (in window)
(+ rs60910145, 22-36662034-T-G, the second G1 SNP, in near-complete LD.)
Condition: APOL1-mediated kidney disease risk (FSGS, HIV-associated nephropathy,
hypertension-attributed ESKD) when biallelic G1/G2. ClinVar: **risk allele**.
Trypanosome-selection → African-ancestry-specific.

| Pop | AC/AN | AF |
| --- | --- | --- |
| AFR | 1912/8682 | 22.0% |
| OTH | 7/1086 | 0.6% |
| AMR | 8/848 | 0.9% |
| NFE | 4/15406 | 0.03% |
| ASJ/EAS/FIN | 0 | 0% |

### APOL1 G2 — rs71785313 / rs1317778148 — 22-36662041-AATAATT-A (in window)
6-bp in-frame deletion (p.Asn388_Tyr389del). gnomAD r2.1.1: AFR 14.0%, NFE 0%.

APOL1 is ~36.66 Mb — inside coverage. Our panel has NO AFR label on chr22, so
for this sample APOL1's African-ancestry association is **population match
unresolved against our EUR-only reference panel** — explicitly NOT "no
association" and NOT "safe". This is the clearest demonstrator of the
"unresolved" state the workflow must distinguish.

## Honest limitation (to surface in the UI and report)

chr22 within our coverage offers essentially NO well-supported *Mendelian* P/LP
variant with documented single-population founder enrichment that is also
resolvable by our EUR-only reference panel:
- Expert-panel P/LP (GP1BB, LZTR1): pan-ethnic, no founder enrichment.
- ARSA MLD (already in catalog, 51.06 Mb): pan-ethnic.
- The strongest population-association variants on chr22 (APOL1 AFR, PNPLA3 AMR)
  are RISK alleles, not Mendelian P/LP, and their associated populations
  (AFR, AMR) are weakly or not represented in this sample's chr22 EUR ancestry
  → `unresolved` / `within_superpopulation`, never `supported`.

### Best-supported next chromosomes (for when more chromosomes are processed)
- **chr11 — HBB HbS rs334** (already curated): African-ancestry enrichment, a
  directly array-typed SNP; processing chr11 would let locus ancestry either
  support or leave-unresolved a real observed finding.
- **chr7 — CFTR F508del**: European-enrichment, very strong clinical evidence.
- **chr6 — HFE C282Y rs1800562**: Northern-European enrichment, array-typable
  SNP, already curated in conditions.py.
These have both strong evidence AND a population whose reference label our panel
can represent, so they can reach `supported` where chr22 cannot.

## Full programmatic mine (all chr22 P/LP in window) — results

Instead of hand-picking, `catalog_mine.py` enumerated every chr22 P/LP ClinVar
record in the window and joined gnomAD r2.1.1 per-population allele frequencies.
Artifacts: `docs/artifacts/chr22-all-plp.jsonl` (all 5,897 rows),
`docs/artifacts/chr22-enrichable.jsonl` (same, gnomAD queried at AF>=0.01%),
`docs/artifacts/chr22-candidates-ranked.json` (the 20 with per-pop freqs, ranked).

Funnel counts:
- 5,897 P/LP records on chr22 in window.
- 3,704 have a dbSNP rsid; 762 have ANY reported gnomAD global AF.
- Of those: 2 at >=0.1%, 29 at >=0.01%, the rest rarer.
- 20 resolved to gnomAD per-population frequencies with measurable enrichment.

Key empirical point: chr22 P/LP variants are overwhelmingly rare (that is part
of why they are pathogenic), so very few carry a population-frequency signal to
be "tied to an ancestry". The population tie is the rare property; the funnel is
genuinely narrow even though the raw P/LP count is large.

### Top data-driven candidates (gnomAD AF, review = multiple submitters unless noted)

| Gene | rsid | pos37 | top pop | AF | note |
| --- | --- | --- | --- | --- | --- |
| CHEK2 c.1100delC | rs555607708 | 29,091,857 | FIN 0.86% / ASJ 0.69% | 5.3x | European founder; breast/colorectal predisposition. STRONG. |
| SCO2 | rs749838192 | 50,962,824 | FIN 1.01% | — | fatal infantile cardioencephalomyopathy (recessive). |
| UPB1 | rs143493067 | 24,919,586 | ASJ 0.34% | 3.3x | beta-ureidopropionase deficiency (recessive). |
| ADA2 | rs139750129 | 17,669,339 | FIN 0.12% | — | DADA2 / Sneddon (recessive vasculopathy). |
| ARSA | rs74315457 | 51,065,404 | NFE 0.12% | — | MLD; same gene as existing ARSA entry. |

All land inside our real chr22 EUR-ancestry windows, so FIN/NFE/ASJ
associations resolve to `within_superpopulation` (EUR) at minimum, and where our
locus label is a specific EUR reference pop they can reach `supported`. These
are the first chr22 entries that can demonstrate panel-compatible population
support, unlike the AFR/AMR risk alleles (APOL1/PNPLA3), which stay `unresolved`
against our EUR panel.

## Catalog expansion — DONE (variants added to catalog.py / watchlistCatalog.ts)

The research funnel above produced the candidates; the following five chr22
variants are now in the live catalog (both the Python `catalog.py` and the UI
`watchlistCatalog.ts`), selected by documented gnomAD population enrichment:

| variant_id | gene | pos37 | enriched pop (AF) | on real data (chr22) |
| --- | --- | --- | --- | --- |
| CHEK2_c1100delC | CHEK2 | 29,091,857 | FIN 0.86% / ASJ 0.69% | within_superpopulation (locus IBS/GBR) |
| UPB1_c917minus1GA | UPB1 | 24,919,586 | ASJ 0.34% | mismatch (no AJ panel label) |
| ARSA_c542T_G | ARSA | 51,065,404 | NFE 0.12% | **supported** (locus TSI/GBR ∈ NFE 1000G pops) |
| SCO2_c16_17ins | SCO2 | 50,962,824 | FIN 1.01% | within_superpopulation |
| ADA2_c973minus2AG | ADA2 | 17,669,339 | FIN 0.12% | within_superpopulation |

Catalog size: 5 -> 10 (chr22 entries: 1 -> 6). ARSA c.542T>G is the first chr22
entry that reaches `supported` against this sample's real locus ancestry — the
concrete payoff the research predicted. FIN-enriched entries correctly resolve
to `within_superpopulation` (EUR, not specifically Finnish), and the ASJ entry
to `mismatch`, against this EUR-only chr22 ancestry. No association is
fabricated; every frequency is a recorded gnomAD r2.1.1 value.

Tests: `test_chr22_expansion_present_and_in_window` asserts the additions exist
and fall in the real ancestry window; the classification test accepts the valid
`Pathogenic/Likely pathogenic` aggregate while still excluding VUS/benign/
conflicting.

## LOCKED chr22 catalog (threshold A: >=2x enrichment AND >=0.1% AF in the associated pop)

Display gate: a population TAG is applied only when the variant's gnomAD AF in
the associated population is >=0.1% AND >=2x the median of other gnomAD pops
(ratio "inf" = allele present in top pop, ~0 elsewhere, passes the ratio test).
All coordinates GRCh37, verified against ClinVar esummary + gnomAD r2.1.1.

### Mendelian P/LP with a supported/contextualized population tag (6)

| Gene | HGVS | rsid | GRCh37 | Condition | Inheritance | Review | Enriched pop (AF) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SCO2 | c.16_17ins... (p.Arg6fs) | rs749838192 | 22:50,962,824 ins | Fatal infantile cardioencephalomyopathy (COX def.) | AR | multi-submitter | FIN 1.01% |
| CHEK2 | c.1100del (p.Thr367fs) | rs555607708 | 22:29,091,857 del | Breast/colorectal/prostate cancer predisposition | AD (moderate penetrance) | multi-submitter | FIN 0.86%, ASJ 0.69% (5.3x) |
| UPB1 | c.917-1G>A | rs143493067 | 22:24,919,586 | Beta-ureidopropionase deficiency | AR | multi-submitter | ASJ 0.34% (3.3x) |
| LZTR1 | c.1407G>A (p.Trp469Ter) | rs777243508 | 22:21,348,266 | Noonan syndrome 2 / schwannomatosis | AD/AR | multi-submitter | FIN 0.14% |
| ADA2 | c.973-2A>G | rs139750129 | 22:17,669,339 | Deficiency of ADA2 (DADA2) / Sneddon | AR | multi-submitter | FIN 0.12% |
| ARSA | c.542T>G (p.Ile181Ser) | rs74315457 | 22:51,065,404 | Metachromatic leukodystrophy | AR | multi-submitter | NFE 0.12% |

### Risk alleles (separate evidence_class; NOT labeled Pathogenic) (2)

| Gene | variant | rsid | GRCh37 | Condition | Enriched pop (AF) |
| --- | --- | --- | --- | --- | --- |
| APOL1 | G1 (S342G) + G2 (del) | rs73885319 / rs71785313 | 22:36,661,906 / 36,662,041 | APOL1 kidney disease (biallelic) | AFR 22% (1696x) |
| PNPLA3 | I148M | rs738409 | 22:44,324,727 | Steatotic liver disease susceptibility | AMR 50% |

### Pan-ethnic Mendelian, NO population tag (demonstrates "no supported association") (1)
| Gene | variant | GRCh37 | note |
| --- | --- | --- | --- |
| ARSA | c.907G>A (existing entry) | 22:51,064,654 | MLD, pan-ethnic, associated_populations=[] -> no_association_documented |

TOTAL chr22 catalog: 6 tagged P/LP + 2 risk alleles + 1 pan-ethnic Mendelian = 9 entries.

### How each resolves against our real chr22 ancestry (restored run; EUR labels TSI/CEU/IBS/GBR + PEL)
- FIN/NFE/ASJ-enriched EUR variants: our locus labels are EUR (TSI/CEU/IBS/GBR)
  -> `within_superpopulation` (EUR) at minimum; `supported` only if the locus
  label equals the specific enriched group (we have no FIN/ASJ reference label on
  chr22 yet -> these stay `within_superpopulation` / unresolved-for-specific).
  Adding FIN is already in 1000G (not on this sample's chr22); ASJ needs the
  GSE21478 panel addition to ever reach `supported`.
- APOL1 (AFR): our chr22 has NO AFR label -> `population_match_unresolved`
  against our panel (NOT mismatch/safe).
- PNPLA3 (AMR): our chr22 has a real PEL(AMR) window at 35.5-37.2M, but PNPLA3 is
  at 44.3M (a TSI/GBR EUR window) -> for THIS sample, AMR association vs EUR
  locus -> unresolved/mismatch, shown honestly.
- ARSA c.907G>A pan-ethnic: `no_association_documented` even though locus
  resolves (TSI/GBR) -> demonstrates the "ancestry known, no supported
  association" state.
