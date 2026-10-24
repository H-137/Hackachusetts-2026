#!/usr/bin/env python3
"""Cross-verify the pure-Python TGENO decoder against the trusted DReichLab
geno_single C extractor (Step 7 integrity gate).

geno_single (built from AdmixTools/src/geno.c + geno_single.c) extracts one
individual's full genotype vector from a packed .geno/.tgeno into a single-sample
GENO file. We decode that single-sample output independently and compare, for a
set of SNP columns spanning heterozygous, homozygous-ref, homozygous-alt, and
missing calls, against our TGENO decoder reading the SAME individual from the
full file. Any disagreement aborts.

Requires a local full HO.geno (TGENO). Run after the download completes.
"""

from __future__ import annotations

import argparse
import math
import subprocess
import sys
from pathlib import Path

AADR_DIR = Path(__file__).resolve().parents[1] / "reference/assets/aadr"
HEADER = 48

sys.path.insert(0, str(Path(__file__).resolve().parent))
from aadr_to_vcf import read_ind, read_chr22_snps, decode_snp, _count_snps  # noqa: E402


def _decode_single_sample_tgeno(path: Path, nsnp: int) -> list[int]:
    """Decode a single-sample TGENO file (output of geno_single, which writes
    with transpose=true). One row (the single sample), row_size = ceil(nsnp/4);
    SNP j at byte j//4, bit_shift 6-(j%4)*2 of that row. Decoded INDEPENDENTLY
    of the main decoder so agreement is a real cross-check of the byte math via
    the trusted C extractor's output."""
    data = path.read_bytes()
    header = data[:HEADER].split()
    assert header[0] == b"TGENO", f"expected single-sample TGENO, got {header[0]!r}"
    row = data[HEADER:HEADER + math.ceil(nsnp / 4)]
    out = []
    for snp in range(nsnp):
        byte = row[snp // 4]
        shift = 6 - (snp % 4) * 2
        out.append((byte >> shift) & 0x3)
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--geno", default=str(AADR_DIR / "HO.geno"))
    ap.add_argument("--ind", default=str(AADR_DIR / "HO.ind"))
    ap.add_argument("--snp", default=str(AADR_DIR / "HO.snp"))
    ap.add_argument("--geno-single", default="/tmp/AdmixTools/src/geno_single")
    ap.add_argument("--sample-id", default="AshkenaziJew5782.HO")
    ap.add_argument("--n-check", type=int, default=200,
                    help="chr22 SNP columns to compare (spanning all call types).")
    args = ap.parse_args(argv)

    geno = Path(args.geno)
    if not geno.exists():
        print(f"Full geno not present yet: {geno}", file=sys.stderr)
        return 3

    ind = read_ind(Path(args.ind))
    nind = len(ind)
    nsnp = _count_snps(Path(args.snp))
    row_size = math.ceil(nsnp / 4)
    expected = HEADER + nind * row_size
    if geno.stat().st_size != expected:
        print(f"geno size {geno.stat().st_size} != expected TGENO {expected}",
              file=sys.stderr)
        return 2

    # Find the target sample's row index.
    row_idx = None
    for (i, sid, _sex, _pop) in ind:
        if sid == args.sample_id:
            row_idx = i
            break
    if row_idx is None:
        print(f"{args.sample_id} not in .ind", file=sys.stderr)
        return 2

    # Trusted extraction via geno_single -> single-sample GENO file.
    out_geno = AADR_DIR / "verify_single.geno"
    r = subprocess.run([args.geno_single, str(geno), str(row_idx), str(out_geno)],
                       capture_output=True, text=True)
    if r.returncode != 0 or not out_geno.exists():
        print(f"geno_single failed: {r.stdout} {r.stderr}", file=sys.stderr)
        return 2
    trusted = _decode_single_sample_tgeno(out_geno, nsnp)

    # Our TGENO decoder reading the same sample row from the full file, using
    # the production decode_snp() (the exact code aadr_to_vcf.py uses).
    with open(geno, "rb") as fh:
        fh.seek(HEADER + row_idx * row_size)
        row = fh.read(row_size)

    # A THIRD, independent unpack (whole-byte LUT, MSB-first) to catch any shift
    # bug: expand each byte to its 4 SNP values left-to-right.
    def unpack_byte(b: int) -> tuple[int, int, int, int]:
        return ((b >> 6) & 3, (b >> 4) & 3, (b >> 2) & 3, b & 3)
    independent = []
    for b in row:
        independent.extend(unpack_byte(b))

    chr22_cols, chr22_snps = read_chr22_snps(Path(args.snp))

    # Pick columns spanning all call types from the trusted vector.
    by_type = {0: [], 1: [], 2: [], 3: []}
    for col in chr22_cols:
        by_type[trusted[col]].append(col)
    picks = []
    for t in (0, 1, 2, 3):
        picks += by_type[t][: max(1, args.n_check // 4)]
    picks = picks[: args.n_check] or chr22_cols[: args.n_check]

    mismatches = 0
    seen = {0: 0, 1: 0, 2: 0, 3: 0}
    for col in picks:
        ours = decode_snp(row, col)          # production decoder
        ours2 = independent[col]             # independent whole-byte unpack
        theirs = trusted[col]                # via trusted C geno_single output
        seen[theirs] += 1
        if not (ours == ours2 == theirs):
            mismatches += 1
            if mismatches <= 10:
                print(f"  MISMATCH col {col}: production={ours} "
                      f"independent={ours2} trusted={theirs}")

    name = {0: "hom-ref", 1: "het", 2: "hom-alt", 3: "missing"}
    print(f"Sample {args.sample_id} (row {row_idx}); compared {len(picks)} chr22 columns.")
    print("  call-type coverage:", {name[k]: v for k, v in seen.items()})
    if mismatches == 0:
        print("VERIFIED: pure-Python TGENO decoder agrees with trusted geno_single "
              "on every compared genotype, across hom-ref/het/hom-alt/missing.")
        out_geno.unlink(missing_ok=True)
        return 0
    print(f"FAILED: {mismatches} mismatches.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
