/**
 * Phase 5 stage: BrandSpec → EnrichedBrandSpec.
 *
 * Asks the LLM for three derived artifacts the downstream stages need:
 *   - copy_directives: 3–8 voice rules the customizer should follow
 *   - sample_product_categories: 3–8 niche-appropriate category names
 *   - sample_product_names: 5–15 niche-appropriate product names
 *
 * The enriched spec is the only thing the customizer ever sees, so the
 * directives have to be specific enough to drive concrete copy choices.
 */

import { z } from "zod";
import type { BrandSpec } from "../brand-spec/schema.js";
import type { LLM } from "./llm.js";
import type { EnrichedBrandSpec } from "./types.js";

// ── Schema for the LLM tool input ───────────────────────────────────────

export const DerivedSchema = z.object({
  copy_directives: z
    .array(z.string().min(8).max(240))
    .min(3)
    .max(8)
    .describe(
      "Specific voice/tone rules the customizer should follow. Reference the niche, the brand voice sliders, and the audience. Avoid generic advice (e.g. \"be friendly\").",
    ),
  sample_product_categories: z
    .array(z.string().min(2).max(60))
    .min(3)
    .max(8)
    .describe("Plausible product category names a real store in this niche would use."),
  sample_product_names: z
    .array(z.string().min(2).max(80))
    .min(5)
    .max(15)
    .describe(
      "Plausible product names a real store in this niche would sell. Specific (region, variety, edition), not generic.",
    ),
});

export type Derived = z.infer<typeof DerivedSchema>;

// ── Prompts ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a brand strategist preparing a concrete brief for a downstream copywriter LLM that will fill in slot text inside hand-designed page patterns.

You receive a brand spec. You emit three derived lists via the \`emit\` tool:

1. copy_directives — 3 to 8 voice/tone rules. These get pasted into every customizer prompt. Be specific to the niche, voice sliders, and audience. Bad: "Be friendly." Good: "Use 'roast' as a verb whenever describing the product." Bad: "Sound premium." Good: "Lean on origin (country, farm, varietal) over adjectives."

2. sample_product_categories — 3 to 8 plausible category names a real store in this niche would put in its nav. They will appear inside category-card patterns where the operator hasn't supplied real categories.

3. sample_product_names — 5 to 15 plausible product names. Specific. A coffee roaster has "Yirgacheffe Konga Natural", not "Light Roast". A candle maker has "Tobacco & Vetiver", not "Scented Candle".

Do not narrate. Emit the tool call.`;

function buildUserPrompt(spec: BrandSpec): string {
  return `Brand spec:\n\n${JSON.stringify(spec, null, 2)}\n\nEmit derived lists via the \`emit\` tool.`;
}

// ── Public stage ────────────────────────────────────────────────────────

export async function interpretBrand(spec: BrandSpec, llm: LLM): Promise<EnrichedBrandSpec> {
  const derived = await llm.call({
    stage: "brand-interpreter",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(spec),
    schema: DerivedSchema,
    toolDescription: "Emit copy directives, sample categories, and sample product names.",
  });
  return { ...spec, derived };
}

// Exposed for tests and prompt-debugging.
export const __testing = { SYSTEM_PROMPT, buildUserPrompt };
