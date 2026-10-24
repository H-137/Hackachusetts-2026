"""Reference-panel registry (Step 7).

Replaces the hardcoded 26-population assumption with a versioned, declarative
description of each reference panel SNPshot can run against. A panel bundles:

  * a stable version id and human description,
  * provenance for every contributing source (name, citation, access terms),
  * the genome build,
  * the sample->population map file and (optionally) the reference VCF,
  * the population -> super-population rollup DERIVED FROM the sample map, not a
    hardcoded dict.

Why derive the rollup from data: the old code hardcoded a 26-entry _SUPERPOP
dict in two places (composition.py, watchlist.py). Any new population (e.g. AJ)
would silently roll up to "OTHER"/"UNKNOWN". Here the rollup is read from the
sample map's super_pop column, with a small, auditable fallback table only for
sources whose map lacks a super-pop column.

The registry file lives at pipeline/reference/panels.json. The baseline
26-population 1000G panel is declared there so existing runs are unchanged;
the expanded panel is a second entry pointing at an augmented sample map.

Nothing here downloads data or reads sample genotypes. It reads the panels.json
descriptor and the panel's sample map (population labels only, no genotypes).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_ROOT.parent
PANELS_PATH = PIPELINE_ROOT / "reference" / "panels.json"

# Fallback super-population rollup used ONLY for population codes whose sample
# map does not carry a super_pop column. Audited, extend deliberately. A code
# not found here and not in the map's super_pop column rolls up to "OTHER", and
# that is surfaced (never silently hidden).
FALLBACK_SUPERPOP: dict[str, str] = {
    # 1000 Genomes Phase 3 (the historical 26).
    "CEU": "EUR", "GBR": "EUR", "FIN": "EUR", "IBS": "EUR", "TSI": "EUR",
    "CHB": "EAS", "JPT": "EAS", "CHS": "EAS", "CDX": "EAS", "KHV": "EAS",
    "YRI": "AFR", "LWK": "AFR", "GWD": "AFR", "MSL": "AFR", "ESN": "AFR",
    "ASW": "AFR", "ACB": "AFR",
    "MXL": "AMR", "PUR": "AMR", "CLM": "AMR", "PEL": "AMR",
    "GIH": "SAS", "PJL": "SAS", "BEB": "SAS", "STU": "SAS", "ITU": "SAS",
    # Added reference groups (Step 7).
    "AJ": "MID",          # Ashkenazi Jewish: rolled up under Middle Eastern /
                          # West-Eurasian, NOT merged into EUR, so it stays
                          # distinguishable from 1000G European sub-pops.
}


@dataclass
class PanelSource:
    """One contributing data source for a panel, with provenance + access terms."""
    name: str
    role: str
    citation: str = ""
    access: str = ""          # "open" | "controlled" | "mixed"
    url: str = ""
    notes: str = ""

    def as_dict(self) -> dict:
        return {
            "name": self.name, "role": self.role, "citation": self.citation,
            "access": self.access, "url": self.url, "notes": self.notes,
        }


@dataclass
class Panel:
    """A versioned reference panel descriptor (no genotypes)."""
    panel_id: str
    version: str
    description: str
    genome_build: str
    sample_map: str               # repo-relative path to sample<TAB>pop[<TAB>super_pop]
    reference_vcf_template: str = ""   # repo-relative, {chrom} placeholder; optional
    level: str = "pop"
    sources: list[PanelSource] = field(default_factory=list)
    superpop_overrides: dict[str, str] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    # ---- resolved views (populated on load) -------------------------------
    _populations: list[str] = field(default_factory=list)
    _superpop_by_pop: dict[str, str] = field(default_factory=dict)
    _counts: dict[str, int] = field(default_factory=dict)

    def sample_map_path(self) -> Path:
        return REPO_ROOT / self.sample_map

    def reference_vcf_path(self, chrom: str) -> Path | None:
        if not self.reference_vcf_template:
            return None
        return REPO_ROOT / self.reference_vcf_template.format(chrom=chrom)

    def populations(self) -> list[str]:
        return list(self._populations)

    def superpop_for(self, pop: str) -> str:
        return (self._superpop_by_pop.get(pop)
                or self.superpop_overrides.get(pop)
                or FALLBACK_SUPERPOP.get(pop, "OTHER"))

    def superpop_map(self) -> dict[str, str]:
        """Full pop -> super-pop map for every population in this panel."""
        return {p: self.superpop_for(p) for p in self._populations}

    def counts(self) -> dict[str, int]:
        return dict(self._counts)

    def provenance(self) -> dict:
        """Machine-readable provenance stamped into results."""
        return {
            "panel_id": self.panel_id,
            "panel_version": self.version,
            "description": self.description,
            "genome_build": self.genome_build,
            "level": self.level,
            "populations": self.populations(),
            "population_counts": self.counts(),
            "superpop_map": self.superpop_map(),
            "sources": [s.as_dict() for s in self.sources],
            "notes": self.notes,
        }


def _load_sample_map(path: Path, level: str) -> tuple[list[str], dict[str, str], dict[str, int]]:
    """Read population labels (+ super_pop if present) from a sample map.

    Returns (ordered unique populations, pop->superpop seen in map, counts).
    Reads labels only; never genotypes. Tolerates a 2-column (sample pop) or a
    4-column (sample pop super_pop gender) map, header optional.
    """
    pops: list[str] = []
    seen: set[str] = set()
    superpop: dict[str, str] = {}
    counts: dict[str, int] = {}
    col = {"pop": 1, "super_pop": 2}[level]
    if not path.exists():
        return pops, superpop, counts
    with open(path, "r", encoding="utf-8") as fh:
        first = True
        for line in fh:
            parts = line.split()
            if not parts:
                continue
            if first:
                first = False
                # Skip an obvious header row.
                if parts[0].lower() in ("sample", "sample_id", "id", "#sample"):
                    continue
            if len(parts) <= col:
                continue
            label = parts[col]
            counts[label] = counts.get(label, 0) + 1
            if label not in seen:
                seen.add(label)
                pops.append(label)
            # Capture super_pop when the map carries it (col 2) and we grouped by pop.
            if level == "pop" and len(parts) > 2 and parts[2] and parts[2] != label:
                superpop[label] = parts[2]
    pops.sort()
    return pops, superpop, counts


def _panel_from_dict(d: dict) -> Panel:
    sources = [PanelSource(**s) for s in d.get("sources", [])]
    p = Panel(
        panel_id=d["panel_id"], version=d["version"], description=d["description"],
        genome_build=d["genome_build"], sample_map=d["sample_map"],
        reference_vcf_template=d.get("reference_vcf_template", ""),
        level=d.get("level", "pop"), sources=sources,
        superpop_overrides=d.get("superpop_overrides", {}),
        notes=d.get("notes", []),
    )
    pops, superpop, counts = _load_sample_map(p.sample_map_path(), p.level)
    p._populations = pops
    p._superpop_by_pop = superpop
    p._counts = counts
    return p


def load_registry(path: Path = PANELS_PATH) -> dict[str, Panel]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return {d["panel_id"]: _panel_from_dict(d) for d in data["panels"]}


def get_panel(panel_id: str, path: Path = PANELS_PATH) -> Panel:
    reg = load_registry(path)
    if panel_id not in reg:
        raise KeyError(
            f"Unknown panel '{panel_id}'. Known: {sorted(reg)}. "
            f"Declare it in {path}.")
    return reg[panel_id]


def superpop_map_for(panel_id: str, path: Path = PANELS_PATH) -> dict[str, str]:
    """Convenience: the pop->superpop map for a panel, for composition/watchlist."""
    return get_panel(panel_id, path).superpop_map()
