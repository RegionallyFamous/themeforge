import { describe, it, expect, vi } from "vitest";
import { mockPrompter, text, num, sel, yes, no } from "./prompter-mock.js";
import {
  runForm,
  stepStore,
  stepMood,
  stepVoice,
  stepTypography,
  stepDensity,
  stepColor,
  stepReferences,
} from "./form.js";
import { BrandSpecSchema } from "./schema.js";
import { MOOD_PROFILES } from "./mood-profiles.js";

// Mock node-vibrant so the logo-extract path is exercisable in tests.
vi.mock("node-vibrant", () => ({
  default: {
    from: () => ({
      getPalette: () =>
        Promise.resolve({
          DarkVibrant: { hex: "#3A2E22" },
          LightMuted: { hex: "#F4EDE0" },
          DarkMuted: { hex: "#7B8A6E" },
          Vibrant: { hex: "#A8531E" },
          LightVibrant: { hex: "#E8D9C2" },
          Muted: null,
        }),
    }),
  },
}));

// ── Step-level tests ────────────────────────────────────────────────────

describe("stepStore", () => {
  it("collects name, tagline, description, niche", async () => {
    const p = mockPrompter([
      text("Acme Roastery"),
      text("Beans you can taste"),
      text("Specialty coffee roaster."),
      text("specialty coffee"),
    ]);
    const out = await stepStore(p, {});
    expect(out.store).toEqual({
      name: "Acme Roastery",
      tagline: "Beans you can taste",
      description: "Specialty coffee roaster.",
      niche: "specialty coffee",
    });
  });

  it("offers existing draft values as defaults when the step is re-entered", async () => {
    const p = mockPrompter([text("Acme"), text("t"), text("d"), text("n")]);
    await stepStore(p, {
      store: { name: "Acme", tagline: "old", description: "old", niche: "old" },
    });
    expect(p.transcript[0]?.defaultPresented).toBe("Acme");
    expect(p.transcript[1]?.defaultPresented).toBe("old");
  });
});

describe("stepMood", () => {
  it("primary only when secondary is declined", async () => {
    const p = mockPrompter([sel("heritage"), no()]);
    const out = await stepMood(p, {});
    expect(out.mood).toEqual({ primary: "heritage" });
  });

  it("captures both primary and secondary when accepted", async () => {
    const p = mockPrompter([sel("heritage"), yes(), sel("editorial")]);
    const out = await stepMood(p, {});
    expect(out.mood).toEqual({ primary: "heritage", secondary: "editorial" });
  });

  it("excludes the primary mood from the secondary choices", async () => {
    const p = mockPrompter([sel("heritage"), yes(), sel("editorial")]);
    await stepMood(p, {});
    const secondary = p.transcript[2];
    expect(secondary?.choices?.map((c) => c.value)).not.toContain("heritage");
  });
});

describe("stepVoice", () => {
  it("seeds defaults from the chosen primary mood profile", async () => {
    const draft = { mood: { primary: "heritage" as const } };
    const p = mockPrompter([num(3), num(2), num(4)]);
    await stepVoice(p, draft);
    const expected = MOOD_PROFILES.heritage.voice;
    expect(p.transcript[0]?.defaultPresented).toBe(expected.formality);
    expect(p.transcript[1]?.defaultPresented).toBe(expected.playfulness);
    expect(p.transcript[2]?.defaultPresented).toBe(expected.premiumness);
  });

  it("falls back to no default when no mood is set yet", async () => {
    const p = mockPrompter([num(2), num(3), num(4)]);
    await stepVoice(p, {});
    expect(p.transcript[0]?.defaultPresented).toBeUndefined();
  });
});

describe("stepTypography", () => {
  it("seeds the pairing default from the mood profile", async () => {
    const draft = { mood: { primary: "lux-mono" as const } };
    const p = mockPrompter([sel("elegant_serif"), text(""), text("")]);
    await stepTypography(p, draft);
    expect(p.transcript[0]?.defaultPresented).toBe(MOOD_PROFILES["lux-mono"].typography);
  });

  it("only writes optional headline_font / body_font when non-empty", async () => {
    const p = mockPrompter([sel("modern_sans"), text("  "), text("")]);
    const out = await stepTypography(p, {});
    expect(out.typography).toEqual({ pairing: "modern_sans" });
  });

  it("trims overrides and writes them when provided", async () => {
    const p = mockPrompter([sel("editorial_mix"), text("  Fraunces  "), text("Inter")]);
    const out = await stepTypography(p, {});
    expect(out.typography).toEqual({
      pairing: "editorial_mix",
      headline_font: "Fraunces",
      body_font: "Inter",
    });
  });
});

describe("stepDensity", () => {
  it("seeds the default from the mood profile", async () => {
    const draft = { mood: { primary: "playful" as const } };
    const p = mockPrompter([sel("balanced")]);
    await stepDensity(p, draft);
    expect(p.transcript[0]?.defaultPresented).toBe(MOOD_PROFILES.playful.density);
  });

  it("falls back to 'balanced' when no mood is chosen", async () => {
    const p = mockPrompter([sel("dense")]);
    await stepDensity(p, {});
    expect(p.transcript[0]?.defaultPresented).toBe("balanced");
  });
});

describe("stepColor", () => {
  it("palette_card path: shows the chosen mood's palette cards", async () => {
    const draft = { mood: { primary: "heritage" as const } };
    const p = mockPrompter([sel("palette_card"), sel("Roastery"), sel("light")]);
    const out = await stepColor(p, draft);
    expect(out.color?.source).toBe("palette_card");
    expect(out.color?.palette).toEqual(MOOD_PROFILES.heritage.palettes[0]?.palette);
  });

  it("hex_input path: parses comma-separated hex codes", async () => {
    const p = mockPrompter([
      sel("hex_input"),
      text("#2E1F14, #A8531E, #E8D9C2, #F6F1EA"),
      sel("light"),
    ]);
    const out = await stepColor(p, {});
    expect(out.color?.palette).toEqual(["#2E1F14", "#A8531E", "#E8D9C2", "#F6F1EA"]);
  });

  it("logo_extract path: pulls colors via node-vibrant and confirms", async () => {
    const p = mockPrompter([
      sel("logo_extract"),
      text("/tmp/logo.png"),
      yes(),
      sel("light"),
    ]);
    const out = await stepColor(p, {});
    expect(out.color?.source).toBe("logo_extract");
    expect(out.color?.palette).toEqual([
      "#3a2e22", "#f4ede0", "#7b8a6e", "#a8531e", "#e8d9c2",
    ]);
  });
});

describe("stepReferences", () => {
  it("returns an empty list when the operator declines the first prompt", async () => {
    const p = mockPrompter([no()]);
    const out = await stepReferences(p, {});
    expect(out.references).toEqual([]);
  });

  it("collects up to three references with optional notes", async () => {
    const p = mockPrompter([
      yes(),
      text("https://heartroasters.com"),
      text("Editorial product cards."),
      yes(),
      text("https://workshopcoffee.com"),
      text(""),
      no(),
    ]);
    const out = await stepReferences(p, {});
    expect(out.references).toEqual([
      { url: "https://heartroasters.com", notes: "Editorial product cards." },
      { url: "https://workshopcoffee.com" },
    ]);
  });
});

// ── End-to-end happy path ───────────────────────────────────────────────

describe("runForm", () => {
  it("produces a spec that validates against the BrandSpec schema", async () => {
    const p = mockPrompter([
      // step 1: store
      text("Bellwether Coffee"),
      text("Single-origin coffee, slow-roasted in small batches."),
      text(
        "Bellwether is a small-batch specialty coffee roaster sourcing single-origin beans from named farms.",
      ),
      text("specialty coffee"),
      // step 2: mood
      sel("heritage"),
      yes(),
      sel("editorial"),
      // step 3: voice
      num(3),
      num(2),
      num(4),
      // step 4: audience
      text(
        "Home brewers and cafes who care about traceability, freshness, and the craft of roasting.",
      ),
      // step 5: color (palette card)
      sel("palette_card"),
      sel("Roastery"),
      sel("light"),
      // step 6: typography
      sel("editorial_mix"),
      text("Fraunces"),
      text("Inter"),
      // step 7: density
      sel("airy"),
      // step 8: references — none
      no(),
    ]);

    const onProgress = vi.fn();
    const spec = await runForm(p, { onProgress });

    // Schema-valid:
    expect(BrandSpecSchema.safeParse(spec).success).toBe(true);
    expect(p.remaining()).toBe(0);

    // Fields landed where expected:
    expect(spec.store.name).toBe("Bellwether Coffee");
    expect(spec.mood).toEqual({ primary: "heritage", secondary: "editorial" });
    expect(spec.voice).toEqual({ formality: 3, playfulness: 2, premiumness: 4 });
    expect(spec.color.source).toBe("palette_card");
    expect(spec.color.palette).toEqual(MOOD_PROFILES.heritage.palettes[0]?.palette);
    expect(spec.typography).toEqual({
      pairing: "editorial_mix",
      headline_font: "Fraunces",
      body_font: "Inter",
    });
    expect(spec.density).toBe("airy");
    expect(spec.references).toEqual([]);
    expect(spec.locale).toBe("en_US"); // zod default applied

    // onProgress was called after every step:
    expect(onProgress).toHaveBeenCalledTimes(8);
  });

  it("matches the shape of the canonical coffee-roaster sample", async () => {
    // Same answers as above; assert the resulting spec has the same key
    // structure as the committed `samples/coffee-roaster/brand-spec.json`.
    const p = mockPrompter([
      text("Bellwether Coffee"),
      text("Single-origin coffee, slow-roasted in small batches."),
      text("Bellwether is a small-batch specialty coffee roaster sourcing single-origin beans from named farms."),
      text("specialty coffee"),
      sel("heritage"),
      yes(),
      sel("editorial"),
      num(3),
      num(2),
      num(4),
      text("Home brewers and cafes who care about traceability."),
      sel("palette_card"),
      sel("Roastery"),
      sel("light"),
      sel("editorial_mix"),
      text("Fraunces"),
      text("Inter"),
      sel("airy"),
      no(),
    ]);
    const spec = await runForm(p);
    const topLevelKeys = Object.keys(spec).sort();
    expect(topLevelKeys).toEqual(
      ["audience", "color", "density", "locale", "mood", "references", "store", "typography", "voice", "version"].sort(),
    );
  });
});
