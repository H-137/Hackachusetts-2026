"""Chromosome-level ancestry composition by genomic span (audit-grade).

Computes the share of a chromosome assigned to each reference population by
summing SEGMENT SPAN (base pairs) across BOTH chromosome copies, rather than by
counting RFMix windows or trusting RFMix's internal diploid Q. This makes the
denominator explicit and auditable.

Denominator: the total assigned span = sum over both copies of
(end_0based_exclusive - start_0based) for every emitted segment. Gaps between
segments and any explicitly unknown/uncertain segments are handled as described
below and reported, so the percentages reconcile to 100% of a stated base.

This is a per-chromosome composition. It is NOT a whole-genome ancestry
estimate, and it is NOT a validated ancestry result. Labels are experimental
inferred similarity to reference populations.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CompositionResult:
    chromosome: str
    denominator_bp: int
    assigned_bp: int
    uncertain_bp: int
    unknown_bp: int
    gap_bp: int
    # label -> {bp, fraction_of_assigned, fraction_of_covered}
    by_label: dict = field(default_factory=dict)
    by_superpop: dict = field(default_factory=dict)
    reconciles: bool = False
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "chromosome": self.chromosome,
            "scope": "single chromosome (NOT whole-genome ancestry)",
            "denominator_bp": self.denominator_bp,
            "assigned_bp": self.assigned_bp,
            "uncertain_bp": self.uncertain_bp,
            "unknown_bp": self.unknown_bp,
            "gap_bp": self.gap_bp,
            "by_label": self.by_label,
            "by_superpop": self.by_superpop,
            "reconciles": self.reconciles,
            "notes": self.notes,
        }


# Super-population rollup. The authoritative source is the active panel's
# sample map (panels.py derives pop->super_pop from it, so new populations such
# as AJ roll up correctly). This module-level dict is only a fallback for
# callers that do not pass a panel-derived map; it must not be relied on to
# enumerate "the" population set. A label not found here rolls up to "OTHER",
# which is reported, never silently hidden.
from .panels import FALLBACK_SUPERPOP as _FALLBACK_SUPERPOP

_SUPERPOP = dict(_FALLBACK_SUPERPOP)


def compose_by_span(
    segments: list[dict],
    chromosome: str,
    chrom_length_bp: int | None = None,
    superpop_map: dict[str, str] | None = None,
) -> CompositionResult:
    """Compute per-chromosome composition from AncestrySegment dicts.

    Bases are summed across BOTH copies, so the covered span denominator is up
    to 2 x chromosome length. Each segment contributes (end - start) bp to its
    label, split by assignment_status:
      * assigned   -> counted toward label composition
      * uncertain  -> tracked separately (kept visible, not folded into a label)
      * unknown    -> tracked separately
    Gap bp (positions in no segment on a copy) are reported but, because RFMix
    emits contiguous windows across the analyzed range, are normally ~0 within
    the analyzed range; they can be nonzero relative to full chromosome length.
    """
    assigned_bp = 0
    uncertain_bp = 0
    unknown_bp = 0
    label_bp: dict[str, int] = {}
    covered_by_copy: dict[int, int] = {1: 0, 2: 0}

    for s in segments:
        span = int(s["end_0based_exclusive"]) - int(s["start_0based"])
        if span <= 0:
            continue
        copy = int(s.get("copy_index", 1))
        covered_by_copy[copy] = covered_by_copy.get(copy, 0) + span
        status = s.get("assignment_status", "assigned")
        label = s.get("ancestry_label", "unknown")
        if status == "assigned" and label not in ("unknown", ""):
            assigned_bp += span
            label_bp[label] = label_bp.get(label, 0) + span
        elif status == "uncertain":
            uncertain_bp += span
        else:
            unknown_bp += span

    covered_bp = assigned_bp + uncertain_bp + unknown_bp

    # Gap: covered span vs the maximum possible (2 copies x chrom length), only
    # meaningful when a chromosome length is provided.
    gap_bp = 0
    if chrom_length_bp is not None:
        gap_bp = max(0, 2 * chrom_length_bp - covered_bp)

    # Fractions: give BOTH a fraction of assigned (sums to 100% over labels) and
    # a fraction of covered (so uncertain/unknown are visible against the whole).
    by_label: dict[str, dict] = {}
    for label, bp in sorted(label_bp.items(), key=lambda kv: -kv[1]):
        by_label[label] = {
            "bp": bp,
            "fraction_of_assigned": (bp / assigned_bp) if assigned_bp else 0.0,
            "fraction_of_covered": (bp / covered_bp) if covered_bp else 0.0,
        }

    # Super-population rollup (of assigned span). Prefer the panel-derived map
    # (so panel-specific populations like AJ roll up correctly); fall back to
    # the shared table only when no map is supplied.
    sp_lookup = superpop_map or _SUPERPOP
    sp_bp: dict[str, int] = {}
    for label, bp in label_bp.items():
        sp = sp_lookup.get(label, "OTHER")
        sp_bp[sp] = sp_bp.get(sp, 0) + bp
    by_superpop = {
        sp: {"bp": bp, "fraction_of_assigned": (bp / assigned_bp) if assigned_bp else 0.0}
        for sp, bp in sorted(sp_bp.items(), key=lambda kv: -kv[1])
    }

    # Reconciliation check: label bp must sum to assigned bp exactly.
    reconciles = sum(label_bp.values()) == assigned_bp

    notes = [
        "Composition is by genomic span across both chromosome copies.",
        "fraction_of_assigned uses denominator = total assigned span; it sums to "
        "100% over labels by construction.",
        "This is a single-chromosome composition, NOT whole-genome ancestry, and "
        "NOT a validated ancestry result. Labels are experimental inferred "
        "similarity to reference populations.",
    ]
    other_labels = sorted(l for l in label_bp if sp_lookup.get(l, "OTHER") == "OTHER")
    if other_labels:
        notes.append(
            "Labels without a known super-population rollup (shown under OTHER): "
            + ", ".join(other_labels)
            + ". Add them to the panel's super_pop column or superpop_overrides.")

    return CompositionResult(
        chromosome=chromosome,
        denominator_bp=assigned_bp,
        assigned_bp=assigned_bp,
        uncertain_bp=uncertain_bp,
        unknown_bp=unknown_bp,
        gap_bp=gap_bp,
        by_label=by_label,
        by_superpop=by_superpop,
        reconciles=reconciles,
        notes=notes,
    )
