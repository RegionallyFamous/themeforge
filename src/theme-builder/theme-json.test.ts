import { describe, it, expect } from "vitest";
import { buildThemeJson } from "./theme-json.js";
import type { ThemeTokens } from "../pipeline/types.js";

const baseTokens: ThemeTokens = {
  palette: [
    { name: "Background",     slug: "background",     color: "#F6F1EA" },
    { name: "Background Alt", slug: "background-alt", color: "#E8D9C2" },
    { name: "Foreground",     slug: "foreground",     color: "#2E1F14" },
    { name: "Muted",          slug: "muted",          color: "#7A6757" },
    { name: "Primary",        slug: "primary",        color: "#A8531E" },
    { name: "Accent",         slug: "accent",         color: "#1A1A1A" },
  ],
  typography: {
    body: {
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fontSize: "1.0625rem",
      lineHeight: "1.6",
    },
    heading: {
      fontFamily: "Fraunces, 'Iowan Old Style', serif",
      fontWeight: "500",
      lineHeight: "1.05",
    },
    fluidScale: [0.9, 1.0625, 1.4, 2, 3.25],
  },
  spacing: {
    sectionY: "clamp(4rem, 3rem + 4vw, 6.5rem)",
    contentMaxWidth: "720px",
    wideMaxWidth: "1240px",
  },
  radius: { sm: "0px", md: "0px", lg: "0px" },
  density: "airy",
};

describe("buildThemeJson", () => {
  it("emits a v3 theme.json with the WP schema URL", () => {
    const tj = buildThemeJson(baseTokens);
    expect(tj.$schema).toBe("https://schemas.wp.org/wp/6.7/theme.json");
    expect(tj.version).toBe(3);
  });

  it("preserves the input palette as the color palette", () => {
    const tj = buildThemeJson(baseTokens);
    expect(tj.settings.color.palette).toEqual(baseTokens.palette);
    expect(tj.settings.color.custom).toBe(false);
    expect(tj.settings.color.defaultPalette).toBe(false);
  });

  it("registers heading and body font family slugs", () => {
    const tj = buildThemeJson(baseTokens);
    const slugs = tj.settings.typography.fontFamilies.map((f) => f.slug);
    expect(slugs).toEqual(["heading", "body"]);
    expect(tj.settings.typography.fontFamilies[0]?.name).toBe("Fraunces");
    expect(tj.settings.typography.fontFamilies[1]?.name).toBe("Inter");
  });

  it("emits six named font sizes (small through huge plus a dramatic display); first two are non-fluid, rest are clamp()", () => {
    const tj = buildThemeJson(baseTokens);
    const sizes = tj.settings.typography.fontSizes;
    expect(sizes.map((s) => s.slug)).toEqual(["small", "medium", "large", "x-large", "huge", "display"]);
    expect(sizes[0]?.fluid).toBe(false);
    expect(sizes[1]?.fluid).toBe(false);
    expect(sizes[2]?.size).toMatch(/^clamp\(/);
    expect(sizes[3]?.size).toMatch(/^clamp\(/);
    expect(sizes[4]?.size).toMatch(/^clamp\(/);
    // Display should be roughly 2× huge — used by h1 for dramatic page-hero scale
    expect(sizes[5]?.size).toMatch(/^clamp\(/);
    const huge = parseFloat(sizes[4]!.size.match(/(\d+\.?\d*)rem\)$/)?.[1] ?? "0");
    const display = parseFloat(sizes[5]!.size.match(/(\d+\.?\d*)rem\)$/)?.[1] ?? "0");
    expect(display).toBeGreaterThan(huge * 1.5);
  });

  it("uses the input contentMaxWidth/wideMaxWidth and sectionY", () => {
    const tj = buildThemeJson(baseTokens);
    expect(tj.settings.layout.contentSize).toBe("720px");
    expect(tj.settings.layout.wideSize).toBe("1240px");
    const sectionEntry = tj.settings.spacing.spacingSizes.find((s) => s.slug === "section");
    expect(sectionEntry?.size).toBe(baseTokens.spacing.sectionY);
  });

  it("density tunes the styles.spacing.blockGap", () => {
    expect(buildThemeJson({ ...baseTokens, density: "airy" }).styles.spacing.blockGap).toBe("1.5rem");
    expect(buildThemeJson({ ...baseTokens, density: "balanced" }).styles.spacing.blockGap).toBe(
      "1.25rem",
    );
    expect(buildThemeJson({ ...baseTokens, density: "dense" }).styles.spacing.blockGap).toBe("1rem");
  });

  it("falls back to the first palette entry if no `background` slug is present", () => {
    const tokens: ThemeTokens = {
      ...baseTokens,
      palette: [{ name: "Cream", slug: "cream", color: "#fff" }],
    };
    const tj = buildThemeJson(tokens);
    expect(tj.styles.color.background).toBe("var:preset|color|cream");
  });

  it("registers header + footer template parts", () => {
    const tj = buildThemeJson(baseTokens);
    expect(tj.templateParts.map((p) => p.name)).toEqual(["header", "footer"]);
  });

  it("is deterministic — same input, same output", () => {
    const a = buildThemeJson(baseTokens);
    const b = buildThemeJson(baseTokens);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("enables useRootPaddingAwareAlignments + emits root padding", () => {
    const tj = buildThemeJson(baseTokens);
    expect(tj.settings.useRootPaddingAwareAlignments).toBe(true);
    expect(tj.styles.spacing.padding.left).toMatch(/^var:preset\|spacing\|/);
    expect(tj.styles.spacing.padding.right).toMatch(/^var:preset\|spacing\|/);
  });

  it("emits per-heading typography (h1–h6 + heading) styling", () => {
    const tj = buildThemeJson(baseTokens);
    const els = tj.styles.elements as Record<string, { typography?: Record<string, unknown> }>;
    for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6", "heading"]) {
      expect(els[tag]?.typography, `element ${tag} typography`).toBeDefined();
      expect(els[tag]?.typography?.fontFamily).toBe("var:preset|font-family|heading");
    }
    // h1 leans on the dramatic display size; h6 collapses to small
    expect((els.h1!.typography! as { fontSize?: string }).fontSize).toBe("var:preset|font-size|display");
    expect((els.h6!.typography! as { fontSize?: string }).fontSize).toBe("var:preset|font-size|small");
  });

  it("button gets :hover and :focus states", () => {
    const tj = buildThemeJson(baseTokens);
    const btn = (tj.styles.elements as { button?: Record<string, unknown> }).button!;
    expect(btn[":hover"]).toBeDefined();
    expect(btn[":focus"]).toBeDefined();
    // Hover background uses color-mix on the primary
    const hover = btn[":hover"] as { color?: { background?: string } };
    expect(hover.color?.background).toMatch(/color-mix.*var\(--wp--preset--color--primary/);
  });

  it("link toggles underline on hover", () => {
    const tj = buildThemeJson(baseTokens);
    const link = (tj.styles.elements as { link?: Record<string, unknown> }).link!;
    expect((link.typography as { textDecoration?: string }).textDecoration).toBe("underline");
    const hover = link[":hover"] as { typography?: { textDecoration?: string } };
    expect(hover.typography?.textDecoration).toBe("none");
  });

  it("emits per-block defaults for the blocks our patterns lean on", () => {
    const tj = buildThemeJson(baseTokens);
    const blocks = tj.styles.blocks;
    for (const slug of [
      "core/site-title",
      "core/post-title",
      "core/quote",
      "core/separator",
      "core/buttons",
      "core/navigation",
      "woocommerce/product-price",
    ]) {
      expect(blocks[slug], `styles.blocks[${slug}]`).toBeDefined();
    }
  });

  it("emits gradient + shadow + aspect-ratio presets", () => {
    const tj = buildThemeJson(baseTokens);
    expect(tj.settings.color.gradients.length).toBeGreaterThanOrEqual(4);
    expect(tj.settings.shadow.presets.length).toBeGreaterThanOrEqual(3);
    expect(tj.settings.dimensions.aspectRatios.length).toBeGreaterThanOrEqual(5);
    // Gradients should reference the brand's actual primary color
    expect(tj.settings.color.gradients.some((g) => g.gradient.includes(baseTokens.palette[4]!.color))).toBe(true);
  });

  it("opts out of WP defaults so the operator's tokens are the only set in play", () => {
    const tj = buildThemeJson(baseTokens);
    expect(tj.settings.color.defaultPalette).toBe(false);
    expect(tj.settings.color.defaultGradients).toBe(false);
    expect(tj.settings.color.defaultDuotone).toBe(false);
    expect(tj.settings.typography.defaultFontSizes).toBe(false);
    expect(tj.settings.spacing.defaultSpacingSizes).toBe(false);
    expect(tj.settings.shadow.defaultPresets).toBe(false);
    expect(tj.settings.dimensions.defaultAspectRatios).toBe(false);
  });
});
