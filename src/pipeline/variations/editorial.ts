/**
 * "Editorial" variation — leans typographic. Bumps the fluid font scale
 * by ~12%, opens up the block gap, and tightens heading line-height so
 * display headlines sit closer to their body copy. The palette is
 * untouched (editorial mood is about rhythm, not color).
 */

import type { Variation } from "./types.js";
import type { FontSizeEntry } from "../../theme-builder/theme-json.js";

const SCALE = 1.12;

export const editorialVariation: Variation = {
  slug: "editorial",
  title: "Editorial",
  apply(base) {
    const fontSizes: FontSizeEntry[] = base.settings.typography.fontSizes.map((s) => ({
      ...s,
      size: scaleSize(s.size, SCALE),
    }));
    return {
      version: 3,
      title: "Editorial",
      settings: { typography: { fontSizes } },
      styles: {
        spacing: { blockGap: "1.75rem" },
        elements: {
          h1: { typography: { lineHeight: "0.95", letterSpacing: "-0.025em" } },
          h2: { typography: { lineHeight: "1.0",  letterSpacing: "-0.02em" } },
        },
      },
    };
  },
};

/**
 * Multiply numeric magnitudes inside a CSS length or `clamp(...)` while
 * leaving units, function names, operators, and `vw`/`vh` intact.
 *
 * `clamp(1.75rem, 1.4rem + 1.4vw, 2.25rem)` × 1.12
 *   → `clamp(1.96rem, 1.57rem + 1.57vw, 2.52rem)`
 */
function scaleSize(size: string, factor: number): string {
  return size.replace(/(\d+(?:\.\d+)?)/g, (n) => trim(parseFloat(n) * factor));
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "") || "0";
}
