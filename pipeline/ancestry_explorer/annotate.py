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
    """Layer 1: what was actually measured at the locus, with raw provenance.

    measurement_status taxonomy:
      observed               directly measured A/C/G/T call
      no_call                site on the array but not called (0)
      indel_uninterpretable  array reports an I/D placeholder; the site IS
                             assayed but a SNP-only pipeline cannot interpret it
      not_observed           rsID absent from the raw file (NOT hom-ref)
    """
    measurement_status: str
    genotype: str | None
    carries_clinical_allele: bool | None
    clinical_allele_copies: int | None
    call_kind: str  # "measured" | "imputed"
    # Full raw-row provenance (original build, coordinate, reported alleles,
    # strand conversion). None only when no raw lookup was supplied.
    raw_provenance: dict | None = None
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


_COMPLEMENT = {"A": "T", "T": "A", "C": "G", "G": "C"}


def _copies_of_clinical_allele_stranded(
    genotype: str, clinical_allele: str, strand_conversion: str,
) -> int | None:
    """Count copies of the clinical allele, honoring any strand conversion.

    Returns None when the clinical allele is not a single SNP base (e.g. an
    indel), so carrier status is not asserted from a SNP genotype.
    """
    ca = clinical_allele.upper()
    if ca not in _COMPLEMENT:
        return None
    target = _COMPLEMENT[ca] if strand_conversion == "complement" else ca
    sep = "|" if "|" in genotype else "/"
    alleles = [a.strip().upper() for a in genotype.split(sep)]
    return sum(1 for a in alleles if a == target)


def annotate_locus(
    condition: CuratedCondition,
    variant: CuratedVariant,
    ancestry_segments: list[dict],
    evidence_by_rsid: dict[str, list[dict]],
    frequencies_by_rsid: dict[str, list[dict]],
    raw_provenance: dict | None = None,
) -> AnnotatedLocus:
    """Build one ancestry-contextualized locus record.

    raw_provenance is a RawRowProvenance.as_dict() for this rsID (from
    raw_lookup.lookup_raw_rows). The measurement status and genotype come from
    the ACTUAL raw row, never assumed. When raw_provenance is None, the locus is
    reported not_observed (absence is never homozygous reference).
    """
    rsid = variant.rsid

    # --- Layer 1: observation (fact), derived from the actual raw row. ---
    if raw_provenance is None:
        obs = LocusObservation(
            measurement_status="not_observed", genotype=None,
            carries_clinical_allele=None, clinical_allele_copies=None,
            call_kind="measured", raw_provenance=None,
            note="No raw lookup supplied; reported not_observed (not hom-ref).",
        )
    else:
        status = raw_provenance["measurement_status"]
        gt = raw_provenance.get("genotype")
        if status == "observed" and gt is not None:
            copies = _copies_of_clinical_allele_stranded(
                gt, variant.clinical_allele,
                raw_provenance.get("strand_conversion", "none"),
            )
            obs = LocusObservation(
                measurement_status="observed", genotype=gt,
                carries_clinical_allele=(copies is not None and copies > 0),
                clinical_allele_copies=copies,
                call_kind=raw_provenance.get("call_kind", "measured"),
                raw_provenance=raw_provenance,
                note="Directly measured genotype from the raw row.",
            )
        else:
            note = {
                "no_call": "Reported as a no-call; not a negative result.",
                "indel_uninterpretable": (
                    "Array reports an indel placeholder: the site IS assayed but "
                    "a SNP-only pipeline cannot interpret it. Not absent, not "
                    "negative."
                ),
                "not_observed": "rsID absent from the raw file; not hom-ref.",
            }.get(status, "Not a directly measured SNP call.")
            obs = LocusObservation(
                measurement_status=status, genotype=None,
                carries_clinical_allele=None, clinical_allele_copies=None,
                call_kind=raw_provenance.get("call_kind", "measured"),
                raw_provenance=raw_provenance, note=note,
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
    if obs.measurement_status == "not_observed":
        limitations.append(
            "This rsID is absent from the raw file; reported not_observed. "
            "Absence is NOT homozygous reference and NOT a negative result."
        )
    elif obs.measurement_status == "no_call":
        limitations.append(
            "The site is on the array but was not called in this sample; not a "
            "negative result."
        )
    elif obs.measurement_status == "indel_uninterpretable":
        limitations.append(
            "The array assays this site but reports an indel placeholder a "
            "SNP-only pipeline cannot interpret; confirmatory testing is needed."
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
    ancestry_segments: list[dict],
    evidence_by_rsid: dict[str, list[dict]],
    frequencies_by_rsid: dict[str, list[dict]],
    raw_provenance_by_rsid: dict[str, dict] | None = None,
    conditions: list[CuratedCondition] | None = None,
) -> list[dict]:
    """Annotate every curated locus. All curated loci are always included.

    raw_provenance_by_rsid maps rsid -> RawRowProvenance.as_dict() from
    raw_lookup.lookup_raw_rows. When absent, loci are reported not_observed
    (absence is never homozygous reference).
    """
    conds = conditions if conditions is not None else CURATED_CONDITIONS
    prov = raw_provenance_by_rsid or {}
    out: list[dict] = []
    for cond in conds:
        for var in cond.variants:
            out.append(annotate_locus(
                cond, var, ancestry_segments, evidence_by_rsid,
                frequencies_by_rsid, prov.get(var.rsid),
            ).as_dict())
    return out
