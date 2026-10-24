"""Generate the synthetic precomputed analysis bundle (plan Steps 2-6 outputs).

The bundle is written to data/demo/analysis_bundle.json and consumed by the
TypeScript explorer. It conforms to schemas/normalized.schema.json.

EVERYTHING here is SYNTHETIC and deterministic (fixed RNG seed). It is NOT a
real genome, not inference output, and must never be presented as a real result.

DEMO INDIVIDUAL (designed to be realistic AND to exercise the whole dashboard):
  A recently-admixed person of primarily West African ancestry with substantial
  Ashkenazi Jewish ancestry and some other European ancestry — e.g. an
  African-American individual with a Jewish grandparent. Realistic because:
    * ancestry is drawn from a SMALL palette (3-4 reference groups), not 8+;
    * segments are LONG and contiguous (few switches per chromosome copy),
      as real local ancestry looks after a few generations of admixture;
    * genome-wide proportions are consistent (~55% African, ~30% Ashkenazi
      Jewish, ~15% other European).
  Interesting because it lights up multiple founder-variant stories at once:
    * HBB HbS (rs334) OBSERVED heterozygous -> sickle cell TRAIT (an observed
      finding), over African ancestry;
    * BRCA1 / BRCA2 / HEXA Ashkenazi founder variants NOT ASSAYED (indels), with
      AJ ancestry overlaid at those loci -> the "ancestry supports attention,
      the array can't confirm" showcase;
    * ARSA (MLD) SNP OBSERVED but 0 copies -> a clean assayed-and-not-found
      contrast so the not-assayed vs assayed distinction is visible.

Usage:
    python3 scripts/make_analysis_bundle.py
"""
from __future__ import annotations

import json
import random
from pathlib import Path

SEED = 20260124
ACCESSED_AT = "2026-10-24T00:00:00Z"
SAMPLE_ID = "synthetic-bundle-001"
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

# The demo person's ancestral palette, as (reference-population code, weight).
# Codes are 1000 Genomes population codes recognized by the UI geography model,
# plus "AJ" for the Ashkenazi signal. West-African-dominant, with Ashkenazi
# Jewish and some non-AJ European ancestry.
AFRICAN = ["YRI", "ESN", "GWD", "ACB", "ASW"]
EUROPEAN = ["CEU", "GBR", "TSI"]
# Palette weights (approximate genome-wide proportions).
PALETTE = (
    [("YRI", 0.20), ("ESN", 0.18), ("GWD", 0.12), ("ACB", 0.05)]  # ~55% African
    + [("AJ", 0.30)]                                                # ~30% Ashkenazi
    + [("CEU", 0.09), ("GBR", 0.06)]                               # ~15% European
)

# Loci (chrom -> 0-based position) where we FORCE a given ancestry on at least
# one copy so the founder-variant stories are demonstrable. AJ over the
# Ashkenazi founder genes; African over HBB.
FORCED_ANCESTRY = {
    "17": ("AJ", 41276044),   # BRCA1 185delAG locus
    "13": ("AJ", 32914437),   # BRCA2 6174delT locus
    "15": ("AJ", 72638891),   # HEXA 1278insTATC locus
    "11": ("YRI", 5248231),   # HBB HbS (rs334) locus
}

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
        "summary": "Tumor-suppressor gene. Certain founder pathogenic variants are documented at elevated frequency in some reference groups, including Ashkenazi Jewish.",
    },
    {
        "gene": "BRCA2", "chromosome": "13",
        "start_0based": 32889616, "end_0based_exclusive": 32973809,
        "conditions": ["Hereditary breast and ovarian cancer"],
        "summary": "Tumor-suppressor gene. Specific founder pathogenic variants are documented in some reference groups, including Ashkenazi Jewish.",
    },
    {
        "gene": "HEXA", "chromosome": "15",
        "start_0based": 72635593, "end_0based_exclusive": 72668352,
        "conditions": ["Tay-Sachs disease"],
        "summary": "Beta-hexosaminidase A. Recessive. Specific pathogenic variants are documented at elevated carrier frequency in some reference groups, including Ashkenazi Jewish.",
    },
    {
        "gene": "HBB", "chromosome": "11",
        "start_0based": 5246695, "end_0based_exclusive": 5248301,
        "conditions": ["Sickle cell disease"],
        "summary": "Beta-globin. Recessive. Carrier frequency of the HbS variant is elevated in populations with historical malaria exposure, including West African.",
    },
    {
        "gene": "ARSA", "chromosome": "22",
        "start_0based": 51061181, "end_0based_exclusive": 51066604,
        "conditions": ["Metachromatic leukodystrophy"],
        "summary": "Arylsulfatase A. Recessive. A directly array-typable SNP variant; shown here as an assayed locus for contrast.",
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
        "rationale": "Specific BRCA1/BRCA2 founder pathogenic variants (e.g. 185delAG, 6174delT) occur at higher frequency among people with Ashkenazi Jewish ancestry. There is no single BRCA1 mutation responsible for breast cancer.",
        "examined_variant_keys": ["GRCh37:17:41276045:AG:-", "GRCh37:13:32914438:T:-"],
        "not_measured": [
            "These founder variants are small indels that consumer SNP arrays do not reliably type; they are reported not_assayed, never negative.",
            "Most other BRCA1/BRCA2 pathogenic variants, large rearrangements, and copy-number variants are not detectable here.",
        ],
        "screening_note": "Ashkenazi Jewish ancestry overlapping these loci is a reason to consider targeted founder-panel or full BRCA testing — it does not establish that a variant is present. Absence here does NOT rule a variant out, because the array cannot type these indels.",
        "source_urls": ["https://www.ncbi.nlm.nih.gov/clinvar/", "https://gnomad.broadinstitute.org/"],
    },
    {
        "condition": "Tay-Sachs disease",
        "gene": "HEXA",
        "inheritance": "Autosomal recessive",
        "elevated_frequency_groups": ["AJ"],
        "rationale": "Certain HEXA founder variants (e.g. 1278insTATC) show elevated carrier frequency in Ashkenazi Jewish populations. Carrier status requires confirmatory testing and reflects reproductive-risk counseling, not personal disease.",
        "examined_variant_keys": ["GRCh37:15:72638892:-:TATC"],
        "not_measured": [
            "The HEXA founder variant is an insertion not reliably typed by consumer SNP arrays.",
            "Enzyme-activity testing (the clinical standard for carrier screening) is not represented by SNP genotypes.",
        ],
        "screening_note": "Consider targeted HEXA testing or enzyme assay where reproductive-risk counseling is relevant, especially given Ashkenazi Jewish ancestry at this locus.",
        "source_urls": ["https://www.ncbi.nlm.nih.gov/clinvar/"],
    },
    {
        "condition": "Sickle cell disease",
        "gene": "HBB",
        "inheritance": "Autosomal recessive",
        "elevated_frequency_groups": ["YRI", "ESN", "GWD", "ACB", "ASW"],
        "rationale": "The HBB HbS allele (rs334) occurs at elevated frequency in West African ancestry populations, reflecting historical malaria selection. This is population context, not a personal diagnosis.",
        "examined_variant_keys": ["GRCh37:11:5248232:T:A"],
        "not_measured": [
            "Hemoglobin electrophoresis and full HBB sequencing are the clinical standards and are not represented here.",
        ],
        "screening_note": "An observed single HbS copy is consistent with sickle cell TRAIT (a carrier state), not sickle cell disease. Consider confirmatory hemoglobin testing and, where relevant, partner screening and counseling.",
        "source_urls": ["https://www.ncbi.nlm.nih.gov/clinvar/"],
    },
    {
        "condition": "Metachromatic leukodystrophy",
        "gene": "ARSA",
        "inheritance": "Autosomal recessive",
        "elevated_frequency_groups": [],
        "rationale": "ARSA pathogenic variants cause MLD. The curated variant here is a directly array-typable SNP, included to show a clean assayed-and-not-found result alongside the not-assayed indels.",
        "examined_variant_keys": ["GRCh37:22:51064654:G:A"],
        "not_measured": [
            "Most ARSA pathogenic variants and the pseudodeficiency allele are not represented by this single SNP.",
        ],
        "screening_note": "This specific curated SNP was assayed and the clinical allele was not observed. That covers only this position, not the whole gene.",
        "source_urls": ["https://www.ncbi.nlm.nih.gov/clinvar/"],
    },
]


def _pick(rng: random.Random, exclude: str | None = None) -> str:
    """Draw a population from the palette by weight, optionally excluding one."""
    pool = [(c, w) for (c, w) in PALETTE if c != exclude]
    labels = [c for c, _ in pool]
    weights = [w for _, w in pool]
    return rng.choices(labels, weights=weights, k=1)[0]


def _superpop(label: str) -> str:
    if label in AFRICAN:
        return "AFR"
    if label in EUROPEAN:
        return "EUR"
    if label == "AJ":
        return "AJ"
    return "UNKNOWN"


def build_segments(rng: random.Random) -> list[dict]:
    """Realistic local ancestry: few LONG contiguous segments per copy.

    Each chromosome copy is partitioned into 1-3 long segments, each assigned a
    population drawn from the demo person's palette. Adjacent segments differ.
    At the forced loci, the relevant copy's overlapping segment is set to the
    required ancestry so the founder-variant stories are demonstrable.
    """
    segments: list[dict] = []
    for chrom, length in AUTOSOME_LENGTHS.items():
        forced = FORCED_ANCESTRY.get(chrom)
        for copy_index in (1, 2):
            # 1-3 segments; longer chromosomes lean toward more.
            n_seg = rng.choices([1, 2, 3], weights=[3, 4, 2], k=1)[0]
            # Build cut points.
            cuts = sorted(rng.uniform(0.15, 0.85) for _ in range(n_seg - 1))
            bounds = [0] + [int(c * length) for c in cuts] + [length]
            prev_label: str | None = None
            for i in range(len(bounds) - 1):
                start, end = bounds[i], bounds[i + 1]
                if end <= start:
                    continue
                label = _pick(rng, exclude=prev_label)
                prev_label = label
                # Force ancestry on copy 1 at the designated locus so the story
                # is guaranteed to appear on at least one copy.
                if forced and copy_index == 1 and start <= forced[1] < end:
                    label = forced[0]
                # Probabilities: dominant label + a little spread; status by margin.
                top = round(rng.uniform(0.78, 0.97), 3)
                remaining = round(1.0 - top, 3)
                other = _pick(rng, exclude=label)
                probs = {label: top, other: remaining}
                status = "assigned" if top >= 0.85 else "uncertain"
                segments.append({
                    "sample_id": SAMPLE_ID,
                    "chromosome": chrom,
                    "start_0based": start,
                    "end_0based_exclusive": end,
                    "copy_index": copy_index,
                    "ancestry_label": label,
                    "probabilities": probs,
                    "assignment_status": status,
                    "method": "RFMix (synthetic demo surrogate)",
                    "reference_panel": "1000G Phase 3 (synthetic demo surrogate)",
                    "parental_origin": None,
                    "provenance": SYNTH_PROVENANCE,
                })
    return segments


def build_variants_freqs_evidence() -> tuple[list[dict], list[dict], list[dict]]:
    """Curated synthetic variant observations + frequency + evidence rows,
    matched by rsid to the watchlist catalog so findings render."""
    variants: list[dict] = []
    freqs: list[dict] = []
    evidence: list[dict] = []

    def add(variant_key, chrom, pos0, ref, alt, rsid, genotype, status,
            condition, classification, review_status, conflicting, inheritance,
            effect_allele, freqs_by_group, missing_groups):
        variants.append({
            "variant_key": variant_key, "chromosome": chrom,
            "position_0based": pos0, "ref": ref, "alt": alt, "rsid": rsid,
            "genotype": genotype, "phased": True, "phase_set": f"{chrom}:PS1",
            "measurement_status": status, "quality_flags": [],
        })
        for group, af in freqs_by_group.items():
            freqs.append({
                "variant_key": variant_key,
                "dataset_version": "gnomAD v2.1.1 (synthetic surrogate)",
                "ancestry_group": group, "frequency_basis": "global_group",
                "allele_count": None if af is None else int(round(af * 20000)),
                "allele_number": None if af is None else 20000,
                "allele_frequency": af, "filters": [],
                "source_url": "https://gnomad.broadinstitute.org/",
            })
        for group in missing_groups:
            freqs.append({
                "variant_key": variant_key,
                "dataset_version": "gnomAD v2.1.1 (synthetic surrogate)",
                "ancestry_group": group, "frequency_basis": "global_group",
                "allele_count": None, "allele_number": None,
                "allele_frequency": None, "filters": None,
                "source_url": "https://gnomad.broadinstitute.org/",
            })
        evidence.append({
            "variant_key": variant_key, "condition": condition,
            "evidence_type": "clinvar", "classification": classification,
            "review_status": review_status, "conflicting": conflicting,
            "inheritance": inheritance, "effect_allele": effect_allele,
            "effect_size": None, "effect_metric": None, "study_population": None,
            "source_url": "https://www.ncbi.nlm.nih.gov/clinvar/",
            "accessed_at": ACCESSED_AT,
            "limitations": "Synthetic demo evidence row. Classification is illustrative, not a real ClinVar record.",
        })

    # HBB HbS rs334 — OBSERVED heterozygous => sickle cell TRAIT (carrier).
    add("GRCh37:11:5248232:T:A", "11", 5248231, "T", "A", "rs334",
        "T/A", "observed", "Sickle cell disease", "Pathogenic (synthetic)",
        "criteria provided, multiple submitters, no conflicts (synthetic)",
        False, "Autosomal recessive", "A",
        {"YRI": 0.05, "ESN": 0.06, "GWD": 0.04, "ACB": 0.03, "CEU": 0.0001},
        ["CHB", "JPT"])

    # ARSA SNP — OBSERVED, clinical allele ABSENT (0 copies) => clean negative
    # at this specific position (still only this position, not the gene).
    add("GRCh37:22:51064654:G:A", "22", 51064653, "G", "A", "rs-arsa-demo",
        "G/G", "observed", "Metachromatic leukodystrophy", "Pathogenic (synthetic)",
        "criteria provided, multiple submitters (synthetic)", False,
        "Autosomal recessive", "A",
        {"CEU": 0.002, "GBR": 0.002}, ["YRI", "ESN", "ACB"])

    # BRCA1 185delAG — NOT ASSAYED (indel). AJ ancestry overlays this locus.
    add("GRCh37:17:41276045:AG:-", "17", 41276044, "AG", "-", "rs80357914",
        ".", "not_assayed", "Hereditary breast and ovarian cancer",
        "Pathogenic (synthetic)", "reviewed by expert panel (synthetic)", False,
        "Autosomal dominant", "-",
        {"AJ": 0.01}, ["YRI", "ESN", "CEU", "GBR"])

    # BRCA2 6174delT — NOT ASSAYED (indel). AJ ancestry overlays this locus.
    add("GRCh37:13:32914438:T:-", "13", 32914437, "T", "-", "rs80359550",
        ".", "not_assayed", "Hereditary breast and ovarian cancer",
        "Pathogenic (synthetic)", "reviewed by expert panel (synthetic)", False,
        "Autosomal dominant", "-",
        {"AJ": 0.012}, ["YRI", "ESN", "CEU", "GBR"])

    # HEXA 1278insTATC — NOT ASSAYED (indel). AJ ancestry overlays this locus.
    add("GRCh37:15:72638892:-:TATC", "15", 72638891, "-", "TATC", "rs387906309",
        ".", "not_assayed", "Tay-Sachs disease", "Pathogenic (synthetic)",
        "reviewed by expert panel (synthetic)", False, "Autosomal recessive",
        "TATC", {"AJ": 0.013}, ["YRI", "ESN", "CEU", "GBR"])

    # BRCA2 missense SNP — OBSERVED, but with CONFLICTING interpretations. An
    # array-typable SNP (unlike the founder indels), observed heterozygous, kept
    # visible so the dashboard demonstrates it never hides a conflicting call.
    add("GRCh37:13:32913055:A:G", "13", 32913054, "A", "G", "rs-brca2-vus-demo",
        "A/G", "observed", "Hereditary breast and ovarian cancer",
        "Conflicting interpretations of pathogenicity (synthetic)",
        "criteria provided, conflicting interpretations (synthetic)", True,
        "Autosomal dominant", "G",
        {"AJ": 0.004, "CEU": 0.003, "YRI": 0.001}, ["ESN", "CHB"])

    return variants, freqs, evidence


# ~1 assayed marker per this many bp (thinned for a browsable demo).
COVERAGE_SPACING_BP = 300_000
# Low-coverage gaps across the not-assayable indel founder loci, so zooming /
# the coverage panel show the gap explicitly.
COVERAGE_GAPS = [
    ("17", 41_150_000, 41_330_000),  # BRCA1
    ("13", 32_860_000, 33_010_000),  # BRCA2
    ("15", 72_560_000, 72_720_000),  # HEXA
]


def _in_gap(chrom: str, pos0: int) -> bool:
    return any(gc == chrom and gs <= pos0 < ge for gc, gs, ge in COVERAGE_GAPS)


def build_coverage_markers(rng: random.Random) -> list[dict]:
    """Plain assayed SNP positions establishing COVERAGE only (no evidence)."""
    markers: list[dict] = []
    for chrom, length in AUTOSOME_LENGTHS.items():
        pos = COVERAGE_SPACING_BP
        while pos < length:
            jitter = int(rng.uniform(-0.4, 0.4) * COVERAGE_SPACING_BP)
            pos0 = max(0, pos + jitter)
            pos += COVERAGE_SPACING_BP
            if pos0 >= length or _in_gap(chrom, pos0):
                continue
            markers.append({
                "variant_key": f"GRCh37:{chrom}:{pos0 + 1}:cov",
                "chromosome": chrom, "position_0based": pos0,
                "ref": None, "alt": None, "rsid": None, "genotype": ".",
                "phased": True, "phase_set": f"{chrom}:PS1",
                "measurement_status": "observed", "quality_flags": ["coverage_only"],
            })
    return markers


def build_scores() -> list[dict]:
    """One computed polygenic score + one unscorable (data-sufficiency gate)."""
    return [
        {
            "model_id": "demo-pgs-breast-v0", "model_version": "0.0-synthetic",
            "condition": "Breast cancer (polygenic susceptibility)",
            "raw_score": 0.41, "unscorable_reason": None, "marker_coverage": 0.88,
            "missing_data_method": "mean-imputation of model SNPs per model spec (synthetic)",
            "reference_distribution": "synthetic reference distribution (demo only)",
            "percentile": None, "absolute_risk": None,
            "validation_populations": ["synthetic European-ancestry cohort (demo only)"],
            "limitations": "Synthetic polygenic score for demonstration. NOT a validated clinical model. Polygenic susceptibility is separate from high-impact Mendelian variant interpretation. No percentile or absolute risk is reported because no validated comparison distribution or calibrated model is available. PGS accuracy is known to be lower in non-European ancestries, which is directly relevant for this admixed individual.",
            "provenance": SYNTH_PROVENANCE,
        },
        {
            "model_id": "demo-pgs-cad-v0", "model_version": "0.0-synthetic",
            "condition": "Coronary artery disease (polygenic susceptibility)",
            "raw_score": None,
            "unscorable_reason": "Marker coverage below the model's documented minimum; required SNPs are missing from this synthetic dataset.",
            "marker_coverage": 0.41, "missing_data_method": "none applied; coverage gate failed",
            "reference_distribution": None, "percentile": None, "absolute_risk": None,
            "validation_populations": [],
            "limitations": "Unscorable: insufficient marker coverage. Shown to demonstrate the data-sufficiency gate, which refuses to fabricate a score.",
            "provenance": SYNTH_PROVENANCE,
        },
    ]


def _composition_note(segments: list[dict]) -> dict:
    """Genome-wide composition by span, for the bundle provenance note."""
    by_label: dict[str, int] = {}
    total = 0
    for s in segments:
        span = s["end_0based_exclusive"] - s["start_0based"]
        by_label[s["ancestry_label"]] = by_label.get(s["ancestry_label"], 0) + span
        total += span
    by_super: dict[str, float] = {}
    for label, bp in by_label.items():
        sp = _superpop(label)
        by_super[sp] = by_super.get(sp, 0.0) + (bp / total if total else 0.0)
    return {k: round(v, 3) for k, v in sorted(by_super.items(), key=lambda kv: -kv[1])}


def main() -> None:
    rng = random.Random(SEED)
    segments = build_segments(rng)
    curated, freqs, evidence = build_variants_freqs_evidence()
    coverage = build_coverage_markers(rng)
    variants = curated + coverage
    comp = _composition_note(segments)

    bundle = {
        "sample": {
            "sample_id": SAMPLE_ID, "source_type": "precomputed",
            "genome_build": "GRCh37", "synthetic": True,
            "processing_status": "scored",
            "quality_summary": {
                "total_records": 652341, "parsed_records": 652341,
                "autosomal_records": 618902, "no_call_count": 4102,
                "unsupported_indel_count": 221, "duplicate_exact_count": 9,
                "duplicate_conflicting_count": 2,
                "excluded_by_chromosome": {"X": 15210, "Y": 1980, "MT": 1140},
                "error_count": 0, "sufficient_for_inference": True,
            },
            "provenance": {
                **SYNTH_PROVENANCE,
                "notes": (
                    "Synthetic precomputed bundle (demo individual: admixed "
                    f"West African / Ashkenazi Jewish / European; approx composition {comp}). "
                    "Not inference output. Demo only."
                ),
            },
            "source_metadata": {
                "source_format": "AncestryDNA-raw-text", "array_version": "V2.0",
                "converter_version": "V1.0", "declared_build": "37.1",
                "normalized_build": "GRCh37", "strand": "+",
                "generated_at": "10/08/2026 12:30:57 UTC",
                "usage_notice": "FOR GENEALOGICAL RESEARCH ONLY. NOT INTENDED FOR MEDICAL, DIAGNOSTIC, OR HEALTH PURPOSES.",
            },
        },
        "segments": segments, "variants": variants, "frequencies": freqs,
        "evidence": evidence, "genes": GENES, "conditions": CONDITIONS,
        "scores": build_scores(),
    }
    OUT.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"  segments: {len(segments)} | curated variants: {len(curated)} | "
          f"coverage markers: {len(coverage)}")
    print(f"  genome-wide composition (by span, super-pop): {comp}")


if __name__ == "__main__":
    main()
