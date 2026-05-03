/**
 * Brand-spec interactive form.
 *
 * Each step is a small, pure-ish function `(prompter, draft) → draft`.
 * The driver `runForm` invokes them in order and validates the final
 * shape against the zod schema. Steps depend only on the abstract
 * `Prompter` so the same code drives the inquirer-backed CLI flow and
 * the deterministic test mock.
 *
 * Mood selection (step 2) seeds defaults for voice, typography, and
 * density so an operator who likes the suggested mood can sprint
 * through subsequent steps by pressing return.
 */

import { BrandSpecSchema, type BrandSpec, type MoodArchetype, type TypographyPairing } from "./schema.js";
import { MOOD_PROFILES, ALL_MOODS, type PaletteCard } from "./mood-profiles.js";
import { renderMoodCard } from "./mood-cards.js";
import { extractPaletteFromLogo } from "./logo-extract.js";
import type { DraftSpec } from "./drafts.js";

// ── Prompter interface ──────────────────────────────────────────────────

export interface SelectChoice<T> {
  name: string;
  value: T;
  description?: string;
}

export interface Prompter {
  text(
    message: string,
    opts?: { default?: string; validate?: (v: string) => true | string },
  ): Promise<string>;

  number(
    message: string,
    opts: { min: number; max: number; default?: number },
  ): Promise<number>;

  select<T extends string>(
    message: string,
    choices: SelectChoice<T>[],
    opts?: { default?: T },
  ): Promise<T>;

  confirm(message: string, opts?: { default?: boolean }): Promise<boolean>;
}

export interface RunFormOptions {
  /** Initial draft (e.g. resumed from `.forge-drafts/<slug>.json`). */
  initial?: DraftSpec;
  /** Called after each step with the draft so far. */
  onProgress?: (draft: DraftSpec) => void;
}

// ── Driver ───────────────────────────────────────────────────────────────

export async function runForm(
  prompter: Prompter,
  options: RunFormOptions = {},
): Promise<BrandSpec> {
  let d: DraftSpec = { version: 1, ...(options.initial ?? {}) };
  const tick = () => options.onProgress?.(d);

  d = await stepStore(prompter, d);            tick();
  d = await stepMood(prompter, d);             tick();
  d = await stepVoice(prompter, d);            tick();
  d = await stepAudience(prompter, d);         tick();
  d = await stepColor(prompter, d);            tick();
  d = await stepTypography(prompter, d);       tick();
  d = await stepDensity(prompter, d);          tick();
  d = await stepReferences(prompter, d);       tick();

  return BrandSpecSchema.parse(d);
}

// ── Step 1: Store basics ────────────────────────────────────────────────

export async function stepStore(prompter: Prompter, draft: DraftSpec): Promise<DraftSpec> {
  const existing = draft.store;
  const name        = await prompter.text("Store name?",        { default: existing?.name });
  const tagline     = await prompter.text("Tagline?",            { default: existing?.tagline });
  const description = await prompter.text("Short description?",  { default: existing?.description });
  const niche       = await prompter.text("Niche (e.g. \"specialty coffee\")?", { default: existing?.niche });
  return { ...draft, store: { name, tagline, description, niche } };
}

// ── Step 2: Mood ────────────────────────────────────────────────────────

export async function stepMood(prompter: Prompter, draft: DraftSpec): Promise<DraftSpec> {
  const choices: SelectChoice<MoodArchetype>[] = ALL_MOODS.map((m) => ({
    name: renderMoodCard(m),
    value: m,
    description: MOOD_PROFILES[m].tagline,
  }));
  const primary = await prompter.select<MoodArchetype>(
    "Primary mood?",
    choices,
    { default: draft.mood?.primary },
  );

  const wantSecondary = await prompter.confirm("Pick a secondary mood?", { default: false });
  let secondary: MoodArchetype | undefined;
  if (wantSecondary) {
    const remaining = choices.filter((c) => c.value !== primary);
    secondary = await prompter.select<MoodArchetype>(
      "Secondary mood?",
      remaining,
      { default: draft.mood?.secondary },
    );
  }

  const mood: BrandSpec["mood"] = secondary ? { primary, secondary } : { primary };
  return { ...draft, mood };
}

// ── Step 3: Voice ───────────────────────────────────────────────────────

export async function stepVoice(prompter: Prompter, draft: DraftSpec): Promise<DraftSpec> {
  const moodVoice = draft.mood?.primary ? MOOD_PROFILES[draft.mood.primary].voice : undefined;
  const formality   = await prompter.number("Formality (1=casual, 5=formal)?",       { min: 1, max: 5, default: draft.voice?.formality   ?? moodVoice?.formality });
  const playfulness = await prompter.number("Playfulness (1=serious, 5=playful)?",   { min: 1, max: 5, default: draft.voice?.playfulness ?? moodVoice?.playfulness });
  const premiumness = await prompter.number("Premiumness (1=accessible, 5=lux)?",    { min: 1, max: 5, default: draft.voice?.premiumness ?? moodVoice?.premiumness });
  return { ...draft, voice: { formality, playfulness, premiumness } };
}

// ── Step 4: Audience ────────────────────────────────────────────────────

export async function stepAudience(prompter: Prompter, draft: DraftSpec): Promise<DraftSpec> {
  const description = await prompter.text(
    "Audience description (one sentence, who buys this)?",
    { default: draft.audience?.description },
  );
  return { ...draft, audience: { description } };
}

// ── Step 5: Color ───────────────────────────────────────────────────────

export async function stepColor(prompter: Prompter, draft: DraftSpec): Promise<DraftSpec> {
  const source = await prompter.select<"palette_card" | "hex_input" | "logo_extract">(
    "How do you want to choose colors?",
    [
      { name: "Pick from a curated palette card", value: "palette_card" },
      { name: "Paste hex codes",                  value: "hex_input"   },
      { name: "Extract from a logo image",        value: "logo_extract" },
    ],
    { default: draft.color?.source ?? "palette_card" },
  );

  let palette: string[];
  if (source === "palette_card") palette = await pickPaletteCard(prompter, draft);
  else if (source === "hex_input") palette = await pickHexes(prompter, draft);
  else palette = await pickFromLogo(prompter, draft);

  const base = await prompter.select<"light" | "dark">(
    "Base lightness?",
    [
      { name: "Light",  value: "light" },
      { name: "Dark",   value: "dark" },
    ],
    { default: draft.color?.base ?? "light" },
  );

  return { ...draft, color: { source, palette, base } };
}

async function pickPaletteCard(prompter: Prompter, draft: DraftSpec): Promise<string[]> {
  const moodKey: MoodArchetype = draft.mood?.primary ?? "editorial";
  const cards: PaletteCard[] = MOOD_PROFILES[moodKey].palettes;
  const choice = await prompter.select<string>(
    `Pick a palette card (${moodKey}):`,
    cards.map((c) => ({
      name: `${c.name} — ${c.palette.slice(0, 5).join(" ")}`,
      value: c.name,
    })),
  );
  const card = cards.find((c) => c.name === choice);
  if (!card) throw new Error(`palette card "${choice}" not found in ${moodKey}`);
  return card.palette;
}

async function pickHexes(prompter: Prompter, draft: DraftSpec): Promise<string[]> {
  const seed = draft.color?.palette?.join(", ") ?? "";
  const raw = await prompter.text(
    "Enter 3–6 hex codes, comma-separated (e.g. #2E1F14, #A8531E, #F6F1EA)",
    {
      default: seed || undefined,
      validate: (v) => {
        const list = parseHexList(v);
        if (list.length < 3 || list.length > 6) return "Need between 3 and 6 hex colors.";
        if (!list.every((h) => /^#[0-9a-fA-F]{6}$/.test(h))) return "Each entry must be a 6-digit hex like #ff0099.";
        return true;
      },
    },
  );
  return parseHexList(raw);
}

function parseHexList(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function pickFromLogo(prompter: Prompter, _draft: DraftSpec): Promise<string[]> {
  const path = await prompter.text("Path to logo image?", {
    validate: (v) => (v.length > 0 ? true : "Required."),
  });
  const { palette } = await extractPaletteFromLogo(path);
  if (palette.length < 3) {
    throw new Error(
      `logo at ${path} only yielded ${palette.length} distinct color(s); rerun and pick "Paste hex codes".`,
    );
  }
  const ok = await prompter.confirm(
    `Use extracted palette ${palette.join(" ")}?`,
    { default: true },
  );
  if (!ok) throw new Error("Logo palette declined; rerun the form and pick a different source.");
  return palette;
}

// ── Step 6: Typography ──────────────────────────────────────────────────

export async function stepTypography(prompter: Prompter, draft: DraftSpec): Promise<DraftSpec> {
  const moodPairing = draft.mood?.primary ? MOOD_PROFILES[draft.mood.primary].typography : undefined;
  const pairing = await prompter.select<TypographyPairing>(
    "Typography pairing?",
    [
      { name: "Modern Sans (Inter / system stack)",        value: "modern_sans" },
      { name: "Elegant Serif (Playfair / EB Garamond)",    value: "elegant_serif" },
      { name: "Editorial Mix (display serif + sans body)", value: "editorial_mix" },
      { name: "Industrial (mono + condensed sans)",        value: "industrial" },
      { name: "Humanist (Source Sans + slab)",             value: "humanist" },
      { name: "Surprise me (pipeline picks based on mood)", value: "surprise_me" },
    ],
    { default: draft.typography?.pairing ?? moodPairing },
  );

  const headlineDefault = draft.typography?.headline_font ?? "";
  const headline_font = await prompter.text(
    "Headline font name (optional override, blank to skip):",
    { default: headlineDefault },
  );
  const bodyDefault = draft.typography?.body_font ?? "";
  const body_font = await prompter.text(
    "Body font name (optional override, blank to skip):",
    { default: bodyDefault },
  );

  const typography: BrandSpec["typography"] = { pairing };
  if (headline_font.trim().length > 0) typography.headline_font = headline_font.trim();
  if (body_font.trim().length > 0)     typography.body_font     = body_font.trim();
  return { ...draft, typography };
}

// ── Step 7: Density ─────────────────────────────────────────────────────

export async function stepDensity(prompter: Prompter, draft: DraftSpec): Promise<DraftSpec> {
  const moodDensity = draft.mood?.primary ? MOOD_PROFILES[draft.mood.primary].density : undefined;
  const density = await prompter.select<"airy" | "balanced" | "dense">(
    "Layout density?",
    [
      { name: "Airy (lots of whitespace)",         value: "airy" },
      { name: "Balanced (default)",                value: "balanced" },
      { name: "Dense (information-rich)",          value: "dense" },
    ],
    { default: draft.density ?? moodDensity ?? "balanced" },
  );
  return { ...draft, density };
}

// ── Step 8: References ──────────────────────────────────────────────────

export async function stepReferences(prompter: Prompter, draft: DraftSpec): Promise<DraftSpec> {
  const refs: NonNullable<BrandSpec["references"]> = [];
  for (let i = 0; i < 3; i++) {
    const more = await prompter.confirm(
      i === 0 ? "Add an inspiration URL? (optional, up to 3)" : `Add another reference? (${i}/3 so far)`,
      { default: i === 0 },
    );
    if (!more) break;
    const url = await prompter.text("Reference URL:", {
      validate: (v) => (/^https?:\/\//.test(v) ? true : "Must start with http:// or https://"),
    });
    const notes = await prompter.text("What about it inspired you? (optional)", { default: "" });
    refs.push(notes.trim().length > 0 ? { url, notes: notes.trim() } : { url });
  }
  return { ...draft, references: refs };
}
