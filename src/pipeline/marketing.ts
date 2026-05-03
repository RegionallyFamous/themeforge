/**
 * Phase 8 stage: marketing copy.
 *
 * Asks the LLM for the marketplace-listing assets every theme bundle
 * ships with: headline, long description, feature list, audience
 * statement, per-variation one-liners, demo-store concept, and a
 * screenshots brief. The bundler's `marketing/` directory is generated
 * from this single payload.
 */

import { z } from "zod";
import type { LLM } from "./llm.js";
import type { EnrichedBrandSpec, TemplateId, TemplatePlan } from "./types.js";

// ── Schema ──────────────────────────────────────────────────────────────

export const VARIATION_SLUGS = ["light", "dark", "editorial", "playful", "mono"] as const;
export type VariationSlugLiteral = (typeof VARIATION_SLUGS)[number];

const SCREENSHOT_PAGES = [
  "homepage",
  "single-product",
  "archive-product",
  "page",
  "cart",
  "checkout",
] as const;

export const MarketingAssetsSchema = z
  .object({
    headline: z
      .string()
      .min(20)
      .max(120)
      .describe("One-sentence positioning. Names the niche and the visual personality."),

    description: z
      .string()
      .min(200)
      .max(800)
      .describe(
        "2–3 paragraphs. What the buyer gets, in their language. Not a feature list — that's a separate field.",
      ),

    features: z
      .array(z.string().min(15).max(160))
      .min(5)
      .max(12)
      .describe("Outcomes the buyer can claim. Each line is a single bullet."),

    built_for: z
      .string()
      .min(40)
      .max(280)
      .describe("Who this theme is for. Specific niches and use cases, not personas."),

    variations: z
      .array(
        z.object({
          slug: z.enum(VARIATION_SLUGS),
          branded_title: z.string().min(2).max(40),
          one_liner: z.string().min(10).max(120),
        }),
      )
      .length(VARIATION_SLUGS.length),

    demo_store_concept: z
      .string()
      .min(100)
      .max(600)
      .describe(
        "One paragraph describing what a demo site for this theme would showcase. Specific products, sections, and copy hooks — enough that someone could build the demo from it.",
      ),

    screenshots_brief: z
      .array(
        z.object({
          page: z.enum(SCREENSHOT_PAGES),
          width: z.number().int().min(360).max(2560),
          notes: z.string().min(20).max(240),
        }),
      )
      .min(3)
      .max(10)
      .describe(
        "3–10 screenshots that together tell the buying story. Always include at least one homepage at 1440 and at least one viewport ≤768.",
      ),
  })
  .superRefine((assets, ctx) => {
    // Variation slugs must cover the canonical five exactly once.
    const seen = new Set<string>();
    for (const v of assets.variations) {
      if (seen.has(v.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variations"],
          message: `variation slug "${v.slug}" appears more than once`,
        });
      }
      seen.add(v.slug);
    }
    for (const required of VARIATION_SLUGS) {
      if (!seen.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variations"],
          message: `variation slug "${required}" is missing from variations`,
        });
      }
    }
    // Screenshot brief must include a homepage shot at desktop width.
    const hasDesktopHomepage = assets.screenshots_brief.some(
      (s) => s.page === "homepage" && s.width >= 1280,
    );
    if (!hasDesktopHomepage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["screenshots_brief"],
        message: "screenshots_brief must include at least one homepage at width >= 1280",
      });
    }
    // …and at least one mobile-ish viewport.
    const hasMobile = assets.screenshots_brief.some((s) => s.width <= 768);
    if (!hasMobile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["screenshots_brief"],
        message: "screenshots_brief must include at least one shot at width <= 768",
      });
    }
  });

export type MarketingAssets = z.infer<typeof MarketingAssetsSchema>;

// ── Prompts ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are writing the marketplace-listing copy for a polished WooCommerce block theme. The buyer is a small-business owner shopping for a theme on a marketplace (ThemeForest, Mojo, the operator's own site). They will read your copy in 30 seconds and decide.

You receive:
  - the brand spec (with derived voice directives — same rules as the customizer)
  - the list of style variations (slug + branded title)
  - the list of templates with the patterns picked for each

Emit one MarketingAssets payload via the \`emit\` tool. The schema enforces lengths and structure; stay inside the limits from the start.

Tone rules:
  - Specific over generic. The niche should feel present without keyword-stuffing the brand name.
  - Outcomes for the buyer, not internals of the theme. "Newsletter signup wired up" — not "core/group with constrained layout".
  - Variation one-liners: 5–10 words each, evocative not technical. Match the variation's branded title.
  - demo_store_concept: a single paragraph — what would a demo site for this theme actually show? Specific products, hero copy, sections to include. Concrete enough that someone could build it from your description.
  - screenshots_brief: 3–6 shots that together tell the buying story. At minimum: one homepage at 1440, one homepage or product page at 360, one product detail page. For each, name what should be visible (hero copy, product grid count, signup banner, etc.).

Do not narrate. Emit the tool call.`;

function buildUserPrompt(
  spec: EnrichedBrandSpec,
  plan: TemplatePlan,
  variations: Array<{ slug: VariationSlugLiteral; branded_title: string }>,
): string {
  const planSummary = Object.entries(plan.templates)
    .map(([tpl, instances]) => {
      const ids = (instances ?? []).map((i) => i.pattern_id).join(", ");
      return `  - ${tpl}: [${ids}]`;
    })
    .join("\n");

  const variationsSummary = variations
    .map((v) => `  - ${v.slug} → "${v.branded_title}"`)
    .join("\n");

  return [
    `Brand spec:`,
    "",
    JSON.stringify(spec, null, 2),
    "",
    `Templates and their pattern picks:`,
    planSummary || "  (none)",
    "",
    `Style variations (slug → branded title):`,
    variationsSummary,
    "",
    `Footer pattern: ${plan.parts.footer}`,
    "",
    "Emit the marketing assets via the `emit` tool.",
  ].join("\n");
}

// ── Public stage ────────────────────────────────────────────────────────

export interface MarketingDeps {
  spec: EnrichedBrandSpec;
  plan: TemplatePlan;
  variations: Array<{ slug: VariationSlugLiteral; branded_title: string }>;
}

export async function generateMarketing(
  deps: MarketingDeps,
  llm: LLM,
): Promise<MarketingAssets> {
  return llm.call({
    stage: "marketing",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(deps.spec, deps.plan, deps.variations),
    schema: MarketingAssetsSchema,
    toolDescription: "Emit the marketplace-listing assets for this theme.",
  });
}

// Exposed for tests and prompt-debugging.
export const __testing = { SYSTEM_PROMPT, buildUserPrompt };

// Re-export for downstream typing; avoids a circular import in the
// renderer.
export type { TemplateId };
