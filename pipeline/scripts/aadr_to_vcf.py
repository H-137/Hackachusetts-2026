#!/usr/bin/env python3
"""Convert the real AADR / Human Origins 'Jew_Ashkenazi' individuals to a
GRCh37 chr22 VCF (Step 7, real-data path) — VERIFIED TGENO decoder.

The AADR v66 Human Origins .geno file is **TGENO** (transpose packed), NOT the
SNP-major GENO format. This decoder follows the authoritative DReichLab spec
(AdmixTools/transpose_info/transpose_format.txt) and the reference C reader
(DReichLab/AdmixTools src/geno.c):

  * Magic "TGENO"; header is ALWAYS 48 bytes (GENO_HEADER_SIZE), regardless of
    nind/nsnp. (The max(48, ceil(nind/4)) rule is for GENO only.)
  * Body is SAMPLE-MAJOR: one row per individual, row_size = ceil(nsnp/4) bytes.
    Sample s occupies bytes [48 + s*row_size, 48 + (s+1)*row_size).
  * Within a sample row, SNP j is at byte (j//4), bit_shift = 6 - (j%4)*2;
    value = (byte >> bit_shift) & 0x3.  (geno.c row_position + transpose_position)
  * 2-bit value: 00 = homozygous REFERENCE, 01 = heterozygous,
    10 = homozygous ALTERNATE, 11 = missing. (transpose_format.txt)
    In the .snp file, col5 = reference/allele1, col6 = alternate/allele2.

Efficiency: we need only the 8 Ashkenazi sample rows. Each row is contiguous, so
we HTTP-range-fetch just those 8 rows (~8 x 146 KB) instead of the 4 GB file —
UNLESS a local full HO.geno is present (then we read it directly, which also
lets the trusted geno_single tool cross-verify).

Cross-verification: scripts/verify_aadr_decoder.py compares this decoder against
the compiled DReichLab geno_single extractor on several genotypes.
"""

from __future__ import annotations

import argparse
import math
import subprocess
import sys
from pathlib import Path

AADR_DIR = Path(__file__).resolve().parents[1] / "reference/assets/aadr"
GENO_DATAFILE_ID = "13994808"  # v66.p1_HO.aadr.patch.PUB.geno on Harvard Dataverse
DATAVERSE = "https://dataverse.harvard.edu/api/access/datafile/"
HEADER_SIZE = 48  # TGENO: always 48 bytes

# 2-bit TGENO value -> (number of ALT alleles, is_missing). REF=allele1(col5),
# ALT=allele2(col6). 00=hom ref(0 alt), 01=het(1 alt), 10=hom alt(2 alt), 11=NA.
CODE_TO_GT = {0b00: "0/0", 0b01: "0/1", 0b10: "1/1", 0b11: "./."}


def resolve_s3(datafile_id: str) -> str:
    r = subprocess.run(
        ["curl", "-sI", "--max-time", "60", DATAVERSE + datafile_id],
        capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if line.lower().startswith("location:"):
            return line.split(":", 1)[1].strip()
    raise RuntimeError("Could not resolve S3 presigned URL for the geno file.")


def read_ind(path: Path) -> list[tuple[int, str, str, str]]:
    """Return [(row_index, sample_id, sex, population), ...] for all individuals."""
    out = []
    with open(path) as fh:
        for i, line in enumerate(fh):
            p = line.split()
            if len(p) >= 3:
                out.append((i, p[0], p[1], p[2]))
    return out


def read_chr22_snps(path: Path):
    """Return (global_snp_indices, snps) for chr22, where snps is
    [(rsid, pos1, allele1_ref, allele2_alt), ...] and global indices are the
    0-based SNP row numbers in the full .snp file (= column index in TGENO)."""
    idx = []
    snps = []
    with open(path) as fh:
        for i, line in enumerate(fh):
            p = line.split()
            if len(p) < 6:
                continue
            if p[1] == "22":
                idx.append(i)
                snps.append((p[0], int(p[3]), p[4].upper(), p[5].upper()))
    return idx, snps


def _fetch_sample_row(url: str, sample_row: int, row_size: int) -> bytes:
    start = HEADER_SIZE + sample_row * row_size
    end = start + row_size - 1
    r = subprocess.run(
        ["curl", "-s", "--max-time", "600", "-r", f"{start}-{end}", url],
        capture_output=True)
    if r.returncode != 0 or len(r.stdout) != row_size:
        raise RuntimeError(
            f"Range fetch for sample row {sample_row} returned "
            f"{len(r.stdout)} bytes (expected {row_size}).")
    return r.stdout


def _read_sample_row_local(geno: Path, sample_row: int, row_size: int) -> bytes:
    with open(geno, "rb") as fh:
        fh.seek(HEADER_SIZE + sample_row * row_size)
        return fh.read(row_size)


def decode_snp(row: bytes, snp_col: int) -> int:
    """2-bit TGENO value for SNP column snp_col within one sample row."""
    byte = row[snp_col // 4]
    shift = 6 - (snp_col % 4) * 2
    return (byte >> shift) & 0x3


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--population", default="Jew_Ashkenazi")
    ap.add_argument("--ind", default=str(AADR_DIR / "HO.ind"))
    ap.add_argument("--snp", default=str(AADR_DIR / "HO.snp"))
    ap.add_argument("--geno", default=str(AADR_DIR / "HO.geno"),
                    help="Local full .geno (used if present; else range-fetch).")
    ap.add_argument("--out-vcf", default=str(AADR_DIR / "aadr_aj.chr22.vcf"))
    ap.add_argument("--id-prefix", default="AADR_AJ_")
    args = ap.parse_args(argv)

    ind = read_ind(Path(args.ind))
    nind = len(ind)
    row_size = math.ceil((_count_snps(Path(args.snp))) / 4)  # ceil(nsnp/4)

    targets = [(row, sid) for (row, sid, _sex, pop) in ind if pop == args.population]
    if not targets:
        print(f"No individuals with population '{args.population}'.", file=sys.stderr)
        return 2
    target_ids = [args.id_prefix + sid.replace(".", "_") for _, sid in targets]
    print(f"{len(targets)} real '{args.population}' individuals: "
          + ", ".join(sid for _, sid in targets))

    chr22_cols, chr22_snps = read_chr22_snps(Path(args.snp))
    if not chr22_cols:
        print("No chr22 SNPs found.", file=sys.stderr)
        return 2
    print(f"chr22: {len(chr22_cols)} SNPs; TGENO row_size = {row_size} bytes "
          f"({nind} individuals).")

    geno = Path(args.geno)
    use_local = geno.exists() and geno.stat().st_size == HEADER_SIZE + nind * row_size
    if use_local:
        print(f"Using local {geno} (size verified against TGENO layout).")
    else:
        url = resolve_s3(GENO_DATAFILE_ID)
        print("Local geno absent/size-mismatch; range-fetching the 8 sample rows.")

    # Read the full row for each target sample (contiguous, sample-major).
    sample_rows: list[bytes] = []
    for (row_idx, sid) in targets:
        raw = (_read_sample_row_local(geno, row_idx, row_size) if use_local
               else _fetch_sample_row(url, row_idx, row_size))
        sample_rows.append(raw)

    out = Path(args.out_vcf)
    kept = 0
    skipped = 0
    missing_counts = [0] * len(targets)
    with open(out, "w") as w:
        w.write("##fileformat=VCFv4.2\n")
        w.write("##source=AADR_v66_HumanOrigins_" + args.population + "_TGENO\n")
        w.write("##reference=GRCh37\n")
        w.write("##contig=<ID=22>\n")
        w.write('##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n')
        w.write("#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t"
                + "\t".join(target_ids) + "\n")
        for col, (rsid, pos1, a1, a2) in zip(chr22_cols, chr22_snps):
            if a1 not in "ACGT" or a2 not in "ACGT" or a1 == a2:
                skipped += 1
                continue
            gts = []
            all_missing = True
            for si, row in enumerate(sample_rows):
                code = decode_snp(row, col)
                gt = CODE_TO_GT[code]
                if gt == "./.":
                    missing_counts[si] += 1
                else:
                    all_missing = False
                gts.append(gt)
            if all_missing:
                continue
            w.write(f"22\t{pos1}\t{rsid}\t{a1}\t{a2}\t.\t.\t.\tGT\t"
                    + "\t".join(gts) + "\n")
            kept += 1

    print(f"Wrote {out}: {kept} biallelic-SNP chr22 sites for {len(target_ids)} "
          f"real {args.population} individuals ({skipped} non-ACGT skipped).")
    n_chr22_bi = kept  # sites with at least one call
    print("Per-sample chr22 missingness (of "
          f"{len([1 for (_, _, a1, a2) in chr22_snps if a1 in 'ACGT' and a2 in 'ACGT' and a1 != a2])} "
          "biallelic-SNP sites):")
    for sid_full, mc in zip(target_ids, missing_counts):
        total_bi = len([1 for (_, _, a1, a2) in chr22_snps
                        if a1 in "ACGT" and a2 in "ACGT" and a1 != a2])
        pct = 100.0 * mc / total_bi if total_bi else 0.0
        print(f"  {sid_full:28s} missing {mc}/{total_bi} ({pct:.1f}%)")
    return 0


def _count_snps(snp_path: Path) -> int:
    n = 0
    with open(snp_path) as fh:
        for _ in fh:
            n += 1
    return n


if __name__ == "__main__":
    raise SystemExit(main())
