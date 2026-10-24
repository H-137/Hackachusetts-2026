"""Enumerate chr22 ClinVar P/LP variants in our ancestry window and join them to
gnomAD per-population allele frequencies, so the catalog can be filtered by REAL
documented population enrichment instead of hand-picked names.

Method (reproducible funnel):
  1. ClinVar E-utilities: all chr22 P/LP (+ review status, coordinate, gene)
     inside the real ancestry coverage window.
  2. gnomAD r2.1.1 (GRCh37) GraphQL: per-population allele frequency per variant.
  3. Compute an enrichment ratio (max-pop AF / median-of-other-pops AF) and tag
     the most-enriched population.

Output: a JSONL table (one row per variant) under docs/artifacts/, NOT committed
sample data (it is public reference metadata). Nothing here is personal data.

This is a research/triage tool to BUILD the curated catalog; it is not the
catalog itself. Classifications/frequencies must be re-verified before real use.

Usage:
    python -m ancestry_explorer.catalog_mine \
        --start 16000000 --end 51300000 \
        --out ../docs/artifacts/chr22-clinvar-gnomad.jsonl \
        --max 0        # 0 = no cap
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from statistics import median

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
GNOMAD = "https://gnomad.broadinstitute.org/api"

# gnomAD r2.1.1 top-level ancestry populations (exclude *_XX/_XY sex splits).
GNOMAD_POPS = ["afr", "amr", "asj", "eas", "fin", "nfe", "sas", "oth"]
# Rough map from a gnomAD population to a 1000G-style reference label family, so
# we can later ask "can our reference panel even represent this population?".
GNOMAD_TO_SUPERPOP = {
    "afr": "AFR", "amr": "AMR", "asj": "EUR", "eas": "EAS",
    "fin": "EUR", "nfe": "EUR", "sas": "SAS", "oth": "UNKNOWN",
}


def _get(url: str, tries: int = 3, pause: float = 0.34) -> bytes:
    last: Exception | None = None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=40) as fh:
                time.sleep(pause)  # be polite to NCBI (<3 req/s without a key)
                return fh.read()
        except Exception as e:  # noqa: BLE001 - network best-effort
            last = e
            time.sleep(1.0)
    raise RuntimeError(f"GET failed: {url}: {last}")


def _post_json(url: str, payload: dict, tries: int = 5, pause: float = 0.8) -> dict:
    """POST with polite throttling and exponential backoff on HTTP 429.

    gnomAD's public API rate-limits aggressively; we pace every call and back
    off hard on 429 so a full run does not get throttled to all-failures.
    """
    data = json.dumps(payload).encode()
    last: Exception | None = None
    backoff = 2.0
    for _ in range(tries):
        try:
            req = urllib.request.Request(
                url, data=data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as fh:
                body = json.loads(fh.read())
            time.sleep(pause)  # pace steady-state requests
            return body
        except urllib.error.HTTPError as e:  # noqa: PERF203
            last = e
            if e.code == 429:
                time.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
            else:
                time.sleep(1.0)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.0)
    raise RuntimeError(f"POST failed: {url}: {last}")


def clinvar_ids(start: int, end: int, extra: str = "") -> list[str]:
    """All ClinVar UIDs for chr22 P/LP in [start,end] on GRCh37."""
    term = (f"22[chromosome] AND {start}:{end}[chrpos37] AND "
            f'"clinsig pathogenic"[Properties]{extra}')
    ids: list[str] = []
    retstart = 0
    while True:
        q = urllib.parse.urlencode({
            "db": "clinvar", "term": term, "retmode": "json",
            "retmax": 500, "retstart": retstart,
        })
        res = json.loads(_get(f"{EUTILS}/esearch.fcgi?{q}"))
        r = res["esearchresult"]
        batch = r.get("idlist", [])
        ids.extend(batch)
        total = int(r.get("count", 0))
        retstart += len(batch)
        if retstart >= total or not batch:
            break
    return ids


def clinvar_summaries(ids: list[str]) -> dict[str, dict]:
    """esummary for ClinVar UIDs, batched; extract coordinate/gene/review/trait."""
    out: dict[str, dict] = {}
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        q = urllib.parse.urlencode({
            "db": "clinvar", "retmode": "json", "id": ",".join(chunk)})
        res = json.loads(_get(f"{EUTILS}/esummary.fcgi?{q}"))
        result = res.get("result", {})
        for uid in result.get("uids", []):
            r = result[uid]
            loc37 = {}
            rsid = None
            spdi = ""
            gnomad_global_af = None
            for vs in r.get("variation_set", []):
                spdi = spdi or vs.get("canonical_spdi", "")
                for l in vs.get("variation_loc", []):
                    if l.get("assembly_name") == "GRCh37" and not loc37:
                        loc37 = l
                for x in vs.get("variation_xrefs", []):
                    if x.get("db_source") == "dbSNP" and rsid is None:
                        rsid = "rs" + str(x.get("db_id"))
                for af in vs.get("allele_freq_set", []):
                    if "gnomAD" in af.get("source", "") and af.get("value"):
                        try:
                            gnomad_global_af = float(af["value"])
                        except ValueError:
                            pass
            # germline_classification holds description + review_status + traits.
            gc = r.get("germline_classification", {})
            out[uid] = {
                "clinvar_uid": uid,
                "accession": r.get("accession", ""),
                "title": r.get("title", ""),
                "variant_type": r.get("obj_type", ""),
                "genes": [g.get("symbol", "") for g in r.get("genes", [])],
                "protein_change": r.get("protein_change", ""),
                "review_status": gc.get("review_status", ""),
                "clinsig": gc.get("description", ""),
                "last_evaluated": gc.get("last_evaluated", ""),
                "traits": [t.get("trait_name", "")
                           for t in gc.get("trait_set", [])],
                "chr": loc37.get("chr"),
                "start37": loc37.get("start"),
                "stop37": loc37.get("stop"),
                "canonical_spdi": spdi,
                "rsid": rsid,
                "clinvar_gnomad_global_af": gnomad_global_af,
            }
    return out


def _gnomad_variant(variant_id: str) -> dict | None:
    query = ("query($v:String!){variant(variantId:$v,dataset:gnomad_r2_1)"
             "{variant_id rsids genome{ac an populations{id ac an}}}}")
    res = _post_json(GNOMAD, {"query": query, "variables": {"v": variant_id}})
    return (res.get("data") or {}).get("variant")


def _gnomad_search(rsid: str) -> str | None:
    query = ("query($q:String!){variant_search(query:$q,dataset:gnomad_r2_1)"
             "{variant_id}}")
    res = _post_json(GNOMAD, {"query": query, "variables": {"q": rsid}})
    hits = (res.get("data") or {}).get("variant_search") or []
    return hits[0]["variant_id"] if hits else None


def gnomad_freqs(rsid: str | None) -> dict | None:
    """Per-population AC/AN for a variant, resolved from gnomAD r2.1.1 by rsid."""
    if not rsid:
        return None
    vid = _gnomad_search(rsid)
    if not vid:
        return None
    v = _gnomad_variant(vid)
    if not v or not v.get("genome"):
        return None
    pops = {p["id"]: (p["ac"], p["an"]) for p in v["genome"]["populations"]}
    freqs = {}
    for k in GNOMAD_POPS:
        if k in pops and pops[k][1]:
            freqs[k] = pops[k][0] / pops[k][1]
    return {"variant_id": v["variant_id"], "rsids": v.get("rsids", []),
            "freqs": freqs}


def enrichment(freqs: dict[str, float]) -> dict:
    """Max-population AF vs the median of the other populations -> enrichment."""
    if not freqs:
        return {"top_pop": None, "top_af": 0.0, "ratio": 0.0, "superpop": None}
    top_pop = max(freqs, key=lambda k: freqs[k])
    top_af = freqs[top_pop]
    others = [v for k, v in freqs.items() if k != top_pop]
    base = median(others) if others else 0.0
    ratio = (top_af / base) if base > 0 else (float("inf") if top_af > 0 else 0.0)
    return {"top_pop": top_pop, "top_af": top_af,
            "ratio": (None if ratio == float("inf") else round(ratio, 1)),
            "superpop": GNOMAD_TO_SUPERPOP.get(top_pop)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--start", type=int, default=16000000)
    ap.add_argument("--end", type=int, default=51300000)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max", type=int, default=0, help="cap variants (0=all)")
    ap.add_argument("--min-af", type=float, default=0.0005,
                    help="only query gnomAD when ClinVar global AF >= this")
    ap.add_argument("--review", default="", help='e.g. "reviewed by expert panel"')
    args = ap.parse_args(argv)

    extra = f' AND "{args.review}"[Review status]' if args.review else ""
    sys.stderr.write("Enumerating ClinVar chr22 window...\n")
    ids = clinvar_ids(args.start, args.end, extra)
    if args.max:
        ids = ids[: args.max]
    sys.stderr.write(f"  {len(ids)} ClinVar UIDs.\n")

    sys.stderr.write("Fetching ClinVar summaries...\n")
    summ = clinvar_summaries(ids)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    n_gnomad = 0
    with out.open("w", encoding="utf-8") as fh:
        for j, (uid, s) in enumerate(summ.items(), 1):
            row = dict(s)
            # Pre-filter: only query gnomAD when ClinVar already reports a
            # gnomAD global AF at/above a floor. No reported AF => the variant is
            # a near-singleton with no population signal to enrich, and querying
            # gnomAD for it only wastes the rate budget. This targets exactly the
            # enrichable variants and keeps the full run within gnomAD limits.
            glob = s.get("clinvar_gnomad_global_af")
            g = None
            if glob is not None and glob >= args.min_af and s.get("rsid"):
                try:
                    g = gnomad_freqs(s.get("rsid"))
                except Exception:  # noqa: BLE001
                    g = None
            if g:
                n_gnomad += 1
                row["gnomad_variant_id"] = g["variant_id"]
                row["gnomad_rsids"] = g["rsids"]
                row["gnomad_freqs"] = {k: round(v, 5) for k, v in g["freqs"].items()}
                row["enrichment"] = enrichment(g["freqs"])
            else:
                row["gnomad_variant_id"] = None
                row["gnomad_freqs"] = {}
                row["enrichment"] = enrichment({})
            fh.write(json.dumps(row) + "\n")
            if j % 100 == 0:
                sys.stderr.write(f"  {j}/{len(summ)} (gnomAD hits: {n_gnomad})\n")
    sys.stderr.write(f"Wrote {out}: {len(summ)} rows, {n_gnomad} with gnomAD freqs.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
