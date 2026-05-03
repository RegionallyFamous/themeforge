/**
 * Phase 5 stage: EnrichedBrandSpec + PatternDef + context → CustomizedPattern.
 *
 * For each pattern instance the planner picked, we ask the LLM to fill
 * in every slot. The tool input schema is **constructed per-pattern**
 * from the slot definitions so the model can only emit shapes the
 * downstream serializer actually understands.
 *
 * Re-validation through zod is defense-in-depth: Claude's server-side
 * tool input checks miss things like max_chars, hex pattern shape, and
 * repeater item discriminators.
 */

import { z } from "zod";
import type { LLM } from "./llm.js";
import type {
  CustomizedPattern,
  EnrichedBrandSpec,
  PatternDef,
  PatternSlotInTemplate,
  SlotDef,
} from "./types.js";

// ── Per-slot schema construction ────────────────────────────────────────

const URL_PATTERN = /^(?:\/|https?:\/\/)/;

function slotResolutionSchema(def: SlotDef): z.ZodTypeAny {
  switch (def.type) {
    case "text":
      return z.object({
        type: z.literal("text"),
        value: z.string().min(1).max(def.max_chars),
      });
    case "url":
      return z.object({
        type: z.literal("url"),
        value: z.string().regex(URL_PATTERN, "Must be a relative path or absolute URL."),
      });
    case "image_role":
      return z.object({
        type: z.literal("image_role"),
        role: z.literal(def.role),
        aspect: z.literal(def.aspect),
        alt: z.string().min(1).max(140),
      });
    case "link":
      return z.object({
        type: z.literal("link"),
        label: z.string().min(1).max(80),
        url: z.string().regex(URL_PATTERN, "Must be a relative path or absolute URL."),
      });
    case "enum":
      return z.object({
        type: z.literal("enum"),
        value: z.enum(def.options as [string, ...string[]]),
      });
    case "repeater": {
      const itemFields: Record<string, z.ZodTypeAny> = {};
      for (const [key, sub] of Object.entries(def.items)) {
        itemFields[key] = slotResolutionSchema(sub);
      }
      return z.object({
        type: z.literal("repeater"),
        items: z.array(z.object(itemFields)).min(def.min).max(def.max),
      });
    }
  }
}

export function buildResolutionSchema(pattern: PatternDef): z.ZodTypeAny {
  const fields: Record<string, z.ZodTypeAny> = {};
  for (const [slotId, def] of Object.entries(pattern.slots)) {
    fields[slotId] = slotResolutionSchema(def);
  }
  return z.object({ resolutions: z.object(fields) });
}

// ── Pattern summary for the prompt ──────────────────────────────────────

export function describeSlots(pattern: PatternDef): string {
  const lines: string[] = [];
  for (const [id, def] of Object.entries(pattern.slots)) {
    lines.push(`  - ${id}: ${describeSlot(def)}`);
  }
  return lines.join("\n");
}

function describeSlot(def: SlotDef): string {
  switch (def.type) {
    case "text":
      return `text (max ${def.max_chars} chars, tone: ${def.tone})`;
    case "url":
      return `url${def.default ? ` (default: ${def.default})` : ""}`;
    case "image_role":
      return `image_role (role: ${def.role}, aspect: ${def.aspect}) — supply only the alt text`;
    case "link":
      return `link (label + url)`;
    case "enum":
      return `enum (one of: ${def.options.join(", ")})`;
    case "repeater":
      return `repeater (${def.min}–${def.max} items, each with: ${Object.keys(def.items).join(", ")})`;
  }
}

// ── Prompts ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a copywriter filling in the slots of a hand-designed page section.

You will receive:
  - the brand spec (with derived copy directives — these are non-negotiable voice rules)
  - the pattern definition (id, name, description, slot list with constraints)
  - the template + position context (where this section lives)

You must emit a \`resolutions\` map via the \`emit\` tool, one entry per slot. The tool's input schema is constructed from the slot definitions — it will reject anything that doesn't fit (length limits, hex pattern, repeater item count). Stay inside the constraints from the start; don't waste a retry.

Copy that lands:
  - Specific over generic. Use sample_product_categories / sample_product_names from the spec when a slot needs example product or category names.
  - Verbs over adjectives.
  - Match the tone hint on each text slot (\`hero\`, \`supporting\`, \`cta\`, \`microcopy\`, \`body\`).
  - Stay inside max_chars — these are *visual* limits, not soft suggestions. Headlines that exceed them break the layout.
  - For image_role slots: write only the alt text. The src/role/aspect are predetermined.
  - For url slots: use the supplied default if it fits the section; otherwise pick a reasonable site-relative path (\`/shop\`, \`/about\`, \`/products/...\`).
  - For repeaters: produce exactly the count you can populate well; don't pad to the max.

Do not narrate. Emit one tool call.`;

function buildUserPrompt(
  spec: EnrichedBrandSpec,
  pattern: PatternDef,
  context: PatternSlotInTemplate["context"],
): string {
  return [
    `Brand spec (with derived directives):`,
    "",
    JSON.stringify(spec, null, 2),
    "",
    `Pattern: ${pattern.id} — ${pattern.name}`,
    `Description: ${pattern.description}`,
    `Slots:`,
    describeSlots(pattern),
    "",
    `Template context: position ${context.position} in \`${context.template}\`.`,
    "",
    "Emit `resolutions` via the `emit` tool now.",
  ].join("\n");
}

// ── Public stage ────────────────────────────────────────────────────────

export async function customizePattern(
  spec: EnrichedBrandSpec,
  pattern: PatternDef,
  context: PatternSlotInTemplate["context"],
  llm: LLM,
): Promise<CustomizedPattern> {
  const schema = buildResolutionSchema(pattern);
  const result = (await llm.call({
    stage: "pattern-customizer",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(spec, pattern, context),
    schema,
    toolDescription: `Emit slot resolutions for the "${pattern.id}" pattern in the "${context.template}" template.`,
  })) as { resolutions: CustomizedPattern["resolutions"] };

  return { pattern_id: pattern.id, resolutions: result.resolutions };
}

// Exposed for tests and prompt-debugging.
export const __testing = { SYSTEM_PROMPT, buildUserPrompt };
