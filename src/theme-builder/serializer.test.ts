import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseBlocks } from "@wordpress/block-serialization-default-parser";
import { serialize } from "./serializer.js";
import type { PatternDef, SlotResolution } from "../pipeline/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

function loadPattern(relPath: string): PatternDef {
  return JSON.parse(readFileSync(resolve(repoRoot, relPath), "utf8")) as PatternDef;
}

function loadFixture(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), "utf8");
}

/**
 * Extract a contiguous block of lines (1-indexed, inclusive) from a file.
 * Lets us point tests at exact regions of hand-built reference output.
 */
function extractLines(text: string, fromLine: number, toLine: number): string {
  return text.split("\n").slice(fromLine - 1, toLine).join("\n");
}

describe("serializer: hero-split", () => {
  const heroPattern = loadPattern("patterns/hero/hero-split.json");
  const indexHtml = loadFixture("samples/coffee-roaster/output/templates/index.html");
  const heroExpected = extractLines(indexHtml, 3, 34);

  const resolutions: Record<string, SlotResolution> = {
    headline: {
      type: "text",
      value: "Single-origin coffee, slow-roasted in small batches.",
    },
    subhead: {
      type: "text",
      value:
        "Beans sourced from named farms across Ethiopia, Colombia, and Guatemala. Roasted Tuesday through Thursday on a 5kg drum. Shipped within 48 hours.",
    },
    cta_label: { type: "text", value: "Shop the roast" },
    cta_url: { type: "url", value: "/shop" },
    image: {
      type: "image_role",
      role: "hero_lifestyle",
      aspect: "4:5",
      alt: "Hero lifestyle photograph",
    },
  };

  it("emits block markup matching the hand-built index.html excerpt", () => {
    const out = serialize(heroPattern.tree, resolutions);
    expect(out).toBe(heroExpected);
  });

  it("round-trips through the WordPress block parser", () => {
    const out = serialize(heroPattern.tree, resolutions);
    const parsed = parseBlocks(out).filter((b) => b.blockName !== null);

    // The pattern has a single top-level group block.
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.blockName).toBe("core/group");

    // Re-emitting the parsed tree shape must match the original tree shape:
    // every block name and the nesting structure must agree.
    const stripToShape = (b: { blockName: string | null; innerBlocks: unknown[] }): unknown => ({
      name: b.blockName,
      innerBlocks: (b.innerBlocks as { blockName: string | null; innerBlocks: unknown[] }[]).map(
        stripToShape,
      ),
    });
    const parsedShape = parsed.map(stripToShape);

    const treeShape = heroPattern.tree.map(function shape(b): unknown {
      return { name: b.name, innerBlocks: (b.innerBlocks ?? []).map(shape) };
    });

    expect(parsedShape).toEqual(treeShape);
  });

  it("preserves block attrs verbatim through a round-trip", () => {
    const out = serialize(heroPattern.tree, resolutions);
    const parsed = parseBlocks(out).filter((b) => b.blockName !== null);

    const collectAttrs = (b: {
      blockName: string | null;
      attrs: Record<string, unknown> | null;
      innerBlocks: unknown[];
    }): unknown => ({
      name: b.blockName,
      attrs: b.attrs ?? {},
      children: (b.innerBlocks as Parameters<typeof collectAttrs>[0][]).map(collectAttrs),
    });
    const treeAttrs = heroPattern.tree.map(function attrs(b): unknown {
      return {
        name: b.name,
        attrs: b.attrs ?? {},
        children: (b.innerBlocks ?? []).map(attrs),
      };
    });

    expect(parsed.map(collectAttrs)).toEqual(treeAttrs);
  });
});

describe("serializer: grid-3up", () => {
  const pattern = loadPattern("patterns/product-grid/grid-3up.json");
  const indexHtml = loadFixture("samples/coffee-roaster/output/templates/index.html");
  // The grid-3up section is the second top-level pattern in the hand-built
  // index.html: lines 36–62 inclusive (one outer wp:group plus its body).
  const expected = extractLines(indexHtml, 36, 62);

  const resolutions: Record<string, SlotResolution> = {
    section_eyebrow: { type: "text", value: "This week's roast" },
    section_heading: { type: "text", value: "Three coffees on the bench" },
    section_blurb: {
      type: "text",
      value:
        "Rotating selection from this week's roast. Drink them within four weeks of the roast date for best results.",
    },
  };

  it("emits block markup matching the hand-built index.html grid section", () => {
    const out = serialize(pattern.tree, resolutions);
    expect(out).toBe(expected);
  });

  it("round-trips through the WordPress block parser", () => {
    const out = serialize(pattern.tree, resolutions);
    const parsed = parseBlocks(out).filter((b) => b.blockName !== null);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.blockName).toBe("core/group");
  });
});

describe("serializer: footer-rich", () => {
  const pattern = loadPattern("patterns/footer/footer-rich.json");
  const expected = loadFixture("samples/coffee-roaster/output/parts/footer.html").trimEnd();

  const link = (label: string, url: string) => ({
    label: { type: "text" as const, value: label },
    url: { type: "url" as const, value: url },
  });

  const resolutions: Record<string, SlotResolution> = {
    brand_blurb: {
      type: "text",
      value:
        "Small-batch specialty coffee, sourced from named farms and roasted three days a week in Brooklyn, New York.",
    },
    shop_links: {
      type: "repeater",
      items: [
        link("All coffees", "/shop"),
        link("Single origin", "/shop/single-origin"),
        link("Subscriptions", "/shop/subscriptions"),
        link("Brewing gear", "/shop/gear"),
      ],
    },
    support_links: {
      type: "repeater",
      items: [
        link("Shipping", "/shipping"),
        link("Contact", "/contact"),
        link("Wholesale", "/wholesale"),
        link("About us", "/about"),
      ],
    },
    newsletter_blurb: {
      type: "text",
      value: "Roast notes, brew tips, and new arrivals. One email a week, no more.",
    },
    copyright: { type: "text", value: "© 2026 Bellwether Coffee. Roasted in Brooklyn." },
  };

  it("emits block markup matching the hand-built footer.html", () => {
    const out = serialize(pattern.tree, resolutions);
    expect(out).toBe(expected);
  });

  it("output parses cleanly (no orphaned comments)", () => {
    const out = serialize(pattern.tree, resolutions);
    const parsed = parseBlocks(out).filter((b) => b.blockName !== null);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.blockName).toBe("core/group");
  });
});
