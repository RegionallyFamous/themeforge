/**
 * Deterministic theme.json builder.
 *
 * Takes a typed `ThemeTokens` (the LLM-produced or hand-authored token
 * set) and emits a WordPress theme.json document targeting the WP 6.7
 * schema. No I/O, no network, no LLM. Everything the LLM produces is a
 * compact set of brand tokens; this file expands those into the full
 * shape WordPress block themes need:
 *
 *   - settings: palette, gradients (derived from palette), shadow
 *     presets, aspect ratios, fluid type ramp, spacing scale, root
 *     padding awareness
 *   - styles: per-element (h1–h6, button + hover + focus, link + hover,
 *     heading shared, caption) + per-block (post-title, site-title,
 *     quote, separator, buttons, navigation, WC product-price) defaults
 *   - styles.spacing.padding root padding tokens
 *
 * The result mirrors what bundled WP themes (Twenty Twenty-Five etc.)
 * emit. A theme without these touches looks like a wireframe; a theme
 * with them looks like a finished product.
 */

import type { ThemeTokens } from "../pipeline/types.js";
import { fontFaceForFamily } from "./bunny-fonts.js";

const SCHEMA_URL = "https://schemas.wp.org/wp/6.7/theme.json";

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

export interface GradientEntry {
  name: string;
  slug: string;
  gradient: string;
}

export interface ShadowEntry {
  name: string;
  slug: string;
  shadow: string;
}

export interface AspectRatioEntry {
  name: string;
  slug: string;
  ratio: string;
}

export interface ThemeJson {
  $schema: string;
  version: 3;
  settings: {
    appearanceTools: true;
    useRootPaddingAwareAlignments: true;
    layout: { contentSize: string; wideSize: string };
    color: {
      palette: PaletteEntry[];
      gradients: GradientEntry[];
      custom: false;
      defaultPalette: false;
      defaultGradients: false;
      defaultDuotone: false;
    };
    typography: {
      fontFamilies: FontFamilyEntry[];
      fontSizes: FontSizeEntry[];
      defaultFontSizes: false;
      fluid: true;
      lineHeight: true;
      letterSpacing: true;
    };
    spacing: {
      spacingScale: { operator: "*"; increment: number; steps: number; mediumStep: number; unit: "rem" };
      spacingSizes: SpacingSizeEntry[];
      defaultSpacingSizes: false;
      units: string[];
      padding: true;
      margin: true;
      blockGap: true;
    };
    border: { color: true; radius: true; style: true; width: true };
    shadow: {
      defaultPresets: false;
      presets: ShadowEntry[];
    };
    dimensions: {
      aspectRatios: AspectRatioEntry[];
      defaultAspectRatios: false;
    };
  };
  styles: {
    color: { background: string; text: string };
    typography: { fontFamily: string; fontSize: string; lineHeight: string };
    spacing: {
      blockGap: string;
      padding: { left: string; right: string };
    };
    elements: Record<string, unknown>;
    blocks: Record<string, unknown>;
    /** Raw CSS injected at theme-json level. Used for micro-interactions
     *  and details that the structured fields can't express (hover
     *  lifts, image zoom, focus rings, sale badge polish). */
    css: string;
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
  const fontSizes = buildFontSizes(tokens);
  const sizeBy = (slug: FontSizeSlug) => `var:preset|font-size|${slug}`;
  const colorBy = (slug: string) => `var:preset|color|${slug}`;
  const spaceBy = (slug: string) => `var:preset|spacing|${slug}`;

  const headingFamily = `var:preset|font-family|heading`;
  const bodyFamily = `var:preset|font-family|body`;
  const headingWeight = tokens.typography.heading.fontWeight;
  const headingLineHeight = tokens.typography.heading.lineHeight;

  return {
    $schema: SCHEMA_URL,
    version: 3,
    settings: {
      appearanceTools: true,
      useRootPaddingAwareAlignments: true,
      layout: {
        contentSize: tokens.spacing.contentMaxWidth,
        wideSize: tokens.spacing.wideMaxWidth,
      },
      color: {
        palette: tokens.palette.map((c) => ({ name: c.name, slug: c.slug, color: c.color })),
        gradients: buildGradients(tokens),
        custom: false,
        defaultPalette: false,
        defaultGradients: false,
        defaultDuotone: false,
      },
      typography: {
        fontFamilies: [
          buildFontFamily(tokens.typography.heading.fontFamily, "heading"),
          buildFontFamily(tokens.typography.body.fontFamily, "body"),
        ],
        fontSizes,
        defaultFontSizes: false,
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
        defaultSpacingSizes: false,
        units: ["px", "em", "rem", "%", "vh", "vw"],
        padding: true,
        margin: true,
        blockGap: true,
      },
      border: { color: true, radius: true, style: true, width: true },
      shadow: {
        defaultPresets: false,
        presets: buildShadows(tokens),
      },
      dimensions: {
        aspectRatios: [
          { name: "Square",     slug: "square",     ratio: "1" },
          { name: "Portrait",   slug: "portrait",   ratio: "3/4" },
          { name: "Tall",       slug: "tall",       ratio: "4/5" },
          { name: "Vertical",   slug: "vertical",   ratio: "9/16" },
          { name: "Landscape",  slug: "landscape",  ratio: "4/3" },
          { name: "Wide",       slug: "wide",       ratio: "16/9" },
          { name: "Cinematic",  slug: "cinematic",  ratio: "21/9" },
        ],
        defaultAspectRatios: false,
      },
    },
    styles: {
      color: {
        background: colorBy(slugOrDefault(tokens.palette, "background")),
        text:       colorBy(slugOrDefault(tokens.palette, "foreground")),
      },
      typography: {
        fontFamily: bodyFamily,
        fontSize:   sizeBy("medium"),
        lineHeight: tokens.typography.body.lineHeight,
      },
      spacing: {
        blockGap: DENSITY[tokens.density].blockGap,
        // Root padding — every alignfull/wide section breathes consistently
        // at the page edges. Pairs with useRootPaddingAwareAlignments.
        padding: { left: spaceBy("40"), right: spaceBy("40") },
      },
      elements: {
        // Per-heading sizing pulled from the fluid scale. Each level
        // gets a distinct presence — h1 huge, h2 x-large, h3 large,
        // h4–h6 progressively tighter. Without this, every heading just
        // uses the WP default and the type system reads as undifferentiated.
        h1: { typography: { fontFamily: headingFamily, fontSize: sizeBy("huge"),    fontWeight: headingWeight, lineHeight: headingLineHeight, letterSpacing: "-0.02em" } },
        h2: { typography: { fontFamily: headingFamily, fontSize: sizeBy("x-large"), fontWeight: headingWeight, lineHeight: "1.1",            letterSpacing: "-0.015em" } },
        h3: { typography: { fontFamily: headingFamily, fontSize: sizeBy("large"),   fontWeight: headingWeight, lineHeight: "1.2" } },
        h4: { typography: { fontFamily: headingFamily, fontSize: sizeBy("medium"),  fontWeight: headingWeight, lineHeight: "1.3" } },
        h5: { typography: { fontFamily: headingFamily, fontSize: sizeBy("small"),   fontWeight: headingWeight, lineHeight: "1.4" } },
        h6: { typography: { fontFamily: headingFamily, fontSize: sizeBy("small"),   fontWeight: headingWeight, lineHeight: "1.4" } },
        heading: { typography: { fontFamily: headingFamily, fontWeight: headingWeight, lineHeight: headingLineHeight } },
        button: {
          color: { background: colorBy("primary"), text: colorBy(slugOrDefault(tokens.palette, "background")) },
          spacing: { padding: { top: "0.85rem", right: "1.75rem", bottom: "0.85rem", left: "1.75rem" } },
          typography: { fontSize: sizeBy("small"), fontWeight: "500", letterSpacing: "0.02em" },
          border: { radius: tokens.radius.md },
          ":hover": {
            color: {
              background: `color-mix(in srgb, var(--wp--preset--color--primary) 88%, transparent)`,
              text: colorBy(slugOrDefault(tokens.palette, "background")),
            },
          },
          ":focus": {
            outline: { color: colorBy("primary"), offset: "2px", style: "solid", width: "2px" },
          },
        },
        link: {
          color: { text: "currentColor" },
          typography: { textDecoration: "underline" },
          ":hover": { typography: { textDecoration: "none" } },
        },
        caption: { typography: { fontSize: sizeBy("small") } },
      },
      blocks: {
        // Site title leans into the brand's heading family at small
        // sizes (header chrome). Strip the link underline; let
        // navigation sit cleanly next to it.
        "core/site-title": {
          typography: { fontFamily: headingFamily, fontWeight: headingWeight, letterSpacing: "-0.01em" },
          elements: {
            link: {
              typography: { textDecoration: "none" },
              ":hover": { typography: { textDecoration: "underline" } },
            },
          },
        },
        // Product titles in the grid. Small + clean by default; bold
        // links so they read as catalog entries.
        "core/post-title": {
          typography: { fontFamily: headingFamily, fontWeight: headingWeight },
          elements: {
            link: {
              typography: { textDecoration: "none" },
              ":hover": { typography: { textDecoration: "underline" } },
            },
          },
        },
        // Pull quotes get a left border accent in primary, generous
        // padding, and a lighter weight so they don't compete with body.
        "core/quote": {
          border: { style: "solid", width: "0 0 0 3px", color: colorBy("primary") },
          spacing: {
            blockGap: spaceBy("30"),
            margin:  { left: "0", right: "0" },
            padding: { top: spaceBy("30"), right: spaceBy("40"), bottom: spaceBy("30"), left: spaceBy("40") },
          },
          typography: { fontSize: sizeBy("large"), fontStyle: "italic", fontWeight: "400" },
        },
        // Separator: subtle hairline using muted color so it reads as a
        // structural divider, not a heavy line.
        "core/separator": {
          border: { color: colorBy("muted"), style: "solid", width: "0 0 1px 0" },
        },
        "core/buttons": {
          spacing: { blockGap: "12px" },
        },
        "core/navigation": {
          typography: { fontSize: sizeBy("small"), fontWeight: "500" },
          elements: {
            link: {
              color: { text: "currentColor" },
              typography: { textDecoration: "none" },
              ":hover": { typography: { textDecoration: "underline" } },
            },
          },
        },
        // WC product price — the hero copy of any product card. Keep it
        // emphasised but not shouty.
        "woocommerce/product-price": {
          typography: { fontFamily: headingFamily, fontSize: sizeBy("medium"), fontWeight: "500" },
        },
        "woocommerce/product-rating": {
          typography: { fontSize: sizeBy("small") },
        },
        // Newsletter / signup forms via core/html — give them
        // baseline button-like spacing so the inline forms don't look
        // like raw HTML.
        "core/html": {
          spacing: { blockGap: "8px" },
        },
        // Cover blocks (full-bleed heroes) — give the inner container
        // a comfortable max-width so headlines don't stretch to edges
        // on ultra-wide screens.
        "core/cover": {
          spacing: { padding: { top: spaceBy("section"), bottom: spaceBy("section"), left: spaceBy("40"), right: spaceBy("40") } },
        },
      },
      css: buildPremiumCss(tokens),
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

/**
 * Derive a small set of palette gradients. Used by the cover/group
 * blocks for visual variety beyond flat colors. Operators can pick one
 * in the editor for any block that supports gradient backgrounds.
 */
function buildGradients(tokens: ThemeTokens): GradientEntry[] {
  const get = (slug: string, fallback: string): string =>
    tokens.palette.find((c) => c.slug === slug)?.color ?? fallback;
  const primary = get("primary", "#1F1F1F");
  const accent = get("accent", get("foreground", "#000000"));
  const fg = get("foreground", "#1A1A1A");
  const bg = get("background", "#FFFFFF");
  const bgAlt = get("background-alt", bg);

  return [
    { name: "Primary diagonal",       slug: "primary-diagonal",       gradient: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)` },
    { name: "Sunset",                 slug: "sunset",                 gradient: `linear-gradient(180deg, ${primary} 0%, ${bgAlt} 100%)` },
    { name: "Soft surface",           slug: "soft-surface",           gradient: `linear-gradient(180deg, ${bg} 0%, ${bgAlt} 100%)` },
    { name: "Deep contrast",          slug: "deep-contrast",          gradient: `linear-gradient(135deg, ${fg} 0%, ${primary} 100%)` },
    { name: "Primary spotlight",      slug: "primary-spotlight",      gradient: `radial-gradient(circle at 30% 30%, ${primary} 0%, ${fg} 80%)` },
  ];
}

/**
 * A small shadow ramp tuned in neutrals. Buttons/cards/cover overlays
 * pick from these in the editor; without presets the editor's own
 * defaults are too "Material" for editorial brands.
 */
function buildShadows(_tokens: ThemeTokens): ShadowEntry[] {
  return [
    { name: "Subtle",  slug: "subtle",  shadow: "0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.04)" },
    { name: "Lifted",  slug: "lifted",  shadow: "0 4px 12px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08)" },
    { name: "Floating",slug: "floating",shadow: "0 12px 32px rgba(0,0,0,0.10), 0 32px 64px rgba(0,0,0,0.12)" },
    { name: "Inset",   slug: "inset",   shadow: "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.10)" },
  ];
}

/**
 * Premium polish CSS — the micro-interactions and details the
 * structured theme.json fields can't express on their own. This is what
 * separates "block theme that renders" from "block theme that feels
 * like a sellable product":
 *
 *   - smooth transitions on every interactive element
 *   - product cards lift on hover (Outerknown / Saturdays NYC pattern)
 *   - product images zoom inside their container on hover
 *   - sale badge styled as a deliberate small pill, not the WP default rectangle
 *   - newsletter form fields styled with the brand palette
 *   - hairline section dividers using the muted color
 *   - eyebrow text styling for the small-caps tracked-out headings
 *     used as section eyebrows
 *   - refined separator styling (centered short hairline, not full-width thick)
 *   - product card title gets just a touch of weight + tracking
 *   - heading typography opens up letter-spacing on the largest sizes
 */
function buildPremiumCss(tokens: ThemeTokens): string {
  const muted = tokens.palette.find((c) => c.slug === "muted")?.color ?? "currentColor";
  const primary = tokens.palette.find((c) => c.slug === "primary")?.color ?? "#000";
  const bg = tokens.palette.find((c) => c.slug === "background")?.color ?? "#fff";
  const fg = tokens.palette.find((c) => c.slug === "foreground")?.color ?? "#000";

  // Use string concatenation rather than a giant template literal so the
  // intent of each rule stays close to its CSS.
  return [
    `/* Smooth transitions for everything interactive — what feels "designed". */`,
    `a, button, .wp-block-button__link, .wp-block-image img, .wp-block-woocommerce-product-image img, .wp-block-cover, .wp-block-group { transition: transform .25s ease, opacity .25s ease, color .2s ease, background-color .2s ease, border-color .2s ease, box-shadow .25s ease; }`,
    ``,
    `/* Buttons: subtle lift on hover (the move every premium e-comm theme makes) */`,
    `.wp-block-button__link:hover { transform: translateY(-1px); }`,
    `.wp-block-button__link:active { transform: translateY(0); }`,
    ``,
    `/* Product cards in WC product collection — lift on hover, zoom image */`,
    `.wp-block-woocommerce-product-template > li, .wp-block-woocommerce-product-template > .wc-block-product { display: flex; flex-direction: column; gap: .75rem; transition: transform .3s ease; }`,
    `.wp-block-woocommerce-product-template > li:hover, .wp-block-woocommerce-product-template > .wc-block-product:hover { transform: translateY(-4px); }`,
    `.wp-block-woocommerce-product-image { overflow: hidden; }`,
    `.wp-block-woocommerce-product-image img { transition: transform .5s ease; }`,
    `.wp-block-woocommerce-product-template > li:hover .wp-block-woocommerce-product-image img,`,
    `.wp-block-woocommerce-product-template > .wc-block-product:hover .wp-block-woocommerce-product-image img { transform: scale(1.04); }`,
    ``,
    `/* Sale badge — refined small pill instead of WP's default rectangle */`,
    `.wc-block-components-product-sale-badge { background: ${primary}; color: ${bg}; padding: .25rem .65rem; border-radius: 999px; font-size: .7rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; box-shadow: 0 1px 2px rgba(0,0,0,.08); }`,
    ``,
    `/* Product title in grid — slight tracking to make it feel composed */`,
    `.wp-block-woocommerce-product-template a.wp-block-post-title__link, .wp-block-post-title a { letter-spacing: -.005em; text-decoration: none; }`,
    ``,
    `/* Newsletter forms — match brand tokens so they don't look like raw HTML */`,
    `.forge-newsletter { display: flex; gap: .5rem; align-items: stretch; flex-wrap: wrap; }`,
    `.forge-newsletter input[type="email"] { flex: 1 1 220px; padding: .85rem 1rem; border: 1px solid ${muted}; background: ${bg}; color: ${fg}; font: inherit; border-radius: 0; }`,
    `.forge-newsletter input[type="email"]:focus { outline: 2px solid ${primary}; outline-offset: 1px; }`,
    `.forge-newsletter button { padding: .85rem 1.5rem; background: ${primary}; color: ${bg}; border: none; font: inherit; font-weight: 500; letter-spacing: .02em; cursor: pointer; transition: transform .25s ease, opacity .2s ease; }`,
    `.forge-newsletter button:hover { transform: translateY(-1px); opacity: .92; }`,
    ``,
    `/* Eyebrow microcopy — small caps tracked-out, used by section eyebrows */`,
    `.has-text-color.has-muted-color.has-small-font-size, p.has-small-font-size.has-muted-color { letter-spacing: .12em; text-transform: uppercase; font-weight: 500; }`,
    ``,
    `/* Marquee strip — used by hero-marquee and usp-row-five */`,
    `p.forge-marquee { letter-spacing: .08em; text-transform: uppercase; font-size: .8rem; font-weight: 500; }`,
    ``,
    `/* Separator: a short centered hairline reads as deliberate (vs WP's full-width default) */`,
    `hr.wp-block-separator:not(.is-style-wide):not(.is-style-dots) { width: 60px; max-width: 60px; margin-left: auto; margin-right: auto; border: 0; border-top: 1px solid ${muted}; opacity: .6; }`,
    ``,
    `/* Image hover for editorial cards (about / category sections) */`,
    `figure.wp-block-image { overflow: hidden; }`,
    `figure.wp-block-image img { transition: transform .6s ease; }`,
    `figure.wp-block-image:hover img { transform: scale(1.03); }`,
    ``,
    `/* Quote: italic citation block accent */`,
    `.wp-block-quote cite { display: block; font-style: normal; font-size: .85rem; letter-spacing: .04em; text-transform: uppercase; opacity: .75; margin-top: .75rem; }`,
    ``,
    `/* Cover overlay: extra dim by default so type stays readable on light placeholders */`,
    `.wp-block-cover .wp-block-cover__inner-container { width: 100%; }`,
    ``,
    `/* Site title link cleanup */`,
    `.wp-block-site-title a { text-decoration: none; }`,
    ``,
    `/* Add to cart form — match button styling */`,
    `.wp-block-woocommerce-add-to-cart-form button.single_add_to_cart_button { background: ${primary}; color: ${bg}; border: none; padding: .9rem 1.75rem; font: inherit; font-weight: 500; letter-spacing: .02em; transition: transform .25s ease, opacity .2s ease; cursor: pointer; }`,
    `.wp-block-woocommerce-add-to-cart-form button.single_add_to_cart_button:hover { transform: translateY(-1px); opacity: .92; }`,
    ``,
    `/* Reduce motion respect */`,
    `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0.01ms !important; transition-delay: 0ms !important; transform: none !important; } }`,
    ``,
  ].join("\n");
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
