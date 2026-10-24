# Step 2 — Reference assets and harmonized VCF

Status: complete (approach B — real machinery, validated on a small real slice).

## What Step 2 delivers

- An **asset manifest** (`pipeline/reference/manifest.json`) pinning the GRCh37
  reference FASTA, the 1000 Genomes Phase 3 phased panel, a slice FASTA for
  laptop-scale validation, and placeholders for the genetic map and gene
  annotation consumed by later steps. It records URLs, version strings,
  chromosome naming, coordinate conventions, licenses, and SHA-256 checksums.
- A **setup command** (`python -m ancestry_explorer.setup_cli setup`) that
  downloads public assets and verifies checksums, transmitting no sample data.
- A **harmonizer** (`ancestry_explorer.harmonize`) that turns parsed autosomal
  SNP records into a sorted, bgzip-compressed, tabix-indexed VCF plus a
  privacy-safe harmonization report.
- The htslib toolchain (`bcftools`, `samtools`, `bgzip`, `tabix`) as the
  standard, independently-validatable VCF machinery.

## Approach B: real but laptop-scale

The full GRCh37 FASTA is ~892 MB and the full Phase 3 panel is tens of GB. To
keep the real-data path genuinely real without a multi-GB download, the setup
command has two modes:

- `--mode slice` (default): downloads the real Ensembl GRCh37 **chromosome 22**
  FASTA (~10 MB) and pulls a position window of the real chr22 Phase 3 panel via
  a `bcftools`/`tabix` **remote range query** (only the requested byte ranges,
  not the full 206 MB file). This is enough real data to validate harmonization
  end to end.
- `--mode full`: downloads the complete `human_g1k_v37` FASTA. The production
  path; documented and runnable when the full genome is needed.

The validation window is chr22:20,000,000–22,000,000, chosen because it is
densely covered in both the array data and the panel.

## Pinned sources

| Asset | Source | Naming |
| --- | --- | --- |
| Reference FASTA (full) | `human_g1k_v37.fasta.gz` (1000 Genomes EBI FTP) | `1,2,…,22,X,Y,MT` |
| Reference FASTA (slice) | Ensembl GRCh37 release-113 chr22 FASTA | `22` |
| Phased panel | 1000G `phase3_shapeit2_mvncall_integrated_v5b.20130502` | no `chr` prefix |
| Gene annotation | GENCODE release 19 (GRCh37) | pinned for Step 6 |

The slice uses the Ensembl chr22 FASTA; the full pipeline uses `human_g1k_v37`,
which is the exact reference the Phase 3 panel was aligned to. REF-allele checks
are run against whichever reference is in use, and mismatches are reported, never
silently flipped.

## Harmonization logic

For each analysis-ready autosomal SNP record:

1. Read the reference base at the 1-based position with `samtools faidx`.
2. Resolve REF/ALT from the two observed forward-strand alleles:
   - both equal ref → `0/0` (hom-ref; no observed ALT, written with `ALT=.`),
   - exactly one equals ref → `0/1` (het; ALT is the non-ref allele),
   - neither equals ref and the two alleles are identical → `1/1` (hom-alt),
   - neither equals ref and the alleles differ → **dropped** as
     `multiallelic_vs_reference` (the first implementation is biallelic-only).
3. A/T and C/G sites are **flagged** `AA_REFCHK=strand_check` (not dropped);
   their resolution against our reference is unambiguous, but the flag tells the
   Step 3 phasing step to apply strand care when matching to the panel.
4. Records are coordinate-sorted, written to VCF, then `bgzip`-compressed and
   `tabix`-indexed.

Variants are matched by build + chromosome + position + REF + ALT. An rsID alone
is never used as the join key.

### Build-mismatch safety

If the parsed metadata's normalized build is not GRCh37, harmonization raises
before any marker is written. A wrong-build file cannot flow silently into
annotation.

## Verification performed

- Full Python suite: 17 tests pass (12 parser + 5 harmonization). Harmonization
  tests build a tiny synthetic FASTA and need no network; they are skipped (not
  failed) where the htslib toolchain is absent.
- **Independent validation**: `bcftools view` accepts the output VCF, and
  `bcftools norm --check-ref e` reports `369/0/0/0/0/0/0` on the real-data
  slice — zero REF mismatches against the GRCh37 reference.
- **Real-data slice**: the real `AncestryDNA.txt` harmonized against the chr22
  window produced 369 variants (308 ref-match, 61 hom-alt resolved, 2 strand
  flagged, 0 dropped). The report contains aggregate counts only; no genotype
  values.
- Build-mismatch guard confirmed to reject a GRCh38-declared file.

## Privacy

- Setup transmits no sample data; it only fetches public assets.
- The harmonization report holds aggregate counts and per-reason tallies only.
- The output VCF contains genotypes (its purpose) and is treated as sample data:
  written under the gitignored `pipeline/local-out/` and never transmitted.
- Downloaded reference assets live under the gitignored
  `pipeline/reference/assets/`.

## Thresholds and open items

- A documented minimum marker-overlap / quality gate for blocking inference is
  set in the manifest's consumers for Step 3 (phasing), where the panel overlap
  is actually computed. Step 2 establishes the harmonized VCF those thresholds
  operate on.
- The genetic map source is pinned in Step 3 with the chosen phasing tool, which
  bundles a compatible map.
- `--mode full` downloads were validated for the FASTA URL (headers, size, range
  support) but the full 892 MB fetch is left to an explicit run.
