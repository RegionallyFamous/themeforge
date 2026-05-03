/**
 * Render mood profiles as a terminal "card" — name + tagline + a row of
 * three colored swatches. Used during the form's mood selection step.
 */

import chalk from "chalk";
import { MOOD_PROFILES } from "./mood-profiles.js";
import type { MoodArchetype } from "./schema.js";

const SWATCH_GLYPH = "  ";

export function renderMoodCard(mood: MoodArchetype): string {
  const p = MOOD_PROFILES[mood];
  const swatches = p.swatch.map((hex) => chalk.bgHex(hex)(SWATCH_GLYPH)).join("");
  const title = chalk.bold(p.archetype);
  return `${swatches} ${title} — ${chalk.dim(p.tagline)}`;
}

export function renderAllMoodCards(): string {
  return (Object.keys(MOOD_PROFILES) as MoodArchetype[])
    .map((m) => renderMoodCard(m))
    .join("\n");
}
