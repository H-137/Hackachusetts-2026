"""CLI for Step 2 reference setup and harmonization.

Subcommands:
  setup   Download/verify reference assets (slice | full).
  harmonize  Parse an AncestryDNA file and write a reference-aligned VCF.

Privacy: setup transmits no sample data. harmonize reads a local sample file and
writes a VCF under a gitignored path; its printed report carries aggregate counts
only, never genotype values.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .harmonize import harmonize
from .parser import parse_ancestrydna
from .ancestry import (
    build_rfmix_genetic_map,
    build_sample_map,
    parse_msp_to_segments,
    run_rfmix,
)
from .composition import compose_by_span
from .phasing import phase_chromosome, phase_genome
from .reference import (
    REPO_ROOT,
    SLICE_CHROM,
    SLICE_END,
    SLICE_START,
    download_panel_chromosomes,
    load_manifest,
    run_setup,
)


def _cmd_setup(args: argparse.Namespace) -> int:
    report = run_setup(args.mode)
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def _cmd_harmonize(args: argparse.Namespace) -> int:
    with open(args.input, "r", encoding="utf-8") as fh:
        text = fh.read()
    parsed = parse_ancestrydna(text)

    manifest = load_manifest()
    if args.slice:
        fa = REPO_ROOT / manifest["assets"]["reference_fasta_slice"]["local_path"]
        restrict_chrom = SLICE_CHROM
        restrict_window = (SLICE_START, SLICE_END)
    else:
        fa = REPO_ROOT / manifest["assets"]["reference_fasta"]["local_path"]
        restrict_chrom = None
        restrict_window = None

    if not fa.exists():
        print(f"Reference FASTA not found at {fa}. Run `setup` first.", file=sys.stderr)
        return 2

    out = Path(args.out)
    report = harmonize(
        parsed,
        reference_fasta=fa,
        out_vcf_gz=out,
        sample_id=args.sample_id,
        restrict_chrom=restrict_chrom,
        restrict_window=restrict_window,
    )
    report.toolchain = manifest.get("resolved_toolchain", {})
    json.dump({"harmonization": report.as_dict(), "vcf": str(out)}, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Step 2 reference setup and harmonization.")
    sub = ap.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("setup", help="Download and verify reference assets.")
    sp.add_argument("--mode", choices=["slice", "full", "phasing"], default="slice")
    sp.set_defaults(func=_cmd_setup)

    hp = sub.add_parser("harmonize", help="Harmonize an AncestryDNA file into a VCF.")
    hp.add_argument("input", help="Path to an AncestryDNA raw-text file.")
    hp.add_argument("--out", required=True, help="Output .vcf.gz path.")
    hp.add_argument("--sample-id", default="sample")
    hp.add_argument("--slice", action="store_true",
                    help="Use the single-chromosome slice reference and window.")
    hp.set_defaults(func=_cmd_harmonize)

    dp = sub.add_parser("download-panel", help="Download full per-chromosome 1000G panels.")
    dp.add_argument("--chroms", required=True,
                    help="Comma-separated chromosomes, e.g. 20,21,22.")
    dp.set_defaults(func=_cmd_download_panel)

    pp = sub.add_parser("phase", help="Phase one chromosome of a harmonized VCF with Beagle.")
    pp.add_argument("--gt", required=True, help="Harmonized sample .vcf.gz.")
    pp.add_argument("--panel", required=True, help="Reference panel .vcf.gz for the chromosome.")
    pp.add_argument("--chrom", required=True, help="Chromosome (e.g. 22).")
    pp.add_argument("--out", required=True, help="Output prefix for phased VCF.")
    pp.set_defaults(func=_cmd_phase)

    gp = sub.add_parser("phase-genome", help="Phase several chromosomes against full panels.")
    gp.add_argument("--gt", required=True, help="Harmonized sample .vcf.gz (genome-wide).")
    gp.add_argument("--chroms", required=True, help="Comma-separated chromosomes, e.g. 20,21,22.")
    gp.add_argument("--out-dir", required=True, help="Output directory for phased VCFs.")
    gp.set_defaults(func=_cmd_phase_genome)

    wp = sub.add_parser("watchlist", help="Build the ancestry-informed pathogenic-variant watchlist.")
    wp.add_argument("--segments", action="append", default=[],
                    help="Path to a segments.chrN.json file (repeatable).")
    wp.add_argument("--chroms", required=True,
                    help="Comma-separated processed chromosomes, e.g. 22.")
    wp.add_argument("--raw", default=None, help="AncestryDNA raw file for observed status (optional).")
    wp.add_argument("--out", default=None, help="Optional output JSON path.")
    wp.set_defaults(func=_cmd_watchlist)

    ap_ = sub.add_parser("ancestry", help="Run RFMix local ancestry on a phased chromosome.")
    ap_.add_argument("--query", required=True, help="Phased query .vcf.gz for the chromosome.")
    ap_.add_argument("--chrom", required=True, help="Chromosome (e.g. 22).")
    ap_.add_argument("--sample-id", required=True, help="Query sample id (VCF column).")
    ap_.add_argument("--out-dir", required=True, help="Output directory.")
    ap_.add_argument("--range", default=None, help="Optional Mbp range, e.g. 20-22.")
    ap_.set_defaults(func=_cmd_ancestry)

    args = ap.parse_args(argv)
    return args.func(args)


def _cmd_watchlist(args: argparse.Namespace) -> int:
    from dataclasses import dataclass

    from .catalog import CATALOG, catalog, catalog_provenance
    from .raw_lookup import lookup_raw_rows
    from .watchlist import build_watchlist

    segments: list = []
    for sp in args.segments:
        segments.extend(json.loads(Path(sp).read_text()))
    processed = {c.strip() for c in args.chroms.split(",") if c.strip()}

    prov: dict = {}
    clin: dict = {}
    if args.raw:
        @dataclass
        class _V:
            rsid: str
            chromosome: str
            position_1based: int
            clinical_allele: str
            variant_type: str
            expected_build: str = "GRCh37"

        cvars = [
            _V(v.rsid, v.chromosome, v.position_1based, (v.alt or ""), v.variant_class)
            for v in CATALOG if v.rsid
        ]
        prov = {k: val.as_dict() for k, val in lookup_raw_rows(Path(args.raw), cvars).items()}
    clin = {v.variant_id: (v.alt or "") for v in CATALOG}

    wl = build_watchlist(catalog(), segments, processed, prov, clin)
    report = {
        "provenance": catalog_provenance(),
        "processed_chromosomes": sorted(processed),
        "watchlist_size": len(wl),
        "watchlist": wl,
    }
    if args.out:
        Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
    json.dump({k: report[k] for k in ("provenance", "processed_chromosomes", "watchlist_size")},
              sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def _cmd_ancestry(args: argparse.Namespace) -> int:
    manifest = load_manifest()
    rfmix = REPO_ROOT / manifest["assets"]["ancestry_tool_rfmix"]["local_path"]
    panel_dir = REPO_ROOT / manifest["assets"]["phased_panel"]["local_dir"]
    gm_dir = REPO_ROOT / manifest["assets"]["genetic_map"]["local_dir"]
    panel_meta = REPO_ROOT / "pipeline/reference/assets/panel_meta/samples.panel"
    ref_vcf = panel_dir / f"ALL.chr{args.chrom}.phase3.genotypes.vcf.gz"

    for p, what in [(rfmix, "RFMix binary"), (ref_vcf, "reference panel"),
                    (panel_meta, "panel metadata")]:
        if not p.exists():
            print(f"{what} not found at {p}. Run setup/download-panel first.", file=sys.stderr)
            return 2

    out_dir = Path(args.out_dir)
    gmap = build_rfmix_genetic_map(
        gm_dir / f"plink.chr{args.chrom}.GRCh37.map", out_dir / f"rfmix.chr{args.chrom}.map")
    sample_map, n_ref = build_sample_map(panel_meta, ref_vcf, out_dir / "sample_map.tsv")

    extra = ["--analyze-range=" + args.range] if args.range else None
    msp = run_rfmix(
        query_vcf=Path(args.query), reference_vcf=ref_vcf, sample_map=sample_map,
        genetic_map=gmap, chromosome=args.chrom,
        out_basename=out_dir / f"rfmix.chr{args.chrom}", rfmix_bin=rfmix, extra_args=extra,
    )
    segments, summary = parse_msp_to_segments(
        msp, args.sample_id, [], ref_vcf.name)
    summary.reference_samples = n_ref

    seg_out = out_dir / f"segments.chr{args.chrom}.json"
    seg_out.write_text(json.dumps(segments, indent=2), encoding="utf-8")

    # Span-based per-chromosome composition (explicit denominator; reconciles).
    comp = compose_by_span(segments, args.chrom).as_dict()
    comp_out = out_dir / f"composition.chr{args.chrom}.json"
    comp_out.write_text(json.dumps(comp, indent=2), encoding="utf-8")

    json.dump({"ancestry": summary.as_dict(), "segments_file": str(seg_out),
               "composition_file": str(comp_out), "composition": comp},
              sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def _cmd_phase_genome(args: argparse.Namespace) -> int:
    manifest = load_manifest()
    beagle = REPO_ROOT / manifest["assets"]["phasing_tool_beagle"]["local_path"]
    conform = REPO_ROOT / manifest["assets"]["conform_gt"]["local_path"]
    panel_dir = REPO_ROOT / manifest["assets"]["phased_panel"]["local_dir"]
    gm_dir = REPO_ROOT / manifest["assets"]["genetic_map"]["local_dir"]
    chroms = [c.strip() for c in args.chroms.split(",") if c.strip()]

    report = phase_genome(
        sample_vcf_gz=Path(args.gt),
        chromosomes=chroms,
        panel_dir=panel_dir,
        genetic_map_dir=gm_dir,
        out_dir=Path(args.out_dir),
        beagle_jar=beagle,
        conform_gt_jar=conform,
    )
    json.dump({"phase_genome": report}, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0 if report["all_allele_counts_preserved"] else 4


def _cmd_download_panel(args: argparse.Namespace) -> int:
    chroms = [c.strip() for c in args.chroms.split(",") if c.strip()]
    report = download_panel_chromosomes(chroms)
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def _cmd_phase(args: argparse.Namespace) -> int:
    manifest = load_manifest()
    beagle = REPO_ROOT / manifest["assets"]["phasing_tool_beagle"]["local_path"]
    conform = REPO_ROOT / manifest["assets"]["conform_gt"]["local_path"]
    gm = REPO_ROOT / manifest["assets"]["genetic_map"]["local_dir"] / f"plink.chr{args.chrom}.GRCh37.map"
    for p, what in [(beagle, "Beagle jar"), (gm, "genetic map")]:
        if not p.exists():
            print(f"{what} not found at {p}. Run `setup --mode phasing` first.", file=sys.stderr)
            return 2

    res = phase_chromosome(
        sample_vcf_gz=Path(args.gt),
        panel_vcf_gz=Path(args.panel),
        genetic_map=gm,
        chromosome=args.chrom,
        out_prefix=Path(args.out),
        beagle_jar=beagle,
        conform_gt_jar=conform,
    )
    json.dump({"phasing": res.as_dict()}, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0 if res.allele_counts_preserved else 4


if __name__ == "__main__":
    raise SystemExit(main())
