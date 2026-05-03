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
    expect(tj.$schema).toBe("https://schemas.wp.org/trunk/theme.json");
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

  it("emits five named font sizes; first two are non-fluid, rest are clamp()", () => {
    const tj = buildThemeJson(baseTokens);
    const sizes = tj.settings.typography.fontSizes;
    expect(sizes.map((s) => s.slug)).toEqual(["small", "medium", "large", "x-large", "huge"]);
    expect(sizes[0]?.fluid).toBe(false);
    expect(sizes[1]?.fluid).toBe(false);
    expect(sizes[2]?.size).toMatch(/^clamp\(/);
    expect(sizes[3]?.size).toMatch(/^clamp\(/);
    expect(sizes[4]?.size).toMatch(/^clamp\(/);
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
    expect(tj.styles.color.background).toBe("var(--wp--preset--color--cream)");
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
});
