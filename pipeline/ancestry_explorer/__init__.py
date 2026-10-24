"""Ancestry-Aware Variant Explorer preprocessing pipeline.

Step 1 provides the authoritative AncestryDNA parser and normalized schema.
Step 2 adds reference-asset management and harmonization into a reference-aligned
VCF. Phasing, ancestry inference, and scoring are added in later milestones.

This package is NOT a diagnostic tool.
"""

from .family import resolve_parental_origin, summarize_trio
from .harmonize import HarmonizationReport, harmonize
from .parser import ParseResult, parse_ancestrydna
from .phasing import PhasingResult, phase_chromosome
from .reference import load_manifest, run_setup

__all__ = [
    "ParseResult",
    "parse_ancestrydna",
    "HarmonizationReport",
    "harmonize",
    "PhasingResult",
    "phase_chromosome",
    "resolve_parental_origin",
    "summarize_trio",
    "run_setup",
    "load_manifest",
]
