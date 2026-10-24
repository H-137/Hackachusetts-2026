"""Reference-asset manifest handling, download, and checksum verification.

Implements the Step 2 setup command. Downloads ONLY public reference assets and
verifies their checksums. It never reads, uploads, or transmits any sample data.

Two modes:
  * slice (default): fetch a single-chromosome GRCh37 FASTA (~10 MB) and a
    position-windowed subset of the real 1000G Phase 3 chr22 panel via a tabix
    remote range query. Enough real data to validate harmonization end to end on
    a laptop.
  * full: fetch the complete human_g1k_v37 FASTA (~892 MB) and per-chromosome
    panel files. The real production path; documented but heavy.

Checksums: on first successful download the SHA-256 is computed and written back
into the manifest. On later runs the stored checksum is enforced; a mismatch is
a hard error (a reference asset must never change underneath us silently).
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_ROOT.parent
MANIFEST_PATH = PIPELINE_ROOT / "reference" / "manifest.json"

# Default validation window on chr22 (GRCh37). A gene-dense region with plenty
# of real Phase 3 panel sites. 1-based inclusive, as tabix/VCF expect.
SLICE_CHROM = "22"
SLICE_START = 20_000_000
SLICE_END = 22_000_000


@dataclass
class ToolCheck:
    name: str
    present: bool
    version: str


def _run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=False, **kwargs)


def check_tools() -> list[ToolCheck]:
    """Verify the external htslib toolchain is available."""
    checks: list[ToolCheck] = []
    for tool in ("bcftools", "samtools", "bgzip", "tabix"):
        path = shutil.which(tool)
        version = ""
        if path:
            res = _run([tool, "--version"])
            version = (res.stdout or res.stderr).splitlines()[0] if (res.stdout or res.stderr) else ""
        checks.append(ToolCheck(tool, path is not None, version))
    return checks


def load_manifest() -> dict:
    with open(MANIFEST_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_manifest(manifest: dict) -> None:
    with open(MANIFEST_PATH, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            block = fh.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def _download(url: str, dest: Path) -> None:
    """Stream a public asset to disk. No request body, no sample data."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        shutil.copyfileobj(resp, out, length=1 << 20)
    tmp.replace(dest)


def _verify_or_record(manifest_entry: dict, key: str, path: Path) -> str:
    """Enforce a stored checksum, or record it on first download.

    Returns "recorded" or "verified". Raises on mismatch.
    """
    digest = sha256_file(path)
    stored = manifest_entry.get(key)
    if stored is None:
        manifest_entry[key] = digest
        return "recorded"
    if stored != digest:
        raise RuntimeError(
            f"Checksum mismatch for {path.name}: manifest expects {stored[:12]}…, "
            f"downloaded file is {digest[:12]}…. Refusing to proceed."
        )
    return "verified"


def _bgzip_fasta_to_plain(gz_path: Path, out_fa: Path) -> None:
    """Decompress a .fa.gz to plain FASTA and index it with samtools faidx.

    The 1000 Genomes human_g1k_v37.fasta.gz is stored in the legacy RAZF format,
    which htslib's bgzip refuses ("Cannot decompress legacy RAZF format"). Plain
    gunzip reads it fine (it emits a harmless "trailing garbage ignored" warning
    for the RAZF footer). We try bgzip first for true bgzip/gzip inputs, then
    fall back to gunzip for RAZF.
    """
    out_fa.parent.mkdir(parents=True, exist_ok=True)

    with open(out_fa, "wb") as out:
        res = subprocess.run(["bgzip", "-dc", str(gz_path)], stdout=out,
                             stderr=subprocess.PIPE, check=False)
    if res.returncode != 0:
        # Legacy RAZF (or other bgzip-incompatible gzip): use gunzip. gunzip
        # exits non-zero (2) only for the trailing-garbage warning, so we accept
        # a non-empty output as success and verify via faidx below.
        with open(out_fa, "wb") as out:
            subprocess.run(["gunzip", "-c", str(gz_path)], stdout=out,
                           stderr=subprocess.DEVNULL, check=False)
        if out_fa.stat().st_size == 0:
            raise RuntimeError(
                f"Failed to decompress {gz_path.name} with both bgzip and gunzip. "
                f"bgzip stderr: {res.stderr.decode(errors='replace')[:200]}"
            )

    subprocess.run(["samtools", "faidx", str(out_fa)], check=True)


def setup_slice(manifest: dict) -> dict:
    """Fetch the small real slice: chr22 FASTA + windowed panel subset."""
    assets = manifest["assets"]
    report: dict = {"mode": "slice", "steps": []}

    # 1. Reference FASTA slice (Ensembl GRCh37 chr22).
    fa_entry = assets["reference_fasta_slice"]
    fa_local = REPO_ROOT / fa_entry["local_path"]
    gz_tmp = fa_local.with_suffix(fa_local.suffix + ".gz")
    if not fa_local.exists():
        _download(fa_entry["url"], gz_tmp)
        status = _verify_or_record(fa_entry, "sha256", gz_tmp)
        _bgzip_fasta_to_plain(gz_tmp, fa_local)
        gz_tmp.unlink(missing_ok=True)
        report["steps"].append({"asset": fa_entry["id"], "checksum": status, "path": str(fa_local)})
    else:
        report["steps"].append({"asset": fa_entry["id"], "checksum": "cached", "path": str(fa_local)})

    # 2. Panel subset: a position window of the real chr22 Phase 3 panel, pulled
    #    with a tabix remote range query so we never download the full 206 MB.
    panel_entry = assets["phased_panel"]
    panel_url = panel_entry["url_template"].format(chrom=SLICE_CHROM)
    panel_dir = REPO_ROOT / panel_entry["local_dir"]
    panel_dir.mkdir(parents=True, exist_ok=True)
    panel_slice = panel_dir / f"panel.chr{SLICE_CHROM}.{SLICE_START}-{SLICE_END}.vcf.gz"
    if not panel_slice.exists():
        region = f"{SLICE_CHROM}:{SLICE_START}-{SLICE_END}"
        # tabix streams only the requested byte ranges from the remote index.
        res = subprocess.run(
            ["bcftools", "view", "-Oz", "-o", str(panel_slice), f"{panel_url}", region],
            capture_output=True, text=True, check=False,
        )
        if res.returncode != 0:
            raise RuntimeError(
                "Failed to fetch panel slice via remote range query. "
                f"stderr: {res.stderr.strip()[:300]}"
            )
        subprocess.run(["tabix", "-p", "vcf", str(panel_slice)], check=True)
        report["steps"].append({
            "asset": f"{panel_entry['id']}:chr{SLICE_CHROM}:{region}",
            "checksum": "slice_not_pinned",
            "path": str(panel_slice),
        })
    else:
        report["steps"].append({
            "asset": f"{panel_entry['id']}:chr{SLICE_CHROM}",
            "checksum": "cached",
            "path": str(panel_slice),
        })

    report["slice_window"] = {"chrom": SLICE_CHROM, "start": SLICE_START, "end": SLICE_END}
    report["reference_fasta"] = str(fa_local)
    report["panel_vcf"] = str(panel_slice)
    return report


def setup_full(manifest: dict) -> dict:
    """Document (and, if run, perform) the full-asset download. Heavy."""
    assets = manifest["assets"]
    report: dict = {"mode": "full", "steps": []}

    fa_entry = assets["reference_fasta"]
    fa_local = REPO_ROOT / fa_entry["local_path"]
    gz_tmp = fa_local.with_suffix(fa_local.suffix + ".gz")
    if not fa_local.exists():
        print(f"Downloading {fa_entry['approx_size']} reference FASTA… this is large.",
              file=sys.stderr)
        _download(fa_entry["url"], gz_tmp)
        status = _verify_or_record(fa_entry, "sha256", gz_tmp)
        _bgzip_fasta_to_plain(gz_tmp, fa_local)
        gz_tmp.unlink(missing_ok=True)
        report["steps"].append({"asset": fa_entry["id"], "checksum": status, "path": str(fa_local)})
    else:
        report["steps"].append({"asset": fa_entry["id"], "checksum": "cached", "path": str(fa_local)})

    report["note"] = (
        "Per-chromosome panel downloads are intentionally left to an explicit "
        "run to avoid tens of GB of traffic. Use the panel URL template in the "
        "manifest with bcftools/tabix as needed."
    )
    return report


def run_setup(mode: str) -> dict:
    tools = check_tools()
    missing = [t.name for t in tools if not t.present]
    if missing:
        raise RuntimeError(
            f"Missing required tools: {', '.join(missing)}. "
            "Install htslib/bcftools/samtools (e.g. `brew install htslib bcftools samtools`)."
        )

    manifest = load_manifest()
    manifest.setdefault("resolved_toolchain", {})
    for t in tools:
        manifest["resolved_toolchain"][t.name] = t.version

    if mode == "slice":
        report = setup_slice(manifest)
    elif mode == "full":
        report = setup_full(manifest)
    else:
        raise ValueError(f"Unknown mode: {mode}")

    save_manifest(manifest)
    report["toolchain"] = {t.name: t.version for t in tools}
    return report
