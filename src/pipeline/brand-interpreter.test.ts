import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  interpretBrand,
  DerivedSchema,
  __testing,
} from "./brand-interpreter.js";
import { BrandSpecSchema } from "../brand-spec/schema.js";
import type { LLM } from "./llm.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const sampleBrandSpec = BrandSpecSchema.parse(
  JSON.parse(
    readFileSync(resolve(repoRoot, "samples/coffee-roaster/brand-spec.json"), "utf8"),
  ),
);

const validDerived = {
  copy_directives: [
    "Use 'roast' as a verb whenever possible.",
    "Mention origin (country and farm) at least once per section.",
    "Avoid hyperbole; let the craft speak.",
  ],
  sample_product_categories: ["Single Origin", "Espresso Blends", "Subscriptions", "Brewing Gear"],
  sample_product_names: [
    "Yirgacheffe Konga Natural",
    "Colombia Tolima Decaf",
    "House Espresso",
    "Holiday Subscription Box",
    "V60 Brewer",
  ],
};

function fakeLLM(payload: unknown): LLM & { call: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(async (_opts: unknown) => payload as never);
  return { call: fn } as unknown as LLM & { call: ReturnType<typeof vi.fn> };
}

describe("DerivedSchema", () => {
  it("accepts the canonical valid payload", () => {
    expect(DerivedSchema.safeParse(validDerived).success).toBe(true);
  });

  it("rejects fewer than 3 copy_directives", () => {
    const bad = { ...validDerived, copy_directives: validDerived.copy_directives.slice(0, 2) };
    expect(DerivedSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects fewer than 5 sample_product_names", () => {
    const bad = { ...validDerived, sample_product_names: validDerived.sample_product_names.slice(0, 4) };
    expect(DerivedSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects directives that are too short to be useful", () => {
    const bad = { ...validDerived, copy_directives: ["short", "x", "y"] };
    expect(DerivedSchema.safeParse(bad).success).toBe(false);
  });
});

describe("interpretBrand", () => {
  it("calls the LLM with the brand-interpreter stage and embeds the spec in the user prompt", async () => {
    const llm = fakeLLM(validDerived);
    await interpretBrand(sampleBrandSpec, llm);

    expect(llm.call).toHaveBeenCalledTimes(1);
    const opts = llm.call.mock.calls[0]![0] as {
      stage: string;
      schema: unknown;
      systemPrompt: string;
      userPrompt: string;
    };
    expect(opts.stage).toBe("brand-interpreter");
    expect(opts.schema).toBe(DerivedSchema);
    expect(opts.userPrompt).toContain("Bellwether Coffee");
    expect(opts.userPrompt).toContain("specialty coffee");
  });

  it("returns the original spec extended with the derived block", async () => {
    const llm = fakeLLM(validDerived);
    const out = await interpretBrand(sampleBrandSpec, llm);
    expect(out.store).toEqual(sampleBrandSpec.store);
    expect(out.mood).toEqual(sampleBrandSpec.mood);
    expect(out.derived).toEqual(validDerived);
  });

  it("system prompt names every derived field for the model", () => {
    expect(__testing.SYSTEM_PROMPT).toContain("copy_directives");
    expect(__testing.SYSTEM_PROMPT).toContain("sample_product_categories");
    expect(__testing.SYSTEM_PROMPT).toContain("sample_product_names");
  });
});
