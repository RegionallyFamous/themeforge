import { describe, it, expect } from "vitest";
import { loadPatternLibrary } from "./loader.js";
import { mockResolutionsFor } from "./mock-resolutions.js";
import { serialize } from "../theme-builder/serializer.js";
import { assertRoundTrip, validateMarkup } from "../theme-builder/validator.js";

const lib = loadPatternLibrary();

/**
 * Minimum patterns per category. The library can grow above these
 * counts without breaking the test — this floor only catches accidental
 * deletions.
 */
const MINIMUM_CATEGORY_COUNTS: Record<string, number> = {
  hero:               3,
  "product-grid":     3,
  "category-showcase": 1,
  "usp-strip":        1,
  testimonial:        2,
  newsletter:         2,
  footer:             2,
  "single-product":   1,
  faq:                2,
  header:             3,
  about:              1,
  press:              1,
};

const PHASE_9_TARGET = 21;

describe("pattern library", () => {
  it("loads at least the Phase 9 batch (21 patterns)", () => {
    expect(lib.size).toBeGreaterThanOrEqual(PHASE_9_TARGET);
  });

  it("meets the minimum pattern count for every required category", () => {
    const counts: Record<string, number> = {};
    for (const { pattern } of lib.values()) {
      counts[pattern.category] = (counts[pattern.category] ?? 0) + 1;
    }
    for (const [category, minCount] of Object.entries(MINIMUM_CATEGORY_COUNTS)) {
      expect(counts[category] ?? 0, `category ${category}`).toBeGreaterThanOrEqual(minCount);
    }
  });

  it("every pattern's id matches its filename", () => {
    for (const { pattern, filePath } of lib.values()) {
      const expectedTail = `${pattern.id}.json`;
      expect(filePath.endsWith(expectedTail), `${filePath} vs id ${pattern.id}`).toBe(true);
    }
  });

  it("every pattern declares at least one compatible template and mood", () => {
    for (const { pattern } of lib.values()) {
      expect(pattern.compatible_templates.length, pattern.id).toBeGreaterThan(0);
      expect(pattern.compatible_moods.length, pattern.id).toBeGreaterThan(0);
    }
  });
});

describe("pattern library serializer coverage", () => {
  for (const { pattern } of lib.values()) {
    it(`${pattern.id}: serializes with mock resolutions`, () => {
      const resolutions = mockResolutionsFor(pattern);
      expect(() => serialize(pattern.tree, resolutions)).not.toThrow();
    });

    it(`${pattern.id}: validates and round-trips byte-for-byte`, () => {
      const resolutions = mockResolutionsFor(pattern);
      const markup = serialize(pattern.tree, resolutions);
      expect(validateMarkup(markup)).toEqual({ ok: true });
      expect(assertRoundTrip(markup)).toEqual({ ok: true });
    });
  }
});
