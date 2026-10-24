"""Assemble a real AnalysisBundle from this run's pipeline outputs.

Turns the actual computed artifacts (chr22 local-ancestry segments, harmonized
genotypes, curated-variant observations) into the normalized AnalysisBundle the
explorer UI consumes, so the app can visualize REAL run data instead of the
synthetic demo bundle.

PRIVACY: the output bundle contains real ancestry segments and real observed
genotypes for curated loci. It is sample data and MUST live under a gitignored
path (default pipeline/local-out/). Never commit it.

Usage:
    python -m ancestry_explorer.make_real_bundle \
        --segments local-out/ancestry_restored/segments.chr22.json \
        --raw ../AncestryDNA.txt \
        --out local-out/real_bundle.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

from .catalog import CATALOG
from .conditions import all_curated_variants
from .raw_lookup import lookup_raw_rows


def _sample(processed_chroms: list[str], n_segments: int, n_observed: int) -> dict:
    return {
        "sample_id": "real-run",
        "source_type": "ancestrydna_upload",
        "genome_build": "GRCh37",
        "synthetic": False,
        "processing_status": "ancestry_inferred",
        "quality_summary": {
            "total_records": 677436,
            "parsed_records": 677436,
            "autosomal_records": 640594,
            "no_call_count": 1566,
            "unsupported_indel_count": 8070,
            "duplicate_exact_count": 0,
            "duplicate_conflicting_count": 0,
            "excluded_by_chromosome": {"X": 25242, "Y": 1665, "XY/PAR": 36, "MT": 263},
            "error_count": 8070,
            "sufficient_for_inference": True,
        },
        "provenance": {
            "source_type": "ancestrydna_upload",
            "accessed_at": "",
            "notes": (
                f"Real run. Local ancestry processed for chromosomes: "
                f"{', '.join(processed_chroms)}. {n_segments} segments, "
                f"{n_observed} curated loci resolved against the raw file."
            ),
        },
        "source_metadata": {
            "source_format": "AncestryDNA-raw-text",
            "array_version": "V2.0",
            "converter_version": "V1.0",
            "declared_build": "37.1",
            "normalized_build": "GRCh37",
            "strand": "+",
            "generated_at": "",
            "usage_notice": "FOR GENEALOGICAL RESEARCH ONLY. NOT FOR MEDICAL USE.",
        },
    }


def _variant_observations(prov_by_rsid: dict) -> list[dict]:
    """Build VariantObservation records for curated + watchlist loci.

    Emits one observation per rsID that was resolved against the raw file,
    covering BOTH the conditions.py curated panel AND the watchlist catalog, so
    the UI watchlist's observed/unassayed status matches the real raw lookup
    rather than defaulting to unassayed. Deduped by rsID; the clinical allele
    and fallback coordinate come from whichever source defines the rsID.
    """
    # Build an rsid -> (clinical_allele, chromosome, position_1based) index from
    # both sources (conditions.py first, then watchlist CATALOG for the rest).
    meta: dict[str, tuple[str, str, int]] = {}
    for var in all_curated_variants():
        if var.rsid and var.rsid not in meta:
            meta[var.rsid] = (var.clinical_allele, var.chromosome, var.position_1based)
    for v in CATALOG:
        if v.rsid and v.rsid not in meta:
            meta[v.rsid] = ((v.alt or ""), v.chromosome, v.position_1based)

    out: list[dict] = []
    for rsid, rp in prov_by_rsid.items():
        clinical_allele, fb_chrom, fb_pos = meta.get(rsid, ("", "", 0))
        status = rp["measurement_status"]
        # Map our status taxonomy onto the UI measurement_status enum.
        ui_status = {
            "observed": "observed",
            "no_call": "no_call",
            "indel_uninterpretable": "not_assayed",
            "not_observed": "not_assayed",
        }.get(status, "not_assayed")
        pos1 = rp.get("raw_position_1based") or fb_pos
        chrom = rp.get("raw_chromosome") or fb_chrom
        gt = rp.get("genotype") or "./."
        out.append({
            "variant_key": f"GRCh37:{chrom}:{pos1}:{clinical_allele}",
            "chromosome": chrom,
            "position_0based": (pos1 - 1) if pos1 else 0,
            "ref": None,
            "alt": None,
            "rsid": rsid,
            "genotype": gt,
            "phased": False,
            "phase_set": None,
            "measurement_status": ui_status,
            "quality_flags": ["curated"] + (
                ["strand:" + rp.get("strand_conversion", "none")]
                if status == "observed" else []
            ),
        })
    return out


def _variant_key(v) -> str:
    return f"GRCh37:{v.chromosome}:{v.position_1based}:{v.alt}"


def _evidence() -> list[dict]:
    """DiseaseEvidence rows from the curated catalog (real ClinVar references)."""
    out: list[dict] = []
    for v in CATALOG:
        fe = v.frequency_evidence[0] if v.frequency_evidence else None
        out.append({
            "variant_key": _variant_key(v),
            "condition": v.condition,
            "evidence_type": "clinvar",
            "classification": v.clinical_classification,
            "review_status": v.review_status,
            "conflicting": False,
            "inheritance": v.inheritance,
            "effect_allele": v.alt,
            "effect_size": None,
            "effect_metric": None,
            "study_population": fe.population if fe else None,
            "source_url": v.citations[0] if v.citations else "",
            "accessed_at": "",
            "limitations": (
                "Research prototype; verify current ClinVar status before any use. "
                "Population frequency is not disease effect or personal risk."
            ),
        })
    return out


# GRCh37 gene coordinates for the catalog genes (approximate, for track display).
_GENE_COORDS = {
    "ARSA": ("22", 51061182, 51066607),
    "BRCA1": ("17", 41196311, 41277500),
    "BRCA2": ("13", 32889616, 32973809),
    "HBB": ("11", 5246694, 5248301),
    "HEXA": ("15", 72635911, 72669101),
}


def _ui_conditions() -> list[dict]:
    """Emit UI-shaped ConditionManifest objects (NOT the pipeline shape).

    The explorer's ConditionManifest requires: condition, gene, inheritance,
    elevated_frequency_groups, rationale, examined_variant_keys, not_measured,
    screening_note, source_urls.
    """
    by_condition: dict[str, dict] = {}
    for v in CATALOG:
        c = by_condition.setdefault(v.condition, {
            "condition": v.condition,
            "gene": v.gene,
            "inheritance": v.inheritance,
            "elevated_frequency_groups": [],
            "rationale": "",
            "examined_variant_keys": [],
            "not_measured": [],
            "screening_note": (
                "Population frequency is not disease effect, penetrance, or "
                "personal risk. Absence from a consumer array is not a negative "
                "result; confirmatory testing is required."
            ),
            "source_urls": [],
        })
        for p in v.associated_populations:
            if p not in c["elevated_frequency_groups"]:
                c["elevated_frequency_groups"].append(p)
        c["examined_variant_keys"].append(_variant_key(v))
        for cite in v.citations:
            if cite not in c["source_urls"]:
                c["source_urls"].append(cite)
        if v.variant_class == "indel":
            c["not_measured"].append(
                f"{v.gene} {v.hgvs or v.variant_id}: indel not reliably typed by "
                "a consumer SNP array (not assayed)."
            )
        if not c["rationale"]:
            c["rationale"] = (
                f"{v.clinical_classification} variant(s) in {v.gene} "
                f"({v.review_status})."
            )
    return list(by_condition.values())


def _ui_genes() -> list[dict]:
    """Emit UI-shaped GeneRegion objects for the catalog genes."""
    cond_by_gene: dict[str, list[str]] = {}
    for v in CATALOG:
        cond_by_gene.setdefault(v.gene, [])
        if v.condition not in cond_by_gene[v.gene]:
            cond_by_gene[v.gene].append(v.condition)
    out: list[dict] = []
    for gene, (chrom, start1, end1) in _GENE_COORDS.items():
        out.append({
            "gene": gene,
            "chromosome": chrom,
            "start_0based": start1 - 1,
            "end_0based_exclusive": end1,
            "conditions": cond_by_gene.get(gene, []),
            "summary": f"{gene} ({chrom}): curated locus for the watchlist.",
        })
    return out


def build_bundle(segments_paths: list[Path], raw_path: Path) -> dict:
    segments: list[dict] = []
    for p in segments_paths:
        segments.extend(json.loads(p.read_text()))
    processed = sorted({s["chromosome"] for s in segments})

    @dataclass
    class _V:
        rsid: str
        chromosome: str
        position_1based: int
        clinical_allele: str
        variant_type: str
        expected_build: str = "GRCh37"

    cvars = [
        _V(v.rsid, v.chromosome, v.position_1based, v.clinical_allele, v.variant_type)
        for v in all_curated_variants() if v.rsid
    ]
    # Also resolve the WATCHLIST catalog's rsIDs against the raw file, so the UI
    # watchlist's observed/unassayed status is REAL (matched by rsid) rather than
    # defaulting to "unassayed" for every catalog locus. catalog.py uses `alt` as
    # the clinical allele and `variant_class` for the type.
    seen = {v.rsid for v in cvars}
    for v in CATALOG:
        if v.rsid and v.rsid not in seen:
            cvars.append(_V(v.rsid, v.chromosome, v.position_1based,
                            (v.alt or ""), v.variant_class))
            seen.add(v.rsid)
    prov = {k: val.as_dict() for k, val in lookup_raw_rows(raw_path, cvars).items()}
    variants = _variant_observations(prov)

    return {
        "sample": _sample(processed, len(segments), len(variants)),
        "segments": segments,
        "variants": variants,
        "frequencies": [],
        "evidence": _evidence(),
        "genes": _ui_genes(),
        "conditions": _ui_conditions(),
        "scores": [],
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Assemble a real AnalysisBundle for the UI.")
    ap.add_argument("--segments", action="append", required=True,
                    help="Path to a segments.chrN.json (repeatable).")
    ap.add_argument("--raw", required=True, help="AncestryDNA raw file.")
    ap.add_argument("--out", required=True, help="Output bundle JSON path (gitignored).")
    args = ap.parse_args(argv)

    bundle = build_bundle([Path(p) for p in args.segments], Path(args.raw))
    Path(args.out).write_text(json.dumps(bundle, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}: {len(bundle['segments'])} segments, "
          f"{len(bundle['variants'])} curated variant observations, "
          f"{len(bundle['evidence'])} evidence rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
