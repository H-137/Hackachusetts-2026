"""Ancestry-Aware Variant Explorer preprocessing pipeline.

Step 1 provides the authoritative AncestryDNA parser and normalized schema.
Step 2 adds reference-asset management and harmonization into a reference-aligned
VCF. Phasing, ancestry inference, and scoring are added in later milestones.

This package is NOT a diagnostic tool.
"""

from .annotate import annotate_all
from .composition import compose_by_span
from .conditions import CURATED_CONDITIONS, manifest as condition_manifest
from .family import resolve_parental_origin, summarize_trio
from .pgs import parse_scoring_file, score_pgs000057
from .harmonize import HarmonizationReport, harmonize
from .parser import ParseResult, parse_ancestrydna
from .phasing import PhasingResult, phase_chromosome
from .reference import load_manifest, run_setup
from .restore_markers import restore_ancestry_vcf

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
    "restore_ancestry_vcf",
    "compose_by_span",
    "annotate_all",
    "CURATED_CONDITIONS",
    "condition_manifest",
    "score_pgs000057",
    "parse_scoring_file",
]
