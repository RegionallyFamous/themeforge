/**
 * "Dark" variation — produces a dark palette by mirroring each base
 * color around L=0.5 in HSL space. Hue and saturation are preserved so
 * the brand identity carries through; only lightness flips.
 *
 * Slugs are unchanged, so every pattern that references
 * `has-background-background-color`, `has-foreground-color`, etc., is
 * automatically dark when this variation is active.
 */

import type { Variation } from "./types.js";
import { invertLightness } from "./color-utils.js";

export const darkVariation: Variation = {
  slug: "dark",
  title: "Dark",
  apply(base) {
    const palette = base.settings.color.palette.map((entry) => ({
      ...entry,
      color: invertLightness(entry.color),
    }));
    return {
      version: 3,
      title: "Dark",
      settings: { color: { palette } },
      styles: {
        // Re-point the body styles at the inverted background/foreground
        // so anything inheriting from the base styles flips correctly.
        color: {
          background: `var(--wp--preset--color--background)`,
          text:       `var(--wp--preset--color--foreground)`,
        },
      },
    };
  },
};
