/**
 * Phase 4 completion check (live).
 *
 * Drives the real Claude API. Skipped automatically unless
 * ANTHROPIC_API_KEY is set, so CI without secrets stays green and
 * developers can run it on demand:
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npx vitest run \
 *     src/pipeline/theme-json-generator.live.test.ts
 *
 * Asserts the LLM-emitted ThemeTokens validate, feed cleanly into
 * `buildThemeJson`, produce a v3 theme.json with the expected slugs,
 * and that the chosen palette colors are sourced from the brand spec
 * (no hallucinated hexes).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateThemeTokens } from "./theme-json-generator.js";
import { buildThemeJson } from "../theme-builder/theme-json.js";
import { createLLM } from "./llm.js";
import { BrandSpecSchema } from "../brand-spec/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!HAS_KEY)("[live] generateThemeTokens against the coffee-roaster spec", () => {
  const sampleBrandSpec = BrandSpecSchema.parse(
    JSON.parse(
      readFileSync(resolve(repoRoot, "samples/coffee-roaster/brand-spec.json"), "utf8"),
    ),
  );

  it(
    "produces tokens that validate and feed buildThemeJson cleanly",
    { timeout: 60_000 },
    async () => {
      const llm = createLLM({ silent: true });
      const tokens = await generateThemeTokens(sampleBrandSpec, llm);

      // Required slugs the rest of the pipeline expects:
      const slugs = new Set(tokens.palette.map((c) => c.slug));
      expect(slugs.has("background")).toBe(true);
      expect(slugs.has("foreground")).toBe(true);
      expect(slugs.has("primary")).toBe(true);

      // Density must reflect the spec verbatim:
      expect(tokens.density).toBe(sampleBrandSpec.density);

      // Most palette hexes should come from the brand spec — Claude
      // can derive a couple (e.g. background-alt) but at least three
      // of the spec's source colors should appear.
      const specHexes = new Set(sampleBrandSpec.color.palette.map((h) => h.toLowerCase()));
      const tokenHexes = tokens.palette.map((c) => c.color.toLowerCase());
      const overlap = tokenHexes.filter((h) => specHexes.has(h)).length;
      expect(overlap).toBeGreaterThanOrEqual(3);

      // The deterministic builder accepts it:
      const themeJson = buildThemeJson(tokens);
      expect(themeJson.version).toBe(3);
      expect(themeJson.settings.color.palette.length).toBeGreaterThanOrEqual(3);

      // Surface the result so a developer running this locally can eyeball it.
      // eslint-disable-next-line no-console
      console.log("\n[live] generated tokens:\n", JSON.stringify(tokens, null, 2));
    },
  );
});

describe.skipIf(HAS_KEY)("[live] generateThemeTokens — placeholder when no API key is set", () => {
  it("is skipped (set ANTHROPIC_API_KEY to run the live call)", () => {
    expect(HAS_KEY).toBe(false);
  });
});
