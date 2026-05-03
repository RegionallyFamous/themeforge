/**
 * Centralized pipeline configuration.
 *
 * Models and per-stage temperatures live here so changes are one-stop —
 * no hunting through individual stage files. Pinning the model is part
 * of the LLM call discipline (see `docs/architecture.md`).
 */

// Opus 4.7 across every stage. The pipeline produces a single
// sellable artifact per run — the upgrade in design judgment over
// Sonnet is worth the per-stage cost. Override via `LLMConfig.model`
// when iterating patterns or running cost-sensitive batches.
export const DEFAULT_MODEL = "claude-opus-4-7";

export type StageId =
  | "brand-interpreter"
  | "theme-json-generator"
  | "template-planner"
  | "pattern-customizer"
  | "marketing";

/**
 * Per-stage temperatures. The interpreter and theme-json generator are
 * low-temp because we want consistent token derivations from the same
 * spec; the planner is mid; the customizer (which writes prose) gets the
 * widest range to keep copy from sounding mechanical.
 */
export const STAGE_TEMPERATURES: Record<StageId, number> = {
  "brand-interpreter":     0.3,
  "theme-json-generator":  0.2,
  "template-planner":      0.4,
  "pattern-customizer":    0.6,
  "marketing":             0.5,
};

export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_MAX_RETRIES = 2;
