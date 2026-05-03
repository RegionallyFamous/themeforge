/**
 * Parity test: zod schema (`schema.ts`) and the published JSON Schema
 * (`schemas/brand-spec.schema.json`) must agree on which documents are
 * acceptable. The JSON Schema is the artifact downstream consumers
 * validate against; zod is the runtime validator the pipeline uses. They
 * have to behave the same way or the form can produce specs that fail
 * downstream validation.
 *
 * This is a behavioral test, not a structural diff: same valid inputs
 * pass both, same invalid inputs fail both.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { BrandSpecSchema, type BrandSpec } from "./schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

let validateJsonSchema: (data: unknown) => boolean;

beforeAll(() => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(
    readFileSync(resolve(repoRoot, "schemas/brand-spec.schema.json"), "utf8"),
  );
  validateJsonSchema = ajv.compile(schema);
});

const validSpec: BrandSpec = {
  version: 1,
  store: {
    name: "Bellwether Coffee",
    tagline: "Single-origin coffee, slow-roasted in small batches.",
    description:
      "Small-batch specialty coffee roaster sourcing single-origin beans from named farms.",
    niche: "specialty coffee",
  },
  voice: { formality: 3, playfulness: 2, premiumness: 4 },
  audience: { description: "Home brewers and cafes who care about traceability." },
  mood: { primary: "heritage", secondary: "editorial" },
  color: {
    source: "palette_card",
    palette: ["#2E1F14", "#A8531E", "#E8D9C2", "#F6F1EA", "#1A1A1A"],
    base: "light",
  },
  typography: {
    pairing: "editorial_mix",
    headline_font: "Fraunces",
    body_font: "Inter",
  },
  density: "airy",
  references: [],
  locale: "en_US",
};

describe("BrandSpec schema parity (zod ↔ JSON Schema)", () => {
  it("both accept the canonical coffee-roaster sample", () => {
    const sample = JSON.parse(
      readFileSync(resolve(repoRoot, "samples/coffee-roaster/brand-spec.json"), "utf8"),
    );
    expect(BrandSpecSchema.safeParse(sample).success).toBe(true);
    expect(validateJsonSchema(sample)).toBe(true);
  });

  it("both accept the inline minimal valid spec", () => {
    expect(BrandSpecSchema.safeParse(validSpec).success).toBe(true);
    expect(validateJsonSchema(validSpec)).toBe(true);
  });

  it("both accept a spec without locale (zod fills the default, JSON Schema makes it optional)", () => {
    const { locale: _omit, ...withoutLocale } = validSpec;
    expect(BrandSpecSchema.safeParse(withoutLocale).success).toBe(true);
    expect(validateJsonSchema(withoutLocale)).toBe(true);
  });

  it("both accept a spec without secondary mood", () => {
    const { mood: _m, ...rest } = validSpec;
    const noSecondary = { ...rest, mood: { primary: "heritage" as const } };
    expect(BrandSpecSchema.safeParse(noSecondary).success).toBe(true);
    expect(validateJsonSchema(noSecondary)).toBe(true);
  });

  it("both reject an unknown mood archetype", () => {
    const bad = { ...validSpec, mood: { primary: "synthwave" as unknown as "heritage" } };
    expect(BrandSpecSchema.safeParse(bad).success).toBe(false);
    expect(validateJsonSchema(bad)).toBe(false);
  });

  it("both reject a 5-character hex color", () => {
    const bad = { ...validSpec, color: { ...validSpec.color, palette: ["#abcde", "#ffffff", "#000000"] } };
    expect(BrandSpecSchema.safeParse(bad).success).toBe(false);
    expect(validateJsonSchema(bad)).toBe(false);
  });

  it("both reject a voice slider out of range", () => {
    const bad = { ...validSpec, voice: { ...validSpec.voice, formality: 6 } };
    expect(BrandSpecSchema.safeParse(bad).success).toBe(false);
    expect(validateJsonSchema(bad)).toBe(false);
  });

  it("both reject a non-integer voice slider", () => {
    const bad = { ...validSpec, voice: { ...validSpec.voice, formality: 2.5 } };
    expect(BrandSpecSchema.safeParse(bad).success).toBe(false);
    expect(validateJsonSchema(bad)).toBe(false);
  });

  it("both reject a malformed locale", () => {
    const bad = { ...validSpec, locale: "english" };
    expect(BrandSpecSchema.safeParse(bad).success).toBe(false);
    expect(validateJsonSchema(bad)).toBe(false);
  });

  it("both reject more than three references", () => {
    const bad = {
      ...validSpec,
      references: [
        { url: "https://a.com" },
        { url: "https://b.com" },
        { url: "https://c.com" },
        { url: "https://d.com" },
      ],
    };
    expect(BrandSpecSchema.safeParse(bad).success).toBe(false);
    expect(validateJsonSchema(bad)).toBe(false);
  });

  it("both reject a missing required field (store)", () => {
    const { store: _omit, ...bad } = validSpec;
    expect(BrandSpecSchema.safeParse(bad).success).toBe(false);
    expect(validateJsonSchema(bad)).toBe(false);
  });
});
