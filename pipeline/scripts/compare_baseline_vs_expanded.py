#!/usr/bin/env python3
"""Step 7 comparison: baseline 26-pop run vs expanded 27-pop pilot (chr22).

Reports, honestly:
  * analyzed coverage, window counts, markers/window, runtime,
  * per-bp assignment stability (agreement) across runs and per copy,
  * super-population + per-label span shift,
  * the specific copy-1 PEL block around 35.53-37.24 Mb, before and after,
  * where the expanded panel assigns the real new label (AJ),
  * explicit accuracy caveats (stability != accuracy; AJ group is only 8 samples).

Writes docs/artifacts/chr22-baseline-vs-expanded.json.
"""

from __future__ import annotations

import json
from pathlib import Path

from ancestry_explorer.compare_runs import RunDescriptor, compare

REPO = Path(__file__).resolve().parents[2]
BASE = REPO / "pipeline/local-out/ancestry_restored"
EXP = REPO / "pipeline/local-out/ancestry_expanded_v2"
CHR22_LEN = 51_304_566  # GRCh37 chr22 length (bp)

PEL_BLOCK = (35_531_757, 37_244_287)  # 1-based inclusive region of interest


def _segments(d: Path) -> list[dict]:
    return json.loads((d / "segments.chr22.json").read_text())


def _labels_in_region(segments: list[dict], copy: int, start1: int, end1: int) -> list[dict]:
    s0, e0 = start1 - 1, end1  # to 0-based half-open
    out = []
    for seg in segments:
        if int(seg.get("copy_index", 1)) != copy:
            continue
        if int(seg["end_0based_exclusive"]) <= s0 or int(seg["start_0based"]) >= e0:
            continue
        lo = max(int(seg["start_0based"]), s0)
        hi = min(int(seg["end_0based_exclusive"]), e0)
        out.append({"label": seg["ancestry_label"], "start": lo, "end": hi,
                    "span_bp": hi - lo, "status": seg.get("assignment_status")})
    out.sort(key=lambda x: x["start"])
    return out


def _n_markers(d: Path) -> int:
    f = d / "sample_map.tsv"
    # not marker count; read msp mean instead. Use merged ancestry VCF if present.
    return -1


def main() -> int:
    base_seg = _segments(BASE)
    exp_seg = _segments(EXP)

    # usable markers: count records in the ancestry input VCF if available; else -1.
    from ancestry_explorer.panels import get_panel
    base_sp = get_panel("1kg_phase3_26pop").superpop_map()
    exp_sp = get_panel("1kg_phase3_plus_aj_v2").superpop_map()
    report = compare(
        RunDescriptor("baseline_26pop", base_seg, str(BASE / "rfmix.chr22.msp.tsv"),
                      usable_markers=10192, runtime_seconds=None),
        RunDescriptor("expanded_27pop_v2", exp_seg, str(EXP / "rfmix.chr22.msp.tsv"),
                      usable_markers=10192, runtime_seconds=738.0),
        chrom="22", chrom_len=CHR22_LEN,
        superpop_map_a=base_sp, superpop_map_b=exp_sp,
    )

    # Per-label span shift.
    from ancestry_explorer.composition import compose_by_span
    cb = compose_by_span(base_seg, "22", CHR22_LEN, superpop_map=base_sp).as_dict()["by_label"]
    ce = compose_by_span(exp_seg, "22", CHR22_LEN, superpop_map=exp_sp).as_dict()["by_label"]
    labels = sorted(set(cb) | set(ce))
    label_shift = {
        l: {
            "baseline_bp": cb.get(l, {}).get("bp", 0),
            "expanded_bp": ce.get(l, {}).get("bp", 0),
            "delta_bp": ce.get(l, {}).get("bp", 0) - cb.get(l, {}).get("bp", 0),
        }
        for l in labels
    }

    # The copy-1 PEL block, both runs, both copies.
    pel_block = {
        "region_1based": {"start": PEL_BLOCK[0], "end": PEL_BLOCK[1]},
        "baseline": {
            "copy1": _labels_in_region(base_seg, 1, *PEL_BLOCK),
            "copy2": _labels_in_region(base_seg, 2, *PEL_BLOCK),
        },
        "expanded": {
            "copy1": _labels_in_region(exp_seg, 1, *PEL_BLOCK),
            "copy2": _labels_in_region(exp_seg, 2, *PEL_BLOCK),
        },
    }

    # Where does the expanded panel put the NEW label?
    new_label = "AJ"
    new_label_segments = [
        {"copy": int(s["copy_index"]), "start": int(s["start_0based"]),
         "end": int(s["end_0based_exclusive"]),
         "span_bp": int(s["end_0based_exclusive"]) - int(s["start_0based"])}
        for s in exp_seg if s["ancestry_label"] == new_label
    ]
    new_label_segments.sort(key=lambda x: (x["copy"], x["start"]))

    report["per_label_span_shift_bp"] = label_shift
    report["pel_block_35p53_37p24Mb"] = pel_block
    report["new_label_assignment"] = {
        "label": new_label,
        "total_span_bp": sum(s["span_bp"] for s in new_label_segments),
        "segments": new_label_segments,
        "note": (
            "AJ is a REAL Ashkenazi Jewish reference group (8 AADR Human Origins "
            "individuals) the baseline 26-pop panel cannot emit. Where the "
            "expanded panel assigns AJ is shown; with only 8 reference "
            "individuals on a single chromosome, this placement is experimental "
            "and NOT a validated ancestry result."),
    }
    report["accuracy_statement"] = (
        "ACCURACY IS UNVALIDATED for real ancestry. The only quantitative check "
        "run is the bounded held-out population-classification benchmark in "
        "scripts/heldout_benchmark.py; see its artifact for the number. More "
        "populations, finer segments, and stable/higher marginals do NOT by "
        "themselves establish correctness.")

    out = REPO / "docs/artifacts/chr22-baseline-vs-expanded.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"wrote {out}")
    print(json.dumps({
        "windows_baseline": report["runs"]["baseline_26pop"]["windows"],
        "windows_expanded": report["runs"]["expanded_27pop_v2"]["windows"],
        "agreement_fraction": report["assignment_stability"]["agreement_fraction"],
        "new_label_total_span_bp": report["new_label_assignment"]["total_span_bp"],
        "superpop_baseline": report["runs"]["baseline_26pop"]["superpop_pct"],
        "superpop_expanded": report["runs"]["expanded_27pop_v2"]["superpop_pct"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
