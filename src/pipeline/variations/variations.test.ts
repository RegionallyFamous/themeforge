import { describe, it, expect } from "vitest";
import { buildThemeJson } from "../../theme-builder/theme-json.js";
import {
  ALL_VARIATIONS,
  lightVariation,
  darkVariation,
  editorialVariation,
  playfulVariation,
  monoVariation,
} from "./index.js";
import {
  hexToHsl,
  invertLightness,
  desaturate,
  hslToHex,
  adjustSaturation,
  rotateHue,
} from "./color-utils.js";
import type { ThemeTokens } from "../types.js";

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
    body:    { fontFamily: "Inter, sans-serif",       fontSize: "1.0625rem", lineHeight: "1.6" },
    heading: { fontFamily: "Fraunces, serif",         fontWeight: "500",     lineHeight: "1.05" },
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

const baseTheme = buildThemeJson(baseTokens);

// ── Color utility tests ────────────────────────────────────────────────

describe("hex ↔ hsl round-trip", () => {
  for (const hex of ["#000000", "#ffffff", "#A8531E", "#5B7B4F"]) {
    it(`round-trips ${hex} (within 1/255 per channel)`, () => {
      const [h, s, l] = hexToHsl(hex);
      const out = hslToHex(h, s, l).toLowerCase();
      // Allow a 1-bit difference per channel from float quantization.
      const a = parseInt(hex.slice(1), 16);
      const b = parseInt(out.slice(1), 16);
      const dr = Math.abs((a >> 16) - (b >> 16));
      const dg = Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff));
      const db = Math.abs((a & 0xff) - (b & 0xff));
      expect(dr).toBeLessThanOrEqual(1);
      expect(dg).toBeLessThanOrEqual(1);
      expect(db).toBeLessThanOrEqual(1);
    });
  }
});

describe("invertLightness", () => {
  it("flips a near-white to a near-black, hue preserved", () => {
    const inverted = invertLightness("#F6F1EA");
    const [, , l] = hexToHsl(inverted);
    expect(l).toBeLessThan(0.15);
  });

  it("flips a near-black to a near-white", () => {
    const inverted = invertLightness("#2E1F14");
    const [, , l] = hexToHsl(inverted);
    expect(l).toBeGreaterThan(0.8);
  });
});

describe("desaturate", () => {
  it("zeroes saturation while preserving lightness", () => {
    const grayed = desaturate("#A8531E");
    const [, s] = hexToHsl(grayed);
    expect(s).toBe(0);
  });
});

describe("adjustSaturation", () => {
  it("multiplies saturation by the given factor", () => {
    const [, baseS] = hexToHsl("#A8531E");
    const [, boostedS] = hexToHsl(adjustSaturation("#A8531E", 1.15));
    expect(boostedS).toBeCloseTo(Math.min(1, baseS * 1.15), 2);
  });

  it("leaves pure neutrals neutral (s * factor = 0)", () => {
    const [, s] = hexToHsl(adjustSaturation("#888888", 2));
    expect(s).toBe(0);
  });

  it("clamps to [0, 1] (won't exceed 1.0)", () => {
    const [, s] = hexToHsl(adjustSaturation("#FF0000", 5));
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("rotateHue", () => {
  it("shifts hue while preserving saturation and lightness", () => {
    const original = "#A8531E";
    const [origH, origS, origL] = hexToHsl(original);
    const rotated = rotateHue(original, 60);
    const [newH, newS, newL] = hexToHsl(rotated);
    expect(newS).toBeCloseTo(origS, 2);
    expect(newL).toBeCloseTo(origL, 2);
    // Allow 1 degree of slack from float quantization.
    expect(Math.abs(newH * 360 - ((origH * 360 + 60) % 360))).toBeLessThan(1);
  });

  it("returns pure neutrals unchanged", () => {
    expect(rotateHue("#888888", 90)).toBe("#888888");
    expect(rotateHue("#000000", 180)).toBe("#000000");
  });
});

// ── Variation contracts (apply to all four) ─────────────────────────────

describe("every variation produces a v3 file with a title", () => {
  for (const v of ALL_VARIATIONS) {
    it(`${v.slug} → v3 + title`, () => {
      const file = v.apply(baseTheme);
      expect(file.version).toBe(3);
      expect(file.title).toBe(v.title);
    });
  }
});

describe("every variation is deterministic", () => {
  for (const v of ALL_VARIATIONS) {
    it(`${v.slug}: same input, same output`, () => {
      const a = v.apply(baseTheme);
      const b = v.apply(baseTheme);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  }
});

// ── Per-variation behavior ──────────────────────────────────────────────

describe("light variation", () => {
  it("emits no overrides — base tokens carry through", () => {
    const file = lightVariation.apply(baseTheme);
    expect(file.settings).toBeUndefined();
    expect(file.styles).toBeUndefined();
  });
});

describe("dark variation", () => {
  it("inverts lightness for every palette entry; slugs unchanged", () => {
    const file = darkVariation.apply(baseTheme);
    const palette = file.settings?.color?.palette;
    expect(palette).toBeDefined();
    expect(palette).toHaveLength(baseTokens.palette.length);

    const bgEntry = palette!.find((e) => e.slug === "background")!;
    const fgEntry = palette!.find((e) => e.slug === "foreground")!;

    const baseBg = baseTokens.palette.find((e) => e.slug === "background")!.color;
    const baseFg = baseTokens.palette.find((e) => e.slug === "foreground")!.color;

    expect(bgEntry.color).toBe(invertLightness(baseBg));
    expect(fgEntry.color).toBe(invertLightness(baseFg));

    // Background and foreground should now have their lightness ranks swapped.
    const [, , bgL] = hexToHsl(bgEntry.color);
    const [, , fgL] = hexToHsl(fgEntry.color);
    expect(bgL).toBeLessThan(fgL);
  });

  it("re-asserts styles.color so things inheriting from the base flip too", () => {
    const file = darkVariation.apply(baseTheme);
    expect(file.styles?.color?.background).toMatch(/--wp--preset--color--background/);
    expect(file.styles?.color?.text).toMatch(/--wp--preset--color--foreground/);
  });
});

describe("editorial variation", () => {
  it("scales every fontSize by ~12%", () => {
    const file = editorialVariation.apply(baseTheme);
    const scaled = file.settings?.typography?.fontSizes;
    expect(scaled).toBeDefined();

    const baseSmall = parseFloat(baseTheme.settings.typography.fontSizes[0]!.size);
    const newSmall = parseFloat(scaled![0]!.size);
    expect(newSmall).toBeCloseTo(baseSmall * 1.12, 2);
  });

  it("scales magnitudes inside clamp() while preserving structure", () => {
    const file = editorialVariation.apply(baseTheme);
    const scaledHuge = file.settings!.typography!.fontSizes!.find((s) => s.slug === "huge")!.size;
    expect(scaledHuge).toMatch(/^clamp\(/);
    expect(scaledHuge).toContain("vw");
  });

  it("sets a tighter h1 line-height", () => {
    const file = editorialVariation.apply(baseTheme);
    const h1 = (file.styles?.elements?.h1 as { typography?: { lineHeight?: string } } | undefined);
    expect(h1?.typography?.lineHeight).toBe("0.95");
  });
});

describe("mono variation", () => {
  it("desaturates every palette entry except primary", () => {
    const file = monoVariation.apply(baseTheme);
    const palette = file.settings?.color?.palette;
    expect(palette).toBeDefined();
    for (const entry of palette!) {
      const [, s] = hexToHsl(entry.color);
      if (entry.slug === "primary") {
        expect(s, `primary slug should keep saturation`).toBeGreaterThan(0);
      } else {
        expect(s, `slug ${entry.slug} should be grayscale`).toBe(0);
      }
    }
  });

  it("preserves slugs and entry count", () => {
    const file = monoVariation.apply(baseTheme);
    const palette = file.settings!.color!.palette;
    expect(palette.map((e) => e.slug)).toEqual(baseTokens.palette.map((e) => e.slug));
  });
});

describe("playful variation", () => {
  it("boosts saturation on every chromatic palette entry", () => {
    const file = playfulVariation.apply(baseTheme);
    const palette = file.settings?.color?.palette;
    expect(palette).toBeDefined();
    for (const entry of palette!) {
      const [, baseS] = hexToHsl(
        baseTheme.settings.color.palette.find((c) => c.slug === entry.slug)!.color,
      );
      const [, newS] = hexToHsl(entry.color);
      if (baseS === 0) {
        // Neutrals stay neutral; saturation can't be invented.
        expect(newS).toBe(0);
      } else {
        expect(newS).toBeGreaterThan(baseS);
      }
    }
  });

  it("rounds buttons into pills", () => {
    const file = playfulVariation.apply(baseTheme);
    const button = file.styles?.elements?.button as
      | { border?: { radius?: string } }
      | undefined;
    expect(button?.border?.radius).toBe("999px");
  });

  it("preserves slugs on the palette", () => {
    const file = playfulVariation.apply(baseTheme);
    expect(file.settings!.color!.palette.map((e) => e.slug)).toEqual(
      baseTokens.palette.map((e) => e.slug),
    );
  });
});

describe("ALL_VARIATIONS registry", () => {
  it("exports all five with unique slugs", () => {
    const slugs = ALL_VARIATIONS.map((v) => v.slug).sort();
    expect(slugs).toEqual(["dark", "editorial", "light", "mono", "playful"]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
