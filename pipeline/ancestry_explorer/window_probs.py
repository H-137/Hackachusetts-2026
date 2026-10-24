"""Window-level marginal-probability summary for RFMix segments (audit tool).

Joins the fine-grained forward-backward marginals (<out>.fb.tsv, one row per CRF
window per copy) to the condensed Viterbi segments (<out>.msp.tsv). For each
reported segment and copy it summarizes the underlying windows: the assigned
population, the strongest alternative population, and their probability gap,
preserving the variation RFMix collapsed when it merged windows into segments.

Column layout verified against the raw RFMix headers:
  fb.tsv line 1: "#reference_panel_population:" then the 26 pop codes in order.
  fb.tsv line 2: 4 leading cols (chromosome, physical_position,
    genetic_position, genetic_marker_index) then 26 cols for hap1 then 26 for
    hap2 (total 56). hap1 -> copy 1, hap2 -> copy 2.
  msp.tsv segment copy columns demo_sample.0 / .1 map to copy 1 / copy 2.

Marginals are preserved and reported as-is. They are model marginal
probabilities, NOT calibrated confidence.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


def parse_fb(fb_path: Path) -> tuple[list[str], list[dict]]:
    """Return (pop_order, windows).

    pop_order: 26 population codes in column order.
    windows: list of dicts with position and per-copy probability vectors:
      {position, copy1: {pop: p}, copy2: {pop: p}}
    """
    lines = fb_path.read_text().splitlines()
    pop_line = lines[0]
    pops = [t for t in pop_line.replace("#reference_panel_population:", "").split()]
    n = len(pops)

    windows: list[dict] = []
    for line in lines[2:]:
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 4 + 2 * n:
            continue
        pos = int(parts[1])
        hap1 = [float(x) for x in parts[4:4 + n]]
        hap2 = [float(x) for x in parts[4 + n:4 + 2 * n]]
        windows.append({
            "position": pos,
            "copy1": dict(zip(pops, hap1)),
            "copy2": dict(zip(pops, hap2)),
        })
    return pops, windows


@dataclass
class WindowProb:
    position: int
    assigned: str
    assigned_p: float
    alt: str
    alt_p: float

    @property
    def gap(self) -> float:
        return self.assigned_p - self.alt_p


def _window_top2(probs: dict[str, float]) -> WindowProb:
    ordered = sorted(probs.items(), key=lambda kv: -kv[1])
    (a_pop, a_p) = ordered[0]
    (b_pop, b_p) = ordered[1] if len(ordered) > 1 else ("-", 0.0)
    return WindowProb(0, a_pop, a_p, b_pop, b_p)


def parse_msp_segments(msp_path: Path) -> list[dict]:
    """Return merged segments: {spos, epos, copy1_label, copy2_label}."""
    lines = msp_path.read_text().splitlines()
    # index->code from line 1
    idx2code: dict[int, str] = {}
    for tok in lines[0].replace("#", " ").split():
        if "=" in tok:
            code, _, i = tok.partition("=")
            if i.isdigit():
                idx2code[int(i)] = code
    segs: list[dict] = []
    for line in lines[2:]:
        if line.startswith("#") or not line.strip():
            continue
        p = line.split("\t")
        if len(p) <= 7:
            continue
        segs.append({
            "spos": int(p[1]), "epos": int(p[2]), "n_snps": int(p[5]),
            "copy1_label": idx2code.get(int(p[6]), "?"),
            "copy2_label": idx2code.get(int(p[7]), "?"),
        })
    return segs


def summarize_segment_windows(fb_path: Path, msp_path: Path) -> list[dict]:
    """For each msp segment & copy, summarize the fb windows inside it."""
    _pops, windows = parse_fb(fb_path)
    segments = parse_msp_segments(msp_path)

    out: list[dict] = []
    for seg in segments:
        inside = [w for w in windows if seg["spos"] <= w["position"] <= seg["epos"]]
        row: dict = {
            "spos": seg["spos"], "epos": seg["epos"], "n_snps": seg["n_snps"],
            "n_windows": len(inside),
        }
        for copy_key, label_key, cidx in (("copy1", "copy1_label", 1),
                                          ("copy2", "copy2_label", 2)):
            wps = [_window_top2(w[copy_key]) for w in inside]
            if wps:
                gaps = [wp.gap for wp in wps]
                assigned_ps = [wp.assigned_p for wp in wps]
                # distinct assigned pops within the segment (variation preserved)
                distinct = sorted({wp.assigned for wp in wps})
                row[f"copy{cidx}"] = {
                    "segment_label": seg[label_key],
                    "windows": len(wps),
                    "assigned_pop_mean_p": round(sum(assigned_ps) / len(assigned_ps), 3),
                    "gap_min": round(min(gaps), 3),
                    "gap_mean": round(sum(gaps) / len(gaps), 3),
                    "gap_max": round(max(gaps), 3),
                    "distinct_window_assignments": distinct,
                }
            else:
                row[f"copy{cidx}"] = {"segment_label": seg[label_key], "windows": 0}
        out.append(row)
    return out


def pel_detail(fb_path: Path, msp_path: Path) -> dict:
    """Detailed probability profile for the PEL segment and its neighbours."""
    _pops, windows = parse_fb(fb_path)
    segments = parse_msp_segments(msp_path)

    # Find the PEL segment (either copy).
    pel_i = None
    pel_copy = None
    for i, s in enumerate(segments):
        if s["copy1_label"] == "PEL":
            pel_i, pel_copy = i, "copy1"
            break
        if s["copy2_label"] == "PEL":
            pel_i, pel_copy = i, "copy2"
            break
    if pel_i is None:
        return {"found": False}

    seg = segments[pel_i]
    inside = [w for w in windows if seg["spos"] <= w["position"] <= seg["epos"]]
    profiles = []
    for w in inside:
        wp = _window_top2(w[pel_copy])
        profiles.append({
            "position": w["position"],
            "assigned": wp.assigned, "assigned_p": round(wp.assigned_p, 3),
            "alt": wp.alt, "alt_p": round(wp.alt_p, 3),
            "gap": round(wp.gap, 3),
            "PEL_p": round(w[pel_copy].get("PEL", 0.0), 3),
        })

    neighbours = {}
    if pel_i > 0:
        neighbours["prev"] = {
            "range": [segments[pel_i - 1]["spos"], segments[pel_i - 1]["epos"]],
            "label": segments[pel_i - 1][f"{pel_copy}_label"],
        }
    if pel_i < len(segments) - 1:
        neighbours["next"] = {
            "range": [segments[pel_i + 1]["spos"], segments[pel_i + 1]["epos"]],
            "label": segments[pel_i + 1][f"{pel_copy}_label"],
        }

    return {
        "found": True,
        "copy": pel_copy,
        "range": [seg["spos"], seg["epos"]],
        "n_snps_segment": seg["n_snps"],
        "n_windows": len(inside),
        "window_profiles": profiles,
        "neighbours": neighbours,
    }
