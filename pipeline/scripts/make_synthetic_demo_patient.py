#!/usr/bin/env python3
"""Build a SYNTHETIC demo-patient bundle from the real chr22 expanded run.

This is a DEMO TESTBENCH artifact, NOT a real analysis result. It takes the real
expanded-panel bundle and applies a fixed, explicit set of ancestry-label edits
for demonstration, then stamps the bundle unmistakably as synthetic so the UI
and any viewer can tell it is not pipeline output.

Edits (exactly as specified for the demo):
  * PJL (Punjabi) segments            -> AJ (Ashkenazi Jewish)
  * PUR (Puerto Rican) segments       -> AJ
  * HALF of the IBS (Iberian) segments-> AJ (the "part of the Iberian")
  * TSI (Italian) segments            -> GBR / FIN  (French has no panel/UI code,
                                         so per instruction we bump English (GBR)
                                         and Finnish (FIN) instead, split evenly)

Every edited segment is marked with provenance.notes = "synthetic demo edit ..."
and assignment_method stays RFMix-derived label is replaced; the sample block is
flagged synthetic:true with a precomputed source_type and a clear demo notice.

Output (gitignored, under local-out): local-out/synthetic_demo_patient.json
"""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "pipeline/local-out/real_bundle.expanded.json"
OUT = REPO / "pipeline/local-out/synthetic_demo_patient.json"

DEMO_NOTE = ("SYNTHETIC DEMO EDIT: ancestry label manually reassigned for the "
             "demo testbench. NOT RFMix output and NOT a real ancestry call.")


def main() -> int:
    bundle = json.loads(SRC.read_text())
    segments = bundle["segments"]

    # Deterministic selection of "half of the IBS" segments: sort IBS segments by
    # (copy_index, start) and take the first half.
    ibs = sorted(
        [i for i, s in enumerate(segments) if s["ancestry_label"] == "IBS"],
        key=lambda i: (segments[i]["copy_index"], segments[i]["start_0based"]),
    )
    ibs_to_aj = set(ibs[: len(ibs) // 2])  # first half -> AJ; rest stay IBS

    # TSI segments split evenly: alternate GBR / FIN by sorted order.
    tsi = sorted(
        [i for i, s in enumerate(segments) if s["ancestry_label"] == "TSI"],
        key=lambda i: (segments[i]["copy_index"], segments[i]["start_0based"]),
    )
    tsi_target = {idx: ("GBR" if k % 2 == 0 else "FIN") for k, idx in enumerate(tsi)}

    counts = {"PJL->AJ": 0, "PUR->AJ": 0, "IBS->AJ": 0, "TSI->GBR": 0, "TSI->FIN": 0}

    for i, s in enumerate(segments):
        lab = s["ancestry_label"]
        new = None
        if lab == "PJL":
            new = "AJ"; counts["PJL->AJ"] += 1
        elif lab == "PUR":
            new = "AJ"; counts["PUR->AJ"] += 1
        elif lab == "IBS" and i in ibs_to_aj:
            new = "AJ"; counts["IBS->AJ"] += 1
        elif lab == "TSI":
            new = tsi_target[i]; counts[f"TSI->{new}"] += 1
        if new is None:
            continue
        s["original_ancestry_label"] = lab
        s["ancestry_label"] = new
        prov = dict(s.get("provenance") or {})
        prov["notes"] = f"{DEMO_NOTE} ({lab} -> {new})"
        s["provenance"] = prov

    # Flag the whole bundle synthetic and record the edit in sample provenance.
    sample = bundle["sample"]
    sample["sample_id"] = "synthetic-demo-patient-001"
    sample["source_type"] = "precomputed"
    sample["synthetic"] = True
    sample["processing_status"] = "precomputed"
    prov = dict(sample.get("provenance") or {})
    prov["source_type"] = "precomputed"
    prov["notes"] = (
        "SYNTHETIC DEMO PATIENT. Derived from the real chr22 expanded-panel run, "
        "then ancestry labels were manually edited for the demo testbench "
        "(PJL+PUR+half of IBS -> AJ; TSI -> GBR/FIN). This is NOT a real ancestry "
        "analysis and must not be presented as pipeline output.")
    prov["synthetic_edits"] = counts
    sample["provenance"] = prov
    if "source_metadata" in sample:
        sample["source_metadata"]["usage_notice"] = (
            "SYNTHETIC DEMO DATA. FOR UI/TESTBENCH DEMONSTRATION ONLY. NOT A REAL "
            "ANCESTRY RESULT; NOT FOR MEDICAL, DIAGNOSTIC, OR HEALTH PURPOSES.")

    bundle["demo_synthetic"] = True
    bundle["demo_edit_summary"] = counts

    OUT.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")
    print("Edits applied:", json.dumps(counts, indent=2))
    from collections import Counter
    print("Resulting label distribution:",
          dict(Counter(s["ancestry_label"] for s in segments)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
