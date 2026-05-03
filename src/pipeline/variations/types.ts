/**
 * Shape of a `theme/styles/<slug>.json` file.
 *
 * WordPress reads these on top of `theme.json`. Anything you set here
 * overrides the base; anything you omit inherits from the base.
 *
 * Per the architecture decision, variations override **only** theme.json
 * tokens — never patterns. So this type intentionally only exposes the
 * `settings` and `styles` slices of theme.json.
 */

import type { ThemeJson, FontSizeEntry, PaletteEntry } from "../../theme-builder/theme-json.js";

export type StyleSettingsOverride = Partial<{
  color: { palette: PaletteEntry[] };
  typography: { fontSizes: FontSizeEntry[] };
}>;

export type StyleStylesOverride = Partial<{
  color: { background: string; text: string };
  typography: { fontFamily: string; fontSize: string; lineHeight: string };
  spacing: { blockGap: string };
  elements: Record<string, unknown>;
}>;

export interface StyleVariationFile {
  version: 3;
  title: string;
  settings?: StyleSettingsOverride;
  styles?: StyleStylesOverride;
}

export interface Variation {
  /** Filename slug — becomes `theme/styles/<slug>.json`. */
  slug: string;
  /** Human-readable name shown in WP's Appearance → Styles UI. */
  title: string;
  apply(base: ThemeJson): StyleVariationFile;
}
