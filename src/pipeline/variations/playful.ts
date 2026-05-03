/**
 * "Playful" variation — boosts palette saturation by ~15% and rounds
 * buttons into pills. Reads as energetic without restructuring the
 * layout. Neutral colors stay neutral (saturation=0 multiplied by
 * anything is still 0), so the brand identity isn't redirected — only
 * the chromatic colors get more presence.
 */

import type { Variation } from "./types.js";
import { adjustSaturation } from "./color-utils.js";

const SATURATION_BOOST = 1.15;

export const playfulVariation: Variation = {
  slug: "playful",
  title: "Playful",
  apply(base) {
    const palette = base.settings.color.palette.map((entry) => ({
      ...entry,
      color: adjustSaturation(entry.color, SATURATION_BOOST),
    }));
    return {
      version: 3,
      title: "Playful",
      settings: { color: { palette } },
      styles: {
        spacing: { blockGap: "1.5rem" },
        elements: {
          // Pill buttons — the single most-recognizable "playful" cue
          // without fighting the underlying brand.
          button: { border: { radius: "999px" } },
        },
      },
    };
  },
};
