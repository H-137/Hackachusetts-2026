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
from .reference import (
    REPO_ROOT,
    SLICE_CHROM,
    SLICE_END,
    SLICE_START,
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
    sp.add_argument("--mode", choices=["slice", "full"], default="slice")
    sp.set_defaults(func=_cmd_setup)

    hp = sub.add_parser("harmonize", help="Harmonize an AncestryDNA file into a VCF.")
    hp.add_argument("input", help="Path to an AncestryDNA raw-text file.")
    hp.add_argument("--out", required=True, help="Output .vcf.gz path.")
    hp.add_argument("--sample-id", default="sample")
    hp.add_argument("--slice", action="store_true",
                    help="Use the single-chromosome slice reference and window.")
    hp.set_defaults(func=_cmd_harmonize)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
