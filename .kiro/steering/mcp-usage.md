# MCP usage policy (always apply)

This project may connect an MCP server (BioMCP: ClinVar, variant annotation,
biomedical literature) configured in `.kiro/settings/mcp.json`. MCP tools make
NETWORK calls, so their use is constrained by the project's offline-first and
privacy guarantees.

## Build-time curation only — never a runtime dependency

- MCP servers are for AUTHORING: looking up a variant's classification/review
  status, population frequencies, coordinates, or a paper's PMID while we extend
  the catalog or reference data.
- Whatever an MCP tool returns MUST land in a versioned, cited project file
  (e.g. the watchlist catalog, panel descriptors, docs), NOT get called live by
  the app. The deterministic offline path stays the default; the demo must run
  with no network and no MCP server present.

## Public reference data only — never raw genetic data

- Only send PUBLIC identifiers to an MCP tool: gene names, rsIDs / HGVS variant
  identifiers, genomic coordinates, population/condition names, PMIDs.
- NEVER send a user's raw genotypes, alleles, or any identifying genomic data to
  an MCP server. This extends the privacy invariant in guardrails.md to every
  outbound MCP call.

## Sourcing & verification (guardrails.md still applies)

- Data pulled via MCP is external and untrusted. Cite it with a source and
  version, and keep allele frequency / carrier frequency / disease prevalence
  distinct with their denominators. Uncertain figures stay null, never invented.
- No guideline citations or absolute-risk numbers enter the catalog unless they
  come from a sourced, versioned dataset.
- Prefer the bounded, read-only typed tools (ClinVar, variant normalization,
  literature). Treat any raw/escape-hatch tool as a last resort and review its
  output before it enters a project file.
