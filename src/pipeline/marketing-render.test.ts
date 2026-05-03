import { describe, it, expect } from "vitest";
import { renderMarketingFiles } from "./marketing-render.js";
import type { MarketingAssets } from "./marketing.js";
import type { ThemeMetadata } from "../theme-builder/scaffolds.js";

const meta: ThemeMetadata = {
  name: "Bellwether Coffee",
  slug: "bellwether-coffee",
  description: "Single-origin coffee, slow-roasted in small batches.",
  author: "woo-theme-forge",
  version: "1.0.0",
};

const assets: MarketingAssets = {
  headline: "A heritage-leaning, editorial WooCommerce theme for small-batch coffee roasters.",
  description:
    "A WooCommerce block theme for specialty coffee roasters. Five style variations and polished placeholders.",
  features: [
    "Full Site Editing block theme.",
    "Five variations switchable from Appearance → Styles.",
    "Newsletter, FAQ, testimonial patterns included.",
    "Theme.json palette and fluid type scale.",
    "Placeholder image system in one folder.",
  ],
  built_for: "Specialty coffee roasters and single-origin importers.",
  variations: [
    { slug: "light",     branded_title: "First Light",  one_liner: "Warm cream, generous spacing." },
    { slug: "dark",      branded_title: "Deep Roast",   one_liner: "Low-light palette." },
    { slug: "editorial", branded_title: "Press",        one_liner: "Bigger type, tighter rhythm." },
    { slug: "playful",   branded_title: "Sunday",       one_liner: "Saturated palette, pill buttons." },
    { slug: "mono",      branded_title: "Letterpress",  one_liner: "Grayscale palette, single accent." },
  ],
  demo_store_concept:
    "A demo site for a fictional Brooklyn roaster with three featured single-origins on the homepage.",
  screenshots_brief: [
    { page: "homepage",       width: 1440, notes: "Hero with image, USP strip, first row of products visible." },
    { page: "single-product", width: 1440, notes: "Image left, title + price + summary + add-to-cart right." },
    { page: "homepage",       width: 360,  notes: "Mobile homepage stacked." },
  ],
};

describe("renderMarketingFiles", () => {
  it("emits the expected files (six markdown + one JSON sidecar)", () => {
    const out = renderMarketingFiles(assets, meta);
    expect(Object.keys(out.files).sort()).toEqual([
      "changelog.md",
      "demo-concept.md",
      "description.md",
      "features.md",
      "screenshots-brief.json",
      "screenshots-brief.md",
      "variations.md",
    ]);
  });

  it("screenshots-brief.json is the brief in the shape Playwright + the deploy CLI consume", () => {
    const out = renderMarketingFiles(assets, meta);
    const parsed = JSON.parse(out.files["screenshots-brief.json"]!);
    expect(parsed).toEqual(assets.screenshots_brief);
  });

  it("description.md leads with the brand name and headline", () => {
    const out = renderMarketingFiles(assets, meta);
    const md = out.files["description.md"]!;
    expect(md.split("\n")[0]).toBe("# Bellwether Coffee");
    expect(md).toContain("_A heritage-leaning, editorial WooCommerce theme");
    expect(md).toContain("## Built for");
    expect(md).toContain("## Compatibility");
  });

  it("features.md renders each feature as a bullet", () => {
    const out = renderMarketingFiles(assets, meta);
    const md = out.files["features.md"]!;
    for (const f of assets.features) expect(md).toContain(`- ${f}`);
  });

  it("variations.md renders each variation with branded title + one-liner + file path", () => {
    const out = renderMarketingFiles(assets, meta);
    const md = out.files["variations.md"]!;
    for (const v of assets.variations) {
      expect(md, `variation ${v.slug}`).toContain(`## ${v.branded_title}`);
      expect(md, `variation ${v.slug}`).toContain(`styles/${v.slug}.json`);
      expect(md, `variation ${v.slug}`).toContain(v.one_liner);
    }
  });

  it("demo-concept.md surfaces the LLM-written paragraph", () => {
    const out = renderMarketingFiles(assets, meta);
    expect(out.files["demo-concept.md"]).toContain(assets.demo_store_concept);
  });

  it("screenshots-brief.md numbers each shot and includes the suggested filename", () => {
    const out = renderMarketingFiles(assets, meta);
    const md = out.files["screenshots-brief.md"]!;
    expect(md).toContain("## 1. `homepage` @ 1440px");
    expect(md).toContain("Filename: `screenshots/homepage-1440.png`");
    expect(md).toContain("## 3. `homepage` @ 360px");
  });

  it("changelog.md is deterministic — derived from theme metadata, not the LLM", () => {
    const out = renderMarketingFiles(assets, meta);
    const md = out.files["changelog.md"]!;
    expect(md).toContain("## 1.0.0");
    expect(md).toContain("Initial release.");
  });
});
