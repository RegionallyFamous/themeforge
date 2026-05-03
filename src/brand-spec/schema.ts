/**
 * Zod schema for BrandSpec. Mirrors `schemas/brand-spec.schema.json`.
 *
 * Both must stay in sync. The JSON schema is the canonical published
 * artifact; this file is the runtime validator the pipeline uses.
 *
 * If you change one, change the other. There's a test in
 * `schema.test.ts` that ensures they accept the same documents.
 */

import { z } from "zod";

export const MoodArchetype = z.enum([
  "apothecary",
  "editorial",
  "brutalist",
  "botanical",
  "heritage",
  "nordic",
  "playful",
  "y2k",
  "sport",
  "lux-mono",
  "coastal",
  "sci",
]);
export type MoodArchetype = z.infer<typeof MoodArchetype>;

export const TypographyPairing = z.enum([
  "modern_sans",
  "elegant_serif",
  "editorial_mix",
  "industrial",
  "humanist",
  "surprise_me",
]);
export type TypographyPairing = z.infer<typeof TypographyPairing>;

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color.");

export const BrandSpecSchema = z.object({
  version: z.literal(1),

  store: z.object({
    name:        z.string().min(1).max(60),
    tagline:     z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    niche:       z.string().min(1).max(60),
  }),

  voice: z.object({
    formality:   z.number().int().min(1).max(5),
    playfulness: z.number().int().min(1).max(5),
    premiumness: z.number().int().min(1).max(5),
  }),

  audience: z.object({
    description: z.string().min(1).max(240),
  }),

  mood: z.object({
    primary:   MoodArchetype,
    secondary: MoodArchetype.optional(),
  }),

  color: z.object({
    source:  z.enum(["palette_card", "hex_input", "logo_extract"]),
    palette: z.array(HexColor).min(3).max(6),
    base:    z.enum(["light", "dark"]),
  }),

  typography: z.object({
    pairing:        TypographyPairing,
    headline_font:  z.string().optional(),
    body_font:      z.string().optional(),
  }),

  density: z.enum(["airy", "balanced", "dense"]),

  references: z
    .array(
      z.object({
        url:   z.string().url(),
        notes: z.string().max(240).optional(),
      })
    )
    .max(3)
    .optional()
    .default([]),

  locale: z
    .string()
    .regex(/^[a-z]{2}_[A-Z]{2}$/)
    .default("en_US"),
});

export type BrandSpec = z.infer<typeof BrandSpecSchema>;
