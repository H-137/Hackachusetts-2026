---
inclusion: manual
---

# Release / demo checklist (pull in with #release-checklist)

Run through this before a demo, a push to shared `main`, or tagging a build.
Pull it into context manually with `#release-checklist` — it is not always-on.

## Verify loop (all must pass)

```sh
export PATH="$HOME/.local/node/node-v24.22.1-darwin-arm64/bin:$PATH"
npm run build   # tsc -b && vite build
npm run lint    # eslint .
npm test        # vitest run
cd pipeline && python -m pytest   # Python pipeline suite
```

## Offline integrity

- No new CDN references. Globe textures, fonts, and any models resolve from
  `public/`.
- The offline/deterministic path is the default. Any remote provider
  (assistant, region research) is explicit/opt-in and transmits only a
  sanitized, non-identifying summary — never raw genotypes.

## Scientific & copy review (guardrails.md)

- No fabricated ancestry calls, classifications, allele frequencies, or risk
  values anywhere in the UI — unavailable/not-assayed/unscorable states instead.
- No percentile/absolute risk without a validated comparison distribution or a
  calibrated model with the required inputs.
- No unsourced guideline citations (NCCN/USPSTF/ACOG/ACMG).
- "Consider"/"confirm" language only; no diagnostic/treatment wording.
- No-call / missing variant is never shown as a reassuring negative.

## Git hygiene before push (tech-conventions.md)

- Commit local work, fetch, and if behind, merge on a temporary branch; resolve
  conflicts deliberately (keep additive changes from both sides); re-run the
  full verify loop; fast-forward `main`; push. Never force-push over a
  teammate's commits.
- Check for feature duplication with the teammate before adding a parallel
  version of an existing panel/engine.

## Privacy spot-check

- Grep diffs for raw alleles/genotypes reaching logs, analytics, error reports,
  or URLs. There should be none.
