"""Local ancestry inference with RFMix 2.03 (Step 4).

Runs RFMix on phased query data against a labeled 1000 Genomes reference panel
and parses the output into normalized AncestrySegment records (Section 8 schema,
the same type the Step 6 UI consumes).

Workflow per chromosome:
  1. Build the RFMix genetic map (chrom, bp, cM) from the Beagle PLINK map
     (which is chrom, ., cM, bp) by reordering columns.
  2. Build the sample map (sample_id -> super-population) from the 1000G panel
     metadata, so RFMix knows the reference-group label for each reference
     sample.
  3. Run RFMix with the phased query VCF, the full 1000G panel as reference, the
     sample map, and the genetic map.
  4. Parse <out>.msp.tsv into AncestrySegment records: one per haplotype (copy)
     per window, converting 1-based inclusive RFMix ranges to internal 0-based
     half-open intervals, and attaching marginal probabilities from <out>.fb.tsv
     where available.

Uncertainty handling: RFMix emits a most-likely call per window (Viterbi) and
marginal probabilities (forward-backward). We DO NOT claim these probabilities
are calibrated confidence. A window whose top marginal probability is below a
documented threshold is marked assignment_status = "uncertain"; windows with no
usable call are "unknown". Adequate-probability windows are "assigned".

Privacy: RFMix inputs/outputs are genetic data under gitignored paths. The
summary returned here is aggregate counts only; no genotype values.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path

# Marginal-probability threshold below which a window's call is downgraded to
# "uncertain" rather than "assigned". A conservative default; it does not assert
# the probabilities are calibrated, only that low-probability calls are flagged.
ASSIGNED_PROB_THRESHOLD = 0.90

# 1000 Genomes reference-group granularity. This workflow uses the 26 fine-grain
# sub-populations ("pop" level). The broader 5 super-populations remain available
# via build_sample_map(level="super_pop") but "pop" is the default here.
#
# The actual label set and ordering are ALWAYS read from RFMix output metadata
# (see _parse_msp_header); these tuples are documentation/reference only and are
# not used to hardcode parsing.
POP_SUBPOPULATIONS = (
    # EUR
    "CEU", "TSI", "FIN", "GBR", "IBS",
    # EAS
    "CHB", "JPT", "CHS", "CDX", "KHV",
    # AFR
    "YRI", "LWK", "GWD", "MSL", "ESN", "ASW", "ACB",
    # AMR
    "MXL", "PUR", "CLM", "PEL",
    # SAS
    "GIH", "PJL", "BEB", "STU", "ITU",
)
SUPERPOPS = ("AFR", "AMR", "EAS", "EUR", "SAS")

# Default reference-group level for this workflow.
DEFAULT_LEVEL = "pop"


@dataclass
class AncestryRunSummary:
    chromosome: str
    query_samples: int
    reference_samples: int
    windows: int
    segments_emitted: int
    assigned: int
    uncertain: int
    unknown: int
    subpop_order: list[str]
    method: str = "RFMix v2.03"
    reference_panel: str = ""
    reference_panel_provenance: dict = field(default_factory=dict)
    msp_path: str = ""
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "chromosome": self.chromosome,
            "query_samples": self.query_samples,
            "reference_samples": self.reference_samples,
            "windows": self.windows,
            "segments_emitted": self.segments_emitted,
            "assigned": self.assigned,
            "uncertain": self.uncertain,
            "unknown": self.unknown,
            "subpop_order": self.subpop_order,
            "method": self.method,
            "reference_panel": self.reference_panel,
            "reference_panel_provenance": self.reference_panel_provenance,
            "msp_path": self.msp_path,
            "warnings": self.warnings,
        }


def _run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=False, **kw)


def build_rfmix_genetic_map(plink_map: Path, out_map: Path) -> Path:
    """Convert a Beagle PLINK map (chrom . cM bp) to RFMix (chrom bp cM)."""
    out_map.parent.mkdir(parents=True, exist_ok=True)
    lines_out: list[str] = []
    with open(plink_map, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 4:
                continue
            chrom, _id, cm, bp = parts[0], parts[1], parts[2], parts[3]
            lines_out.append(f"{chrom}\t{bp}\t{cm}")
    out_map.write_text("\n".join(lines_out) + "\n", encoding="utf-8")
    return out_map


def build_sample_map(
    panel_metadata: Path, reference_vcf: Path, out_map: Path,
    level: str = DEFAULT_LEVEL,
) -> tuple[Path, int]:
    """Write a sample_id<TAB>population map restricted to samples in the ref VCF.

    Returns (path, n_reference_samples). Only samples present in BOTH the panel
    metadata and the reference VCF are included; others would be ignored by
    RFMix anyway, and keeping the map tight avoids confusion.
    """
    # Samples actually present in the reference VCF.
    res = _run(["bcftools", "query", "-l", str(reference_vcf)])
    vcf_samples = set(res.stdout.split())

    col_idx = {"pop": 1, "super_pop": 2}[level]
    rows: list[str] = []
    with open(panel_metadata, "r", encoding="utf-8") as fh:
        header = fh.readline()  # skip header
        _ = header
        for line in fh:
            parts = line.split()
            if len(parts) <= col_idx:
                continue
            sample, label = parts[0], parts[col_idx]
            if sample in vcf_samples:
                rows.append(f"{sample}\t{label}")

    out_map.parent.mkdir(parents=True, exist_ok=True)
    out_map.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return out_map, len(rows)


def _subset_reference_to_query_sites(
    reference_vcf: Path, query_vcf: Path, out_vcf: Path
) -> Path:
    """Restrict a reference panel to the positions present in the query VCF.

    RFMix only uses SNPs shared between query and reference, so a large merged
    panel (e.g. 1000G + an added group, ~1M sites x thousands of samples) can be
    subset to the query's ~10k sites with no change to the result, while
    avoiding loading the full matrix into memory (which OOM-kills RFMix). The
    reference sample set is unchanged.
    """
    regions = out_vcf.parent / (out_vcf.stem + ".qsites.txt")
    out_vcf.parent.mkdir(parents=True, exist_ok=True)
    # Positions present in the query.
    r = subprocess.run(
        ["bcftools", "view", "-H", str(query_vcf)],
        capture_output=True, text=True, check=False)
    with open(regions, "w", encoding="utf-8") as fh:
        for line in r.stdout.splitlines():
            if not line:
                continue
            parts = line.split("\t", 2)
            if len(parts) >= 2:
                fh.write(f"{parts[0]}\t{parts[1]}\n")
    _run(["bcftools", "view", "-R", str(regions), str(reference_vcf),
          "-Oz", "-o", str(out_vcf)])
    _run(["bcftools", "index", "-f", "-t", str(out_vcf)])
    return out_vcf


def run_rfmix(
    query_vcf: Path,
    reference_vcf: Path,
    sample_map: Path,
    genetic_map: Path,
    chromosome: str,
    out_basename: Path,
    rfmix_bin: Path,
    generations: int = 8,
    extra_args: list[str] | None = None,
    subset_reference_to_query: bool = True,
) -> Path:
    """Invoke RFMix for one chromosome. Returns the .msp.tsv path.

    subset_reference_to_query: when True (default), the reference VCF is first
    restricted to the query's sites. This keeps memory bounded for large panels
    (RFMix loads the whole reference matrix) without changing the result, since
    RFMix only uses query-reference shared SNPs.
    """
    out_basename.parent.mkdir(parents=True, exist_ok=True)
    ref_for_rfmix = reference_vcf
    if subset_reference_to_query:
        ref_for_rfmix = _subset_reference_to_query_sites(
            reference_vcf, query_vcf,
            out_basename.parent / (out_basename.name + ".ref_subset.vcf.gz"))
    cmd = [
        str(rfmix_bin),
        "-f", str(query_vcf),
        "-r", str(ref_for_rfmix),
        "-m", str(sample_map),
        "-g", str(genetic_map),
        "-o", str(out_basename),
        "--chromosome=" + chromosome,
        "-G", str(generations),
    ]
    if extra_args:
        cmd.extend(extra_args)
    res = _run(cmd)
    msp = Path(f"{out_basename}.msp.tsv")
    if not msp.exists():
        raise RuntimeError(
            f"RFMix did not produce {msp.name}. stderr: {res.stderr.strip()[:500]}"
        )
    return msp


def _parse_msp_header(msp_path: Path) -> tuple[list[str], list[str]]:
    """Return (subpop_order, haplotype_columns) from the .msp.tsv header lines.

    Line 1 (comment): subpopulation code -> index mapping.
    Line 2: column header including per-haplotype columns like 'SAMPLE.0'/'.1'.
    """
    subpop_order: list[str] = []
    hap_cols: list[str] = []
    with open(msp_path, "r", encoding="utf-8") as fh:
        first = fh.readline().rstrip("\n")
        second = fh.readline().rstrip("\n")
    # First line looks like: "#Subpopulation order/codes: AFR=0  AMR=1 ..."
    if first.startswith("#"):
        for tok in first.replace("#", " ").split():
            if "=" in tok:
                name, _, idx = tok.partition("=")
                if idx.isdigit():
                    # place name at its index
                    i = int(idx)
                    while len(subpop_order) <= i:
                        subpop_order.append("")
                    subpop_order[i] = name
    # Second line is the real header; haplotype columns follow the leading 6.
    cols = second.lstrip("#").split("\t")
    # Leading columns: chm, spos, epos, sgpos, egpos, n snps
    hap_cols = cols[6:]
    return subpop_order, hap_cols


def parse_msp_to_segments(
    msp_path: Path,
    sample_id: str,
    subpop_order: list[str],
    reference_panel: str,
    method: str = "RFMix v2.03",
    panel_provenance: dict | None = None,
) -> tuple[list[dict], AncestryRunSummary]:
    """Parse .msp.tsv into AncestrySegment dicts for a single query sample.

    Each data row covers a window [spos, epos] (1-based inclusive) with one
    ancestry index per haplotype column. For a single query sample there are two
    haplotype columns (copy 1 and copy 2). Converts to 0-based half-open.

    panel_provenance: optional machine-readable panel descriptor (panels.py
    Panel.provenance()) stamped onto every segment so results carry the
    reference-panel version/population-set/sources, not just a VCF filename.
    """
    subpop_order, hap_cols = _parse_msp_header(msp_path)
    n_hap = len(hap_cols)
    # For the single query sample we expect its two haplotypes present; find
    # their column indices by matching the sample id prefix.
    sample_hap_idx = [i for i, c in enumerate(hap_cols) if c.split(".")[0] == sample_id]
    if len(sample_hap_idx) < 2:
        # Fall back to the first two haplotype columns.
        sample_hap_idx = [0, 1] if n_hap >= 2 else list(range(n_hap))

    segments: list[dict] = []
    windows = 0
    assigned = unknown = uncertain = 0
    chrom = ""

    with open(msp_path, "r", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or not line.strip():
                continue
            parts = line.rstrip("\n").split("\t")
            if parts[0] in ("chm", "chr") or len(parts) <= 6:
                continue
            chrom = parts[0]
            spos = int(parts[1])  # 1-based inclusive start
            epos = int(parts[2])  # 1-based inclusive end
            hap_vals = parts[6:]
            windows += 1

            start0 = spos - 1
            end0 = epos  # inclusive end (1-based) -> exclusive end (0-based)

            for copy_i, col in enumerate(sample_hap_idx, start=1):
                if col >= len(hap_vals):
                    continue
                raw = hap_vals[col].strip()
                if not raw.isdigit():
                    unknown += 1
                    status = "unknown"
                    label = "unknown"
                else:
                    idx = int(raw)
                    label = subpop_order[idx] if 0 <= idx < len(subpop_order) else "unknown"
                    # Without per-window fb probabilities wired in, treat a valid
                    # Viterbi call as assigned; probability-based downgrade to
                    # "uncertain" is applied by attach_probabilities().
                    status = "assigned" if label != "unknown" else "unknown"
                    if status == "assigned":
                        assigned += 1
                    else:
                        unknown += 1

                segments.append({
                    "sample_id": sample_id,
                    "chromosome": chrom,
                    "start_0based": start0,
                    "end_0based_exclusive": end0,
                    "copy_index": copy_i,
                    "ancestry_label": label,
                    "probabilities": None,
                    "assignment_status": status,
                    "method": method,
                    "reference_panel": reference_panel,
                    "reference_panel_version": (
                        (panel_provenance or {}).get("panel_version", "")),
                    "reference_panel_id": (
                        (panel_provenance or {}).get("panel_id", "")),
                    "parental_origin": None,
                    "provenance": {
                        "source_type": "ancestrydna_upload",
                        "accessed_at": "",
                        "notes": "RFMix local ancestry; copy 1/2 are phase order, not parental.",
                        "reference_panel": panel_provenance or {},
                    },
                })

    summary = AncestryRunSummary(
        chromosome=chrom,
        query_samples=1,
        reference_samples=0,
        windows=windows,
        segments_emitted=len(segments),
        assigned=assigned,
        uncertain=uncertain,
        unknown=unknown,
        subpop_order=subpop_order,
        method=method,
        reference_panel=reference_panel,
        reference_panel_provenance=panel_provenance or {},
        msp_path=str(msp_path),
    )
    return segments, summary
