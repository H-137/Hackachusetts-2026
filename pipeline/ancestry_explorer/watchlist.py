"""SNPshot core engine: ancestry-informed pathogenic-variant watchlist.

For every catalog variant, local ancestry at THAT VARIANT'S LOCUS (independently
on chromosome copy 1 and copy 2) is the central lookup. We never substitute
whole-genome or whole-chromosome ancestry composition for the locus-specific
segment.

Pipeline per variant:
  1. Harmonize coordinate/alleles to our genome build (GRCh37).
  2. Find the overlapping ancestry segment on copy 1 and copy 2 independently.
     If the chromosome has not been processed -> ancestry_not_available (no
     extrapolation).
  3. Retrieve each copy's segment boundaries, reference-population label,
     marginal probabilities, and assignment status (stability info).
  4. Compare locus ancestry with the variant's documented population
     association. Match ONLY when supported; a broad/neighboring reference group
     is not treated as a specific founder population -> unresolved.
  5. Fold in the observed genotype + measurement status from the raw file
     (correct allele/strand handling; absence is never reference; no allele is
     attributed to a specific copy unless phase is established).
  6. Assign an explainable priority CATEGORY (not an invented numeric risk).

Hard interpretation rules (enforced + surfaced):
  * Ancestry can contextualize attention for an UNMEASURED variant; it never
    establishes presence/absence.
  * Population frequency is not disease effect, penetrance, or personal risk.
  * Lower documented frequency = weaker ancestry-based evidence, NOT "safe" /
    "ruled out" / "skip screening".
  * Directly observed clinically relevant findings stay visible regardless of
    ancestry.
  * Ancestry labels are experimental reference-population similarity, not known
    ethnicity; marginal probabilities are not converted to risk percentages.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

# Which fine reference populations roll up to which super-population, so we can
# say a locus label is "within the associated super-population" WITHOUT claiming
# it is the specific founder population.
_SUPERPOP = {
    "CEU": "EUR", "GBR": "EUR", "FIN": "EUR", "IBS": "EUR", "TSI": "EUR",
    "CHB": "EAS", "JPT": "EAS", "CHS": "EAS", "CDX": "EAS", "KHV": "EAS",
    "YRI": "AFR", "LWK": "AFR", "GWD": "AFR", "MSL": "AFR", "ESN": "AFR",
    "ASW": "AFR", "ACB": "AFR",
    "MXL": "AMR", "PUR": "AMR", "CLM": "AMR", "PEL": "AMR",
    "GIH": "SAS", "PJL": "SAS", "BEB": "SAS", "STU": "SAS", "ITU": "SAS",
}


@dataclass
class CopyAncestry:
    copy_index: int
    available: bool
    ancestry_label: str | None = None
    assignment_status: str | None = None          # assigned | uncertain | unknown
    segment_start_0based: int | None = None
    segment_end_0based_exclusive: int | None = None
    marginal_probabilities: dict | None = None
    reason: str = ""


@dataclass
class PopulationCompatibility:
    """How locus ancestry relates to the variant's documented association."""
    status: str   # "supported" | "within_superpopulation" | "mismatch"
                  # | "no_association_documented" | "unresolved" | "not_available"
    detail: str


@dataclass
class WatchlistEntry:
    variant_id: str
    condition: str
    gene: str
    inheritance: str
    chromosome: str
    position_1based: int
    build: str
    hgvs: str | None
    rsid: str | None
    clinical_classification: str
    review_status: str
    citations: list[str]
    associated_populations: list[str]
    founder_variant: bool
    frequency_evidence: list[dict]
    # Locus-specific ancestry, per copy.
    copy1_ancestry: dict
    copy2_ancestry: dict
    population_compatibility: dict
    # Observation.
    measurement_status: str          # observed | no_call | indel_uninterpretable | not_observed | unassayed
    observed_genotype: str | None
    phase_established: bool
    # Explainable prioritization.
    priority_category: str           # see assign_priority
    priority_reasons: list[str]
    attention_rationale: str
    limitations: list[str]

    def as_dict(self) -> dict:
        return asdict(self)


def _overlapping_segment(segments: list[dict], chrom: str, pos0: int, copy: int) -> dict | None:
    for s in segments:
        if (s.get("chromosome") == chrom and int(s["copy_index"]) == copy
                and int(s["start_0based"]) <= pos0 < int(s["end_0based_exclusive"])):
            return s
    return None


def _copy_ancestry(segments: list[dict], processed_chroms: set[str],
                   chrom: str, pos0: int, copy: int) -> CopyAncestry:
    if chrom not in processed_chroms:
        return CopyAncestry(copy, available=False,
                            reason="ancestry_not_available: chromosome not processed")
    seg = _overlapping_segment(segments, chrom, pos0, copy)
    if seg is None:
        return CopyAncestry(copy, available=False,
                            reason="no overlapping ancestry segment on this copy")
    return CopyAncestry(
        copy_index=copy, available=True,
        ancestry_label=seg.get("ancestry_label"),
        assignment_status=seg.get("assignment_status"),
        segment_start_0based=int(seg["start_0based"]),
        segment_end_0based_exclusive=int(seg["end_0based_exclusive"]),
        marginal_probabilities=seg.get("probabilities"),
        reason="locus-specific segment found",
    )


def _compatibility(assoc: list[str], c1: CopyAncestry, c2: CopyAncestry) -> PopulationCompatibility:
    if not assoc:
        return PopulationCompatibility(
            "no_association_documented",
            "No specific founder/population association is documented for this "
            "variant, so locus ancestry adds little population-frequency context.",
        )
    labels = [c.ancestry_label for c in (c1, c2) if c.available and c.ancestry_label]
    if not labels:
        return PopulationCompatibility(
            "not_available",
            "Local ancestry is not available at this locus (chromosome not "
            "processed or no segment), so population compatibility is unresolved.",
        )
    assoc_set = set(assoc)
    # Exact support: a copy's label is one of the specifically associated pops.
    if any(lbl in assoc_set for lbl in labels):
        return PopulationCompatibility(
            "supported",
            "At least one chromosome copy's locus ancestry matches a specifically "
            "associated reference population. This is a reason for ADDITIONAL "
            "attention; it does not establish the variant is present.",
        )
    # Same super-population but not the specific founder group: do NOT claim a
    # founder match.
    assoc_super = {_SUPERPOP.get(p) for p in assoc}
    label_super = {_SUPERPOP.get(l) for l in labels}
    if assoc_super & label_super:
        return PopulationCompatibility(
            "within_superpopulation",
            "Locus ancestry falls in the same broad super-population as the "
            "association but is NOT the specific founder reference population. "
            "A broad/neighboring group is not treated as the founder population; "
            "population-frequency relevance is weaker and this is marked "
            "unresolved for a specific founder match.",
        )
    return PopulationCompatibility(
        "mismatch",
        "Locus ancestry does not match the associated population. The variant is "
        "still shown; lower population-frequency relevance does NOT mean safe, "
        "ruled out, or skip screening.",
    )


def assign_priority(variant: dict, compat: PopulationCompatibility,
                    measurement_status: str, carries: bool | None) -> tuple[str, list[str], str]:
    """Explainable priority category. No invented numeric risk weights.

    Categories (ordered, most actionable first):
      observed_finding       a clinically relevant allele was directly observed
      ancestry_supported     unmeasured + locus ancestry supports attention
      review_status_strong   expert-panel variant, context weaker/unresolved
      context_weak           documented but weak/mismatched ancestry relevance
      ancestry_not_available ancestry at the locus could not be determined
    """
    reasons: list[str] = []
    cls = variant.get("clinical_classification", "")
    review = variant.get("review_status", "")
    expert = "expert panel" in review.lower()

    if measurement_status == "observed" and carries:
        reasons.append("A clinically relevant allele was directly observed.")
        return "observed_finding", reasons, (
            "Directly observed finding; visible regardless of ancestry. Confirm "
            "with clinical testing."
        )

    if compat.status == "supported":
        reasons.append(f"{cls} ({review}).")
        reasons.append("Locus ancestry on at least one copy matches a "
                       "specifically associated founder population.")
        return "ancestry_supported", reasons, (
            "Local ancestry at this locus is a reason for additional attention "
            "for an unmeasured/at-risk variant. It does NOT establish presence."
        )

    if expert:
        reasons.append(f"{cls}, reviewed by expert panel.")
        if compat.status in ("within_superpopulation", "unresolved", "not_available"):
            reasons.append("Locus-ancestry support is weaker or unresolved.")
        return "review_status_strong", reasons, (
            "Strong clinical evidence; local-ancestry support is weaker or "
            "unresolved here. Lower frequency relevance is not reassurance."
        )

    if compat.status == "not_available":
        reasons.append("Ancestry at this locus is not available (chromosome not "
                       "processed).")
        return "ancestry_not_available", reasons, (
            "Cannot use local ancestry here yet. Clinical evidence still stands; "
            "absence of ancestry context is not reassurance."
        )

    reasons.append(f"{cls} ({review}); weak or mismatched local-ancestry relevance.")
    return "context_weak", reasons, (
        "Documented pathogenic variant with weaker/mismatched local-ancestry "
        "relevance. Weaker evidence is not 'safe' or 'ruled out'."
    )


def build_watchlist(
    catalog_variants: list[dict],
    ancestry_segments: list[dict],
    processed_chromosomes: set[str],
    raw_provenance_by_rsid: dict[str, dict] | None = None,
    clinical_allele_by_variant: dict[str, str] | None = None,
) -> list[dict]:
    """Build the ancestry-informed watchlist. Returns entries sorted by priority.

    ancestry_segments: normalized AncestrySegment dicts (locus-specific source).
    processed_chromosomes: chroms for which ancestry exists (e.g. {"22"}).
    raw_provenance_by_rsid: RawRowProvenance.as_dict() per rsid (observed status).
    """
    prov = raw_provenance_by_rsid or {}
    entries: list[WatchlistEntry] = []

    for v in catalog_variants:
        chrom = v["chromosome"]
        pos0 = v["position_1based"] - 1
        c1 = _copy_ancestry(ancestry_segments, processed_chromosomes, chrom, pos0, 1)
        c2 = _copy_ancestry(ancestry_segments, processed_chromosomes, chrom, pos0, 2)
        compat = _compatibility(v.get("associated_populations", []), c1, c2)

        # Observation (never inferred from ancestry).
        rp = prov.get(v.get("rsid") or "")
        if rp is None:
            measurement_status = "unassayed"
            observed_gt = None
            carries = None
        else:
            measurement_status = rp["measurement_status"]
            observed_gt = rp.get("genotype")
            carries = None
            if measurement_status == "observed" and observed_gt is not None:
                ca = (clinical_allele_by_variant or {}).get(v["variant_id"])
                if ca:
                    strand = rp.get("strand_conversion", "none")
                    target = {"A": "T", "T": "A", "C": "G", "G": "C"}[ca] \
                        if (strand == "complement" and ca in "ACGT") else ca
                    sep = "|" if "|" in observed_gt else "/"
                    alleles = [a.strip().upper() for a in observed_gt.split(sep)]
                    carries = target.upper() in alleles

        # Phase: our genotypes are unphased at the variant level (phasing is at
        # the panel markers, not every catalog locus), so we never attribute an
        # observed allele to a specific copy.
        phase_established = False

        prio, reasons, rationale = assign_priority(v, compat, measurement_status, carries)

        limitations = [
            "Local ancestry contextualizes attention; it cannot establish a "
            "variant's presence or absence.",
            "Population frequency is not disease effect, penetrance, or personal "
            "disease probability.",
            "Lower documented frequency means weaker ancestry-based evidence, not "
            "'safe', 'ruled out', or 'skip screening'.",
            "Ancestry labels are experimental reference-population similarity, not "
            "known ethnicity; marginal probabilities are not risk percentages.",
        ]
        if not phase_established and measurement_status == "observed":
            limitations.append(
                "Observed genotype is not attributed to a specific chromosome "
                "copy because phase is not established at this locus.")

        entries.append(WatchlistEntry(
            variant_id=v["variant_id"], condition=v["condition"], gene=v["gene"],
            inheritance=v["inheritance"], chromosome=chrom,
            position_1based=v["position_1based"], build=v["source_build"],
            hgvs=v.get("hgvs"), rsid=v.get("rsid"),
            clinical_classification=v["clinical_classification"],
            review_status=v["review_status"], citations=v.get("citations", []),
            associated_populations=v.get("associated_populations", []),
            founder_variant=v.get("founder_variant", False),
            frequency_evidence=v.get("frequency_evidence", []),
            copy1_ancestry=asdict(c1), copy2_ancestry=asdict(c2),
            population_compatibility=asdict(compat),
            measurement_status=measurement_status, observed_genotype=observed_gt,
            phase_established=phase_established,
            priority_category=prio, priority_reasons=reasons,
            attention_rationale=rationale, limitations=limitations,
        ))

    order = {
        "observed_finding": 0, "ancestry_supported": 1, "review_status_strong": 2,
        "context_weak": 3, "ancestry_not_available": 4,
    }
    entries.sort(key=lambda e: order.get(e.priority_category, 9))
    return [e.as_dict() for e in entries]
