# Ancestry-Aware Variant Explorer — Coding Agent Plan

## 1. Objective

Build a hackathon research prototype that combines consumer SNP data, inferred local genetic ancestry, and curated disease-variant evidence in an interactive chromosome explorer. Help users understand what the available data supports, what is missing, and where confirmatory testing would be needed.

The primary deliverable is a working demonstration with synthetic data and transparent evidence. It is not a diagnostic tool or a replacement for clinical genetic testing.

## 2. Problem and motivation

Patient histories often include self-identified ethnicity, which can prompt clinicians to consider ancestry-associated inherited conditions. However, broad categories can obscure mixed ancestry, family history may be unavailable, and patients may not know all of their ancestral backgrounds. Self-identified ethnicity also describes social and cultural identity and should not be treated as equivalent to genetic ancestry.

The proposed project explores whether consumer SNP data can add useful genetic context between a verbal history and more comprehensive genetic testing. The user supplied approximate prices of $50 for consumer testing and up to $1,000 for whole-genome sequencing as motivation. Treat these as unverified project assumptions, not current price comparisons or evidence of cost effectiveness. Clinical evaluation may use targeted testing or gene panels rather than whole-genome sequencing; insurance coverage varies.

An illustrative example is the higher frequency of certain pathogenic BRCA1 and BRCA2 founder variants among people with Ashkenazi Jewish ancestry. There is no single BRCA1 mutation responsible for breast cancer. Ancestry does not establish whether someone carries a pathogenic variant, and an ancestry estimate cannot rule one out.

### Core hypothesis

Combining actual observed variants with local ancestry context and clearly sourced evidence could make genetic information more interpretable, particularly when broad ancestry categories are inadequate. Demonstrating improved clinical decisions, affordability, or equity is future validation work, not an MVP claim.

### Terminology

Use **local genetic ancestry near a gene** rather than “gene-specific ethnicity.” Ancestry is inferred for chromosome segments relative to selected reference populations. It is not an intrinsic ethnicity label attached to a gene or variant.

## 3. Product questions

The prototype should let a user ask:

1. What ancestry assignments are estimated along each chromosome copy, and how uncertain are they?
2. Which curated disease-associated variants are present in the supplied data?
3. How common are those variants across available ancestry reference groups?
4. What evidence supports a clinical or statistical association?
5. Which relevant variants were not measured or cannot be interpreted reliably?
6. What does the implemented disease-specific research score measure, is this sample sufficient to calculate it, and in which populations has the model been evaluated?

## 4. Required implementation scope

Complete all milestones in Section 9 in order. These are required deliverables, not a menu of optional features. Synthetic fixtures support development and demonstration; they do not replace the real input pipeline.

- Parse and assess the AncestryDNA five-column text format specified below.
- Produce harmonized, reference-aligned autosomal VCF data.
- Run statistical phasing against a versioned reference panel.
- Implement a family-aware path when users supply parental files; the single-sample path must also work.
- Run local ancestry inference and preserve probabilities and unknown regions.
- Annotate variants with population frequencies and disease evidence.
- Implement one published disease-specific research score with independently checked calculation and explicit data-sufficiency rules.
- Display two tracks per autosome with clickable variants, evidence, and coverage.
- Export results, methods, quality metrics, and provenance.
- Bundle a synthetic demo that works without network access.

### Required input contract: AncestryDNA raw text

The starting input is a UTF-8 text file with `#` comment lines followed by five **tab-delimited** columns:

```text
rsid	chromosome	position	allele1	allele2
rs3131972	1	752721	G	G
rs114525117	1	759036	G	G
rs4040617	1	779322	A	A
rs141175086	1	780397	C	C
```

The supplied header declares AncestryDNA array V2.0, converter V1.0, human reference build 37.1 coordinates, and forward (+) strand alleles. Parse these declarations rather than guessing from positions. Preserve the exact build declaration and verify compatibility with the selected GRCh37 reference assets before normalization. Raw positions are 1-based; convert to internal 0-based positions by subtracting one.

Implement these parser rules:

1. Read metadata from leading comment lines; preserve array version, converter version, build, strand, and generation timestamp in private processing metadata.
2. Validate the five column names and parse tab-delimited records; support CRLF and LF line endings and an optional UTF-8 BOM.
3. Preserve the original identifier, chromosome, position, and two alleles before harmonization. Do not interpret `allele1` and `allele2` as parental copies or as REF and ALT.
4. Accept positive integer positions and autosomal chromosome codes 1–22 for the analysis path. Retain counts and reasons for other chromosome records excluded from this first implementation.
5. Accept A/C/G/T SNP calls. Recognize documented missing-call encodings after verifying the source specification; report unexpected tokens and unsupported indels instead of coercing them.
6. Collapse exact duplicate records with an audit count; exclude conflicting duplicates from inference and report them.
7. Validate alleles using the reference genome and a compatible variant/reference-panel catalog. A homozygous row alone does not establish both REF and ALT.
8. Return parsed records, metadata, a quality summary, and line-numbered errors without logging allele data.
9. Treat the four rows above as a parser example only. They are insufficient for genome-wide phasing, ancestry inference, or disease scoring. An upload containing only these rows must produce an insufficient-data result rather than fabricated downstream outputs.
10. Preserve the source's genealogical-use and nonmedical-use notice in source provenance. Do not present the prototype as clinical validation of the consumer test.

### Out of scope

- Diagnosing disease or recommending treatment.
- Comprehensive screening for rare inherited disorders from a consumer SNP array.
- Reconstructing a complete genome sequence from SNP data.
- Assigning ethnicity from a single variant or its highest population frequency.
- Generating one combined score for all genetic diseases.
- Claiming ancestry alone establishes the presence or absence of a pathogenic variant.
- Building a broad clinical risk engine by summing arbitrary ClinVar entries or GWAS associations.

## 5. Demo workflow

1. Open the app and choose **Upload AncestryDNA text** or **Explore synthetic demo**.
2. For an upload, validate input and run the local processing pipeline; show stage progress and actionable failures.
3. See a brief sample-quality and coverage overview.
4. Select a chromosome and inspect two ancestry tracks with uncertainty shading.
5. Select a variant marker to view its genotype, segment context, frequency comparison, evidence, and measurement status.
6. Open a condition page to see the curated variants examined and the relevant variants missing from the dataset.
7. Export the research summary.

Keep implementation details out of the main user flow. Put model versions, reference panels, genome builds, and processing parameters in an expandable methods view and the export.

## 6. Scientific pipeline and boundaries

```text
Consumer SNP file                         Synthetic/precomputed demo
       |                                             |
Parse, validate, harmonize                            |
       |                                             |
Phasing, optionally family-aware                     |
       |                                             |
Local ancestry inference                             |
       +---------------------+-----------------------+
                             |
                  Normalized internal records
                             |
            Variant evidence + population frequencies
                             |
          Chromosome explorer + coverage/evidence report
                             |
          Validated disease-specific research score
```

### A. Parse and harmonize

- Identify the source format and record file metadata.
- Detect or require an explicit genome build; never silently assume one.
- Normalize chromosome names and identify duplicate, invalid, and missing calls.
- Match variants by build, chromosome, position, reference allele, and alternate allele. An rsID alone is not a sufficient join key.
- Validate reference alleles against the corresponding reference genome before creating a VCF.
- Handle strand and ambiguous-allele issues explicitly. Never silently flip alleles to force a match.
- Start real-data support with autosomal, biallelic SNPs; report unsupported records.
- Any liftover must record its source/target builds and reject ambiguous mappings.

### B. Phase

- Statistical phasing estimates which alleles belong on the same chromosome copy.
- Use a compatible phased reference panel and genetic map with an established tool such as Beagle or an appropriate SHAPEIT workflow.
- Parental samples require explicit family-aware processing; merely including relatives in a file does not guarantee pedigree information is used.
- Without evidence establishing parental origin, label tracks **copy 1** and **copy 2**.
- Record model, reference panel, parameters, and limitations. Phasing errors can switch track identity along a chromosome.
- Provide a local setup command to obtain and validate reference assets separately from app startup. Run real uploads through the processing pipeline; use precomputed results only for the bundled demo and reproducibility checks.

### C. Infer local ancestry

- Use RFMix or an equivalent established method against a documented reference panel.
- Import segment assignments and ancestry probabilities as separate inputs.
- Retain uncertainty; do not describe model probabilities as guaranteed calibrated confidence.
- Require adequate marker overlap. Do not fabricate fine-scale ancestry unsupported by the reference panel.
- For gene-region views, show overlapping segments on both copies; a gene may cross an inferred ancestry boundary.

### D. Annotate variants

- gnomAD supplies ancestry-group allele frequencies, not disease-risk coefficients.
- Distinguish whole-person ancestry-group frequencies from local-ancestry-informed frequencies.
- ClinVar supplies submitted clinical interpretations, with review status, conditions, dates, and conflicts retained.
- GWAS findings and curated score weights supply statistical association evidence; association does not necessarily imply causation.
- Preserve the exact effect allele and outcome for all quantitative associations.
- Missing from gnomAD is not equivalent to a frequency of zero or evidence of pathogenicity.

### E. Disease-specific research scoring

- Implement one selected published disease-specific model. Return an explicit unscorable result for samples that do not meet its documented requirements.
- Enable a score only after selecting a published model, obtaining usable weights, checking licensing, and reproducing its calculation.
- Implement the model exactly; do not add local ancestry adjustments to an ordinary score unless the published method specifies them.
- Separate polygenic susceptibility from interpretation of high-impact Mendelian variants.
- Report marker coverage, missing-data handling, model version, evaluation populations, and known limits.
- Do not compute a percentile without an appropriate comparison distribution.
- Do not convert a score to absolute disease probability without a supported, calibrated model and required clinical inputs.
- GAUDI is a research precedent, not a ready-made broad clinical disease panel.

## 7. Architecture

Use an existing repository stack if present. Otherwise, default to TypeScript, React, and Vite for the UI, with SVG chromosome tracks. Use a small Python preprocessing package for genomic adapters when needed. Keep the default demo independent of a backend or external services.

Suggested structure:

```text
src/
  components/       # chromosome tracks, evidence panel, coverage table
  domain/           # normalized types and validation
  adapters/         # demo and precomputed-result import
  scoring/          # model-specific implementations
  export/           # research summary generation
data/demo/          # synthetic records and versioned source metadata
pipeline/           # Python parsing, harmonization, phasing, ancestry inference
tests/              # meaningful fixtures and integration checks
docs/               # methods and dataset provenance
README.md
```

Keep scientific processing separate from presentation. The UI must consume the same normalized schema whether results are synthetic or produced by a real pipeline.

## 8. Data contracts

Use one documented internal coordinate convention: **0-based, half-open intervals**. Convert source coordinates in adapters, test those conversions, and display human-facing coordinates as clearly labeled 1-based positions. Do not assume source files share the internal convention.

### Sample

`sample_id`, `source_type`, `genome_build`, `synthetic`, `processing_status`, `quality_summary`, `provenance`

### Variant observation

`variant_key`, `chromosome`, `position_0based`, `ref`, `alt`, `rsid?`, `genotype`, `phased`, `phase_set?`, `measurement_status`, `quality_flags`

`measurement_status` must distinguish `observed`, `imputed`, `not_assayed`, `no_call`, and `excluded`. Use `not_assayed` only when assay coverage is known; absence from an incomplete file may mean unknown coverage.

### Ancestry segment

`sample_id`, `chromosome`, `start_0based`, `end_0based_exclusive`, `copy_index`, `ancestry_label`, `probabilities?`, `assignment_status`, `method`, `reference_panel`, `parental_origin?`, `provenance`

`assignment_status`: `assigned`, `uncertain`, or `unknown`. Parent labels require supporting evidence. Preserve the native probability-window data if it differs from segment resolution; do not invent segment probabilities by joining incompatible outputs.

### Frequency annotation

`variant_key`, `dataset_version`, `ancestry_group`, `frequency_basis`, `allele_count`, `allele_number`, `allele_frequency`, `filters`, `source_url`

`frequency_basis`: `global_group` or `local_ancestry`. Frequency fields may be null; never substitute zero for missing data.

### Disease evidence

`variant_key`, `condition`, `evidence_type`, `classification?`, `review_status?`, `conflicting?`, `inheritance?`, `effect_allele?`, `effect_size?`, `effect_metric?`, `study_population?`, `source_url`, `accessed_at`, `limitations`

### Score result

`model_id`, `model_version`, `condition`, `raw_score`, `marker_coverage`, `missing_data_method`, `reference_distribution?`, `percentile?`, `absolute_risk?`, `validation_populations`, `limitations`, `provenance`

## 9. Ordered implementation milestones

### Step 1 — Repository, schemas, and AncestryDNA parser

- Inspect repository instructions and tooling; scaffold the app and Python pipeline.
- Implement the input contract in Section 4 and normalized schemas in Section 8.
- Create synthetic fixtures for valid files, no-calls, conflicting duplicates, malformed records, mixed line endings, and unsupported chromosomes.
- Add upload and quality-report screens. Keep the provided four-row example as a local parser fixture; do not label it a synthetic genome or use it for inference.

**Done when:** the supplied format parses deterministically, positions convert correctly, metadata is retained, and inadequate or invalid input yields clear errors.

### Step 2 — Reference assets and harmonized VCF

- Select and pin a GRCh37-compatible genome FASTA, phased reference panel, variant catalog, genetic map, and gene annotation.
- Record source URLs, versions, checksums, licenses, chromosome naming, and coordinate conventions in an asset manifest.
- Implement a setup command that downloads public assets and verifies checksums without sending sample data.
- Resolve REF/ALT and allele orientation, filter unsupported markers, and write sorted compressed VCF plus an index and harmonization report.
- Set and document numeric minimum marker-overlap and quality thresholds based on the chosen workflow; block inference when they are not met.

**Done when:** an independent VCF validator accepts the output, allele mismatches are accounted for, and reference-build mismatches cannot pass silently.

### Step 3 — Phasing and parental-data path

- Pin a phasing tool and implement a reproducible chromosome-by-chromosome command wrapper.
- Run the single-sample reference-assisted path on a suitably sized synthetic or consented validation sample.
- Accept zero, one, or two parental files with explicit relationship metadata. Implement a documented family-aware tool path and check Mendelian inconsistencies.
- Write phased VCFs, phase-set information where available, processing logs without genetic records, and provenance.
- Use copy 1/copy 2 labels unless parental origin is supported and tracked through phase blocks.

**Done when:** the pipeline produces valid phased genotypes without changing observed allele counts, and informative family fixtures recover expected parental inheritance while ambiguous sites remain unresolved.

### Step 4 — Local ancestry inference

- Pin RFMix and document reference-group definitions and tool licensing.
- Align phased sample/reference markers and run inference on each supported autosome.
- Parse assignment and probability outputs into normalized records; explicitly map population codes and coordinate conventions.
- Implement documented probability and coverage rules for assigned, uncertain, and unknown regions.

**Done when:** a known synthetic ancestry fixture recovers the expected broad pattern under documented tolerance, both copies are represented, and insufficient coverage yields unknown regions or a blocked stage.

### Step 5 — Variant evidence and disease-model selection

- Create a curated condition/variant manifest with selection rationale and sources.
- Build versioned local annotation extracts from gnomAD and ClinVar; retain missing frequencies, review status, and conflicts.
- Select one published disease-specific scoring model with usable weights, compatible reference assets, and independently reproducible expected results.
- Record effect alleles, genome build, eligible populations, missingness policy, required coverage, and licensing. If no model meets these criteria, report the specific blocker and resolve model selection before declaring the project complete.
- Implement exact model scoring and data-sufficiency gates. Add imputation only where the chosen model requires it, preserving imputation-quality metrics and distinguishing imputed from observed calls.

**Done when:** annotations resolve to the correct alleles and model scores match an independent fixture. Inadequate samples produce an unscorable status with reasons.

### Step 6 — Integrated explorer

- Connect the real pipeline and bundled synthetic demo to the same UI schemas.
- Draw two tracks per autosome, support region selection, and overlay selectable variants.
- Build evidence, ancestry-frequency, gene-region, condition-coverage, and research-score panels.
- Use accessible labels/patterns for uncertainty and a linked data table.
- Display stage status, failures, model applicability, and missing data without presenting unknown results as reassuring negatives.

**Done when:** selecting a variant opens the correct observation and both-copy ancestry context, and all displayed values trace to versioned data or a documented calculation.

### Step 7 — Export, verification, and handoff

- Export a research report with coverage, annotations, score status, uncertainty, methods, and source versions.
- Provide one documented command sequence from reference setup through input processing and app launch.
- Run the acceptance checks in Section 10 and manually inspect the complete demo and uploaded-data workflow.
- Write the README, methods documentation, known limitations, and hackathon walkthrough.

**Done when:** a new developer can reproduce the synthetic demo and process a valid complete input using the documented commands, and the acceptance checks pass.

## 10. Acceptance criteria and meaningful tests

- Synthetic demo completes from landing page to export without network access.
- Source-to-internal coordinate conversions correctly handle segment starts and ends.
- Each copy has valid, non-overlapping segments; gaps render as unknown.
- Wrong genome builds and allele mismatches are blocked before annotation joins.
- A no-call or absent record never becomes a reference genotype or a reassuring negative result.
- Population frequency missingness remains distinct from zero.
- Clicking overlapping markers yields the correct variant and both-copy context.
- Conflicting clinical interpretations remain visible.
- Model scoring passes an independent fixture and refuses insufficient data under its documented policy.
- No raw genetic data appears in logs, analytics, error reports, or browser URLs.
- Build and relevant automated checks pass; manually inspect the demo, uncertain regions, evidence panel, and export.

## 11. Privacy and data handling

- Default to synthetic data; require explicit user action before loading personal genetic files.
- Prefer local browser processing for supported lightweight inputs.
- Do not upload genetic data, including individual variant query lists, to external services without explaining and obtaining consent for that transfer.
- Use bundled annotations for the demo. A future remote annotation service requires a documented privacy design.
- Do not persist raw uploads by default. Provide a clear reset action that clears app-held data; document any browser-storage behavior.
- Do not commit real genetic files, names, credentials, or identifying metadata.
- Apply the same handling rules to parental files and document consent expectations.

## 12. Instructions for coding agents

- Complete Steps 1–7 in order. Do not substitute a mock pipeline for the required real-data path. Treat inadequate samples or unavailable assets as explicit processing blockers, not permission to fabricate results.
- Preserve uncertainty and provenance through every transformation.
- Never fabricate ancestry calls, clinical classifications, model weights, or medical risk values to fill UI gaps.
- Use explicit unavailable states when data or a model is missing.
- Keep demo data clearly separate from real analysis outputs.
- Document scientific decisions and unresolved assumptions in `docs/`; surface user-relevant limits in the app.
- Verify tool/data licenses before redistribution, hosted processing, or nonacademic use.
- Do not transmit personal genomic data, deploy publicly, or connect production services as part of ordinary local implementation.
- At each handoff, report changed files, completed acceptance criteria, tests run, and remaining blockers.

## 13. Final deliverables

1. Runnable local application accepting the specified AncestryDNA text format, plus a synthetic demo.
2. Chromosome ancestry explorer and variant evidence panels.
3. Coverage-aware condition summary and downloadable report.
4. Reproducible harmonization, phasing, family-aware processing, local ancestry, and disease-specific scoring commands, plus versioned data contracts and provenance records.
5. README with setup commands, demo walkthrough, processing boundaries, and known limitations.
6. Relevant tests and a brief hackathon presentation script.

### Suggested pitch

“Broad ethnicity categories can miss the complexity of a person's genetic background. Our research prototype connects chromosome-level ancestry estimates with observed variants and published disease evidence, making both the information and its limitations visible.”

## 14. Starting references

- RFMix manual: https://github.com/slowkoni/rfmix/blob/master/MANUAL.md
- Beagle: https://faculty.washington.edu/browning/beagle/beagle.html
- gnomAD genetic ancestry documentation: https://gnomad.broadinstitute.org/news/2023-11-genetic-ancestry
- Local-ancestry-informed gnomAD frequencies: https://www.nature.com/articles/s41467-025-63340-2
- GAUDI: https://www.nature.com/articles/s41467-024-45135-z
- ClinVar: https://www.ncbi.nlm.nih.gov/clinvar/
- PGS Catalog: https://www.pgscatalog.org/

Agents must verify current documentation, dataset availability, licensing, and any specific clinical claims before integrating them. These references are starting points, not endorsement of clinical suitability.
