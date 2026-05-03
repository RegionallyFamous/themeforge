/**
 * Typed boundaries between pipeline stages.
 *
 * Each stage takes a typed input and returns a typed output. LLM stages
 * additionally validate against a zod schema before returning. See
 * `docs/architecture.md` for the full pipeline.
 */

import type { BrandSpec } from "../brand-spec/schema.js";

// ─── Pattern library ──────────────────────────────────────────────────────

export type SlotDef =
  | { type: "text"; max_chars: number; tone: TextTone }
  | { type: "url"; default?: string }
  | { type: "image_role"; role: string; aspect: string }
  | { type: "link" }
  | { type: "enum"; options: string[] }
  | { type: "repeater"; min: number; max: number; items: Record<string, SlotDef> };

export type TextTone = "hero" | "supporting" | "cta" | "microcopy" | "body";

export interface BlockNode {
  name: string;                                  // e.g., "core/group"
  attrs?: Record<string, unknown>;
  innerBlocks?: BlockNode[];
  slot?: string | Record<string, string>;        // slot id or { attr: slotId, ... }
  /**
   * Literal text content embedded directly in the pattern (e.g. an "Shop"
   * column heading in the footer). Mutually exclusive with `slot` for the
   * same role; whichever is present wins.
   */
  content?: string;
  /**
   * Optional cosmetic separator the serializer emits *before* this block
   * within its parent's child list. Use sparingly — only when the hand
   * authoring intent calls for visual grouping (e.g. an intro section
   * separated from a product grid below). Has no effect on parsing.
   */
  gap?: "blank";
}

export interface PatternDef {
  id: string;
  name: string;
  category: string;
  description: string;
  compatible_templates: string[];
  compatible_moods: string[];
  slots: Record<string, SlotDef>;
  theme_tokens: string[];
  tree: BlockNode[];
}

export type SlotResolution =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "image_role"; role: string; aspect: string; alt: string }
  | { type: "link"; label: string; url: string }
  | { type: "enum"; value: string }
  | { type: "repeater"; items: Array<Record<string, SlotResolution>> };

// ─── Theme tokens (theme.json) ────────────────────────────────────────────

export interface ThemeTokens {
  palette: { name: string; slug: string; color: string }[];
  typography: {
    body:     { fontFamily: string; fontSize: string; lineHeight: string };
    heading:  { fontFamily: string; fontWeight: string; lineHeight: string };
    fluidScale: number[];                        // ramp of fluid font sizes
  };
  spacing: {
    sectionY: string;
    contentMaxWidth: string;
    wideMaxWidth: string;
  };
  radius: { sm: string; md: string; lg: string };
  density: BrandSpec["density"];
}

// ─── Pipeline stage I/O ───────────────────────────────────────────────────

export interface EnrichedBrandSpec extends BrandSpec {
  derived: {
    copy_directives: string[];                   // tone/voice notes for the customizer
    sample_product_categories: string[];         // niche-aware categories
    sample_product_names: string[];              // niche-aware product names
  };
}

export interface TemplatePlan {
  /**
   * Pattern instances per template. `Partial` because the bundler uses
   * fixed scaffolds for cart/checkout and a generated 404 — the planner
   * only fills the templates we actually compose from patterns.
   */
  templates: Partial<Record<TemplateId, PatternSlotInTemplate[]>>;
  /** Template parts. Header is optional in Phase 5 (always a placeholder). */
  parts: { header?: string; footer: string };
}

export type TemplateId =
  | "index"
  | "front-page"
  | "single-product"
  | "archive-product"
  | "page-cart"
  | "page-checkout"
  | "page-404"
  | "page";

export interface PatternSlotInTemplate {
  pattern_id: string;
  context: { template: TemplateId; position: number };
}

export interface CustomizedPattern {
  pattern_id: string;
  resolutions: Record<string, SlotResolution>;
}

export interface ThemeBundle {
  slug: string;
  themeJson: unknown;                            // matches WP theme.json schema
  styleVariations: Record<string, unknown>;
  templates: Record<TemplateId, string>;          // rendered block markup
  parts: Record<string, string>;                  // header.html, footer.html
  imageBrief: string;                             // markdown
  marketing: {
    description: string;
    featureList: string[];
    changelog: string;
  };
}
