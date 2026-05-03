/**
 * Extract a starter palette from a logo image using `node-vibrant`.
 *
 * Used in step 5 of the brand-spec form when the operator picks
 * `color.source: "logo_extract"`. The extracted palette is presented
 * back as a confirmation step — the operator can keep, edit, or
 * discard it. We never silently commit colors derived from an image.
 */

import Vibrant from "node-vibrant";

export interface ExtractedPalette {
  /** 3–5 hex colors, lowercase, deduped, in suggested-use order. */
  palette: string[];
}

export async function extractPaletteFromLogo(filePath: string): Promise<ExtractedPalette> {
  const palette = await Vibrant.from(filePath).getPalette();
  // Order chosen to give a sensible starter set:
  //   - DarkVibrant: usually a strong primary
  //   - LightMuted:  usually a soft background
  //   - DarkMuted:   usually a deep neutral
  //   - Vibrant:     a saturated accent
  //   - LightVibrant: a soft accent
  //   - Muted:       a fallback neutral if the image is low-saturation
  const ordered = [
    palette.DarkVibrant,
    palette.LightMuted,
    palette.DarkMuted,
    palette.Vibrant,
    palette.LightVibrant,
    palette.Muted,
  ];
  const hexes = ordered
    .map((s) => (s ? s.hex : null))
    .filter((h): h is string => typeof h === "string");
  // Dedupe — small or single-color images can return identical swatches
  // for multiple categories.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const h of hexes) {
    const lower = h.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    unique.push(lower);
  }
  // The schema requires at least 3 colors. If the image yields fewer
  // distinct swatches, the form will fall back to manual hex entry.
  return { palette: unique.slice(0, 5) };
}
