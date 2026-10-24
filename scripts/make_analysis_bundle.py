#!/usr/bin/env python3
"""Generate the synthetic precomputed analysis bundle (plan Steps 2-6 outputs).

The bundle is written to data/demo/analysis_bundle.json and consumed by the
TypeScript explorer. It conforms to schemas/normalized.schema.json.

EVERYTHING here is SYNTHETIC and deterministic (fixed RNG seed). It is NOT a
real genome, not inference output, and must never be presented as a real result.
Ancestry calls, probabilities, and the disease score are fabricated-for-demo.

Usage:
    python3 scripts/make_analysis_bundle.py
"""
from __future__ import annotations

import json
import random
from pathlib import Path

SEED = 20260124
ACCESSED_AT = "2026-10-24T00:00:00Z"
OUT = Path(__file__).resolve().parents[1] / "data" / "demo" / "analysis_bundle.json"

# GRCh37 autosome lengths (public reference values).
AUTOSOME_LENGTHS = {
    "1": 249250621, "2": 243199373, "3": 198022430, "4": 191154276,
    "5": 180915260, "6": 171115067, "7": 159138663, "8": 146364022,
    "9": 141213431, "10": 135534747, "11": 135006516, "12": 133851895,
    "13": 115169878, "14": 107349540, "15": 102531392, "16": 90354753,
    "17": 81195210, "18": 78077248, "19": 59128983, "20": 63025520,
    "21": 48129895, "22": 51304566,
}

# Broad reference groups available to the (synthetic) local-ancestry model.
REGIONS = ["AJ", "NFE", "FIN", "AFR", "EAS", "SAS", "AMR", "MID"]

SYNTH_PROVENANCE = {
    "source_type": "precomputed",
    "accessed_at": ACCESSED_AT,
    "notes": "Synthetic precomputed bundle. Not inference output. Demo only.",
    "source_url": None,
}

# Curated gene regions (GRCh37, 0-based half-open; approximate reference loci).
GENES = [
    {
        "gene": "BRCA1", "chromosome": "17",
        "start_0based": 41196311, "end_0based_exclusive": 41277500,
        "conditions": ["Hereditary breast and ovarian cancer"],
        "summary": "Tumor-suppressor gene. Certain founder pathogenic variants are documented at elevated frequency in some reference groups.",
    },
    {
        "gene": "BRCA2", "chromosome": "13",
        "start_0based": 32889616, "end_0based_exclusive": 32973809,
        "conditions": ["Hereditary breast and ovarian cancer"],
        "summary": "Tumor-suppressor gene. Specific founder pathogenic variants are documented in some reference groups.",
    },
    {
        "gene": "HEXA", "chromosome": "15",
        "start_0based": 72635593, "end_0based_exclusive": 72668352,
        "conditions": ["Tay-Sachs disease"],
        "summary": "Beta-hexosaminidase A. Recessive. Specific pathogenic variants are documented at elevated carrier frequency in some reference groups.",
    },
    {
        "gene": "HBB", "chromosome": "11",
        "start_0based": 5246695, "end_0based_exclusive": 5248301,
        "conditions": ["Sickle cell disease / beta-thalassemia"],
        "summary": "Beta-globin. Recessive. Carrier frequency of specific variants varies substantially across reference groups.",
    },
    {
        "gene": "CFTR", "chromosome": "7",
        "start_0based": 117120016, "end_0based_exclusive": 117308718,
        "conditions": ["Cystic fibrosis"],
        "summary": "Recessive. Variant spectrum and carrier frequency differ across reference groups.",
    },
]

# Curated condition manifest. elevated_frequency_groups records POPULATION
# frequency context, not per-person risk. not_measured declares relevant
# variants a consumer SNP array does not cover, so absence is never reassuring.
CONDITIONS = [
    {
        "condition": "Hereditary breast and ovarian cancer",
        "gene": "BRCA1",
        "inheritance": "Autosomal dominant (high-impact Mendelian)",
        "elevated_frequency_groups": ["AJ"],
        "rationale": "Specific BRCA1/BRCA2 founder pathogenic variants occur at higher frequency among people with Ashkenazi Jewish ancestry. There is no single BRCA1 mutation responsible for breast cancer.",
        "examined_variant_keys": [
            "GRCh37:17:41245237:T:TC",  # synthetic placeholder for 185delAG-like founder
        ],
        "not_measured": [
            "Most BRCA1/BRCA2 pathogenic variants outside the small curated founder set are not on a consumer SNP array.",
            "Large rearrangements and copy-number variants are not detectable here.",
        ],
        "screening_note": "A curated founder variant appearing here warrants confirmatory clinical genetic testing, not a diagnosis. Absence here does NOT rule out a pathogenic variant, because most are not measured. Clinicians may consider family history and guideline-based screening regardless of this result.",
        "source_urls": [
            "https://www.ncbi.nlm.nih.gov/clinvar/",
            "https://gnomad.broadinstitute.org/",
        ],
    },
    {
        "condition": "Tay-Sachs disease",
        "gene": "HEXA",
        "inheritance": "Autosomal recessive",
        "elevated_frequency_groups": ["AJ", "FIN"],
        "rationale": "Certain HEXA pathogenic variants show elevated carrier frequency in some reference groups. Carrier status requires confirmatory testing and reflects reproductive-risk counseling, not personal disease.",
        "examined_variant_keys": [],
        "not_measured": [
            "Enzyme-activity testing (the clinical standard for carrier screening) is not represented by SNP genotypes.",
        ],
        "screening_note": "Carrier screening is a clinical decision. Consider targeted HEXA testing or enzyme assay where reproductive-risk counseling is relevant.",
        "source_urls": ["https://www.ncbi.nlm.nih.gov/clinvar/"],
    },
    {
        "condition": "Sickle cell disease / beta-thalassemia",
        "gene": "HBB",
        "inheritance": "Autosomal recessive",
        "elevated_frequency_groups": ["AFR", "MID", "SAS"],
        "rationale": "HBB variant carrier frequency varies substantially across reference groups, partly reflecting historical malaria exposure. This is population context, not a personal diagnosis.",
        "examined_variant_keys": ["GRCh37:11:5248232:T:A"],
        "not_measured": [
            "Hemoglobin electrophoresis and full HBB sequencing are the clinical standards and are not represented here.",
        ],
        "screening_note": "A carrier-consistent genotype warrants confirmatory hemoglobin testing and, where relevant, partner screening and counseling.",
        "source_urls": ["https://www.ncbi.nlm.nih.gov/clinvar/"],
    },
    {
        "condition": "Cystic fibrosis",
        "gene": "CFTR",
        "inheritance": "Autosomal recessive",
        "elevated_frequency_groups": ["NFE", "AJ"],
        "rationale": "CFTR carrier frequency and variant spectrum differ across reference groups. A consumer array covers only a subset of pathogenic variants.",
        "examined_variant_keys": [],
        "not_measured": [
            "The common F508del variant and most of the >2000 CFTR variants are not reliably covered by a consumer SNP array.",
        ],
        "screening_note": "Carrier screening uses targeted CFTR panels. Absence of a call here does not rule out carrier status.",
        "source_urls": ["https://www.ncbi.nlm.nih.gov/clinvar/"],
    },
]


def build_segments(rng: random.Random) -> list[dict]:
    """Two copies per autosome, non-overlapping on each copy, gaps -> unknown."""
    segments: list[dict] = []
    for chrom, length in AUTOSOME_LENGTHS.items():
        for copy_index in (1, 2):
            pos = 0
            # Walk the chromosome in chunks; occasionally leave an unknown gap.
            while pos < length:
                chunk = int(rng.uniform(0.08, 0.28) * length)
                end = min(pos + chunk, length)
                leave_gap = rng.random() < 0.18 and end < length
                # Pick a region; weight AJ onto chr17/13/15 so the BRCA/HEXA
                # story is demonstrable, but keep it clearly synthetic.
                if chrom in ("17", "13", "15") and rng.random() < 0.5:
                    label = "AJ"
                else:
                    label = rng.choice(REGIONS)
                # Probabilities: a dominant label plus spread; status by margin.
                probs = {label: round(rng.uniform(0.55, 0.95), 3)}
                remaining = round(1.0 - probs[label], 3)
                others = rng.sample([r for r in REGIONS if r != label], 2)
                probs[others[0]] = round(remaining * 0.6, 3)
                probs[others[1]] = round(remaining * 0.4, 3)
                top = probs[label]
                status = "assigned" if top >= 0.8 else "uncertain"
                segments.append({
                    "sample_id": "synthetic-bundle-001",
                    "chromosome": chrom,
                    "start_0based": pos,
                    "end_0based_exclusive": end,
                    "copy_index": copy_index,
                    "ancestry_label": label,
                    "probabilities": probs,
                    "assignment_status": status,
                    "method": "RFMix (synthetic demo surrogate)",
                    "reference_panel": "synthetic-ref-panel-v0 (demo only)",
                    "parental_origin": None,
                    "provenance": SYNTH_PROVENANCE,
                })
                pos = end
                if leave_gap:
                    gap = int(rng.uniform(0.02, 0.06) * length)
                    gstart = pos
                    gend = min(pos + gap, length)
                    segments.append({
                        "sample_id": "synthetic-bundle-001",
                        "chromosome": chrom,
                        "start_0based": gstart,
                        "end_0based_exclusive": gend,
                        "copy_index": copy_index,
                        "ancestry_label": "UNKNOWN",
                        "probabilities": None,
                        "assignment_status": "unknown",
                        "method": "RFMix (synthetic demo surrogate)",
                        "reference_panel": "synthetic-ref-panel-v0 (demo only)",
                        "parental_origin": None,
                        "provenance": SYNTH_PROVENANCE,
                    })
                    pos = gend
    return segments


def build_variants_freqs_evidence() -> tuple[list[dict], list[dict], list[dict]]:
    """Curated synthetic variant observations + frequency + evidence rows."""
    variants: list[dict] = []
    freqs: list[dict] = []
    evidence: list[dict] = []

    def add(variant_key, chrom, pos0, ref, alt, rsid, genotype, status,
            condition, classification, review_status, conflicting, inheritance,
            effect_allele, freqs_by_group, missing_groups):
        variants.append({
            "variant_key": variant_key,
            "chromosome": chrom,
            "position_0based": pos0,
            "ref": ref,
            "alt": alt,
            "rsid": rsid,
            "genotype": genotype,
            "phased": True,
            "phase_set": f"{chrom}:PS1",
            "measurement_status": status,
            "quality_flags": [],
        })
        for group, af in freqs_by_group.items():
            freqs.append({
                "variant_key": variant_key,
                "dataset_version": "gnomAD v2.1.1 (synthetic surrogate)",
                "ancestry_group": group,
                "frequency_basis": "global_group",
                "allele_count": None if af is None else int(round(af * 20000)),
                "allele_number": None if af is None else 20000,
                "allele_frequency": af,  # may be None; never substitute zero
                "filters": [],
                "source_url": "https://gnomad.broadinstitute.org/",
            })
        for group in missing_groups:
            # Explicitly-null frequency: missing != zero.
            freqs.append({
                "variant_key": variant_key,
                "dataset_version": "gnomAD v2.1.1 (synthetic surrogate)",
                "ancestry_group": group,
                "frequency_basis": "global_group",
                "allele_count": None,
                "allele_number": None,
                "allele_frequency": None,
                "filters": None,
                "source_url": "https://gnomad.broadinstitute.org/",
            })
        evidence.append({
            "variant_key": variant_key,
            "condition": condition,
            "evidence_type": "clinvar",
            "classification": classification,
            "review_status": review_status,
            "conflicting": conflicting,
            "inheritance": inheritance,
            "effect_allele": effect_allele,
            "effect_size": None,
            "effect_metric": None,
            "study_population": None,
            "source_url": "https://www.ncbi.nlm.nih.gov/clinvar/",
            "accessed_at": ACCESSED_AT,
            "limitations": "Synthetic demo evidence row. Classification is illustrative, not a real ClinVar record.",
        })

    # Synthetic BRCA1 founder-like variant, observed heterozygous.
    add(
        "GRCh37:17:41245237:T:TC", "17", 41245236, "T", "TC", "rs-demo-brca1",
        "T/TC", "observed",
        "Hereditary breast and ovarian cancer", "Pathogenic (synthetic)",
        "criteria provided, multiple submitters, no conflicts (synthetic)",
        False, "Autosomal dominant", "TC",
        {"AJ": 0.01, "NFE": 0.0004}, ["AFR", "EAS", "SAS", "AMR", "FIN", "MID"],
    )
    # Synthetic HBB sickle-like variant, observed heterozygous (carrier-consistent).
    add(
        "GRCh37:11:5248232:T:A", "11", 5248231, "T", "A", "rs-demo-hbb",
        "T/A", "observed",
        "Sickle cell disease / beta-thalassemia", "Pathogenic (synthetic)",
        "criteria provided, single submitter (synthetic)", False,
        "Autosomal recessive", "A",
        {"AFR": 0.045, "MID": 0.01, "SAS": 0.008, "NFE": 0.0001},
        ["EAS", "FIN"],
    )
    # A variant that was NOT assayed by the array (coverage known) -> not_assayed.
    add(
        "GRCh37:7:117199644:CTT:C", "7", 117199643, "CTT", "C", "rs-demo-cftr",
        ".", "not_assayed",
        "Cystic fibrosis", "Pathogenic (synthetic)",
        "criteria provided, multiple submitters (synthetic)", False,
        "Autosomal recessive", "C",
        {"NFE": 0.015, "AJ": 0.012}, ["AFR", "EAS", "SAS", "AMR"],
    )
    # A conflicting-interpretation variant, kept visible per acceptance criteria.
    add(
        "GRCh37:13:32914437:A:G", "13", 32914436, "A", "G", "rs-demo-brca2",
        "A/A", "observed",
        "Hereditary breast and ovarian cancer",
        "Conflicting interpretations of pathogenicity (synthetic)",
        "conflicting interpretations (synthetic)", True,
        "Autosomal dominant", "G",
        {"AJ": 0.002, "NFE": 0.001}, ["AFR", "EAS"],
    )
    return variants, freqs, evidence


# Approximate array marker density: one assayed SNP per this many base pairs.
# Real consumer arrays sit around ~600-700k autosomal markers genome-wide
# (~1 per ~5 kb). We thin that heavily for a browsable synthetic demo while
# keeping the *shape* (dense arms, sparse gaps) realistic.
COVERAGE_SPACING_BP = 300_000

# Deliberate low-coverage gaps (0-based, half-open) so zooming reveals sparse
# regions. Placed over/near curated genes to make the "absence is not a
# reassuring negative" point tangible when a user zooms into them.
COVERAGE_GAPS = [
    ("17", 41_150_000, 41_330_000),  # across BRCA1
    ("13", 32_860_000, 33_010_000),  # across BRCA2
    ("7", 117_100_000, 117_340_000),  # across CFTR
    ("11", 5_100_000, 5_400_000),    # across HBB
]


def _in_gap(chrom: str, pos0: int) -> bool:
    for gc, gs, ge in COVERAGE_GAPS:
        if gc == chrom and gs <= pos0 < ge:
            return True
    return False


def build_coverage_markers(rng: random.Random) -> list[dict]:
    """Plain assayed SNP positions that establish COVERAGE only.

    These carry NO disease evidence and NO population frequency; they exist so
    marker density (and sparse gaps) is visible when zooming. They are tagged
    quality_flags=["coverage_only"] so the UI can distinguish them from curated,
    disease-annotated variants. All synthetic.
    """
    markers: list[dict] = []
    for chrom, length in AUTOSOME_LENGTHS.items():
        pos = COVERAGE_SPACING_BP
        while pos < length:
            # Jitter spacing so density looks array-like, not perfectly regular.
            jitter = int(rng.uniform(-0.4, 0.4) * COVERAGE_SPACING_BP)
            pos0 = max(0, pos + jitter)
            pos += COVERAGE_SPACING_BP
            if pos0 >= length or _in_gap(chrom, pos0):
                continue
            markers.append({
                "variant_key": f"GRCh37:{chrom}:{pos0 + 1}:cov",
                "chromosome": chrom,
                "position_0based": pos0,
                "ref": None,
                "alt": None,
                "rsid": None,
                "genotype": ".",
                "phased": True,
                "phase_set": f"{chrom}:PS1",
                "measurement_status": "observed",
                "quality_flags": ["coverage_only"],
            })
    return markers


def build_scores() -> list[dict]:
    """One disease-specific score result with an explicit unscorable example."""
    return [
        {
            "model_id": "demo-pgs-breast-v0",
            "model_version": "0.0-synthetic",
            "condition": "Breast cancer (polygenic susceptibility)",
            "raw_score": 0.37,
            "unscorable_reason": None,
            "marker_coverage": 0.86,
            "missing_data_method": "mean-imputation of model SNPs per model spec (synthetic)",
            "reference_distribution": "synthetic reference distribution (demo only)",
            "percentile": None,  # no validated comparison distribution
            "absolute_risk": None,  # no calibrated absolute-risk model + clinical inputs
            "validation_populations": ["synthetic NFE-like cohort (demo only)"],
            "limitations": "Synthetic polygenic score for demonstration. NOT a validated clinical model. Polygenic susceptibility is separate from high-impact Mendelian variant interpretation. No percentile or absolute risk is reported because no validated comparison distribution or calibrated model is available.",
            "provenance": SYNTH_PROVENANCE,
        },
        {
            "model_id": "demo-pgs-cad-v0",
            "model_version": "0.0-synthetic",
            "condition": "Coronary artery disease (polygenic susceptibility)",
            "raw_score": None,
            "unscorable_reason": "Marker coverage below the model's documented minimum; required SNPs are missing from this synthetic dataset.",
            "marker_coverage": 0.41,
            "missing_data_method": "none applied; coverage gate failed",
            "reference_distribution": None,
            "percentile": None,
            "absolute_risk": None,
            "validation_populations": [],
            "limitations": "Unscorable: insufficient marker coverage. Shown to demonstrate the data-sufficiency gate, which refuses to fabricate a score.",
            "provenance": SYNTH_PROVENANCE,
        },
    ]


def main() -> None:
    rng = random.Random(SEED)
    curated, freqs, evidence = build_variants_freqs_evidence()
    coverage = build_coverage_markers(rng)
    variants = curated + coverage
    bundle = {
        "sample": {
            "sample_id": "synthetic-bundle-001",
            "source_type": "precomputed",
            "genome_build": "GRCh37",
            "synthetic": True,
            "processing_status": "scored",
            "quality_summary": {
                "total_records": 650000,
                "parsed_records": 650000,
                "autosomal_records": 612345,
                "no_call_count": 4821,
                "unsupported_indel_count": 190,
                "duplicate_exact_count": 12,
                "duplicate_conflicting_count": 3,
                "excluded_by_chromosome": {"X": 15000, "Y": 2000, "MT": 1200},
                "error_count": 0,
                "sufficient_for_inference": True,
            },
            "provenance": SYNTH_PROVENANCE,
            "source_metadata": {
                "source_format": "AncestryDNA-raw-text",
                "array_version": "V2.0",
                "converter_version": "V1.0",
                "declared_build": "37.1",
                "normalized_build": "GRCh37",
                "strand": "+",
                "generated_at": "10/08/2026 12:30:57 UTC",
                "usage_notice": "FOR GENEALOGICAL RESEARCH ONLY. NOT INTENDED FOR MEDICAL, DIAGNOSTIC, OR HEALTH PURPOSES.",
            },
        },
        "segments": build_segments(rng),
        "variants": variants,
        "frequencies": freqs,
        "evidence": evidence,
        "genes": GENES,
        "conditions": CONDITIONS,
        "scores": build_scores(),
    }
    OUT.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} with {len(bundle['segments'])} segments, "
          f"{len(curated)} curated variants, {len(coverage)} coverage markers.")


if __name__ == "__main__":
    main()
