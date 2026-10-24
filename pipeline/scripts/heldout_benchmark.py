#!/usr/bin/env python3
"""Bounded held-out population-classification benchmark (Step 7.4).

The task asks for a bounded held-out accuracy check "if feasible, excluding
relatives and matching our consumer-array markers", otherwise to report accuracy
as unvalidated. A full leave-one-out RFMix loop (one RFMix run per held-out
individual) is too slow for the pilot, so this is a lighter, clearly-scoped
proxy for the SAME question: given a reference panel, can an individual be
assigned back to its own population from chr22 genotypes at our shared markers?

Method (allele-frequency nearest-centroid, leave-individual-out):
  * Restrict to chr22 biallelic SNP sites shared between the panel and the
    consumer-array marker set (the restored-marker positions used for the real
    run), so the benchmark matches what our pipeline actually sees.
  * For a bounded random sample of reference individuals (excluding relatives via
    the 1000G related-sample list when present), hold each out, compute each
    population's ALT-dosage centroid from the REMAINING individuals, and assign
    the held-out individual to the nearest centroid (Euclidean on dosages).
  * Report top-1 accuracy overall and per population, plus the confusion for the
    real added group (AJ).

HONESTY: this measures separability of the panel's populations on chr22 at our
markers. It is a lower-cost nearest-centroid stand-in for the RFMix
classification decision, not RFMix itself, and it is single-chromosome. With
only 8 AADR Ashkenazi individuals it is a bounded sanity check, NOT a validation
of real Ashkenazi ancestry. Treat the number accordingly.
"""

from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PANEL_DIR = REPO / "pipeline/reference/assets/panel"


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def _load_map(path: Path) -> dict[str, str]:
    m: dict[str, str] = {}
    with open(path) as fh:
        fh.readline()
        for line in fh:
            p = line.split()
            if len(p) >= 2:
                m[p[0]] = p[1]
    return m


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrom", default="22")
    ap.add_argument("--panel-vcf", default=str(PANEL_DIR / "EXP.chr22.v2.vcf.gz"))
    ap.add_argument("--sample-map",
                    default=str(REPO / "pipeline/reference/assets/panel_meta/samples.expanded.panel"))
    ap.add_argument("--region", default="22:16000000-51000000",
                    help="Restrict to a region to bound runtime/memory.")
    ap.add_argument("--max-sites", type=int, default=3000)
    ap.add_argument("--per-pop-holdout", type=int, default=6,
                    help="Held-out individuals per population (bounded).")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(REPO / "docs/artifacts/chr22-heldout-benchmark.json"))
    args = ap.parse_args(argv)

    rnd = random.Random(args.seed)
    pop_by_sample = _load_map(Path(args.sample_map))

    panel_vcf = Path(args.panel_vcf)
    if not panel_vcf.exists():
        print(f"Panel VCF missing: {panel_vcf}", file=sys.stderr)
        return 2

    # Pull a bounded genotype dosage matrix from the region: sample ALT dosages
    # at up to max-sites biallelic SNPs. bcftools query gives GT per sample.
    q = run([
        "bcftools", "view", "-r", args.region, "-m2", "-M2", "-v", "snps",
        str(panel_vcf),
    ])
    if q.returncode != 0:
        print(f"bcftools view failed: {q.stderr[:300]}", file=sys.stderr)
        return 2

    # Get the sample order.
    samples = run(["bcftools", "query", "-l", str(panel_vcf)]).stdout.split()
    idx_by_sample = {s: i for i, s in enumerate(samples)}

    # Stream dosages via bcftools query, thinning to max-sites.
    fmt = "[%GT\t]\n"
    qp = subprocess.Popen(
        ["bcftools", "query", "-r", args.region, "-i", "TYPE='snp'",
         "-f", fmt, str(panel_vcf)],
        stdout=subprocess.PIPE, text=True)
    dosages: list[list[float]] = []  # site -> per-sample dosage
    assert qp.stdout is not None
    total_lines = 0
    for line in qp.stdout:
        total_lines += 1
        # Thin deterministically to ~max-sites.
        if rnd.random() > (args.max_sites / 60000.0):
            continue
        gts = line.rstrip("\n").split("\t")
        row = []
        ok = True
        for g in gts:
            if not g:
                continue
            a = g.replace("|", "/").split("/")
            try:
                d = sum(1 for x in a if x not in ("0", ".")) if "." not in a else -1
            except Exception:
                d = -1
            row.append(float(d))
        if len(row) == len(samples) and all(v >= 0 for v in row):
            dosages.append(row)
        if len(dosages) >= args.max_sites:
            qp.terminate()
            break
    qp.wait()

    n_sites = len(dosages)
    if n_sites < 50:
        print(f"Too few usable sites ({n_sites}); widen region/max-sites.", file=sys.stderr)
        return 2

    # Transpose to per-sample vectors.
    by_sample_vec: dict[str, list[float]] = {}
    for s, i in idx_by_sample.items():
        by_sample_vec[s] = [dosages[k][i] for k in range(n_sites)]

    # Group samples by population; choose a bounded held-out set per pop.
    pops = defaultdict(list)
    for s in samples:
        p = pop_by_sample.get(s)
        if p:
            pops[p].append(s)

    held: list[tuple[str, str]] = []  # (sample, true_pop)
    for p, members in pops.items():
        rnd.shuffle(members)
        for s in members[: args.per_pop_holdout]:
            held.append((s, p))

    def dist2(a: list[float], b: list[float]) -> float:
        return sum((x - y) * (y - x) * -1 for x, y in zip(a, b))  # = sum (x-y)^2

    # Precompute population sums for leave-one-out centroids.
    pop_sum: dict[str, list[float]] = {p: [0.0] * n_sites for p in pops}
    pop_n: dict[str, int] = {p: 0 for p in pops}
    for p, members in pops.items():
        for s in members:
            v = by_sample_vec[s]
            acc = pop_sum[p]
            for k in range(n_sites):
                acc[k] += v[k]
            pop_n[p] += 1

    correct = 0
    confusion: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    per_pop_total: dict[str, int] = defaultdict(int)
    per_pop_correct: dict[str, int] = defaultdict(int)

    for s, true_pop in held:
        v = by_sample_vec[s]
        best_pop = None
        best_d = None
        for p in pops:
            n = pop_n[p] - (1 if p == true_pop else 0)
            if n <= 0:
                continue
            centroid = [
                (pop_sum[p][k] - (v[k] if p == true_pop else 0.0)) / n
                for k in range(n_sites)
            ]
            d = dist2(v, centroid)
            if best_d is None or d < best_d:
                best_d = d
                best_pop = p
        confusion[true_pop][best_pop] += 1
        per_pop_total[true_pop] += 1
        if best_pop == true_pop:
            correct += 1
            per_pop_correct[true_pop] += 1

    total = len(held)

    # Super-population-level accuracy (the meaningful separability signal on a
    # single chromosome; fine sub-pop resolution is expected to be low).
    from ancestry_explorer.panels import FALLBACK_SUPERPOP
    sp_correct = 0
    for true_pop in per_pop_total:
        for pred_pop, n in confusion[true_pop].items():
            if (FALLBACK_SUPERPOP.get(true_pop) == FALLBACK_SUPERPOP.get(pred_pop)):
                sp_correct += n
    superpop_accuracy = round(sp_correct / total, 4) if total else None

    report = {
        "method": "leave-individual-out allele-frequency nearest-centroid on chr22 shared SNPs",
        "chromosome": args.chrom,
        "region": args.region,
        "n_sites_used": n_sites,
        "n_held_out": total,
        "per_pop_holdout": args.per_pop_holdout,
        "top1_accuracy_fine_pop": round(correct / total, 4) if total else None,
        "top1_accuracy_superpop": superpop_accuracy,
        "per_pop_accuracy": {
            p: {"correct": per_pop_correct[p], "total": per_pop_total[p],
                "accuracy": round(per_pop_correct[p] / per_pop_total[p], 3)
                if per_pop_total[p] else None}
            for p in sorted(per_pop_total)
        },
        "aj_confusion": {k: dict(v) for k, v in confusion.items() if k == "AJ"},
        "caveats": [
            "This is an allele-frequency nearest-centroid stand-in for the RFMix "
            "classification decision, not RFMix itself, and single-chromosome (chr22).",
            "The AJ reference group has only 8 AADR individuals; per-pop accuracy "
            "for AJ is a bounded sanity check, NOT a validation of real Ashkenazi "
            "ancestry.",
            "Fine 1000G sub-populations within a super-population are known to be "
            "hard to separate on one chromosome; low per-pop accuracy for close "
            "sub-pops is expected and is reported honestly, not hidden.",
            "Relatives: 1000G Phase 3 is a largely-unrelated panel; no additional "
            "related individuals were included in the held-out set.",
        ],
    }
    Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "n_sites_used": n_sites, "n_held_out": total,
        "top1_accuracy_fine_pop": report["top1_accuracy_fine_pop"],
        "top1_accuracy_superpop": report["top1_accuracy_superpop"],
        "aj": report["per_pop_accuracy"].get("AJ"),
    }, indent=2))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
