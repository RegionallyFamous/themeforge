import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectImageRoles, renderImageBrief } from "./image-brief.js";
import { loadPatternLibrary } from "../pattern-library/loader.js";
import { mockResolutionsFor } from "../pattern-library/mock-resolutions.js";
import { buildThemeJson } from "./theme-json.js";
import { ALL_VARIATIONS } from "../pipeline/variations/index.js";
import type { PipelineRun } from "../pipeline/run.js";
import type {
  CustomizedPattern,
  PatternSlotInTemplate,
  TemplateId,
  TemplatePlan,
  ThemeTokens,
} from "../pipeline/types.js";
import { BrandSpecSchema } from "../brand-spec/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const lib = loadPatternLibrary();

const sampleSpec = BrandSpecSchema.parse(
  JSON.parse(readFileSync(resolve(repoRoot, "samples/coffee-roaster/brand-spec.json"), "utf8")),
);

const tokens: ThemeTokens = {
  palette: [
    { name: "Background", slug: "background", color: "#F6F1EA" },
    { name: "Foreground", slug: "foreground", color: "#2E1F14" },
    { name: "Primary",    slug: "primary",    color: "#A8531E" },
  ],
  typography: {
    body:    { fontFamily: "Inter, sans-serif", fontSize: "1rem", lineHeight: "1.6" },
    heading: { fontFamily: "Fraunces, serif",   fontWeight: "500", lineHeight: "1.05" },
    fluidScale: [0.9, 1.0625, 1.4, 2, 3.25],
  },
  spacing: { sectionY: "5rem", contentMaxWidth: "720px", wideMaxWidth: "1240px" },
  radius: { sm: "0px", md: "0px", lg: "0px" },
  density: "airy",
};

/**
 * Build a synthetic PipelineRun whose plan touches a known set of
 * patterns — lets us drive the image-brief logic without running the
 * full LLM pipeline.
 */
function makeRun(patternIds: { index: string[]; "single-product": string[] }): PipelineRun {
  const themeJson = buildThemeJson(tokens);
  const variations = new Map(ALL_VARIATIONS.map((v) => [v.slug, v.apply(themeJson)]));

  const templates: TemplatePlan["templates"] = {};
  const customized = new Map<string, CustomizedPattern>();

  for (const tplId of ["index", "single-product"] as const) {
    const ids = patternIds[tplId];
    const list: PatternSlotInTemplate[] = ids.map((id, i) => ({
      pattern_id: id,
      context: { template: tplId as TemplateId, position: i },
    }));
    templates[tplId as TemplateId] = list;
    for (let i = 0; i < ids.length; i++) {
      const pattern = lib.get(ids[i]!)!.pattern;
      customized.set(`${tplId}:${i}`, {
        pattern_id: ids[i]!,
        resolutions: mockResolutionsFor(pattern),
      });
    }
  }

  // Footer
  customized.set("parts/footer", {
    pattern_id: "footer-rich",
    resolutions: mockResolutionsFor(lib.get("footer-rich")!.pattern),
  });

  return {
    brandSpec: sampleSpec,
    enrichedSpec: { ...sampleSpec, derived: { copy_directives: [], sample_product_categories: [], sample_product_names: [] } },
    themeTokens: tokens,
    themeJson,
    variations,
    plan: { templates, parts: { footer: "footer-rich" } },
    customized,
    templates: {} as PipelineRun["templates"],
    parts: { header: "", footer: "" },
  };
}

describe("collectImageRoles", () => {
  it("aggregates image_role slots across patterns and templates", () => {
    const run = makeRun({
      index: ["hero-cover", "category-trio"],
      "single-product": ["single-product-classic"],
    });
    const usages = collectImageRoles(run, lib);

    // hero-cover has hero_centerpiece (16:9); category-trio has category_tile (1:1) ×3.
    const roles = usages.map((u) => `${u.role}@${u.aspect}`);
    expect(roles).toContain("hero_centerpiece@16:9");
    expect(roles).toContain("category_tile@1:1");
  });

  it("dedupes the same (role, aspect) across patterns into one usage entry", () => {
    const run = makeRun({
      // hero-split uses hero_lifestyle@4:5; if a pattern reused it the dedupe
      // logic should fold them into one entry with multiple appearances.
      index: ["hero-split"],
      "single-product": [],
    });
    const usages = collectImageRoles(run, lib);
    const heroLifestyle = usages.find((u) => u.role === "hero_lifestyle");
    expect(heroLifestyle?.aspect).toBe("4:5");
    expect(heroLifestyle?.filename).toBe("hero_lifestyle-4x5.svg");
  });

  it("includes appearances metadata (template, pattern, position, slot, alt)", () => {
    const run = makeRun({
      index: ["hero-cover"],
      "single-product": [],
    });
    const usages = collectImageRoles(run, lib);
    const hero = usages.find((u) => u.role === "hero_centerpiece")!;
    const app = hero.appearances[0]!;
    expect(app.template).toBe("templates/index.html");
    expect(app.pattern_id).toBe("hero-cover");
    expect(app.slot).toBe("hero_image");
    expect(app.position).toBe(0);
    expect(app.alt).toContain("hero_centerpiece"); // mock resolutions use role in alt
  });

  it("returns roles sorted by role then aspect", () => {
    const run = makeRun({
      index: ["category-trio", "hero-cover"],
      "single-product": [],
    });
    const usages = collectImageRoles(run, lib);
    const roles = usages.map((u) => u.role);
    const sorted = [...roles].sort();
    expect(roles).toEqual(sorted);
  });
});

describe("renderImageBrief", () => {
  it("produces a markdown doc with one section per role", () => {
    const run = makeRun({
      index: ["hero-cover", "category-trio"],
      "single-product": [],
    });
    const usages = collectImageRoles(run, lib);
    const md = renderImageBrief(usages, "Bellwether Coffee");
    expect(md).toMatch(/^# Image brief — Bellwether Coffee/);
    expect(md).toContain("Total distinct images to source: **2**");
    expect(md).toContain("`hero_centerpiece` — 16:9");
    expect(md).toContain("`category_tile` — 1:1");
    expect(md).toContain("File: `assets/placeholders/hero_centerpiece-16x9.svg`");
  });

  it("handles the zero-roles case gracefully", () => {
    const md = renderImageBrief([], "Empty Brand");
    expect(md).toContain("# Image brief — Empty Brand");
    expect(md).toContain("No image roles in use");
  });
});
