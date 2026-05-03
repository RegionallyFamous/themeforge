/**
 * Per-mood branded titles for the five style variations.
 *
 * The mechanical labels (Light / Dark / Editorial / Playful / Mono) tell
 * the operator what each variation does. The branded labels are what
 * the customer sees in WordPress's Appearance → Styles picker — they
 * should sound like the brand, not like a build pipeline.
 *
 * Naming brief for each mood: pick five short noun-phrases that read
 * like an actual brand's collection names. Avoid Capitalized Marketing,
 * acronyms, and adjectives ending in "-ier". One word is best.
 *
 * If you add a new MoodArchetype to the schema, add a row here too —
 * `brandedTitles` falls back to the mechanical labels for unknown moods,
 * so the build won't break, but the variation picker will look generic.
 */

import type { MoodArchetype } from "../../brand-spec/schema.js";

/** Variation slugs — must match the `Variation.slug` values in this dir. */
export type VariationSlug = "light" | "dark" | "editorial" | "playful" | "mono";

const MECHANICAL_TITLES: Record<VariationSlug, string> = {
  light:     "Light",
  dark:      "Dark",
  editorial: "Editorial",
  playful:   "Playful",
  mono:      "Mono",
};

const BRANDED: Record<MoodArchetype, Record<VariationSlug, string>> = {
  apothecary: {
    light: "Tincture",   dark: "Apothecary",   editorial: "Compendium",  playful: "Garden",     mono: "Mortar",
  },
  editorial: {
    light: "Recto",      dark: "Verso",        editorial: "Folio",       playful: "Headline",   mono: "Margins",
  },
  brutalist: {
    light: "Plain",      dark: "Vault",        editorial: "Spec",        playful: "Riot",       mono: "Concrete",
  },
  botanical: {
    light: "Bloom",      dark: "Forest",       editorial: "Field Guide", playful: "Wildflower", mono: "Stone",
  },
  heritage: {
    light: "First Light", dark: "Deep Roast",  editorial: "Press",       playful: "Sunday",     mono: "Letterpress",
  },
  nordic: {
    light: "Daylight",   dark: "Dusk",         editorial: "Almanac",     playful: "Frost",      mono: "Granite",
  },
  playful: {
    light: "Daytime",    dark: "Twilight",     editorial: "Special",     playful: "Carnival",   mono: "Quiet",
  },
  y2k: {
    light: "Chrome",     dark: "Midnight",     editorial: "Manifesto",   playful: "Holo",       mono: "Static",
  },
  sport: {
    light: "Field",      dark: "Court",        editorial: "Pace",        playful: "Rally",      mono: "Stadium",
  },
  "lux-mono": {
    light: "Champagne",  dark: "Onyx",         editorial: "Atelier",     playful: "Spritz",     mono: "Marble",
  },
  coastal: {
    light: "Daybreak",   dark: "Anchor",       editorial: "Logbook",     playful: "Tidepool",   mono: "Driftwood",
  },
  sci: {
    light: "Lab",        dark: "Eclipse",      editorial: "Whitepaper",  playful: "Plasma",     mono: "Schema",
  },
};

/**
 * Resolve a (mood, variation) pair into a branded title.
 *
 * Falls back to the mechanical label (`Light`, `Dark`, ...) if the mood
 * isn't in the table. That should only happen during development when
 * a new mood is added to the enum but not yet to `BRANDED`.
 */
export function brandedTitle(mood: MoodArchetype, slug: VariationSlug): string {
  return BRANDED[mood]?.[slug] ?? MECHANICAL_TITLES[slug];
}

/** Convenience: full per-mood title map. Useful for tests and previews. */
export function brandedTitles(mood: MoodArchetype): Record<VariationSlug, string> {
  const fallback = MECHANICAL_TITLES;
  return BRANDED[mood] ?? fallback;
}

export const __testing = { MECHANICAL_TITLES, BRANDED };
