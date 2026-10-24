"""Ancestry-Aware Variant Explorer preprocessing pipeline.

Step 1 provides the authoritative AncestryDNA parser and normalized schema
definitions. Harmonization, phasing, ancestry inference, and scoring are added
in later milestones.

This package is NOT a diagnostic tool.
"""

from .parser import ParseResult, parse_ancestrydna

__all__ = ["ParseResult", "parse_ancestrydna"]
