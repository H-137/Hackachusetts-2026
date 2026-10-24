"""Ancestry-contextualized per-locus evidence assembler (Step 5 core).

For each curated disease-associated locus, assemble five INDEPENDENT layers into
one record, keeping each from contaminating the others:

  1. observed genotype + assay status (fact)
  2. local ancestry for BOTH copies, with uncertainty (context only)
  3. published disease-association evidence
  4. population-specific allele frequency + documented founder associations
  5. an explicit frequency-vs-effect distinction

Hard guardrails (enforced here):
  * A curated locus is ALWAYS included, regardless of the person's inferred
    ancestry. Ancestry never gates whether an observed variant is shown.
  * Ancestry is NEVER used as evidence that an unmeasured variant is present. A
    not_assayed / no_call locus stays that way; ancestry near it changes nothing
    about its measurement status.
  * Population frequency context is labeled as frequency, explicitly not as an
    ancestry-dependent disease effect, and not as a personal finding.
  * No disease probability or percentile is produced anywhere here.

Privacy: this operates on already-parsed genotype structures in memory. Callers
surface per-locus status/labels, not raw allele dumps, to logs.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from .conditions import CURATED_CONDITIONS, CuratedCondition, CuratedVariant


@dataclass
class LocusObservation:
    """Layer 1: what was actually measured at the locus."""
    measurement_status: str  # observed | no_call | not_assayed | excluded
    genotype: str | None     # e.g. "A/A", or None when not observed
    carries_clinical_allele: bool | None  # None when not observed/assayed
    clinical_allele_copies: int | None     # 0/1/2, None when not observed
    note: str = ""


@dataclass
class AncestryContext:
    """Layer 2: local ancestry over the locus, both copies. CONTEXT ONLY."""
    copy1_label: str | None
    copy1_status: str | None   # assigned | uncertain | unknown
    copy2_label: str | None
    copy2_status: str | None
    note: str = (
        "Local ancestry is experimental inferred similarity to reference "
        "populations and is contextual only. It is NOT evidence about whether a "
        "variant is present and does not alter the observed genotype."
    )


@dataclass
class AnnotatedLocus:
    condition: str
    gene: str
    rsid: str
    chromosome: str
    position_1based: int
    variant_type: str
    observation: LocusObservation
    ancestry_context: AncestryContext
    disease_evidence: list[dict]
    frequency_annotations: list[dict]
    founder_context: list[dict]
    frequency_vs_effect_note: str
    limitations: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


def _copies_of_clinical_allele(genotype: str, clinical_allele: str) -> int:
    """Count copies of the clinical allele in a genotype string like 'A/T'."""
    sep = "|" if "|" in genotype else "/"
    alleles = [a.strip().upper() for a in genotype.split(sep)]
    return sum(1 for a in alleles if a == clinical_allele.upper())


def annotate_locus(
    condition: CuratedCondition,
    variant: CuratedVariant,
    observed_genotypes: dict[str, str],
    measurement_status: dict[str, str],
    ancestry_segments: list[dict],
    evidence_by_rsid: dict[str, list[dict]],
    frequencies_by_rsid: dict[str, list[dict]],
) -> AnnotatedLocus:
    """Build one ancestry-contextualized locus record.

    observed_genotypes / measurement_status are keyed by rsid. A variant absent
    from both is not_assayed (we never infer it). ancestry_segments are the
    normalized AncestrySegment dicts for the sample.
    """
    rsid = variant.rsid

    # --- Layer 1: observation (fact). Never inferred from ancestry. ---
    status = measurement_status.get(rsid)
    gt = observed_genotypes.get(rsid)
    if status is None:
        # Absent from the processed data. For an indel that arrays can't type,
        # say so specifically; otherwise it is simply not assayed here.
        status = "not_assayed"
    if gt is not None and status == "observed":
        copies = _copies_of_clinical_allele(gt, variant.clinical_allele)
        obs = LocusObservation(
            measurement_status="observed", genotype=gt,
            carries_clinical_allele=copies > 0, clinical_allele_copies=copies,
            note="Directly observed genotype." if variant.array_typable else "",
        )
    else:
        obs = LocusObservation(
            measurement_status=status, genotype=None,
            carries_clinical_allele=None, clinical_allele_copies=None,
            note=(
                "Indel not reliably typed by consumer SNP arrays; reported as "
                "not_assayed rather than negative."
                if (not variant.array_typable and status == "not_assayed")
                else "Not observed in this dataset; not a negative result."
            ),
        )

    # --- Layer 2: ancestry context over the locus, both copies. ---
    overlapping = [
        s for s in ancestry_segments
        if s.get("chromosome") == variant.chromosome
        and int(s["start_0based"]) <= (variant.position_1based - 1) < int(s["end_0based_exclusive"])
    ]
    by_copy = {int(s["copy_index"]): s for s in overlapping}
    c1 = by_copy.get(1)
    c2 = by_copy.get(2)
    anc = AncestryContext(
        copy1_label=c1.get("ancestry_label") if c1 else None,
        copy1_status=c1.get("assignment_status") if c1 else None,
        copy2_label=c2.get("ancestry_label") if c2 else None,
        copy2_status=c2.get("assignment_status") if c2 else None,
    )

    # --- Layers 3 & 4: evidence + frequency (passed through, nulls preserved) ---
    evidence = evidence_by_rsid.get(rsid, [])
    freqs = frequencies_by_rsid.get(rsid, [])

    # --- Layer 5 + guardrail limitations ---
    limitations = [
        "Observed-genotype interpretation is independent of local ancestry.",
        "Inferred ancestry is never used as evidence that an unmeasured variant "
        "is present.",
    ]
    if obs.measurement_status != "observed":
        limitations.append(
            "This locus was not directly observed here; its absence is not a "
            "negative or reassuring result."
        )
    if variant.variant_type == "indel":
        limitations.append(
            "Indel: not reliably assayed by a consumer SNP array; confirmatory "
            "testing is required to assess it."
        )

    founder = [asdict(f) for f in condition.founder_context]

    return AnnotatedLocus(
        condition=condition.condition,
        gene=variant.gene,
        rsid=rsid,
        chromosome=variant.chromosome,
        position_1based=variant.position_1based,
        variant_type=variant.variant_type,
        observation=obs,
        ancestry_context=anc,
        disease_evidence=evidence,
        frequency_annotations=freqs,
        founder_context=founder,
        frequency_vs_effect_note=condition.frequency_vs_effect_note,
        limitations=limitations,
    )


def annotate_all(
    observed_genotypes: dict[str, str],
    measurement_status: dict[str, str],
    ancestry_segments: list[dict],
    evidence_by_rsid: dict[str, list[dict]],
    frequencies_by_rsid: dict[str, list[dict]],
    conditions: list[CuratedCondition] | None = None,
) -> list[dict]:
    """Annotate every curated locus. All curated loci are always included."""
    conds = conditions if conditions is not None else CURATED_CONDITIONS
    out: list[dict] = []
    for cond in conds:
        for var in cond.variants:
            out.append(annotate_locus(
                cond, var, observed_genotypes, measurement_status,
                ancestry_segments, evidence_by_rsid, frequencies_by_rsid,
            ).as_dict())
    return out
