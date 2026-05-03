/**
 * Deterministic theme.json builder.
 *
 * Takes a typed `ThemeTokens` (the LLM-produced or hand-authored token
 * set) and emits a WordPress theme.json document. No I/O, no network,
 * no LLM. Phase 4's theme-json-generator produces the `ThemeTokens`
 * input; this file is what turns those tokens into the file WP reads.
 */

import type { ThemeTokens } from "../pipeline/types.js";
import { fontFaceForFamily } from "./bunny-fonts.js";

const SCHEMA_URL = "https://schemas.wp.org/trunk/theme.json";

export interface FontFaceEntry {
  fontFamily: string;
  fontWeight: string;
  fontStyle: "normal" | "italic";
  src: string[];
}

export interface FontFamilyEntry {
  name: string;
  slug: string;
  fontFamily: string;
  fontFace?: FontFaceEntry[];
}

export interface FontSizeEntry {
  slug: string;
  size: string;
  name: string;
  fluid?: boolean;
}

export interface SpacingSizeEntry {
  name: string;
  slug: string;
  size: string;
}

export interface PaletteEntry {
  name: string;
  slug: string;
  color: string;
}

export interface ThemeJson {
  $schema: string;
  version: 3;
  settings: {
    appearanceTools: true;
    layout: { contentSize: string; wideSize: string };
    color: {
      palette: PaletteEntry[];
      custom: false;
      defaultPalette: false;
      defaultGradients: false;
    };
    typography: {
      fontFamilies: FontFamilyEntry[];
      fontSizes: FontSizeEntry[];
      fluid: true;
      lineHeight: true;
      letterSpacing: true;
    };
    spacing: {
      spacingScale: { operator: "*"; increment: number; steps: number; mediumStep: number; unit: "rem" };
      spacingSizes: SpacingSizeEntry[];
      units: string[];
    };
    border: { color: true; radius: true; style: true; width: true };
  };
  styles: {
    color: { background: string; text: string };
    typography: { fontFamily: string; fontSize: string; lineHeight: string };
    spacing: { blockGap: string };
  };
  templateParts: Array<{ name: string; title: string; area: string }>;
}

const FONT_SIZE_SLUGS = ["small", "medium", "large", "x-large", "huge"] as const;
type FontSizeSlug = (typeof FONT_SIZE_SLUGS)[number];

const DENSITY: Record<
  ThemeTokens["density"],
  { blockGap: string; fluidLift: number }
> = {
  airy:     { blockGap: "1.5rem",  fluidLift: 1.5 },
  balanced: { blockGap: "1.25rem", fluidLift: 1.2 },
  dense:    { blockGap: "1rem",    fluidLift: 1.0 },
};

export function buildThemeJson(tokens: ThemeTokens): ThemeJson {
  return {
    $schema: SCHEMA_URL,
    version: 3,
    settings: {
      appearanceTools: true,
      layout: {
        contentSize: tokens.spacing.contentMaxWidth,
        wideSize: tokens.spacing.wideMaxWidth,
      },
      color: {
        palette: tokens.palette.map((c) => ({ name: c.name, slug: c.slug, color: c.color })),
        custom: false,
        defaultPalette: false,
        defaultGradients: false,
      },
      typography: {
        fontFamilies: [
          buildFontFamily(tokens.typography.heading.fontFamily, "heading"),
          buildFontFamily(tokens.typography.body.fontFamily, "body"),
        ],
        fontSizes: buildFontSizes(tokens),
        fluid: true,
        lineHeight: true,
        letterSpacing: true,
      },
      spacing: {
        spacingScale: { operator: "*", increment: 1.5, steps: 7, mediumStep: 1.5, unit: "rem" },
        spacingSizes: [
          { name: "Tight",   slug: "20",      size: "0.75rem" },
          { name: "Snug",    slug: "30",      size: "1.25rem" },
          { name: "Cozy",    slug: "40",      size: "2rem" },
          { name: "Roomy",   slug: "50",      size: "3.25rem" },
          { name: "Section", slug: "section", size: tokens.spacing.sectionY },
        ],
        units: ["px", "em", "rem", "%", "vh", "vw"],
      },
      border: { color: true, radius: true, style: true, width: true },
    },
    styles: {
      color: {
        background: `var(--wp--preset--color--${slugOrDefault(tokens.palette, "background")})`,
        text:       `var(--wp--preset--color--${slugOrDefault(tokens.palette, "foreground")})`,
      },
      typography: {
        fontFamily: "var(--wp--preset--font-family--body)",
        fontSize:   "var(--wp--preset--font-size--medium)",
        lineHeight: tokens.typography.body.lineHeight,
      },
      spacing: { blockGap: DENSITY[tokens.density].blockGap },
    },
    templateParts: [
      { name: "header", title: "Header", area: "header" },
      { name: "footer", title: "Footer", area: "footer" },
    ],
  };
}

function buildFontFamily(stack: string, slug: "heading" | "body"): FontFamilyEntry {
  const entry: FontFamilyEntry = {
    name: firstFamilyName(stack),
    slug,
    fontFamily: stack,
  };
  // Auto-attach @font-face declarations sourced from Bunny Fonts so the
  // brand's chosen typography actually loads (rather than falling back
  // to the system stack). Returns undefined for commercial / unknown
  // families — the operator can drop licensed files in later.
  const faces = fontFaceForFamily(entry);
  if (faces && faces.length > 0) entry.fontFace = faces;
  return entry;
}

function firstFamilyName(stack: string): string {
  const first = stack.split(",")[0]?.trim() ?? stack;
  return first.replace(/^["']|["']$/g, "");
}

function slugOrDefault(palette: ThemeTokens["palette"], slug: string): string {
  return palette.some((c) => c.slug === slug) ? slug : (palette[0]?.slug ?? slug);
}

/**
 * Map the abstract `fluidScale` (a ramp of base sizes in rem) onto WP's
 * five named font sizes. The first two sizes are non-fluid (used heavily
 * for body copy where `clamp()` would be visually noisy at small sizes).
 * Everything from `large` upward becomes a fluid clamp whose breadth is
 * tuned by the brand's density.
 */
function buildFontSizes(tokens: ThemeTokens): FontSizeEntry[] {
  const lift = DENSITY[tokens.density].fluidLift;
  const ramp = tokens.typography.fluidScale.slice(0, FONT_SIZE_SLUGS.length);
  const out: FontSizeEntry[] = [];
  ramp.forEach((base, i) => {
    const slug = FONT_SIZE_SLUGS[i] as FontSizeSlug;
    const name = friendlyName(slug);
    if (i < 2) {
      out.push({ slug, size: `${stripTrailingZero(base)}rem`, name, fluid: false });
      return;
    }
    const min = base * 0.78;
    const vw = (base - min) * lift;
    const linear = min - 0.15;
    out.push({
      slug,
      size: `clamp(${stripTrailingZero(min)}rem, ${stripTrailingZero(linear)}rem + ${stripTrailingZero(vw)}vw, ${stripTrailingZero(base)}rem)`,
      name,
    });
  });
  return out;
}

function friendlyName(slug: string): string {
  return slug
    .split("-")
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join("-");
}

function stripTrailingZero(n: number): string {
  // Two-decimal-place rendering with trailing zero collapse: "1.50" → "1.5",
  // "1.00" → "1". Keeps the emitted CSS compact and stable.
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, "") || "0";
}
