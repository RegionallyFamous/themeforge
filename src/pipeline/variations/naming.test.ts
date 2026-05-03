import { describe, it, expect } from "vitest";
import { brandedTitle, brandedTitles, __testing } from "./naming.js";
import { ALL_VARIATIONS } from "./index.js";
import type { MoodArchetype } from "../../brand-spec/schema.js";

const ALL_MOODS: MoodArchetype[] = [
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
];

const variationSlugs = ALL_VARIATIONS.map((v) => v.slug).sort();

describe("brandedTitle", () => {
  it("returns a non-empty branded label for every (mood, variation) pair", () => {
    for (const mood of ALL_MOODS) {
      for (const slug of variationSlugs) {
        const title = brandedTitle(mood, slug as never);
        expect(title, `${mood}/${slug}`).toMatch(/\S/);
        expect(title.length, `${mood}/${slug}`).toBeLessThan(40);
      }
    }
  });

  it("falls back to the mechanical label when the mood isn't in the table", () => {
    const title = brandedTitle("nonexistent" as MoodArchetype, "light");
    expect(title).toBe("Light");
  });

  it("titles for one mood are all distinct (no two variations share a name)", () => {
    for (const mood of ALL_MOODS) {
      const titles = variationSlugs.map((s) => brandedTitle(mood, s as never));
      expect(new Set(titles).size, `mood ${mood} has duplicate titles: ${titles.join(", ")}`).toBe(
        titles.length,
      );
    }
  });

  it("matches the canonical sample (heritage)", () => {
    expect(brandedTitle("heritage", "light")).toBe("First Light");
    expect(brandedTitle("heritage", "dark")).toBe("Deep Roast");
    expect(brandedTitle("heritage", "editorial")).toBe("Press");
    expect(brandedTitle("heritage", "playful")).toBe("Sunday");
    expect(brandedTitle("heritage", "mono")).toBe("Letterpress");
  });
});

describe("brandedTitles", () => {
  it("returns the full per-mood map", () => {
    const titles = brandedTitles("nordic");
    expect(Object.keys(titles).sort()).toEqual(variationSlugs);
    expect(titles.dark).toBe("Dusk");
  });

  it("falls back to mechanical labels for an unknown mood", () => {
    const titles = brandedTitles("nonexistent" as MoodArchetype);
    expect(titles).toEqual(__testing.MECHANICAL_TITLES);
  });
});

describe("naming table coverage", () => {
  it("has every MoodArchetype in the BRANDED table — adding a mood without a row would silently degrade variation names", () => {
    const branded = __testing.BRANDED as Record<string, unknown>;
    for (const mood of ALL_MOODS) {
      expect(branded[mood], `mood ${mood} missing from BRANDED table`).toBeDefined();
    }
  });

  it("has every variation slug in every mood's row", () => {
    for (const mood of ALL_MOODS) {
      const row = (__testing.BRANDED as Record<string, Record<string, unknown>>)[mood]!;
      for (const slug of variationSlugs) {
        expect(row[slug], `${mood} is missing slug ${slug}`).toBeDefined();
      }
    }
  });
});
