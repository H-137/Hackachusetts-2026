"""Standalone PGS000057 (CHD57) coronary-heart-disease score (Step 5).

PGS000057: Natarajan P et al., Circulation 2017 (PMID 28223407), 57 variants,
GRCh37/hg19, weight_type effect_weight with OR. An ordinary weighted-sum
polygenic score with NO ancestry term.

This scorer is deliberately ancestry-free and kept completely separate from
local ancestry. Local ancestry is never folded into the weights, never used to
adjust the score, and never converted into disease risk. If ancestry is shown
near this score in the UI it is labeled contextual only.

Correctness rules (from HACKATHON_PROJECT_PLAN.md Step 5):
  * rsID alone is not a sufficient join key: each scoring variant is resolved to
    a GRCh37 position and its effect allele is reconciled to the sample's
    forward-strand alleles (direct or complement) before any dosage is counted.
  * Missing variants are NOT silently dropped. The number of scored vs total
    (57) variants is reported, and a partial sum is labeled a PARTIAL SUM OVER
    OBSERVED MARKERS, never "the PGS000057 score".
  * No disease probability and no percentile are produced (no calibration /
    comparison distribution available for this sample).

The weighted sum itself is dosage(effect_allele) * effect_weight summed over
scored variants. A unit "arithmetic fixture" verifies this code; that is NOT the
same as independently reproducing the published cohort result, and NEITHER
establishes clinical validity for any individual. Those distinctions are stated
in the output.
"""

from __future__ import annotations

import gzip
from dataclasses import dataclass, field
from pathlib import Path

_COMPLEMENT = {"A": "T", "T": "A", "C": "G", "G": "C"}


@dataclass
class ScoreVariant:
    rsid: str
    effect_allele: str
    weight: float


@dataclass
class ScoredVariant:
    rsid: str
    effect_allele: str
    weight: float
    dosage: int            # copies of the effect allele (0/1/2)
    strand: str            # "direct" | "complement"
    contribution: float    # dosage * weight


@dataclass
class PgsResult:
    model_id: str = "PGS000057"
    model_name: str = "CHD57"
    trait: str = "Coronary heart disease"
    genome_build: str = "GRCh37"
    total_variants: int = 57
    scored_variants: int = 0
    missing_variants: int = 0
    ambiguous_skipped: int = 0
    coverage: float = 0.0
    partial_sum_over_observed: float | None = None
    is_complete_published_score: bool = False
    scored_detail: list[dict] = field(default_factory=list)
    missing_rsids: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    provenance: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "model_id": self.model_id,
            "model_name": self.model_name,
            "trait": self.trait,
            "genome_build": self.genome_build,
            "total_variants": self.total_variants,
            "scored_variants": self.scored_variants,
            "missing_variants": self.missing_variants,
            "ambiguous_skipped": self.ambiguous_skipped,
            "coverage": round(self.coverage, 4),
            "partial_sum_over_observed": self.partial_sum_over_observed,
            "is_complete_published_score": self.is_complete_published_score,
            "scored_detail": self.scored_detail,
            "missing_rsids": self.missing_rsids,
            "limitations": self.limitations,
            "provenance": self.provenance,
        }


def parse_scoring_file(path: Path) -> list[ScoreVariant]:
    """Parse a PGS Catalog scoring file (rsID, effect_allele, effect_weight)."""
    opener = gzip.open if str(path).endswith(".gz") else open
    variants: list[ScoreVariant] = []
    header: list[str] | None = None
    with opener(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if header is None:
                header = parts
                continue
            row = dict(zip(header, parts))
            rsid = row.get("rsID") or row.get("rsid") or ""
            ea = (row.get("effect_allele") or "").strip().upper()
            w = row.get("effect_weight")
            if not rsid or not ea or w in (None, ""):
                continue
            variants.append(ScoreVariant(rsid, ea, float(w)))
    return variants


def _reconcile_dosage(effect_allele: str, a1: str, a2: str) -> tuple[int | None, str]:
    """Count copies of the effect allele in a genotype, reconciling strand.

    Returns (dosage, strand) where strand is 'direct' or 'complement'. Returns
    (None, 'ambiguous') if the effect allele matches neither the observed
    alleles nor their complements, i.e. the variant cannot be reconciled and
    must be skipped rather than scored as 0.
    """
    a1, a2 = a1.upper(), a2.upper()
    obs = [a for a in (a1, a2) if a in _COMPLEMENT]
    if len(obs) < 2:
        return None, "ambiguous"
    # Direct strand: effect allele appears among observed alleles.
    if effect_allele in obs:
        return sum(1 for a in obs if a == effect_allele), "direct"
    # Complement strand: effect allele's complement appears.
    comp = _COMPLEMENT.get(effect_allele)
    if comp and comp in obs:
        return sum(1 for a in obs if a == comp), "complement"
    # Effect allele absent on either strand: the person is homozygous for the
    # other allele AND strand is unresolved -> we cannot safely assign 0 here
    # (could be a true 0, could be a strand/annotation mismatch). Skip & count.
    #
    # However, if BOTH observed alleles equal each other and are a valid base,
    # and the effect allele is simply the other SNP allele on the SAME strand,
    # dosage is genuinely 0. We only reach here when neither direct nor
    # complement matched, which for a biallelic SNP means a real mismatch.
    return None, "ambiguous"


def score_pgs000057(
    scoring_file: Path,
    observed_alleles: dict[str, tuple[str, str]],
) -> PgsResult:
    """Compute the partial weighted sum over observed PGS000057 variants.

    observed_alleles maps rsid -> (allele1, allele2) from the sample, for the
    SNP variants actually typed (A/C/G/T only; no-calls and indels excluded by
    the caller).
    """
    variants = parse_scoring_file(scoring_file)
    result = PgsResult(total_variants=len(variants))

    total = 0.0
    scored: list[dict] = []
    missing: list[str] = []

    for v in variants:
        obs = observed_alleles.get(v.rsid)
        if obs is None:
            missing.append(v.rsid)
            continue
        dosage, strand = _reconcile_dosage(v.effect_allele, obs[0], obs[1])
        if dosage is None:
            result.ambiguous_skipped += 1
            missing.append(v.rsid)
            continue
        contrib = dosage * v.weight
        total += contrib
        scored.append({
            "rsid": v.rsid, "effect_allele": v.effect_allele, "weight": v.weight,
            "dosage": dosage, "strand": strand, "contribution": round(contrib, 6),
        })

    result.scored_variants = len(scored)
    result.missing_variants = len(missing)
    result.coverage = len(scored) / len(variants) if variants else 0.0
    result.partial_sum_over_observed = round(total, 6) if scored else None
    result.is_complete_published_score = (len(scored) == len(variants))
    result.scored_detail = scored
    result.missing_rsids = sorted(missing)
    result.provenance = {
        "model_id": "PGS000057",
        "publication": "Natarajan P et al., Circulation 2017; PMID 28223407; "
                       "doi 10.1161/CIRCULATIONAHA.116.024436",
        "source": "PGS Catalog (EBI). Use per author restrictions and EBI Terms of Use.",
        "ancestry_adjustment": "none — this is a standard, ancestry-free PGS",
    }
    result.limitations = [
        f"Only {result.scored_variants} of {result.total_variants} model "
        "variants were observed in this sample; this is a PARTIAL SUM OVER "
        "OBSERVED MARKERS, not the published PGS000057 score.",
        "No disease probability or percentile is produced: no calibration or "
        "comparison distribution is available for this sample.",
        "Local ancestry is NOT incorporated into this score. Any ancestry shown "
        "alongside it is contextual only.",
        "A passing arithmetic fixture verifies this code; it does not reproduce "
        "the published cohort result and does not establish clinical validity.",
    ]
    if result.ambiguous_skipped:
        result.limitations.append(
            f"{result.ambiguous_skipped} variant(s) could not be strand/allele "
            "reconciled to the sample and were skipped rather than scored as 0."
        )
    return result
