"""Family-aware Mendelian-consistency layer (Step 3).

Beagle 5.x does not model parent-offspring relationships, so the family-aware
path is implemented here explicitly and transparently rather than relying on
trio phasing inside the phasing tool.

Given a proband genotype and zero, one, or two parental genotypes at a shared
site, this module:
  * checks Mendelian consistency (does the proband's genotype draw one allele
    from each available parent?),
  * where a trio makes parental origin unambiguous, assigns which proband copy
    came from which parent,
  * leaves ambiguous sites explicitly unresolved (e.g. both parents and the
    proband all heterozygous A/G: parental origin cannot be determined).

Genotypes are represented as unordered allele pairs of strings (e.g. ("A","G")).
This layer operates on allele *values*, independent of VCF 0/1 indexing, so it
composes with the harmonized/phased VCFs without assuming REF/ALT order.

Privacy: functions take and return genotype structures in memory for the
pipeline; callers must keep genotype values out of logs (aggregate counts only).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ParentalOrigin(Enum):
    UNRESOLVED = "unresolved"
    # copy order (copy1_from, copy2_from)
    MOTHER_FATHER = "mother_father"
    FATHER_MOTHER = "father_mother"


@dataclass
class TrioSiteResult:
    mendelian_consistent: bool
    origin: ParentalOrigin
    reason: str
    # Ordered proband copies when resolved: (copy1_allele, copy2_allele).
    ordered: tuple[str, str] | None = None


Genotype = tuple[str, str]


def _as_pair(gt: Genotype) -> tuple[str, str]:
    a, b = gt
    return (a, b)


def _is_missing(gt: Genotype | None) -> bool:
    return gt is None or any(a in (".", "", None) for a in gt)


def mendelian_consistent(child: Genotype, mother: Genotype | None,
                         father: Genotype | None) -> bool:
    """True if the child's alleles can be drawn one from each available parent.

    With both parents: the child must have one allele transmissible by the
    mother and the other by the father (in some assignment). With one parent:
    at least one child allele must be present in that parent. With no parents:
    trivially consistent (nothing to check).
    """
    if _is_missing(child):
        return True
    c1, c2 = _as_pair(child)

    if not _is_missing(mother) and not _is_missing(father):
        m = set(mother)  # type: ignore[arg-type]
        f = set(father)  # type: ignore[arg-type]
        # One allele from mother and the other from father, either assignment.
        return (c1 in m and c2 in f) or (c2 in m and c1 in f)

    present_parent = mother if not _is_missing(mother) else father
    if not _is_missing(present_parent):
        p = set(present_parent)  # type: ignore[arg-type]
        return c1 in p or c2 in p

    return True


def resolve_parental_origin(child: Genotype, mother: Genotype | None,
                            father: Genotype | None) -> TrioSiteResult:
    """Assign which child copy came from which parent, when unambiguous.

    Returns an ordered (copy1, copy2) with copy1 = maternal, copy2 = paternal
    when resolvable; otherwise UNRESOLVED with a reason.
    """
    if _is_missing(child):
        return TrioSiteResult(True, ParentalOrigin.UNRESOLVED, "child_missing")
    if _is_missing(mother) or _is_missing(father):
        return TrioSiteResult(
            mendelian_consistent(child, mother, father),
            ParentalOrigin.UNRESOLVED,
            "incomplete_trio",
        )

    c1, c2 = _as_pair(child)
    m = set(mother)   # type: ignore[arg-type]
    f = set(father)   # type: ignore[arg-type]

    if not mendelian_consistent(child, mother, father):
        return TrioSiteResult(False, ParentalOrigin.UNRESOLVED, "mendelian_error")

    # Can c1 come from mother and c2 from father?
    a_ok = c1 in m and c2 in f
    # Can c1 come from father and c2 from mother?
    b_ok = c1 in f and c2 in m

    if a_ok and not b_ok:
        return TrioSiteResult(True, ParentalOrigin.MOTHER_FATHER,
                              "resolved", ordered=(c1, c2))
    if b_ok and not a_ok:
        return TrioSiteResult(True, ParentalOrigin.FATHER_MOTHER,
                              "resolved", ordered=(c2, c1))
    # Both assignments possible (e.g. all heterozygous for the same pair):
    # parental origin is genuinely ambiguous.
    return TrioSiteResult(True, ParentalOrigin.UNRESOLVED, "ambiguous_both_assignments")


@dataclass
class TrioSummary:
    total_sites: int = 0
    mendelian_errors: int = 0
    resolved: int = 0
    unresolved: int = 0

    def as_dict(self) -> dict:
        return {
            "total_sites": self.total_sites,
            "mendelian_errors": self.mendelian_errors,
            "resolved": self.resolved,
            "unresolved": self.unresolved,
        }


def summarize_trio(
    sites: list[tuple[Genotype, Genotype | None, Genotype | None]],
) -> TrioSummary:
    """Aggregate trio resolution across many sites. Counts only; no genotypes."""
    s = TrioSummary()
    for child, mother, father in sites:
        s.total_sites += 1
        res = resolve_parental_origin(child, mother, father)
        if not res.mendelian_consistent:
            s.mendelian_errors += 1
        if res.origin is ParentalOrigin.UNRESOLVED:
            s.unresolved += 1
        else:
            s.resolved += 1
    return s
