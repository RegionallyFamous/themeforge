import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateMarketing,
  MarketingAssetsSchema,
  __testing,
  VARIATION_SLUGS,
  type MarketingAssets,
} from "./marketing.js";
import { BrandSpecSchema } from "../brand-spec/schema.js";
import type { LLM } from "./llm.js";
import type { EnrichedBrandSpec, TemplatePlan } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const sampleSpec = BrandSpecSchema.parse(
  JSON.parse(readFileSync(resolve(repoRoot, "samples/coffee-roaster/brand-spec.json"), "utf8")),
);

const enrichedSpec: EnrichedBrandSpec = {
  ...sampleSpec,
  derived: {
    copy_directives: ["Use 'roast' as a verb.", "Mention origin every section.", "Avoid hyperbole."],
    sample_product_categories: ["Single Origin", "Espresso", "Subscriptions"],
    sample_product_names: ["Yirgacheffe Konga", "House Espresso", "V60 Brewer", "Roastery Sub", "Tolima Decaf"],
  },
};

const samplePlan: TemplatePlan = {
  templates: {
    index: [
      { pattern_id: "hero-cover",       context: { template: "index", position: 0 } },
      { pattern_id: "usp-strip-three",  context: { template: "index", position: 1 } },
      { pattern_id: "grid-3up",         context: { template: "index", position: 2 } },
    ],
    "single-product": [
      { pattern_id: "single-product-classic", context: { template: "single-product", position: 0 } },
    ],
  },
  parts: { footer: "footer-rich" },
};

const sampleVariations = [
  { slug: "light"     as const, branded_title: "First Light"  },
  { slug: "dark"      as const, branded_title: "Deep Roast"   },
  { slug: "editorial" as const, branded_title: "Press"        },
  { slug: "playful"   as const, branded_title: "Sunday"       },
  { slug: "mono"      as const, branded_title: "Letterpress"  },
];

const validAssets: MarketingAssets = {
  headline: "A heritage-leaning, editorial WooCommerce theme for small-batch coffee roasters.",
  description:
    "A WooCommerce block theme for specialty coffee roasters. Five style variations, polished placeholders, and patterns ready to fill with real products. Fluid typography and spacing carry through breakpoints. Pairs the official WooCommerce cart and checkout blocks with editorial chrome.",
  features: [
    "Full Site Editing block theme — edit every layout in the WP site editor.",
    "Five style variations switchable from Appearance → Styles.",
    "Newsletter, FAQ, testimonial, and category-showcase patterns included.",
    "Theme.json-driven palette, fluid type scale, and spacing tokens.",
    "Placeholder image system replaceable in one folder.",
  ],
  built_for:
    "Specialty coffee roasters, single-origin importers, and espresso bars selling beans online.",
  variations: sampleVariations.map((v) => ({
    slug: v.slug,
    branded_title: v.branded_title,
    one_liner: `${v.branded_title} variation, evocative one-liner.`,
  })),
  demo_store_concept:
    "A demo site for a fictional Brooklyn roaster with three featured single-origin coffees on the homepage, a category showcase pointing at Single Origin / Espresso / Subscriptions, one customer testimonial, and a four-question FAQ.",
  screenshots_brief: [
    { page: "homepage",       width: 1440, notes: "Hero, USP strip, and the first row of the product grid above the fold." },
    { page: "single-product", width: 1440, notes: "Product detail with image left, title + price + summary + add-to-cart right." },
    { page: "homepage",       width: 360,  notes: "Mobile homepage stacked: hero image, headline, CTA, then USP strip." },
  ],
};

function fakeLLM(payload: unknown): LLM & { call: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(async (_opts: unknown) => payload as never);
  return { call: fn } as unknown as LLM & { call: ReturnType<typeof vi.fn> };
}

// ── Schema tests ────────────────────────────────────────────────────────

describe("MarketingAssetsSchema", () => {
  it("accepts the canonical valid payload", () => {
    expect(MarketingAssetsSchema.safeParse(validAssets).success).toBe(true);
  });

  it("rejects when a variation slug is repeated", () => {
    const bad = {
      ...validAssets,
      variations: [
        ...validAssets.variations.slice(0, 4),
        { ...validAssets.variations[0]! }, // duplicate "light"
      ],
    };
    expect(MarketingAssetsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects when a variation slug is missing entirely", () => {
    // Re-use one of the existing slugs in place of "mono" — passes
    // length check but fails the cover-all-five refinement.
    const bad = {
      ...validAssets,
      variations: validAssets.variations.map((v) =>
        v.slug === "mono" ? { ...v, slug: "light" as const } : v,
      ),
    };
    expect(MarketingAssetsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects when no homepage shot at desktop width is present", () => {
    const bad = {
      ...validAssets,
      screenshots_brief: validAssets.screenshots_brief.map((s) =>
        s.page === "homepage" && s.width === 1440 ? { ...s, page: "page" as const } : s,
      ),
    };
    expect(MarketingAssetsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects when no shot at viewport <= 768 is present", () => {
    const bad = {
      ...validAssets,
      screenshots_brief: validAssets.screenshots_brief.map((s) =>
        s.width === 360 ? { ...s, width: 1280 } : s,
      ),
    };
    expect(MarketingAssetsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects too-short description", () => {
    const bad = { ...validAssets, description: "too short" };
    expect(MarketingAssetsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects fewer than 5 features", () => {
    const bad = { ...validAssets, features: validAssets.features.slice(0, 4) };
    expect(MarketingAssetsSchema.safeParse(bad).success).toBe(false);
  });
});

// ── Stage tests ─────────────────────────────────────────────────────────

describe("generateMarketing", () => {
  it("calls the LLM with the marketing stage and embeds plan + variations + spec", async () => {
    const llm = fakeLLM(validAssets);
    await generateMarketing(
      { spec: enrichedSpec, plan: samplePlan, variations: sampleVariations },
      llm,
    );
    const opts = llm.call.mock.calls[0]![0] as { stage: string; userPrompt: string };
    expect(opts.stage).toBe("marketing");
    expect(opts.userPrompt).toContain("Bellwether Coffee");
    expect(opts.userPrompt).toContain("hero-cover");
    expect(opts.userPrompt).toContain("First Light");
    expect(opts.userPrompt).toContain("footer-rich");
  });

  it("returns the LLM payload directly when valid", async () => {
    const llm = fakeLLM(validAssets);
    const out = await generateMarketing(
      { spec: enrichedSpec, plan: samplePlan, variations: sampleVariations },
      llm,
    );
    expect(out).toEqual(validAssets);
  });

  it("system prompt names every required field for the model", () => {
    expect(__testing.SYSTEM_PROMPT).toContain("MarketingAssets");
    expect(__testing.SYSTEM_PROMPT).toContain("variation");
    expect(__testing.SYSTEM_PROMPT).toContain("screenshots_brief");
    expect(__testing.SYSTEM_PROMPT).toContain("demo_store_concept");
  });

  it("VARIATION_SLUGS matches the project's five canonical variation slugs", () => {
    expect([...VARIATION_SLUGS].sort()).toEqual(
      ["dark", "editorial", "light", "mono", "playful"],
    );
  });
});
