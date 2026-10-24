"""Compare two local-ancestry runs (e.g. baseline vs restored-marker).

Reports, per the audit requirement:
  * usable marker counts and markers-per-window for each run,
  * analyzed coverage (span) and window counts,
  * span-based subpopulation proportions for each run,
  * how often per-base-pair assignments CHANGE between runs (agreement rate),
  * runtime (passed in by the caller; not measured here).

Important caveat baked into the output: higher agreement or higher marginal
probabilities between runs do NOT demonstrate accuracy. Two runs can agree and
both be wrong; this comparison measures stability, not correctness.
"""

from __future__ import annotations

from dataclasses import dataclass

from .composition import compose_by_span


def _msp_window_stats(msp_path: str) -> tuple[int, float]:
    """Return (n_windows, mean_snps_per_window) from an .msp.tsv."""
    windows = 0
    total_snps = 0
    with open(msp_path, "r", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or not line.strip():
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) <= 6 or parts[0] in ("chm", "chr"):
                continue
            windows += 1
            try:
                total_snps += int(parts[5])
            except ValueError:
                pass
    mean = (total_snps / windows) if windows else 0.0
    return windows, mean


def _assignment_by_bp(segments: list[dict], copy: int) -> list[tuple[int, int, str]]:
    """Sorted (start, end, label) intervals for one copy."""
    out = [
        (int(s["start_0based"]), int(s["end_0based_exclusive"]), s["ancestry_label"])
        for s in segments
        if int(s.get("copy_index", 1)) == copy
    ]
    out.sort()
    return out


def _bp_agreement(seg_a: list[dict], seg_b: list[dict]) -> tuple[int, int]:
    """Per-bp agreement across both copies: (agreeing_bp, compared_bp).

    For each copy, walk the overlap of the two runs' intervals and count bp
    where the assigned label matches. Only positions covered by BOTH runs on the
    same copy are compared.
    """
    agree = 0
    compared = 0
    for copy in (1, 2):
        a = _assignment_by_bp(seg_a, copy)
        b = _assignment_by_bp(seg_b, copy)
        # Sweep: for each A interval, find overlapping B intervals.
        for (as_, ae, al) in a:
            for (bs, be, bl) in b:
                lo = max(as_, bs)
                hi = min(ae, be)
                if hi <= lo:
                    continue
                span = hi - lo
                compared += span
                if al == bl:
                    agree += span
    return agree, compared


@dataclass
class RunDescriptor:
    name: str
    segments: list[dict]
    msp_path: str
    usable_markers: int
    runtime_seconds: float | None = None


def compare(run_a: RunDescriptor, run_b: RunDescriptor,
            chrom: str, chrom_len: int,
            superpop_map_a: dict[str, str] | None = None,
            superpop_map_b: dict[str, str] | None = None) -> dict:
    wa, ma = _msp_window_stats(run_a.msp_path)
    wb, mb = _msp_window_stats(run_b.msp_path)
    comp_a = compose_by_span(run_a.segments, chrom, chrom_len,
                             superpop_map=superpop_map_a).as_dict()
    comp_b = compose_by_span(run_b.segments, chrom, chrom_len,
                             superpop_map=superpop_map_b).as_dict()
    agree_bp, compared_bp = _bp_agreement(run_a.segments, run_b.segments)

    def _sp(comp):
        return {k: round(v["fraction_of_assigned"] * 100, 1)
                for k, v in comp["by_superpop"].items()}

    return {
        "chromosome": chrom,
        "runs": {
            run_a.name: {
                "usable_markers": run_a.usable_markers,
                "windows": wa,
                "mean_snps_per_window": round(ma, 1),
                "analyzed_span_bp": comp_a["assigned_bp"] + comp_a["uncertain_bp"]
                + comp_a["unknown_bp"],
                "runtime_seconds": run_a.runtime_seconds,
                "superpop_pct": _sp(comp_a),
            },
            run_b.name: {
                "usable_markers": run_b.usable_markers,
                "windows": wb,
                "mean_snps_per_window": round(mb, 1),
                "analyzed_span_bp": comp_b["assigned_bp"] + comp_b["uncertain_bp"]
                + comp_b["unknown_bp"],
                "runtime_seconds": run_b.runtime_seconds,
                "superpop_pct": _sp(comp_b),
            },
        },
        "assignment_stability": {
            "compared_bp": compared_bp,
            "agreeing_bp": agree_bp,
            "agreement_fraction": (agree_bp / compared_bp) if compared_bp else None,
            "changed_fraction": (1 - agree_bp / compared_bp) if compared_bp else None,
        },
        "caveats": [
            "Stability is not accuracy: two runs can agree and both be wrong.",
            "Higher marginal probabilities do not demonstrate correctness.",
            "Per-chromosome composition, not whole-genome ancestry.",
            "Sub-continental labels are experimental inferred similarity to "
            "reference populations.",
        ],
    }
