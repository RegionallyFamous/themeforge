import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serialize } from "./serializer.js";
import { assertRoundTrip, validateMarkup } from "./validator.js";
import type { PatternDef, SlotResolution } from "../pipeline/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

function loadPattern(rel: string): PatternDef {
  return JSON.parse(readFileSync(resolve(repoRoot, rel), "utf8")) as PatternDef;
}

function loadFixture(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

describe("validateMarkup", () => {
  it("accepts the hand-built coffee-roaster footer.html", () => {
    const result = validateMarkup(loadFixture("samples/coffee-roaster/output/parts/footer.html"));
    expect(result).toEqual({ ok: true });
  });

  it("accepts the hand-built coffee-roaster index.html template", () => {
    const result = validateMarkup(
      loadFixture("samples/coffee-roaster/output/templates/index.html"),
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects markup with stray text outside block comments", () => {
    const bad = `<!-- wp:paragraph -->\n<p>ok</p>\n<!-- /wp:paragraph -->\nrogue text not in any block`;
    const result = validateMarkup(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toMatch(/freeform content/);
    }
  });
});

describe("assertRoundTrip", () => {
  it("round-trips the hero-split serializer output byte-for-byte", () => {
    const pattern = loadPattern("patterns/hero/hero-split.json");
    const resolutions: Record<string, SlotResolution> = {
      headline: { type: "text", value: "Headline" },
      subhead: { type: "text", value: "Subhead copy goes here." },
      cta_label: { type: "text", value: "Shop now" },
      cta_url: { type: "url", value: "/shop" },
      image: {
        type: "image_role",
        role: "hero_lifestyle",
        aspect: "4:5",
        alt: "Hero photo",
      },
    };
    const markup = serialize(pattern.tree, resolutions);
    expect(assertRoundTrip(markup)).toEqual({ ok: true });
  });

  it("round-trips the footer-rich serializer output byte-for-byte", () => {
    const pattern = loadPattern("patterns/footer/footer-rich.json");
    const link = (label: string, url: string) => ({
      label: { type: "text" as const, value: label },
      url: { type: "url" as const, value: url },
    });
    const resolutions: Record<string, SlotResolution> = {
      brand_blurb: { type: "text", value: "Blurb" },
      shop_links: { type: "repeater", items: [link("Shop", "/shop"), link("Sale", "/sale")] },
      support_links: {
        type: "repeater",
        items: [link("Help", "/help"), link("Returns", "/returns")],
      },
      newsletter_blurb: { type: "text", value: "Subscribe to our newsletter." },
      copyright: { type: "text", value: "© 2026 Brand." },
    };
    const markup = serialize(pattern.tree, resolutions);
    expect(assertRoundTrip(markup)).toEqual({ ok: true });
  });

  it("round-trips the grid-3up serializer output byte-for-byte", () => {
    const pattern = loadPattern("patterns/product-grid/grid-3up.json");
    const resolutions: Record<string, SlotResolution> = {
      section_eyebrow: { type: "text", value: "Eyebrow" },
      section_heading: { type: "text", value: "Heading" },
      section_blurb: { type: "text", value: "Blurb." },
    };
    const markup = serialize(pattern.tree, resolutions);
    expect(assertRoundTrip(markup)).toEqual({ ok: true });
  });

  it("round-trips the hand-built footer.html fixture", () => {
    expect(
      assertRoundTrip(loadFixture("samples/coffee-roaster/output/parts/footer.html")),
    ).toEqual({ ok: true });
  });
});
