import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline } from "./run.js";
import { loadPatternLibrary } from "../pattern-library/loader.js";
import { BrandSpecSchema } from "../brand-spec/schema.js";
import { mockResolutionsFor } from "../pattern-library/mock-resolutions.js";
import { assertRoundTrip, validateMarkup } from "../theme-builder/validator.js";
import { ALL_VARIATIONS } from "./variations/index.js";
import type { LLM, LLMCallOptions } from "./llm.js";
import type { StageId } from "./config.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const lib = loadPatternLibrary();

const sampleBrandSpec = BrandSpecSchema.parse(
  JSON.parse(
    readFileSync(resolve(repoRoot, "samples/coffee-roaster/brand-spec.json"), "utf8"),
  ),
);

/**
 * Stub LLM that returns a different canned payload per stage. The
 * pattern-customizer stage is dynamic — produces mock resolutions on
 * demand based on the requested pattern (which we infer from the
 * tool description). That keeps the test honest end-to-end without
 * having to script every pattern by hand.
 */
function pipelineLLM(): LLM {
  const enriched = {
    copy_directives: ["Use 'roast' as a verb.", "Mention origin every section.", "Avoid hyperbole."],
    sample_product_categories: ["Single Origin", "Espresso", "Subscriptions"],
    sample_product_names: ["Yirgacheffe Konga", "House Espresso", "V60 Brewer", "Roastery Sub", "Tolima Decaf"],
  };

  const tokens = {
    palette: [
      { name: "Background", slug: "background", color: "#F6F1EA" },
      { name: "Background Alt", slug: "background-alt", color: "#E8D9C2" },
      { name: "Foreground", slug: "foreground", color: "#2E1F14" },
      { name: "Muted", slug: "muted", color: "#7A6757" },
      { name: "Primary", slug: "primary", color: "#A8531E" },
      { name: "Accent", slug: "accent", color: "#1A1A1A" },
    ],
    typography: {
      body: { fontFamily: "Inter, system-ui, sans-serif", fontSize: "1.0625rem", lineHeight: "1.6" },
      heading: { fontFamily: "Fraunces, Georgia, serif", fontWeight: "500", lineHeight: "1.05" },
      fluidScale: [0.9, 1.0625, 1.4, 2, 3.25],
    },
    spacing: {
      sectionY: "clamp(4rem, 3rem + 4vw, 6.5rem)",
      contentMaxWidth: "720px",
      wideMaxWidth: "1240px",
    },
    radius: { sm: "0px", md: "0px", lg: "0px" },
    density: "airy" as const,
  };

  const plan = {
    templates: {
      index: ["hero-cover", "usp-strip-three", "grid-3up", "category-trio", "newsletter-banner"],
      "single-product": ["single-product-classic", "usp-strip-three", "newsletter-banner"],
      "archive-product": ["grid-3up", "newsletter-banner"],
      page: ["hero-split", "newsletter-banner"],
    },
    parts: { footer: "footer-rich" },
  };

  const marketing = {
    headline: "A heritage-leaning, editorial WooCommerce theme for small-batch coffee roasters.",
    description:
      "A WooCommerce block theme designed for specialty coffee roasters who lead with the craft. Five style variations, polished placeholder images, and demo content patterns ready to fill with real products. Fluid typography and spacing carry through across breakpoints. Pairs the official WooCommerce cart and checkout blocks with editorial chrome, so you keep the proven storefront flows without losing the brand voice.",
    features: [
      "Full Site Editing block theme — edit every layout in the WP site editor.",
      "Five style variations switchable from Appearance → Styles.",
      "Newsletter, FAQ, testimonial, and category-showcase patterns included.",
      "Theme.json-driven palette, fluid type scale, and spacing tokens.",
      "Placeholder image system replaceable in one folder.",
    ],
    built_for:
      "Specialty coffee roasters, single-origin importers, and espresso bars that sell beans online and want a storefront whose typography and rhythm reflect the craft.",
    variations: [
      { slug: "light", branded_title: "First Light", one_liner: "Warm cream, generous spacing, serif headlines." },
      { slug: "dark", branded_title: "Deep Roast", one_liner: "Same shape, low-light palette, mood for evening browsing." },
      { slug: "editorial", branded_title: "Press", one_liner: "Bigger type, tighter rhythm, magazine feel." },
      { slug: "playful", branded_title: "Sunday", one_liner: "Saturated palette, pill buttons, looser breath." },
      { slug: "mono", branded_title: "Letterpress", one_liner: "Grayscale palette, single accent, gallery quiet." },
    ],
    demo_store_concept:
      "A demo site for a fictional Brooklyn roaster. Three featured single-origin coffees on the homepage with origin notes and roast dates, a category showcase pointing at Single Origin, Espresso, and Subscriptions, one customer testimonial about freshness, and a four-question FAQ covering shipping, brewing tips, returns, and wholesale.",
    screenshots_brief: [
      { page: "homepage", width: 1440, notes: "Full hero with image, the USP strip, and the first row of the product grid visible above the fold." },
      { page: "single-product", width: 1440, notes: "Product detail with image left, title + price + summary + add-to-cart right, FAQ below." },
      { page: "homepage", width: 360, notes: "Mobile homepage stacked: hero image, headline, CTA, then the USP strip wrapped to 1-column." },
    ],
  };

  return {
    async call<T>(opts: LLMCallOptions<T>): Promise<T> {
      const stage: StageId = opts.stage;
      if (stage === "brand-interpreter") return enriched as T;
      if (stage === "theme-json-generator") return tokens as T;
      if (stage === "template-planner") return plan as T;
      if (stage === "marketing") return marketing as T;
      if (stage === "pattern-customizer") {
        // Pull the pattern id out of the tool description ("...for the
        // \"<id>\" pattern...") so we can generate matching mock data.
        const m = /"([^"]+)" pattern/.exec(opts.toolDescription ?? "");
        const patternId = m?.[1];
        if (!patternId) throw new Error("test pipelineLLM: could not infer pattern id");
        const entry = lib.get(patternId);
        if (!entry) throw new Error(`test pipelineLLM: unknown pattern "${patternId}"`);
        return { resolutions: mockResolutionsFor(entry.pattern) } as T;
      }
      throw new Error(`test pipelineLLM: unhandled stage ${stage}`);
    },
  };
}

describe("runPipeline (end-to-end with mocked LLM)", () => {
  it("produces a complete in-memory bundle", async () => {
    const result = await runPipeline(sampleBrandSpec, { llm: pipelineLLM(), library: lib });

    // Every stage's intermediate is preserved for inspection.
    expect(result.brandSpec).toBe(sampleBrandSpec);
    expect(result.enrichedSpec.derived.copy_directives.length).toBeGreaterThanOrEqual(3);
    expect(result.themeTokens.palette.length).toBe(6);
    expect(result.themeJson.version).toBe(3);

    // All five style variations included.
    expect([...result.variations.keys()].sort()).toEqual(
      ALL_VARIATIONS.map((v) => v.slug).sort(),
    );
    expect(result.variations.size).toBe(5);

    // Variation titles are branded for the brand's primary mood, not
    // the mechanical labels — coffee-roaster spec is `heritage`.
    expect(result.variations.get("light")?.title).toBe("First Light");
    expect(result.variations.get("dark")?.title).toBe("Deep Roast");
    expect(result.variations.get("editorial")?.title).toBe("Press");
    expect(result.variations.get("playful")?.title).toBe("Sunday");
    expect(result.variations.get("mono")?.title).toBe("Letterpress");

    // Plan and customizations align.
    expect(Object.keys(result.templates).sort()).toEqual(
      ["archive-product", "index", "page", "single-product"].sort(),
    );
    expect(result.parts.footer).toMatch(/footer-rich|wp:group/); // serialized markup
    expect(result.parts.header).toContain("wp:site-title");
  });

  it("every produced template parses cleanly and round-trips", async () => {
    const result = await runPipeline(sampleBrandSpec, { llm: pipelineLLM(), library: lib });
    for (const [tpl, markup] of Object.entries(result.templates)) {
      expect(markup, `template ${tpl}`).toBeDefined();
      expect(validateMarkup(markup!), `template ${tpl} validation`).toEqual({ ok: true });
      expect(assertRoundTrip(markup!), `template ${tpl} round-trip`).toEqual({ ok: true });
    }
    expect(validateMarkup(result.parts.header)).toEqual({ ok: true });
    expect(assertRoundTrip(result.parts.header)).toEqual({ ok: true });
    expect(validateMarkup(result.parts.footer)).toEqual({ ok: true });
    expect(assertRoundTrip(result.parts.footer)).toEqual({ ok: true });
  });

  it("each template begins with a header template-part and ends with a footer template-part", async () => {
    const result = await runPipeline(sampleBrandSpec, { llm: pipelineLLM(), library: lib });
    for (const [tpl, markup] of Object.entries(result.templates)) {
      const m = markup!;
      const headerIdx = m.indexOf('wp:template-part {"slug":"header"');
      const footerIdx = m.indexOf('wp:template-part {"slug":"footer"');
      expect(headerIdx, `${tpl} header marker`).toBeGreaterThan(-1);
      expect(footerIdx, `${tpl} footer marker`).toBeGreaterThan(headerIdx);
    }
  });

  it("the customized map covers every planned pattern instance plus the footer", async () => {
    const result = await runPipeline(sampleBrandSpec, { llm: pipelineLLM(), library: lib });
    const expectedKeys: string[] = [];
    for (const [tpl, instances] of Object.entries(result.plan.templates)) {
      for (const instance of instances ?? []) {
        expectedKeys.push(`${tpl}:${instance.context.position}`);
      }
    }
    expectedKeys.push("parts/footer");
    expect([...result.customized.keys()].sort()).toEqual(expectedKeys.sort());
  });

  it("calls the LLM once per stage and once per planned pattern instance + footer", async () => {
    const llm = pipelineLLM();
    const calls: StageId[] = [];
    const wrapped: LLM = {
      async call(opts) {
        calls.push(opts.stage);
        return llm.call(opts);
      },
    };
    const result = await runPipeline(sampleBrandSpec, { llm: wrapped, library: lib });

    const customizerCount = Object.values(result.plan.templates).reduce(
      (n, list) => n + (list?.length ?? 0),
      0,
    ) + 1; // +1 for the footer

    expect(calls.filter((s) => s === "brand-interpreter")).toHaveLength(1);
    expect(calls.filter((s) => s === "theme-json-generator")).toHaveLength(1);
    expect(calls.filter((s) => s === "template-planner")).toHaveLength(1);
    expect(calls.filter((s) => s === "pattern-customizer")).toHaveLength(customizerCount);
    expect(calls.filter((s) => s === "marketing")).toHaveLength(1);
  });

  it("returns marketing assets with the canonical 5 variation entries", async () => {
    const result = await runPipeline(sampleBrandSpec, { llm: pipelineLLM(), library: lib });
    expect(result.marketing.headline).toMatch(/coffee/i);
    expect(result.marketing.features.length).toBeGreaterThanOrEqual(5);
    expect(result.marketing.variations.map((v) => v.slug).sort()).toEqual(
      ["dark", "editorial", "light", "mono", "playful"],
    );
  });

  it("uses the planner's header pick (with customization) when one is provided", async () => {
    // Build a custom LLM that picks header-stacked (which has a tagline slot).
    const innerLLM = pipelineLLM();
    const llm = {
      async call<T>(opts: Parameters<typeof innerLLM.call>[0]): Promise<T> {
        if (opts.stage === "template-planner") {
          return {
            templates: {
              index: ["hero-cover", "newsletter-banner"],
              "single-product": ["single-product-classic"],
              "archive-product": ["grid-3up"],
              page: ["hero-split"],
            },
            parts: { footer: "footer-rich", header: "header-stacked" },
          } as T;
        }
        return innerLLM.call(opts as never) as Promise<T>;
      },
    };
    const result = await runPipeline(sampleBrandSpec, { llm, library: lib });

    expect(result.plan.parts.header).toBe("header-stacked");
    // The customized map should now also contain a parts/header entry.
    expect(result.customized.has("parts/header")).toBe(true);
    // Header markup should reflect header-stacked's structure (has-muted-color
    // appears in the tagline paragraph), not the hardcoded skeleton.
    expect(result.parts.header).toContain("has-muted-color");
  });
});
