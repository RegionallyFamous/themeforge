/**
 * "Mono" variation — strips chroma from every palette entry except the
 * primary, leaving a grayscale theme with a single colored accent. Reads
 * as restraint / luxury / brutalist depending on which mood the base is
 * in. Useful as a "press-ready" option for editorial moods.
 */

import type { Variation } from "./types.js";
import { desaturate } from "./color-utils.js";

export const monoVariation: Variation = {
  slug: "mono",
  title: "Mono",
  apply(base) {
    const palette = base.settings.color.palette.map((entry) =>
      entry.slug === "primary" ? entry : { ...entry, color: desaturate(entry.color) },
    );
    return {
      version: 3,
      title: "Mono",
      settings: { color: { palette } },
    };
  },
};
