"""Command-line entry for the AncestryDNA parser.

Prints a privacy-safe quality summary (aggregate counts, metadata, error codes)
to stdout. It never prints allele values or per-variant genotype data.

Usage:
    python -m ancestry_explorer.cli path/to/AncestryDNA.txt
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys

from .parser import parse_ancestrydna


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Parse an AncestryDNA raw-text file and print a quality summary."
    )
    ap.add_argument("path", help="Path to an AncestryDNA raw-text (.txt) file.")
    ap.add_argument(
        "--max-errors",
        type=int,
        default=20,
        help="Maximum number of line-level errors to show (default 20).",
    )
    args = ap.parse_args(argv)

    with open(args.path, "r", encoding="utf-8") as fh:
        text = fh.read()

    result = parse_ancestrydna(text)

    # Build a privacy-safe report: metadata + quality summary + error codes only.
    report = {
        "metadata": dataclasses.asdict(result.metadata),
        "quality_summary": dataclasses.asdict(result.quality_summary),
        "errors_preview": [
            {"line_number": e.line_number, "code": e.code, "message": e.message}
            for e in result.errors[: args.max_errors]
        ],
        "errors_total": len(result.errors),
        "records_parsed": len(result.records),
    }
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")

    # Non-zero exit if the input is unusable, so scripts can gate on it.
    if not result.quality_summary.sufficient_for_inference:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
