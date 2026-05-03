/**
 * Phase 2 completion check (the part I can verify automatically):
 * hand-compose a homepage template from five Phase 2 patterns plus
 * header/footer template-parts and prove it parses, round-trips, and
 * contains every section in the right order.
 *
 * The committed snapshot at `samples/coffee-roaster/output/templates/
 * index-phase2.html` is the human-readable artifact — auditors can open
 * it and see the assembled output without running anything. The
 * remaining Phase 2 check (install in WP + WooCommerce, click through at
 * three breakpoints) has to happen in a real WP environment and is
 * tracked in the Phase 2 status report, not here.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPatternLibrary } from "./loader.js";
import { serialize } from "../theme-builder/serializer.js";
import { assertRoundTrip, validateMarkup } from "../theme-builder/validator.js";
import type { BlockNode, SlotResolution } from "../pipeline/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const SNAPSHOT_PATH = resolve(
  repoRoot,
  "samples/coffee-roaster/output/templates/index-phase2.html",
);

const lib = loadPatternLibrary();

function pattern(id: string) {
  const entry = lib.get(id);
  if (!entry) throw new Error(`Test fixture: pattern "${id}" not in library`);
  return entry.pattern;
}

const heroResolutions: Record<string, SlotResolution> = {
  hero_image: {
    type: "image_role",
    role: "hero_centerpiece",
    aspect: "16:9",
    alt: "Bellwether Coffee — week's roast lineup",
  },
  headline: { type: "text", value: "Coffee with a roast date you can taste." },
  subhead: {
    type: "text",
    value:
      "Single-origin beans from named farms, roasted on a 5kg drum and shipped within 48 hours.",
  },
  cta_label: { type: "text", value: "Shop this week" },
  cta_url: { type: "url", value: "/shop" },
};

const uspResolutions: Record<string, SlotResolution> = {
  usp_1_title: { type: "text", value: "Roasted to order" },
  usp_1_body: {
    type: "text",
    value: "Every order starts as green coffee. We roast Tuesday through Thursday.",
  },
  usp_2_title: { type: "text", value: "Direct from the farm" },
  usp_2_body: {
    type: "text",
    value: "We pay above Fair Trade and name every grower on the bag.",
  },
  usp_3_title: { type: "text", value: "Brew tips inside" },
  usp_3_body: { type: "text", value: "Each bag ships with a recipe card for two brewing methods." },
};

const gridResolutions: Record<string, SlotResolution> = {
  section_eyebrow: { type: "text", value: "This week's roast" },
  section_heading: { type: "text", value: "Three coffees on the bench" },
  section_blurb: {
    type: "text",
    value:
      "Rotating selection from this week's roast. Drink them within four weeks of the roast date for best results.",
  },
};

const testimonialResolutions: Record<string, SlotResolution> = {
  quote_text: {
    type: "text",
    value:
      "I've been ordering from Bellwether for two years. Every shipment arrives within a week of the roast date — you can taste it.",
  },
  attribution: { type: "text", value: "— Marta L., Brooklyn" },
};

const newsletterResolutions: Record<string, SlotResolution> = {
  heading: { type: "text", value: "Roast notes in your inbox" },
  blurb: {
    type: "text",
    value:
      "One email a week: what we're roasting, why we picked it, and how we'd brew it. Unsubscribe anytime.",
  },
};

function templatePart(slug: string, tag: string): BlockNode {
  return {
    name: "core/template-part",
    attrs: { slug, tagName: tag },
  };
}

function stitch(): string {
  const sections: string[] = [
    serialize([templatePart("header", "header")]),
    serialize(pattern("hero-cover").tree, heroResolutions),
    serialize(pattern("usp-strip-three").tree, uspResolutions),
    serialize(pattern("grid-3up").tree, gridResolutions),
    serialize(pattern("testimonial-single").tree, testimonialResolutions),
    serialize(pattern("newsletter-banner").tree, newsletterResolutions),
    serialize([templatePart("footer", "footer")]),
  ];
  // Single blank line between top-level sections (matches the Phase 1
  // hand-built reference's template-level rhythm) plus a trailing newline.
  return sections.join("\n\n") + "\n";
}

describe("Phase 2 stitched coffee-roaster index template", () => {
  const stitched = stitch();

  it("validates as well-formed block markup", () => {
    expect(validateMarkup(stitched)).toEqual({ ok: true });
  });

  it("round-trips byte-for-byte through the WordPress parser", () => {
    expect(assertRoundTrip(stitched)).toEqual({ ok: true });
  });

  it("contains every section in the expected order", () => {
    const markers = [
      'wp:template-part {"slug":"header"',
      "Coffee with a roast date you can taste.",
      "Roasted to order",
      "Three coffees on the bench",
      "I've been ordering from Bellwether",
      "Roast notes in your inbox",
      'wp:template-part {"slug":"footer"',
    ];
    let cursor = 0;
    for (const marker of markers) {
      const idx = stitched.indexOf(marker, cursor);
      expect(idx, `expected to find "${marker}" after position ${cursor}`).toBeGreaterThan(-1);
      cursor = idx + marker.length;
    }
  });

  it("matches the committed sample at index-phase2.html", () => {
    // Snapshot. If a pattern changes intentionally, regenerate via:
    //   UPDATE_PHASE2_SNAPSHOT=1 npx vitest run src/pattern-library/stitched-template.test.ts
    if (process.env.UPDATE_PHASE2_SNAPSHOT === "1") {
      writeFileSync(SNAPSHOT_PATH, stitched, "utf8");
    }
    expect(existsSync(SNAPSHOT_PATH), `snapshot missing at ${SNAPSHOT_PATH}`).toBe(true);
    const onDisk = readFileSync(SNAPSHOT_PATH, "utf8");
    expect(stitched).toBe(onDisk);
  });
});
