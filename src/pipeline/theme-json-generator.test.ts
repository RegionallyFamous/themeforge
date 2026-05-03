import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateThemeTokens,
  ThemeTokensSchema,
  __testing,
} from "./theme-json-generator.js";
import { buildThemeJson } from "../theme-builder/theme-json.js";
import { BrandSpecSchema } from "../brand-spec/schema.js";
import type { LLM } from "./llm.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const sampleBrandSpec = BrandSpecSchema.parse(
  JSON.parse(
    readFileSync(resolve(repoRoot, "samples/coffee-roaster/brand-spec.json"), "utf8"),
  ),
);

const validTokens = {
  palette: [
    { name: "Background",     slug: "background",     color: "#F6F1EA" },
    { name: "Background Alt", slug: "background-alt", color: "#E8D9C2" },
    { name: "Foreground",     slug: "foreground",     color: "#2E1F14" },
    { name: "Muted",          slug: "muted",          color: "#7A6757" },
    { name: "Primary",        slug: "primary",        color: "#A8531E" },
    { name: "Accent",         slug: "accent",         color: "#1A1A1A" },
  ],
  typography: {
    body: {
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fontSize: "1.0625rem",
      lineHeight: "1.6",
    },
    heading: {
      fontFamily: "Fraunces, 'Iowan Old Style', Georgia, serif",
      fontWeight: "500",
      lineHeight: "1.05",
    },
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

function fakeLLM(payload: unknown): LLM & { call: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(async (_opts: unknown) => payload as never);
  return { call: fn } as unknown as LLM & { call: ReturnType<typeof vi.fn> };
}

describe("ThemeTokensSchema", () => {
  it("accepts the canonical valid token set", () => {
    expect(ThemeTokensSchema.safeParse(validTokens).success).toBe(true);
  });

  it("rejects a palette missing the `primary` slug", () => {
    const bad = {
      ...validTokens,
      palette: validTokens.palette.filter((c) => c.slug !== "primary"),
    };
    const r = ThemeTokensSchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /primary/.test(i.message))).toBe(true);
    }
  });

  it("rejects a palette with duplicate slugs", () => {
    const bad = {
      ...validTokens,
      palette: [
        { name: "Background",     slug: "background",     color: "#FFFFFF" },
        { name: "Background Two", slug: "background",     color: "#EEEEEE" },
        { name: "Foreground",     slug: "foreground",     color: "#000000" },
        { name: "Primary",        slug: "primary",        color: "#FF0000" },
      ],
    };
    expect(ThemeTokensSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-monotonic fluidScale", () => {
    const bad = {
      ...validTokens,
      typography: { ...validTokens.typography, fluidScale: [1, 1, 2, 3, 4] },
    };
    const r = ThemeTokensSchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /increasing/.test(i.message))).toBe(true);
    }
  });

  it("rejects an invalid hex color", () => {
    const bad = {
      ...validTokens,
      palette: validTokens.palette.map((c) =>
        c.slug === "primary" ? { ...c, color: "not-hex" } : c,
      ),
    };
    expect(ThemeTokensSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts a clamp() expression for spacing.sectionY", () => {
    const r = ThemeTokensSchema.safeParse({
      ...validTokens,
      spacing: { ...validTokens.spacing, sectionY: "clamp(2rem, 1rem + 5vw, 8rem)" },
    });
    expect(r.success).toBe(true);
  });
});

describe("generateThemeTokens", () => {
  it("calls the LLM with the theme-json-generator stage and embeds the brand spec in the user prompt", async () => {
    const llm = fakeLLM(validTokens);
    await generateThemeTokens(sampleBrandSpec, llm);
    expect(llm.call).toHaveBeenCalledTimes(1);
    const opts = llm.call.mock.calls[0]![0] as {
      stage: string;
      schema: unknown;
      systemPrompt: string;
      userPrompt: string;
    };
    expect(opts.stage).toBe("theme-json-generator");
    expect(opts.schema).toBe(ThemeTokensSchema);
    expect(opts.userPrompt).toContain("Bellwether Coffee");
    expect(opts.userPrompt).toContain("specialty coffee");
  });

  it("returned tokens flow through buildThemeJson without further validation", async () => {
    const llm = fakeLLM(validTokens);
    const tokens = await generateThemeTokens(sampleBrandSpec, llm);
    const themeJson = buildThemeJson(tokens);
    expect(themeJson.version).toBe(3);
    expect(themeJson.settings.color.palette).toHaveLength(6);
    expect(themeJson.settings.color.palette.map((c) => c.slug)).toContain("primary");
  });

  it("system prompt names every required palette slug as guidance for Claude", () => {
    expect(__testing.SYSTEM_PROMPT).toContain("background");
    expect(__testing.SYSTEM_PROMPT).toContain("foreground");
    expect(__testing.SYSTEM_PROMPT).toContain("primary");
    expect(__testing.SYSTEM_PROMPT).toContain("fluidScale");
  });
});
