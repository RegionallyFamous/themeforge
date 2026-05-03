/**
 * Phase 4 stage: brand spec → ThemeTokens.
 *
 * Calls the LLM with a tool-use schema constrained to `ThemeTokens`.
 * The result is fed into the Phase 1 deterministic `buildThemeJson`
 * builder. The LLM never produces theme.json directly — it produces a
 * typed token set, and the deterministic builder turns those tokens
 * into the WordPress file.
 */

import { z } from "zod";
import type { BrandSpec } from "../brand-spec/schema.js";
import type { ThemeTokens } from "./types.js";
import type { LLM } from "./llm.js";

// ── Schema ──────────────────────────────────────────────────────────────

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color.");
const SlugPattern = z.string().regex(/^[a-z0-9-]+$/, "Must be lowercase kebab-case.");
const SizeUnit = z
  .string()
  .regex(/^(\d+(?:\.\d+)?(?:px|rem|em|%)|clamp\([^)]+\))$/, "Must be a CSS length or clamp().");
const Density = z.enum(["airy", "balanced", "dense"]);

const REQUIRED_PALETTE_SLUGS = ["background", "foreground", "primary"] as const;

export const ThemeTokensSchema = z
  .object({
    palette: z
      .array(
        z.object({
          name: z.string().min(1).max(40),
          slug: SlugPattern,
          color: HexColor,
        }),
      )
      .min(3)
      .max(8),

    typography: z.object({
      body: z.object({
        fontFamily: z.string().min(1).max(200),
        fontSize: SizeUnit,
        lineHeight: z.string().min(1).max(8),
      }),
      heading: z.object({
        fontFamily: z.string().min(1).max(200),
        fontWeight: z.string().min(1).max(8),
        lineHeight: z.string().min(1).max(8),
      }),
      fluidScale: z.array(z.number().positive().max(8)).length(5),
    }),

    spacing: z.object({
      sectionY: SizeUnit,
      contentMaxWidth: SizeUnit,
      wideMaxWidth: SizeUnit,
    }),

    radius: z.object({
      sm: z.string().min(1),
      md: z.string().min(1),
      lg: z.string().min(1),
    }),

    density: Density,
  })
  .superRefine((tokens, ctx) => {
    // Palette must cover the slugs the rest of the pipeline keys off.
    const slugs = new Set(tokens.palette.map((c) => c.slug));
    for (const required of REQUIRED_PALETTE_SLUGS) {
      if (!slugs.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["palette"],
          message: `palette must include a "${required}" slug`,
        });
      }
    }
    // Slugs must be unique.
    if (slugs.size !== tokens.palette.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["palette"],
        message: "palette slugs must be unique",
      });
    }
    // Fluid scale must be strictly increasing.
    const ramp = tokens.typography.fluidScale;
    for (let i = 1; i < ramp.length; i++) {
      if (ramp[i]! <= ramp[i - 1]!) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["typography", "fluidScale", i],
          message: "fluidScale must be strictly increasing",
        });
        break;
      }
    }
  });

// `ThemeTokens` from `types.ts` is the pipeline-internal shape; this
// schema is its runtime validator. They must agree, so we cast at the
// boundary rather than re-deriving the TS type.
export type ValidatedThemeTokens = z.infer<typeof ThemeTokensSchema> & ThemeTokens;

// ── Prompts ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior visual designer producing the design tokens for a WooCommerce block theme. Given a brand spec, you emit a single ThemeTokens object via the \`emit\` tool. The downstream builder turns those tokens into a WordPress theme.json — your job is the design judgment, not the WordPress format.

Token rules (enforced by validation; the tool will reject invalid input):

- palette: 6 entries with kebab-case slugs. Must include background, foreground, primary. Strongly prefer also including: background-alt (a softer surface), muted (low-contrast text), accent (a single high-contrast pop). Use the brand spec's palette colors as the source — assign them to slugs deliberately, do not invent random hexes.
- typography.body / typography.heading: pick CSS font-family stacks that reflect the brand's typography pairing. Always include system fallbacks ("system-ui, -apple-system, ..." for sans; "Iowan Old Style, Georgia, ..." for serif). Use the brand spec's headline_font / body_font as the primary family if provided.
- typography.fluidScale: an array of 5 base sizes in rem, strictly increasing. Maps to small / medium / large / x-large / huge. Typical ranges: small ~0.85, medium ~1.0–1.1, large ~1.25–1.5, x-large ~1.75–2.5, huge ~2.5–4.0. Heavier brands run higher; minimal brands stay tighter.
- spacing.sectionY: a clamp() expression for top/bottom section padding. Should breathe — denser brands tighter, airier brands looser.
- spacing.contentMaxWidth / wideMaxWidth: pixel widths. Editorial / lux brands prefer narrower content (~640–720px) and wider wide (~1240–1320px). Sport / playful brands often run wider content.
- radius: small/medium/large border radii. Heritage / lux / editorial: usually 0px. Playful / coastal / sport: 4–16px.
- density: copy directly from the brand spec.

You receive a single brand spec as JSON. Emit one ThemeTokens via the tool. Do not narrate.`;

function buildUserPrompt(spec: BrandSpec): string {
  return `Brand spec:\n\n${JSON.stringify(spec, null, 2)}\n\nEmit the ThemeTokens via the \`emit\` tool now.`;
}

// ── Public stage ────────────────────────────────────────────────────────

export async function generateThemeTokens(
  brandSpec: BrandSpec,
  llm: LLM,
): Promise<ValidatedThemeTokens> {
  return llm.call({
    stage: "theme-json-generator",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(brandSpec),
    schema: ThemeTokensSchema,
    toolDescription: "Emit the validated ThemeTokens for this brand spec.",
  }) as Promise<ValidatedThemeTokens>;
}

// Exposed for tests and prompt-debugging.
export const __testing = { SYSTEM_PROMPT, buildUserPrompt };
