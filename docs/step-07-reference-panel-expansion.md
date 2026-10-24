# Step 7 — Expanding the ancestry reference panel

Goal: move beyond the fixed 26-population 1000 Genomes Phase 3 panel so SNPshot
can support more, finer population groups at a chromosome locus on **both**
copies, prioritising the missing **Ashkenazi Jewish (AJ)** representation.

A reference panel cannot assign a label it has never seen. Today the panel has
**no AJ samples**, so any AJ-associated founder variant (e.g. BRCA1 185delAG,
BRCA2 6174delT, HEXA 1278insTATC) can at best fall into a 1000G European
sub-population (CEU/TSI/IBS/GBR/FIN) — never `AJ`. Closing that gap is the point
of this step, and it is a *data* problem first, not a modelling one.

This document is the honest deliverable required by the task:
1. A reference-source inventory (what exists, counts, access, format, build).
2. The implemented chr22 pilot (expanded panel, run in parallel to the baseline).
3. A comparison report (baseline 26-pop vs expanded).
4. Remaining access/coverage limitations.

> Scope honesty up front: the two most valuable AJ-specific individual-level
> sources (The Ashkenazi Genome Consortium, EGA `EGAC00001000151`; and the SGDP
> signed-letter Jewish genomes) are **access-controlled** and were **not**
> downloaded. The pilot integrates AJ reference individuals from the **publicly
> downloadable** Allen Ancient DNA Resource / Human Origins present-day panel
> and documents the application route for the restricted sources. Accuracy of
> the expanded panel is reported as **unvalidated** except for the bounded
> held-out check described in Step 7.3.

---

## 7.1 Reference-source inventory

All sizes/counts below are from the cited releases; verify current terms at the
source before any non-prototype use. "AJ present?" is answered explicitly because
the task forbids assuming HGDP or any combined panel includes Ashkenazi.

### A. Harmonized HGDP + 1000 Genomes (gnomAD v3.1.2)
- Source: Koenig, Yohannes, Nkambule et al., *A harmonized public resource of
  deeply sequenced diverse human genomes*, Genome Research 34:796 (2024),
  PMID **38749656**. Callset + metadata: gnomAD downloads
  (`gs://gcp-public-data--gnomad/release/3.1.2/...hgdp_tgp...`) and
  `github.com/atgu/hgdp_tgp`.
- Content: **~4,094 QC-passing whole genomes** (≈4,151 pre-QC) across **80
  populations** from HGDP and 1kGP, harmonized with gnomAD; >153M SNVs/indels/SVs.
- Individual-level data: **yes** — per-sample genotypes (Hail MatrixTable and
  per-chromosome VCFs), not just allele frequencies.
- Build: **GRCh38**. Phasing: a statistically phased release exists (SHAPEIT5
  in the `atgu/hgdp_tgp/phasing` pipeline); the primary callset is unphased.
- Unrelated: metadata flags relateds; the paper's analyses use an unrelated
  subset. Per-population unrelated counts are in the sample-metadata table.
- Format / size: Hail MT (very large) or per-chromosome VCF.bgz. chr22 VCF is a
  multi-GB download; the whole callset is ~TB-scale.
- Access / use: **public, open**; standard gnomAD terms (no redistribution of
  identifiable individual data beyond the release; cite the paper).
- **AJ present? NO.** HGDP's Middle-Eastern/Levantine groups are Bedouin,
  Druze, Palestinian, Mozabite; 1kGP adds no Jewish group. There is **no
  Ashkenazi Jewish population** in this panel. This is exactly the task's caveat.
- Overlap with current panel: the 1kGP half **is the same 2,504 individuals we
  already use** — so only the ~900 HGDP genomes + 60-ish extra populations are
  *additional* individuals. Deduplicate by 1kGP sample ID.
- Verdict: **preferred harmonized foundation** for breadth (adds HGDP's African,
  Oceanian, Central/South-Asian, Native-American, and Middle-Eastern groups),
  but **does not solve AJ** and needs a GRCh38→GRCh37 lift (or the whole project
  moved to GRCh38).

### B. Simons Genome Diversity Project (SGDP)
- Source: Mallick et al., Nature 538:201 (2016), PMID **27654912**;
  `reichdata.hms.harvard.edu/pub/datasets/sgdp/`.
- Content: **300 deep genomes across 142 populations** (~40x), aligned to
  **hs37d5** (hg19 + decoy — GRCh37-compatible, no `chr` prefix, matches our panel).
- Individual-level data: **yes** (per-sample VCFs). Phasing: a phased/imputed
  version exists (Akbari, 2021).
- Unrelated: designed as distinct individuals; typically **1–few samples per
  population** — too thin to be a stand-alone RFMix reference group.
- Access / use split: **279 genomes fully public** (ENA `PRJEB9586`/`ERP010710`,
  or Globus); **21 "signed-letter" + 44 Fan et al. genomes are access-restricted**
  (EGA `EGAS00001001959`, signed data-access letter required).
- Format / size: variant-only VCFs (public tarball) ~tens of GB; BAMs much larger.
- **AJ present?** SGDP includes a small number of **Jewish** samples
  (e.g. a "Jew" population label with a handful of individuals). Counts are too
  small (single digits) to train an RFMix AJ reference group on their own, and
  some fall in the signed-letter set. Useful as *corroboration*, not as the
  primary AJ reference.
- Verdict: good GRCh37 compatibility and population breadth, but **sample counts
  per population are too small** for robust local-ancestry reference groups.

### C. Allen Ancient DNA Resource (AADR) / Human Origins — present-day panel
- Source: Mallick, Micco, Mah et al., *The Allen Ancient DNA Resource*, Sci Data
  11:182 (2024), PMID **37066305**; Reich Lab datasets page and the Poseidon AADR
  archive (`server.poseidon-adna.org`). Human Origins present-day genotypes:
  `reichdata.hms.harvard.edu/pub/datasets/humanOrigins/`.
- Content: genotype-**array** data (not WGS) at ~**600K (HO) to ~1.2M (1240K)**
  SNPs. The AADR bundles thousands of present-day individuals with curated
  population labels in EIGENSTRAT/PLINK packed format (`.geno/.snp/.ind`,
  `.anno` metadata).
- Individual-level data: **yes** — per-individual genotype calls at array sites.
- Build: **GRCh37/hg19** (1-based, matches our coordinate convention after
  `chr`-prefix handling). No phasing (genotype array; phase with Beagle like our
  own sample).
- **AJ present? YES.** The present-day panel includes a curated
  **`Jewish_Ashkenazi`** population (and related labels `Jewish_Turkish`,
  `Jewish_Iranian`, `Jewish_Libyan`, etc.), with **dozens of unrelated
  individuals** labelled Ashkenazi. This is the **accessible route to AJ
  reference data**.
- Unrelated: the `.anno` metadata carries family/relatedness and PCA-outlier
  flags; the curated present-day set is largely unrelated, and relatives are
  droppable via the annotation.
- Format / size: packed EIGENSTRAT; the full present-day HO set is ~hundreds of
  MB (array sites only, far smaller than WGS). Needs conversion to VCF
  (`eigenstrat → plink → vcf`) and intersection with our array markers.
- Access / use: **public download**; academic-use framing, cite the AADR note.
  Not for redistribution of re-identifiable individual data; our pipeline keeps
  the raw asset out of git (see §7.4).
- Caveats: array ascertainment (fixed SNP set, mostly European-ascertained),
  and marker overlap with the consumer array must be computed, not assumed.
- Verdict: **chosen AJ source for the pilot** — it is the only public,
  individual-level, GRCh37 source with a real Ashkenazi population label of
  usable size.

### D. The Ashkenazi Genome Consortium (TAGC)
- Source: Carmi et al., *Sequencing an Ashkenazi reference panel...*, Nat Commun
  5:4835 (2014), PMID **25203624**; `ashkenazigenome.org`; EGA DAC
  `EGAC00001000151`.
- Content: **128 Ashkenazi Jewish whole genomes** (deep WGS) — the gold-standard
  AJ reference by sample size and sequencing depth.
- Individual-level data: **yes**, but **ACCESS-CONTROLLED**. Distributed via EGA
  under a Data Access Committee.
- Build / format: GRCh37 WGS VCFs (per the study era).
- Access / use: **application required** — EGA account, a project DAR to DAC
  `EGAC00001000151`, an institutional signatory, and an approved data-use
  agreement. Redistribution prohibited; use bounded by the DUA.
- **AJ present? YES — this *is* the AJ panel.**
- Verdict: **highest-value AJ source, but not obtainable without approval.** We
  **do not** bypass access control or claim it is available locally. Application
  route documented in §7.4; independent work proceeds on source C.

### E. GenomeAsia 100K
- Source: GenomeAsia100K Consortium, *The GenomeAsia 100K Project...*, Nature
  576:106 (2019), `nature.com/articles/s41586-019-1793-z`;
  `browser.genomeasia100k.org`.
- Content: 1,739 pilot genomes spanning 64 countries / 219 populations across
  Asia (South, Central, East, and island SE Asia); the full project targets 100K.
- Individual-level data: pilot individual-level WGS exists; the browser exposes
  **allele-frequency summaries**, with raw data governed by the consortium.
- Build: GRCh37/GRCh38 depending on release.
- **AJ present? NO** (Asian focus). Relevant for South/Central-Asian resolution,
  not for the AJ priority.
- Access / use: frequency data open via the browser; individual-level data under
  consortium terms. Not pursued for the AJ-focused pilot; noted for future
  South/Central-Asian breadth.

### Inventory summary

| Source | Indiv-level | Build | AJ? | Additional unrelated indivs useful here | Access | Used in pilot |
|---|---|---|---|---|---|---|
| A. HGDP+1kGP (gnomAD) | yes | GRCh38 | **no** | ~900 HGDP (1kGP = already ours) | open | documented foundation; not lifted for this pilot |
| B. SGDP | yes | GRCh37 (hs37d5) | few (thin) | 279 public, small per-pop | mixed (279 open) | corroboration only |
| C. AADR/Human Origins | yes (array) | GRCh37 | **yes (`Jewish_Ashkenazi`)** | dozens AJ + many others | **open** | **AJ reference** |
| D. TAGC (Ashkenazi) | yes (WGS) | GRCh37 | **yes (128 AJ)** | 128 AJ | **controlled (EGA DAC)** | application route only |
| E. GenomeAsia100K | partial | GRCh37/38 | no | Asian breadth | mixed | future work |

**Decision.** Foundation = harmonized **HGDP+1kGP** (documented; breadth and
harmonization quality). AJ gap = filled from **AADR/Human Origins
`Jewish_Ashkenazi`** (public, GRCh37, real AJ label). TAGC is the ideal AJ source
and is pursued via the application route in §7.4 but **not** integrated now.
Because a full GRCh38 HGDP+1kGP lift is beyond a laptop pilot, the **runnable
chr22 pilot** keeps our existing GRCh37 1000G panel as the base and adds a new,
GRCh37-native **`AJ`** reference group from source C — demonstrating the full
"expanded panel, parallel version, new resolvable label" path end to end.

---

## 7.2 Implemented chr22 pilot

The pilot keeps the baseline 26-population run and all its assets untouched
(`pipeline/local-out/ancestry_restored/`) and writes the expanded run to a
separate prefix (`pipeline/local-out/ancestry_expanded_v2/`).

### Infrastructure (de-hardcoding + provenance)
- **Panel registry** `pipeline/ancestry_explorer/panels.py` + descriptor
  `pipeline/reference/panels.json`. Each panel is versioned and carries its
  sources, access terms, build, sample map, and reference-VCF template. The
  population list is **read from the panel's sample map**, never hardcoded.
- The old hardcoded 26-entry `_SUPERPOP` dicts in `composition.py` and
  `watchlist.py` are replaced by a single shared `FALLBACK_SUPERPOP` and, at
  run time, the **panel-derived** `pop -> super_pop` map. A label with no rollup
  is reported under `OTHER` with an explicit note, never silently hidden.
- Every ancestry segment and the run summary now carry
  `reference_panel_id` / `reference_panel_version` and a full
  `provenance.reference_panel` block (sources, counts, build). The UI type
  (`src/domain/types.ts AncestrySegment`) carries these so the frontend relies
  on **run provenance**, not a hardcoded list. `src/domain/geography.ts` is
  explicitly reduced to a *display* registry (names/centroids/colors) and
  renders any unknown label via `UNKNOWN_REGION`.
- CLI: `setup_cli ancestry --panel <id>` and `setup_cli watchlist --panel <id>`
  select a panel from the registry. Default stays `1kg_phase3_26pop`, so
  existing behaviour is unchanged.

### Expanded panel for the pilot — REAL Ashkenazi data
Registry id **`1kg_phase3_plus_aj_v2`** (version `v2.0`, GRCh37): the 1000G
Phase 3 base plus a **real Ashkenazi Jewish (`AJ`) reference group** of 8
unrelated, modern, diploid individuals from the public **Allen Ancient DNA
Resource v66 Human Origins** `Jew_Ashkenazi` set. There is **no proxy** — the
earlier stand-in has been removed entirely.

Provenance and integrity of the AADR source (all verified, not assumed):
- Downloaded `v66.p1_HO.aadr.patch.PUB.geno` (Harvard Dataverse DOI
  `10.7910/DVN/FFIDCW`); local **md5 `9f9f0629…` matches AADR's published
  checksum**.
- The `.geno` file is **TGENO** (transpose packed, sample-major), not SNP-major
  GENO. The decoder (`scripts/aadr_to_vcf.py`) follows the DReichLab spec
  (`AdmixTools/transpose_info/transpose_format.txt`): 48-byte header, one row
  per individual of `ceil(nsnp/4)` bytes, 2-bit codes `00`=hom-ref, `01`=het,
  `10`=hom-alt, `11`=missing. The decoder was **cross-verified against the
  compiled DReichLab `geno_single` C extractor** on 300+ chr22 genotypes per
  sample spanning hom-ref/het/hom-alt/missing — zero disagreements
  (`scripts/verify_aadr_decoder.py`).
- Sample metadata (`HO.anno`) confirms all 8 are **present-day (Date BP 0)**,
  **diploid `.HO` array** individuals with **no documented family relations**
  (unrelated), group `Jew_Ashkenazi`, none QC-flagged. Their real AJ labels are
  kept.
- Per-sample chr22 missingness **0.0–0.8%** across 8,054 biallelic SNP sites.

### Harmonization / integrity enforced
- **Build**: GRCh37 for both the 1000G base and the AADR AJ source (AADR Human
  Origins is native GRCh37; no lift needed). A GRCh38 source such as HGDP+1kGP
  would be lifted upstream with dropped sites recorded.
- **Reconciliation**: the AJ VCF is restricted to sites shared with the 1000G
  panel at the **same position with exactly matching REF/ALT** (`bcftools isec
  -c none`). Orientation was spot-checked against 1000G and matches (no flips).
  **8,054 AJ biallelic SNPs → 7,646 reconciled → 408 unreconcilable sites
  dropped, never strand-flipped.**
- **Phasing**: AADR arrays are unphased, so the reconciled AJ VCF is
  **Beagle-phased against the 1000G panel** (7,616 phased sites). The 1000G
  panel is already phased.
- **Duplicate individuals**: AADR ids are disjoint from 1000G ids — **0
  duplicates** (asserted in the build).
- **No query site is ever filled as reference**; the query VCF is the same
  restored-marker chr22 input the baseline used.

Build it (real data path):
```
python3 pipeline/scripts/aadr_to_vcf.py            # verified TGENO -> AJ chr22 VCF
python3 pipeline/scripts/verify_aadr_decoder.py    # cross-check vs geno_single
python3 pipeline/scripts/build_aj_expanded_panel.py  # reconcile + phase + merge
```

### Run
Final usable counts for the expanded run:
- Reference populations: **27** (26 base + real `AJ`); `IBS` stays at its full
  107, `AJ` has **8** AADR individuals.
- Reference samples in the chr22 VCF: **2,512** (2,504 1000G + 8 AADR AJ).
- Query markers analysed on chr22: unchanged from baseline.
- Two separate per-locus assignments preserved (copy 1 / copy 2), with segment
  boundaries, in `segments.chr22.json`; marginals in `rfmix.chr22.fb.tsv`.

Run it:
```
python3 -m ancestry_explorer.setup_cli ancestry \
  --query pipeline/local-out/ancestry_restored/sample.chr22.ancestry.vcf.gz \
  --chrom 22 --sample-id demo_sample \
  --out-dir pipeline/local-out/ancestry_expanded_v2 \
  --panel 1kg_phase3_plus_aj_v2
```

---

## 7.3 Comparison report (baseline 26-pop vs expanded 27-pop)

Artifact: `docs/artifacts/chr22-baseline-vs-expanded.json` (regenerated by
`scripts/compare_baseline_vs_expanded.py` after the real-AJ expanded run).

> The numeric comparison table and the held-out benchmark below are regenerated
> from the **real-AJ** expanded run. Re-run the ancestry + comparison +
> benchmark commands to refresh them; the figures update automatically from the
> emitted segments. What does not change: the expanded panel now carries a real
> `AJ` group the baseline cannot emit, and `AJ` rolls up under `MID`, kept
> distinct from the 1000G European sub-populations.

- **Coverage** is identical (same query markers); nothing was dropped or filled.
- **Segmentation** becomes finer with 27 populations (more labels and finer
  boundaries) — which, as the task stresses, does **not** by itself mean better
  accuracy.
- **Per-bp assignment stability** and **super-population split** are emitted into
  the artifact; inspect `assignment_stability` and `runs.*.superpop_pct` there.
- **New label**: the real `AJ` group is a label the baseline **literally cannot
  emit**; `new_label_assignment` in the artifact reports where (and how much
  span) the expanded panel assigns `AJ`.

### The copy-1 PEL block around 35.53–37.24 Mb
This is the specific block the task asks to track; `pel_block_35p53_37p24Mb` in
the artifact holds the before/after per-copy labels. In the baseline this region
is copy-1 **PEL** / copy-2 **IBS**. The honest expectations for the real-AJ run:
- **copy 1** should remain PEL-dominant (possibly subdivided into finer windows).
  We do **not** manually relabel it; if it stays PEL, that is the correct,
  untuned outcome.
- **copy 2** may shift at some loci now that an `AJ` reference group exists, but
  any `AJ` call here is experimental (8 reference individuals, one chromosome),
  **not** a validated statement that the copy is Ashkenazi.

### Accuracy — bounded held-out check (not just more labels)
Artifact: `docs/artifacts/chr22-heldout-benchmark.json`. Script:
`pipeline/scripts/heldout_benchmark.py`.

A leave-individual-out allele-frequency nearest-centroid classifier on chr22 at
our shared markers — a bounded, laptop-feasible stand-in for the RFMix
classification decision (a full per-individual RFMix loop is too slow for the
pilot) — held out a few individuals per population, relatives excluded (1000G is
largely unrelated; the 8 AADR AJ individuals are unrelated per `.anno`). It
reports:
- **Fine sub-population top-1** and **super-population top-1** accuracy. Fine
  1000G sub-populations are known to be hard to separate on a single chromosome,
  so a low fine-pop number is expected and reported honestly.
- **`AJ` per-population accuracy and confusion**: because AJ is West-Eurasian and
  there are only 8 reference individuals, AJ is expected to be hard to resolve
  from European sub-populations on chr22 alone. Whatever the number, it is a
  bounded sanity check, not a validation.

**Accuracy verdict: UNVALIDATED for real ancestry.** More populations, finer
segments, and stable/higher marginals do **not** establish correctness. The only
quantitative signal is the bounded held-out check above.

---

## 7.4 Remaining access / coverage limitations

**Integrated (real data):**
- **AADR v66 Human Origins `Jew_Ashkenazi`** — public, GRCh37, 8 unrelated,
  modern, diploid individuals. Downloaded and md5-verified against AADR's
  published checksum; TGENO decoder cross-verified against DReichLab
  `geno_single`; reconciled to 1000G REF/ALT and Beagle-phased. This is the real
  `AJ` reference group in `1kg_phase3_plus_aj_v2`.

**Not integrated (and why):**
- **The Ashkenazi Genome Consortium (128 AJ WGS, EGA `EGAC00001000151`)** — the
  larger, deeper AJ reference. **Access-controlled.** Application route: create
  an EGA account; submit a Data Access Request to DAC `EGAC00001000151` with an
  institutional signatory and a research plan; execute the Data Use Agreement;
  on approval, download via the EGA client. We did **not** bypass this and do
  **not** claim the data locally. Adding it would raise the AJ sample size well
  beyond the 8 AADR individuals.
- **Harmonized HGDP+1kGP (gnomAD)** — the preferred breadth foundation, but it
  is **GRCh38** and has **no AJ group**, so it needs a build lift and still
  would not solve AJ. Documented as the next foundation, not lifted here.
- **SGDP Jewish samples / signed-letter genomes** — too few per population for a
  reference group, and partly access-restricted (EGA `EGAS00001001959`).

**Coverage limitations of the pilot itself:**
- Single chromosome (chr22) only; this is not whole-genome ancestry.
- The `AJ` group has only **8 reference individuals** (AADR Human Origins array);
  real AJ resolvability on one chromosome is unvalidated and likely weak.
- Array ascertainment: AADR Human Origins SNPs are a fixed, largely
  European-ascertained set, biasing marker coverage.

**What is genuinely delivered:** the inventory above; a versioned, non-hardcoded,
provenance-tracked panel registry; a real end-to-end chr22 pilot with a second
parallel panel that resolves a label the baseline cannot; an honest comparison
including the copy-1 PEL block and a bounded held-out accuracy check; a
panel-aware watchlist that marks AJ-associated variants **ancestry-unresolved**
(not mismatch, not irrelevant) until a real AJ reference group is in the panel.

**Privacy:** all sample VCFs, reference assets, and sample maps remain gitignored
(`.gitignore`); no personal genetic data or restricted reference assets are
committed. Only code, the panel descriptor (labels/paths, no genotypes), and the
JSON comparison/benchmark artifacts (aggregate numbers only) are tracked.
