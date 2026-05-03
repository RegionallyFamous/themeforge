import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  customizePattern,
  buildResolutionSchema,
  describeSlots,
} from "./pattern-customizer.js";
import { loadPatternLibrary } from "../pattern-library/loader.js";
import { BrandSpecSchema } from "../brand-spec/schema.js";
import { serialize } from "../theme-builder/serializer.js";
import { assertRoundTrip } from "../theme-builder/validator.js";
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
    copy_directives: ["Use 'roast' as a verb.", "Mention origin.", "Avoid hyperbole."],
    sample_product_categories: ["Single Origin", "Espresso", "Subscriptions"],
    sample_product_names: ["Yirgacheffe Konga", "House Espresso", "V60 Brewer", "Roastery Sub", "Tolima Decaf"],
  },
};

function fakeLLM(payload: unknown): LLM & { call: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(async (_opts: unknown) => payload as never);
  return { call: fn } as unknown as LLM & { call: ReturnType<typeof vi.fn> };
}

// ── buildResolutionSchema ───────────────────────────────────────────────

describe("buildResolutionSchema", () => {
  it("accepts a valid resolution map for the hero-cover pattern", () => {
    const pattern = lib.get("hero-cover")!.pattern;
    const schema = buildResolutionSchema(pattern);
    const ok = {
      resolutions: {
        hero_image: { type: "image_role", role: "hero_centerpiece", aspect: "16:9", alt: "Lineup of bags." },
        headline:   { type: "text", value: "Coffee with a roast date you can taste." },
        subhead:    { type: "text", value: "Single-origin beans, roasted three days a week." },
        cta_label:  { type: "text", value: "Shop the roast" },
        cta_url:    { type: "url",  value: "/shop" },
      },
    };
    expect(schema.safeParse(ok).success).toBe(true);
  });

  it("rejects text exceeding the slot's max_chars", () => {
    const pattern = lib.get("hero-cover")!.pattern;
    const schema = buildResolutionSchema(pattern);
    const bad = {
      resolutions: {
        hero_image: { type: "image_role", role: "hero_centerpiece", aspect: "16:9", alt: "alt" },
        headline:   { type: "text", value: "x".repeat(81) }, // max is 80
        subhead:    { type: "text", value: "ok" },
        cta_label:  { type: "text", value: "Shop" },
        cta_url:    { type: "url",  value: "/shop" },
      },
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("rejects an image_role with the wrong aspect literal", () => {
    const pattern = lib.get("hero-cover")!.pattern;
    const schema = buildResolutionSchema(pattern);
    const bad = {
      resolutions: {
        hero_image: { type: "image_role", role: "hero_centerpiece", aspect: "1:1", alt: "alt" }, // hero-cover wants 16:9
        headline:   { type: "text", value: "Headline" },
        subhead:    { type: "text", value: "Subhead" },
        cta_label:  { type: "text", value: "Shop" },
        cta_url:    { type: "url",  value: "/shop" },
      },
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("validates repeater slots (footer-rich shop_links)", () => {
    const pattern = lib.get("footer-rich")!.pattern;
    const schema = buildResolutionSchema(pattern);
    const tooFew = {
      resolutions: {
        brand_blurb: { type: "text", value: "Blurb." },
        shop_links:  { type: "repeater", items: [{ label: { type: "text", value: "Shop" }, url: { type: "url", value: "/shop" } }] },
        support_links: { type: "repeater", items: [
          { label: { type: "text", value: "Help" },    url: { type: "url", value: "/help" } },
          { label: { type: "text", value: "Returns" }, url: { type: "url", value: "/returns" } },
          { label: { type: "text", value: "Contact" }, url: { type: "url", value: "/contact" } },
        ] },
        newsletter_blurb: { type: "text", value: "Subscribe." },
        copyright: { type: "text", value: "(c) 2026" },
      },
    };
    // shop_links min is 3 — 1 item should fail.
    expect(schema.safeParse(tooFew).success).toBe(false);
  });

  it("validates a repeater for the faq-accordion pattern", () => {
    const pattern = lib.get("faq-accordion")!.pattern;
    const schema = buildResolutionSchema(pattern);
    const ok = {
      resolutions: {
        section_heading: { type: "text", value: "Frequently asked" },
        faqs: { type: "repeater", items: [
          { question: { type: "text", value: "When do you roast?" }, answer: { type: "text", value: "Tuesday through Thursday." } },
          { question: { type: "text", value: "Shipping?" },          answer: { type: "text", value: "Within 48 hours of roast." } },
          { question: { type: "text", value: "Returns?" },           answer: { type: "text", value: "Email us within 30 days." } },
        ] },
      },
    };
    expect(schema.safeParse(ok).success).toBe(true);
  });
});

// ── describeSlots ───────────────────────────────────────────────────────

describe("describeSlots", () => {
  it("renders one line per slot with type metadata", () => {
    const pattern = lib.get("hero-cover")!.pattern;
    const out = describeSlots(pattern);
    expect(out).toContain("headline: text (max 80 chars, tone: hero)");
    expect(out).toContain("hero_image: image_role (role: hero_centerpiece, aspect: 16:9)");
    expect(out).toContain("cta_url: url (default: /shop)");
  });

  it("describes repeater slots with item count and field names", () => {
    const pattern = lib.get("faq-accordion")!.pattern;
    const out = describeSlots(pattern);
    expect(out).toContain("faqs: repeater (3–10 items, each with: question, answer)");
  });
});

// ── customizePattern (mocked LLM) ───────────────────────────────────────

describe("customizePattern", () => {
  const heroResolutions = {
    resolutions: {
      hero_image: { type: "image_role", role: "hero_centerpiece", aspect: "16:9", alt: "A morning roast." },
      headline:   { type: "text", value: "Coffee with a roast date you can taste." },
      subhead:    { type: "text", value: "Single-origin beans roasted three days a week." },
      cta_label:  { type: "text", value: "Shop the roast" },
      cta_url:    { type: "url",  value: "/shop" },
    },
  };

  it("returns CustomizedPattern with pattern_id + resolutions", async () => {
    const llm = fakeLLM(heroResolutions);
    const out = await customizePattern(
      enrichedSpec,
      lib.get("hero-cover")!.pattern,
      { template: "index", position: 0 },
      llm,
    );
    expect(out.pattern_id).toBe("hero-cover");
    expect(out.resolutions).toEqual(heroResolutions.resolutions);
  });

  it("calls the LLM with the pattern-customizer stage and embeds spec + slots + context", async () => {
    const llm = fakeLLM(heroResolutions);
    await customizePattern(
      enrichedSpec,
      lib.get("hero-cover")!.pattern,
      { template: "index", position: 2 },
      llm,
    );
    const opts = llm.call.mock.calls[0]![0] as { stage: string; userPrompt: string };
    expect(opts.stage).toBe("pattern-customizer");
    expect(opts.userPrompt).toContain("Bellwether Coffee");
    expect(opts.userPrompt).toContain("hero-cover");
    expect(opts.userPrompt).toContain("position 2 in `index`");
    expect(opts.userPrompt).toContain("Yirgacheffe Konga"); // sample names from derived
  });

  it("output flows through the serializer and round-trips", async () => {
    const llm = fakeLLM(heroResolutions);
    const customized = await customizePattern(
      enrichedSpec,
      lib.get("hero-cover")!.pattern,
      { template: "index", position: 0 },
      llm,
    );
    const markup = serialize(lib.get("hero-cover")!.pattern.tree, customized.resolutions);
    expect(assertRoundTrip(markup)).toEqual({ ok: true });
    expect(markup).toContain("Coffee with a roast date you can taste.");
  });
});
