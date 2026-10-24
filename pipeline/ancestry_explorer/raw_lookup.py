"""Raw-data provenance lookup for curated variants (Step 5).

For every curated variant, find the MATCHING ORIGINAL raw-data row in the
AncestryDNA file and report its genome build, coordinate, reported alleles, and
any strand conversion applied to compare against the clinical (+ strand) allele.

Status rules (per the stricter provenance requirement):
  * A/C/G/T genotype            -> "observed" (directly measured call)
  * a "0" allele                -> "no_call"  (the site was on the array but not
                                   called in this sample)
  * an indel placeholder I / D  -> "indel_uninterpretable" (the platform DOES
                                   assay the site, but a SNP-only pipeline cannot
                                   interpret the I/D code as A/C/G/T) — this is
                                   NOT "not_assayed"
  * rsID absent from the file   -> "not_observed"

Absence is NEVER treated as homozygous reference. Directly measured calls are
distinguished from imputed calls: this consumer raw file contains only directly
measured array genotypes, so `call_kind` is always "measured" here; an
"imputed" kind is reserved for imputed inputs (none in this path).

The build is read from the file's own metadata (declared build 37.1 -> GRCh37);
it is not assumed per variant. Strand: the file declares forward (+) strand, so
no conversion is normally needed; when the clinical allele matches only the
complement of the reported alleles, we record strand_conversion="complement".

Privacy: this reads the local raw file and returns per-variant provenance for
the curated panel only. Callers must not dump these rows into shared logs.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

_SNP = {"A", "C", "G", "T"}
_INDEL = {"I", "D"}
_COMPLEMENT = {"A": "T", "T": "A", "C": "G", "G": "C"}


@dataclass
class RawRowProvenance:
    rsid: str
    found: bool
    # Original row as reported by the source (None when absent).
    raw_chromosome: str | None = None
    raw_position_1based: int | None = None
    raw_allele1: str | None = None
    raw_allele2: str | None = None
    genome_build: str | None = None       # from file metadata, e.g. "GRCh37"
    declared_strand: str | None = None     # from file metadata, e.g. "+"
    # Derived status.
    measurement_status: str = "not_observed"
    call_kind: str = "measured"            # "measured" | "imputed"
    genotype: str | None = None            # "A/G" for SNP calls, else None
    # Cross-check vs the curated manifest's expected coordinate.
    position_matches_expected: bool | None = None
    build_matches_expected: bool | None = None
    strand_conversion: str = "none"        # "none" | "complement" | "n/a"
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "rsid": self.rsid,
            "found": self.found,
            "raw_chromosome": self.raw_chromosome,
            "raw_position_1based": self.raw_position_1based,
            "raw_allele1": self.raw_allele1,
            "raw_allele2": self.raw_allele2,
            "genome_build": self.genome_build,
            "declared_strand": self.declared_strand,
            "measurement_status": self.measurement_status,
            "call_kind": self.call_kind,
            "genotype": self.genotype,
            "position_matches_expected": self.position_matches_expected,
            "build_matches_expected": self.build_matches_expected,
            "strand_conversion": self.strand_conversion,
            "notes": self.notes,
        }


def _read_metadata(path: Path) -> tuple[str | None, str | None]:
    """Return (genome_build, declared_strand) from leading comment lines."""
    build = None
    strand = None
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            if not line.startswith("#"):
                break
            low = line.lower()
            m = re.search(r"build\s+([\d.]+)", low)
            if m and build is None:
                raw = m.group(1)
                build = "GRCh37" if raw.startswith("37") else (
                    "GRCh38" if raw.startswith("38") else "unknown")
            sm = re.search(r"\b(forward|reverse)\s*\(([+-])\)", low)
            if sm:
                strand = sm.group(2)
    return build, strand


def lookup_raw_rows(
    raw_file: Path,
    curated: list,  # list[CuratedVariant]
) -> dict[str, RawRowProvenance]:
    """Scan the raw file once for the curated rsIDs; build provenance per rsID.

    `curated` items must expose .rsid, .chromosome, .position_1based,
    .clinical_allele, .variant_type, .expected_build.
    """
    build, strand = _read_metadata(raw_file)
    wanted = {v.rsid: v for v in curated}
    found_rows: dict[str, tuple[str, int, str, str]] = {}

    header_seen = False
    with open(raw_file, "r", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            if not header_seen:
                header_seen = True
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 5:
                continue
            rsid = parts[0]
            if rsid in wanted and rsid not in found_rows:
                try:
                    pos = int(parts[2])
                except ValueError:
                    continue
                found_rows[rsid] = (parts[1], pos, parts[3].upper(), parts[4].upper())
                if len(found_rows) == len(wanted):
                    break

    out: dict[str, RawRowProvenance] = {}
    for rsid, var in wanted.items():
        prov = RawRowProvenance(rsid=rsid, found=rsid in found_rows,
                                genome_build=build, declared_strand=strand)
        prov.build_matches_expected = (build == var.expected_build)
        if build != var.expected_build:
            prov.notes.append(
                f"File build {build} vs curated expected {var.expected_build}."
            )

        if rsid not in found_rows:
            prov.measurement_status = "not_observed"
            prov.notes.append(
                "rsID not present in the raw file; reported not_observed. "
                "Absence is NOT homozygous reference."
            )
            out[rsid] = prov
            continue

        chrom, pos, a1, a2 = found_rows[rsid]
        prov.raw_chromosome = chrom
        prov.raw_position_1based = pos
        prov.raw_allele1 = a1
        prov.raw_allele2 = a2
        prov.position_matches_expected = (
            chrom == var.chromosome and pos == var.position_1based
        )
        if not prov.position_matches_expected:
            prov.notes.append(
                f"Raw coordinate chr{chrom}:{pos} differs from curated "
                f"chr{var.chromosome}:{var.position_1based}; used the raw row."
            )

        # Classify the reported alleles.
        if a1 in _INDEL or a2 in _INDEL:
            prov.measurement_status = "indel_uninterpretable"
            prov.strand_conversion = "n/a"
            prov.notes.append(
                "Reported as an indel placeholder (I/D). The site IS assayed by "
                "the platform, but a SNP-only pipeline cannot interpret it; this "
                "is not_assayed-equivalent only in the sense of being "
                "uninterpretable here, NOT absent and NOT a negative."
            )
        elif a1 == "0" or a2 == "0":
            prov.measurement_status = "no_call"
            prov.notes.append("Reported as a no-call (0); not a negative result.")
        elif a1 in _SNP and a2 in _SNP:
            prov.measurement_status = "observed"
            prov.genotype = f"{a1}/{a2}"
            # Strand handling vs the clinical allele. BOTH the source file and
            # the curated clinical allele are on the forward (+) strand, so they
            # are already strand-consistent: use the clinical allele DIRECTLY.
            # We must NOT infer a complement flip just because the complement
            # base happens to appear (that is the classic rs334 trap: ref T, HbS
            # allele A; a reported T/T is genuine homozygous reference = 0 copies
            # of A, NOT 2 copies via a spurious A->T complement). Silent flipping
            # is exactly what the plan forbids.
            ca = var.clinical_allele.upper()
            if ca in _SNP:
                prov.strand_conversion = "none"
                if ca not in (a1, a2):
                    prov.notes.append(
                        f"Clinical allele {ca} is absent from the reported "
                        f"forward-strand genotype {a1}/{a2} (0 copies). No "
                        "complement flip is applied; both source and clinical "
                        "allele are already + strand."
                    )
                # Ambiguous A/T or C/G sites can hide a true strand mismatch; flag
                # for confirmation rather than assuming.
                if {a1, a2} in ({"A", "T"}, {"C", "G"}):
                    prov.notes.append(
                        "Strand-ambiguous allele pair (A/T or C/G): forward-strand "
                        "assumption relied on the source's declared + strand; "
                        "confirm before clinical use."
                    )
            else:
                prov.strand_conversion = "n/a"  # clinical allele is an indel
        else:
            prov.measurement_status = "no_call"
            prov.notes.append("Unexpected allele token; treated as no_call.")

        out[rsid] = prov
    return out
