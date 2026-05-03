import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planTemplates,
  buildPlannerSchema,
  renderCatalog,
  PLANNABLE_TEMPLATES,
} from "./template-planner.js";
import { loadPatternLibrary } from "../pattern-library/loader.js";
import { BrandSpecSchema } from "../brand-spec/schema.js";
import type { LLM } from "./llm.js";
import type { EnrichedBrandSpec } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const lib = loadPatternLibrary();

const enrichedSpec: EnrichedBrandSpec = {
  ...BrandSpecSchema.parse(
    JSON.parse(
      readFileSync(resolve(repoRoot, "samples/coffee-roaster/brand-spec.json"), "utf8"),
    ),
  ),
  derived: {
    copy_directives: ["Use 'roast' as a verb.", "Mention origin every section.", "Avoid hyperbole."],
    sample_product_categories: ["Single Origin", "Espresso", "Subscriptions"],
    sample_product_names: ["Yirgacheffe Konga", "House Espresso", "V60 Brewer", "Roastery Sub", "Decaf Tolima"],
  },
};

const validPlan = {
  templates: {
    index: ["hero-cover", "usp-strip-three", "grid-3up", "category-trio", "testimonial-single", "newsletter-banner"],
    "single-product": ["single-product-classic", "usp-strip-three", "faq-accordion", "newsletter-banner"],
    "archive-product": ["grid-3up", "newsletter-banner"],
    page: ["hero-split", "testimonial-single", "newsletter-banner"],
  },
  parts: { footer: "footer-rich" },
};

function fakeLLM(payload: unknown): LLM & { call: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(async (_opts: unknown) => payload as never);
  return { call: fn } as unknown as LLM & { call: ReturnType<typeof vi.fn> };
}

describe("buildPlannerSchema", () => {
  it("accepts a valid plan against the real library", () => {
    const { schema } = buildPlannerSchema(lib);
    expect(schema.safeParse(validPlan).success).toBe(true);
  });

  it("rejects an unknown pattern id", () => {
    const { schema } = buildPlannerSchema(lib);
    const bad = {
      ...validPlan,
      templates: { ...validPlan.templates, index: ["does-not-exist"] },
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("rejects a pattern assigned to an incompatible template", () => {
    // hero-split is not compatible with single-product
    const { schema } = buildPlannerSchema(lib);
    const bad = {
      ...validPlan,
      templates: { ...validPlan.templates, "single-product": ["hero-split", "newsletter-banner"] },
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate patterns within the same template", () => {
    const { schema } = buildPlannerSchema(lib);
    const bad = {
      ...validPlan,
      templates: {
        ...validPlan.templates,
        index: ["hero-cover", "hero-cover", "newsletter-banner"],
      },
    };
    const r = schema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /more than once/.test(i.message))).toBe(true);
    }
  });

  it("rejects a non-footer pattern as the footer pick", () => {
    const { schema } = buildPlannerSchema(lib);
    const bad = { ...validPlan, parts: { footer: "hero-cover" } };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("accepts an optional header pick from the header category", () => {
    const { schema } = buildPlannerSchema(lib);
    const withHeader = {
      ...validPlan,
      parts: { footer: "footer-rich", header: "header-classic" },
    };
    expect(schema.safeParse(withHeader).success).toBe(true);
  });

  it("rejects a non-header pattern in the header slot", () => {
    const { schema } = buildPlannerSchema(lib);
    const bad = {
      ...validPlan,
      parts: { footer: "footer-rich", header: "hero-cover" },
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("indexes patterns by id for downstream lookups", () => {
    const { byId } = buildPlannerSchema(lib);
    expect(byId.size).toBe(lib.size);
    expect(byId.get("hero-cover")?.category).toBe("hero");
  });
});

describe("renderCatalog", () => {
  it("renders one section per plannable template plus footer", () => {
    const out = renderCatalog(lib);
    for (const tpl of PLANNABLE_TEMPLATES) {
      expect(out, `expected catalog to mention template ${tpl}`).toContain(`\`${tpl}\``);
    }
    expect(out).toContain("Footer patterns");
  });

  it("only lists patterns within their compatible_templates section", () => {
    const out = renderCatalog(lib);
    // single-product-classic is compatible only with single-product
    const lines = out.split("\n");
    const sectionStart = lines.findIndex((l) => l.includes("`index`"));
    const sectionEnd = lines.findIndex(
      (l, i) => i > sectionStart && l.startsWith("Patterns valid"),
    );
    const indexSection = lines.slice(sectionStart, sectionEnd).join("\n");
    expect(indexSection).not.toContain("single-product-classic");
  });
});

describe("planTemplates", () => {
  it("calls the LLM with the template-planner stage and embeds catalog + spec", async () => {
    const llm = fakeLLM(validPlan);
    await planTemplates(enrichedSpec, lib, llm);

    expect(llm.call).toHaveBeenCalledTimes(1);
    const opts = llm.call.mock.calls[0]![0] as { stage: string; userPrompt: string };
    expect(opts.stage).toBe("template-planner");
    expect(opts.userPrompt).toContain("Bellwether Coffee");
    expect(opts.userPrompt).toContain("Patterns valid for `index`");
  });

  it("lifts the LLM output into TemplatePlan with positions assigned by array index", async () => {
    const llm = fakeLLM(validPlan);
    const plan = await planTemplates(enrichedSpec, lib, llm);

    expect(plan.parts.footer).toBe("footer-rich");

    const indexPlan = plan.templates.index!;
    expect(indexPlan).toHaveLength(6);
    expect(indexPlan[0]).toEqual({
      pattern_id: "hero-cover",
      context: { template: "index", position: 0 },
    });
    expect(indexPlan[5]).toEqual({
      pattern_id: "newsletter-banner",
      context: { template: "index", position: 5 },
    });
  });

  it("preserves all four plannable templates", async () => {
    const llm = fakeLLM(validPlan);
    const plan = await planTemplates(enrichedSpec, lib, llm);
    expect(Object.keys(plan.templates).sort()).toEqual(
      ["archive-product", "index", "page", "single-product"].sort(),
    );
  });

  it("passes through an optional header pick when the LLM provides one", async () => {
    const llm = fakeLLM({
      ...validPlan,
      parts: { footer: "footer-rich", header: "header-centered" },
    });
    const plan = await planTemplates(enrichedSpec, lib, llm);
    expect(plan.parts.header).toBe("header-centered");
    expect(plan.parts.footer).toBe("footer-rich");
  });

  it("omits header from the lifted plan when the LLM doesn't pick one", async () => {
    const llm = fakeLLM(validPlan); // no header in validPlan
    const plan = await planTemplates(enrichedSpec, lib, llm);
    expect(plan.parts.header).toBeUndefined();
  });
});
