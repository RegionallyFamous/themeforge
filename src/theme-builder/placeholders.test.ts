import { describe, it, expect } from "vitest";
import {
  buildPlaceholderSvg,
  paletteForPlaceholders,
  placeholderFilename,
  rewritePlaceholderUrls,
  aspectSlug,
} from "./placeholders.js";
import { buildThemeJson } from "./theme-json.js";
import type { ThemeTokens } from "../pipeline/types.js";

const tokens: ThemeTokens = {
  palette: [
    { name: "Background",     slug: "background",     color: "#F6F1EA" },
    { name: "Background Alt", slug: "background-alt", color: "#E8D9C2" },
    { name: "Foreground",     slug: "foreground",     color: "#2E1F14" },
    { name: "Muted",          slug: "muted",          color: "#7A6757" },
    { name: "Primary",        slug: "primary",        color: "#A8531E" },
  ],
  typography: {
    body:    { fontFamily: "Inter, sans-serif",  fontSize: "1.0625rem", lineHeight: "1.6" },
    heading: { fontFamily: "Fraunces, serif",    fontWeight: "500",     lineHeight: "1.05" },
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

const themeJson = buildThemeJson(tokens);

describe("aspectSlug + placeholderFilename", () => {
  it("converts aspect ratios to URL-safe form", () => {
    expect(aspectSlug("16:9")).toBe("16x9");
    expect(aspectSlug("1:1")).toBe("1x1");
    expect(aspectSlug("4:5")).toBe("4x5");
  });

  it("composes role + aspect into a stable filename", () => {
    expect(placeholderFilename("hero_lifestyle", "4:5")).toBe("hero_lifestyle-4x5.svg");
  });
});

describe("paletteForPlaceholders", () => {
  it("pulls expected slugs from the theme.json palette", () => {
    const p = paletteForPlaceholders(themeJson);
    expect(p.background).toBe("#F6F1EA");
    expect(p.foreground).toBe("#2E1F14");
    expect(p.primary).toBe("#A8531E");
    expect(p.backgroundAlt).toBe("#E8D9C2");
    expect(p.muted).toBe("#7A6757");
  });

  it("falls back gracefully when a slug is missing", () => {
    const minimalTokens: ThemeTokens = {
      ...tokens,
      palette: [{ name: "Cream", slug: "background", color: "#FFFFFF" }],
    };
    const minimalTheme = buildThemeJson(minimalTokens);
    const p = paletteForPlaceholders(minimalTheme);
    expect(p.background).toBe("#FFFFFF");
    // background-alt missing → falls back to background, not the hardcoded default.
    expect(p.backgroundAlt).toBe("#FFFFFF");
    // foreground missing → uses the hardcoded default.
    expect(p.foreground).toBe("#1A1A1A");
  });
});

describe("buildPlaceholderSvg", () => {
  const palette = paletteForPlaceholders(themeJson);

  it("emits a valid <svg> document with the expected viewBox", () => {
    const svg = buildPlaceholderSvg("hero_centerpiece", "16:9", palette);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('viewBox="0 0 1600 900"');
    expect(svg).toContain('width="1600"');
    expect(svg).toContain('height="900"');
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });

  it("includes the role and aspect as labels", () => {
    const svg = buildPlaceholderSvg("category_tile", "1:1", palette);
    expect(svg).toContain(">category_tile<");
    expect(svg).toContain(">1:1 · placeholder<");
  });

  it("uses the brand's palette colors", () => {
    const svg = buildPlaceholderSvg("hero", "16:9", palette);
    expect(svg).toContain(palette.backgroundAlt);
    expect(svg).toContain(palette.foreground);
    expect(svg).toContain(palette.muted);
  });

  it("is deterministic for the same inputs", () => {
    const a = buildPlaceholderSvg("x", "16:9", palette);
    const b = buildPlaceholderSvg("x", "16:9", palette);
    expect(a).toBe(b);
  });

  it("escapes quotes / angle brackets in role names", () => {
    const svg = buildPlaceholderSvg('he"ro<role>', "1:1", palette);
    expect(svg).toContain('he&quot;ro&lt;role&gt;');
    expect(svg).not.toContain('he"ro<role>');
  });

  it("rejects malformed aspect ratios", () => {
    expect(() => buildPlaceholderSvg("x", "16x9", palette)).toThrow(/aspect/);
  });
});

describe("rewritePlaceholderUrls", () => {
  it("rewrites a single placeholder URL to the theme path", () => {
    const before = '<img src="https://placeholder.local/hero_lifestyle/4x5" alt="x"/>';
    const after = rewritePlaceholderUrls(before, "bellwether-coffee");
    expect(after).toBe(
      '<img src="/wp-content/themes/bellwether-coffee/assets/placeholders/hero_lifestyle-4x5.svg" alt="x"/>',
    );
  });

  it("rewrites every occurrence in a long string", () => {
    const before = [
      '<img src="https://placeholder.local/a/16x9"/>',
      '<img src="https://placeholder.local/b/1x1"/>',
      '<img src="https://placeholder.local/c/4x5"/>',
    ].join("\n");
    const after = rewritePlaceholderUrls(before, "slug");
    expect(after.split("\n").every((l) => l.includes("/wp-content/themes/slug/assets/placeholders/"))).toBe(true);
    expect(after).toContain("a-16x9.svg");
    expect(after).toContain("b-1x1.svg");
    expect(after).toContain("c-4x5.svg");
  });

  it("leaves non-placeholder URLs alone", () => {
    const before = '<img src="https://example.com/real-image.jpg"/>';
    expect(rewritePlaceholderUrls(before, "slug")).toBe(before);
  });
});
