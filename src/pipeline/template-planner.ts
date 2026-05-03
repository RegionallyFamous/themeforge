/**
 * Phase 5 stage: EnrichedBrandSpec + PatternLibrary → TemplatePlan.
 *
 * Picks an ordered list of pattern IDs per template (and one footer
 * pattern) from the available library. The model only sees the patterns
 * that are valid for each surface — we filter the catalog on the way in
 * so it doesn't have to learn the compatibility rules.
 *
 * Validation enforces:
 *  - every picked pattern id exists in the library
 *  - every picked pattern is `compatible_templates`-tagged for the
 *    template it was assigned to
 *  - no pattern is repeated within a single template
 *  - the footer pattern has `category === "footer"`
 *
 * Cart, checkout, and 404 are out of scope here. The bundler in Phase 6
 * uses fixed scaffolds for those.
 */

import { z } from "zod";
import type { LLM } from "./llm.js";
import type { PatternLibrary } from "../pattern-library/loader.js";
import type {
  EnrichedBrandSpec,
  PatternDef,
  PatternSlotInTemplate,
  TemplateId,
  TemplatePlan,
} from "./types.js";

// ── Templates the planner is responsible for ────────────────────────────

export const PLANNABLE_TEMPLATES: TemplateId[] = [
  "index",
  "single-product",
  "archive-product",
  "page",
];

// ── Schema (built per-library so refinements know what's installed) ─────

interface PlannerSchema {
  schema: z.ZodTypeAny;
  /** Patterns indexed by id for downstream validation/use. */
  byId: Map<string, PatternDef>;
}

export function buildPlannerSchema(library: PatternLibrary): PlannerSchema {
  const byId = new Map<string, PatternDef>();
  for (const { pattern } of library.values()) byId.set(pattern.id, pattern);

  const knownIds = [...byId.keys()];
  const footerIds = knownIds.filter((id) => byId.get(id)?.category === "footer");
  const headerIds = knownIds.filter((id) => byId.get(id)?.category === "header");

  if (footerIds.length === 0) {
    throw new Error("template-planner: pattern library has no footer pattern");
  }

  // Build per-template enums of valid pattern IDs to give Claude the
  // tightest possible schema. Falls back to a plain string if a template
  // somehow has no valid patterns (model will fail validation, retry).
  const templatesShape: Record<string, z.ZodTypeAny> = {};
  for (const tpl of PLANNABLE_TEMPLATES) {
    const valid = knownIds.filter((id) => byId.get(id)!.compatible_templates.includes(tpl));
    const elem = valid.length > 0 ? z.enum(valid as [string, ...string[]]) : z.string();
    templatesShape[tpl] = z.array(elem).min(1).max(8);
  }

  // Header is optional — when no header patterns exist (or the planner
  // declines), the orchestrator falls back to its hardcoded skeleton.
  // When picked, the header-pattern flow mirrors the footer flow:
  // customize → serialize → write as `parts/header.html`.
  const partsShape: Record<string, z.ZodTypeAny> = {
    footer: z.enum(footerIds as [string, ...string[]]),
  };
  if (headerIds.length > 0) {
    partsShape.header = z.enum(headerIds as [string, ...string[]]).optional();
  }

  const schema = z
    .object({
      templates: z.object(templatesShape),
      parts: z.object(partsShape),
    })
    .superRefine((plan, ctx) => {
      // Reject duplicates within a single template — patterns aren't
      // designed to repeat (e.g. two heroes back-to-back is wrong).
      for (const [tpl, ids] of Object.entries(plan.templates)) {
        const seen = new Set<string>();
        for (const id of ids as string[]) {
          if (seen.has(id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["templates", tpl],
              message: `pattern "${id}" appears more than once in ${tpl}`,
            });
          }
          seen.add(id);
        }
      }
    });

  return { schema, byId };
}

// ── Catalog rendering for the prompt ────────────────────────────────────

export function renderCatalog(library: PatternLibrary): string {
  const byId = new Map<string, PatternDef>();
  for (const { pattern } of library.values()) byId.set(pattern.id, pattern);

  const lines: string[] = [];
  for (const tpl of PLANNABLE_TEMPLATES) {
    const matches = [...byId.values()].filter((p) => p.compatible_templates.includes(tpl));
    if (matches.length === 0) continue;
    lines.push(`Patterns valid for \`${tpl}\`:`);
    for (const p of matches) {
      lines.push(`  - ${p.id} (${p.category}) — ${p.description} [moods: ${p.compatible_moods.join(", ")}]`);
    }
    lines.push("");
  }

  const headers = [...byId.values()].filter((p) => p.category === "header");
  if (headers.length > 0) {
    lines.push("Header patterns (parts/header — optional, fall back to a sensible default):");
    for (const p of headers) {
      lines.push(`  - ${p.id} — ${p.description} [moods: ${p.compatible_moods.join(", ")}]`);
    }
    lines.push("");
  }

  const footers = [...byId.values()].filter((p) => p.category === "footer");
  if (footers.length > 0) {
    lines.push("Footer patterns (parts/footer):");
    for (const p of footers) {
      lines.push(`  - ${p.id} — ${p.description} [moods: ${p.compatible_moods.join(", ")}]`);
    }
  }

  return lines.join("\n");
}

// ── Prompts ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an art director picking which hand-designed patterns belong on each template of a WooCommerce block theme. You do not invent patterns — you pick from the catalog supplied in the user message.

Picking guidelines:

- index: lead with a hero, then differentiate the surface with USP, category, product, testimonial, and newsletter sections. Aim for 4–6 patterns.
- single-product: the single-product pattern is mandatory and must be first. Then add value-add chrome (USP, FAQ, testimonial, newsletter) — pick what fits the niche. 2–4 patterns total.
- archive-product: a product grid is mandatory. A newsletter or testimonial below works for many niches. 1–3 patterns.
- page: pick a calmer set — hero, body section, FAQ, newsletter. 2–4 patterns.

Hard constraints (the tool will reject violations):

- Only use pattern IDs from the catalog.
- Only assign a pattern to a template it is compatible with (the catalog already filters to valid options per template).
- No pattern may appear twice within the same template.

Pick by **mood fit**: the brand's primary mood is in the spec. Patterns whose \`compatible_moods\` include that mood read more on-brand. Patterns from a different mood family can still work but should be the minority.

Pick exactly one footer pattern. If a header catalog is provided, also pick a header — match it to the brand's primary mood. Headers are optional in the schema; the orchestrator falls back to a sensible default if you omit it.

Do not narrate. Emit the tool call.`;

function buildUserPrompt(spec: EnrichedBrandSpec, catalog: string): string {
  return `Brand spec:\n\n${JSON.stringify(spec, null, 2)}\n\nCatalog:\n\n${catalog}\n\nEmit the template plan via the \`emit\` tool.`;
}

// ── Public stage ────────────────────────────────────────────────────────

export async function planTemplates(
  spec: EnrichedBrandSpec,
  library: PatternLibrary,
  llm: LLM,
): Promise<TemplatePlan> {
  const { schema, byId } = buildPlannerSchema(library);
  const catalog = renderCatalog(library);

  const raw = (await llm.call({
    stage: "template-planner",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(spec, catalog),
    schema,
    toolDescription: "Emit the template plan: ordered pattern IDs per template, plus a footer (and optionally a header).",
  })) as {
    templates: Record<TemplateId, string[]>;
    parts: { footer: string; header?: string };
  };

  return liftToPlan(raw, byId);
}

function liftToPlan(
  raw: { templates: Record<string, string[]>; parts: { footer: string; header?: string } },
  _byId: Map<string, PatternDef>,
): TemplatePlan {
  const templates: TemplatePlan["templates"] = {};
  for (const [tpl, ids] of Object.entries(raw.templates)) {
    const list: PatternSlotInTemplate[] = ids.map((id, position) => ({
      pattern_id: id,
      context: { template: tpl as TemplateId, position },
    }));
    templates[tpl as TemplateId] = list;
  }
  const parts: TemplatePlan["parts"] = { footer: raw.parts.footer };
  if (raw.parts.header) parts.header = raw.parts.header;
  return { templates, parts };
}

// Exposed for tests and prompt-debugging.
export const __testing = { SYSTEM_PROMPT, buildUserPrompt };
