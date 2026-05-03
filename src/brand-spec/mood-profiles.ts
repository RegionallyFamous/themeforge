/**
 * Mood archetypes — the visual + tonal starting points the operator
 * picks from in step 2 of the brand-spec form.
 *
 * Each profile includes:
 *  - a one-line `tagline` for the mood card display
 *  - default `voice` slider values (formality / playfulness / premiumness),
 *    typography `pairing`, and layout `density`
 *  - a `swatch` of three representative colors for the terminal preview
 *  - three curated `palettes` the operator can choose from in step 5
 *
 * The defaults pre-fill subsequent steps so a user can sprint through
 * the form by accepting them, or override any individually.
 */

import type { MoodArchetype, TypographyPairing } from "./schema.js";

export interface PaletteCard {
  name: string;
  palette: string[];
}

export interface MoodProfile {
  archetype: MoodArchetype;
  tagline: string;
  voice: {
    formality: 1 | 2 | 3 | 4 | 5;
    playfulness: 1 | 2 | 3 | 4 | 5;
    premiumness: 1 | 2 | 3 | 4 | 5;
  };
  typography: TypographyPairing;
  density: "airy" | "balanced" | "dense";
  swatch: [string, string, string];
  palettes: PaletteCard[];
}

export const MOOD_PROFILES: Record<MoodArchetype, MoodProfile> = {
  apothecary: {
    archetype: "apothecary",
    tagline: "Muted, herbal, considered. Serif-led, restrained accents.",
    voice: { formality: 4, playfulness: 1, premiumness: 4 },
    typography: "elegant_serif",
    density: "airy",
    swatch: ["#F4EDE0", "#7B8A6E", "#3A2E22"],
    palettes: [
      { name: "Sage & Bone",      palette: ["#3A2E22", "#7B8A6E", "#D7CFB7", "#F4EDE0", "#1F1812"] },
      { name: "Linen & Eucalypt", palette: ["#2F3026", "#9BA88E", "#E1DCC9", "#F6F2E6", "#1A1A14"] },
      { name: "Ginger Root",      palette: ["#43261C", "#A77146", "#E8D2B6", "#F2EAD8", "#1F1410"] },
    ],
  },
  editorial: {
    archetype: "editorial",
    tagline: "Magazine-style. Big type, generous whitespace, restrained palette.",
    voice: { formality: 4, playfulness: 2, premiumness: 4 },
    typography: "editorial_mix",
    density: "airy",
    swatch: ["#FFFFFF", "#111111", "#C7402F"],
    palettes: [
      { name: "Newsprint",      palette: ["#111111", "#C7402F", "#F2EFE8", "#FFFFFF", "#7A7570"] },
      { name: "Ink & Ivory",    palette: ["#1A1A1A", "#8E5A3C", "#EBE5D6", "#FAF7F1", "#666155"] },
      { name: "Atelier",        palette: ["#0E0E0E", "#9C7C4F", "#E9E1D2", "#FAF6EC", "#5C5547"] },
    ],
  },
  brutalist: {
    archetype: "brutalist",
    tagline: "Raw, monospaced, high-contrast. Function as ornament.",
    voice: { formality: 2, playfulness: 3, premiumness: 2 },
    typography: "industrial",
    density: "dense",
    swatch: ["#000000", "#FFFFFF", "#FFD400"],
    palettes: [
      { name: "Concrete",         palette: ["#000000", "#FFD400", "#E5E5E5", "#FFFFFF", "#7A7A7A"] },
      { name: "Plywood",          palette: ["#0A0A0A", "#E84610", "#D9D2C0", "#FFFFFF", "#444444"] },
      { name: "Rebar",            palette: ["#111111", "#3D7AFF", "#DADADA", "#FFFFFF", "#5A5A5A"] },
    ],
  },
  botanical: {
    archetype: "botanical",
    tagline: "Organic, leafy, soft. Illustrative accents over geometric ones.",
    voice: { formality: 3, playfulness: 4, premiumness: 3 },
    typography: "humanist",
    density: "balanced",
    swatch: ["#E8EDD7", "#5B7B4F", "#2F3A26"],
    palettes: [
      { name: "Garden Wall",  palette: ["#2F3A26", "#5B7B4F", "#CFD9B6", "#F1F2E2", "#1A1F14"] },
      { name: "Wildflower",   palette: ["#384226", "#A87E3D", "#D9E2BD", "#F5F4DE", "#222B1A"] },
      { name: "Meadow",       palette: ["#2D3A2A", "#7E9472", "#E2E5C9", "#F5F2E0", "#1A2118"] },
    ],
  },
  heritage: {
    archetype: "heritage",
    tagline: "Old-world, crafted, warm. Slab serifs and earned patina.",
    voice: { formality: 3, playfulness: 2, premiumness: 4 },
    typography: "editorial_mix",
    density: "airy",
    swatch: ["#F6F1EA", "#A8531E", "#2E1F14"],
    palettes: [
      { name: "Roastery",     palette: ["#2E1F14", "#A8531E", "#E8D9C2", "#F6F1EA", "#1A1A1A"] },
      { name: "Workshop",     palette: ["#1F1B17", "#8A4A24", "#D9C9AF", "#F2EBE0", "#0F0E0C"] },
      { name: "Bindery",      palette: ["#2A1E16", "#9B6440", "#E2D2BC", "#F4EDE0", "#171210"] },
    ],
  },
  nordic: {
    archetype: "nordic",
    tagline: "Minimal, calm, sans-serif. Soft palettes and quiet rhythm.",
    voice: { formality: 4, playfulness: 2, premiumness: 3 },
    typography: "modern_sans",
    density: "airy",
    swatch: ["#F4F4F0", "#A6B5BD", "#1F2937"],
    palettes: [
      { name: "Fjord",        palette: ["#1F2937", "#6F8893", "#D8DEE3", "#F4F4F0", "#0F1722"] },
      { name: "Stoneware",    palette: ["#222524", "#8C9892", "#DCDDD7", "#F2F1EB", "#13161A"] },
      { name: "Birch",        palette: ["#26241F", "#A39A86", "#E2DED2", "#FAF7EE", "#16140F"] },
    ],
  },
  playful: {
    archetype: "playful",
    tagline: "Bright, rounded, energetic. Confident colour, loose grids.",
    voice: { formality: 1, playfulness: 5, premiumness: 2 },
    typography: "humanist",
    density: "balanced",
    swatch: ["#FFE6C7", "#FF7A45", "#3DB39E"],
    palettes: [
      { name: "Citrus",       palette: ["#1F2933", "#FF7A45", "#FFE6C7", "#FBF7EF", "#3DB39E"] },
      { name: "Confetti",     palette: ["#211A2B", "#E94B7B", "#FFE25C", "#F2F0EA", "#5BC0BE"] },
      { name: "Popsicle",     palette: ["#222222", "#FF8AA0", "#FFD27A", "#FFFFFF", "#67D5C2"] },
    ],
  },
  y2k: {
    archetype: "y2k",
    tagline: "Bold gradients, glossy chrome, retro-futurist. Maximalist.",
    voice: { formality: 1, playfulness: 5, premiumness: 2 },
    typography: "modern_sans",
    density: "dense",
    swatch: ["#FF3DBA", "#7B5BFF", "#00E5FF"],
    palettes: [
      { name: "Cyberbubble",  palette: ["#0A0420", "#FF3DBA", "#7B5BFF", "#00E5FF", "#FFFFFF"] },
      { name: "Holo",         palette: ["#101010", "#FF6EC7", "#A65BFF", "#5BFFE7", "#F4F0F8"] },
      { name: "Mall Rat",     palette: ["#16162A", "#FF4D6D", "#7AA0FF", "#C2EFFF", "#F5F1F8"] },
    ],
  },
  sport: {
    archetype: "sport",
    tagline: "Strong, kinetic, sans-serif. Primary colour, no apology.",
    voice: { formality: 2, playfulness: 4, premiumness: 3 },
    typography: "modern_sans",
    density: "balanced",
    swatch: ["#FFFFFF", "#000000", "#E11D2A"],
    palettes: [
      { name: "Court",        palette: ["#0B0B0B", "#E11D2A", "#F5F5F5", "#FFFFFF", "#7A7A7A"] },
      { name: "Field",        palette: ["#0F1A2C", "#FFD400", "#E5EAF1", "#FFFFFF", "#3A4F6B"] },
      { name: "Track",        palette: ["#101418", "#FF6A00", "#E8E9EC", "#FFFFFF", "#5B6772"] },
    ],
  },
  "lux-mono": {
    archetype: "lux-mono",
    tagline: "Single accent. High contrast. Restraint reads as expensive.",
    voice: { formality: 5, playfulness: 1, premiumness: 5 },
    typography: "elegant_serif",
    density: "airy",
    swatch: ["#FFFFFF", "#000000", "#BFA468"],
    palettes: [
      { name: "Champagne",    palette: ["#0A0A0A", "#BFA468", "#EFEAE0", "#FFFFFF", "#3A3A3A"] },
      { name: "Onyx",         palette: ["#000000", "#A87FCB", "#EAE6F0", "#FFFFFF", "#2C2330"] },
      { name: "Ivory",        palette: ["#161210", "#9C7A4A", "#F1ECDF", "#FFFFFF", "#3A2E22"] },
    ],
  },
  coastal: {
    archetype: "coastal",
    tagline: "Breezy, sandy, soft blues. Warm whites, generous air.",
    voice: { formality: 2, playfulness: 3, premiumness: 3 },
    typography: "humanist",
    density: "balanced",
    swatch: ["#F6EFDF", "#7AB6C5", "#1F3A47"],
    palettes: [
      { name: "Salt Air",     palette: ["#1F3A47", "#7AB6C5", "#E2D9C2", "#F6EFDF", "#11212A"] },
      { name: "Driftwood",    palette: ["#2A2620", "#A8B5BD", "#E1D8C0", "#F4ECDA", "#161310"] },
      { name: "Tide Pool",    palette: ["#16323D", "#5C9CB0", "#D9CDB5", "#F1E9D6", "#0B1A22"] },
    ],
  },
  sci: {
    archetype: "sci",
    tagline: "Technical, precise. Grids, mono accents, measured rhythm.",
    voice: { formality: 4, playfulness: 2, premiumness: 3 },
    typography: "industrial",
    density: "balanced",
    swatch: ["#0E1722", "#5BD2FF", "#E2E6EB"],
    palettes: [
      { name: "Schematic",    palette: ["#0E1722", "#5BD2FF", "#A8B0BC", "#E2E6EB", "#070C13"] },
      { name: "Lab Coat",     palette: ["#101216", "#3DDC97", "#9DA3AC", "#EFEFF1", "#06080B"] },
      { name: "Analyst",      palette: ["#10121A", "#FFB347", "#9098A6", "#E8EAF0", "#070811"] },
    ],
  },
};

export const ALL_MOODS: MoodArchetype[] = Object.keys(MOOD_PROFILES) as MoodArchetype[];

export function moodProfile(m: MoodArchetype): MoodProfile {
  return MOOD_PROFILES[m];
}
