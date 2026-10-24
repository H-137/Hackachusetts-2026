# Scientific & communication guardrails (always apply)

This is a research prototype for TRIAGE context, not a diagnostic tool. These
rules are non-negotiable and apply to all code, UI copy, and generated text.
They come from HACKATHON_PROJECT_PLAN.md and must never be relaxed to "fill a
gap" in the UI or data.

## Never fabricate

- Never invent ancestry calls, clinical classifications, model weights, allele
  frequencies, or medical risk values to fill a UI gap. Use explicit
  "unavailable" / "not assayed" / "unscorable" states instead.
- No percentile or absolute risk without a validated comparison distribution or
  a calibrated model plus required clinical inputs. If absent, say so.
- No guideline citations (NCCN/USPSTF/ACOG/ACMG) or absolute-risk numbers unless
  they come from a sourced, versioned dataset. In the synthetic prototype, omit
  them and say why.

## Language

- Use "consider" and "confirm". Never diagnostic or treatment language
  ("you have", "diagnosis", "prescribe", "treatment plan").
- Population frequency is context, not a personal finding. Phrase as
  "founder-variant frequency elevated in <group>", never "higher risk because of
  ethnicity" or any causal-ancestry wording.
- Ancestry does not establish whether a person carries a variant, and an
  ancestry estimate cannot rule one out. Say this where relevant.
- Local ancestry is an experimental model estimate relative to reference
  populations, not an intrinsic ethnicity; probabilities are not risk
  percentages.

## Absence and coverage

- A no-call / not-assayed / missing variant is NEVER a reassuring negative. A
  consumer array types only selected positions; absence is uninformative.
- Keep "missing from a database" distinct from a frequency of zero (null, not 0).
- Keep uncertain/unknown ancestry segments visible (hatching), never shown as a
  confident call.

## Privacy (local-first)

- Raw genetic data (alleles, genotypes) must never appear in logs, analytics,
  error reports, URLs, or any transmitted payload.
- The offline/deterministic path is the default; any remote provider (assistant,
  region research) transmits only a sanitized, non-identifying summary and must
  be explicit/opt-in. Never transmit raw genotypes.
- Never attribute an observed allele to a specific chromosome copy unless phase
  is established.

## Roles

- Clinician view is the default (dense, evidence-forward, triage-first). Patient
  view is the secondary, simplified layer: plain language, no raw variant
  tables or provenance, high-impact findings point to "discuss with your
  provider or a genetic counselor".
