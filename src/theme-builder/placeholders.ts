/**
 * Placeholder image system.
 *
 * Themes ship with theme-tinted SVGs that read as intentional rather
 * than missing. The serializer emits image src URLs of the form
 * `https://placeholder.local/<role>/<aspect-with-x>` (e.g. `…/hero_lifestyle/4x5`).
 * The bundler swaps those for real on-disk paths inside the theme.
 *
 * Per the architecture decision: no image generation, no stock API.
 * The placeholder set + IMAGE_BRIEF.md is the operator's checklist for
 * sourcing real photography before launch.
 */

import type { ThemeJson } from "./theme-json.js";

export const PLACEHOLDER_HOST = "https://placeholder.local";

export interface PlaceholderPalette {
  background: string;
  backgroundAlt: string;
  foreground: string;
  muted: string;
  primary: string;
}

/**
 * Pull the palette colors needed for a placeholder out of a finished
 * theme.json. Falls back gracefully when a slug is missing.
 */
export function paletteForPlaceholders(theme: ThemeJson): PlaceholderPalette {
  const find = (slug: string, fallback: string) =>
    theme.settings.color.palette.find((c) => c.slug === slug)?.color ?? fallback;
  return {
    background:    find("background",     "#F5F5F0"),
    backgroundAlt: find("background-alt", find("background", "#EEE9E0")),
    foreground:    find("foreground",     "#1A1A1A"),
    muted:         find("muted",          "#888888"),
    primary:       find("primary",        "#A8531E"),
  };
}

/** Convert a `4:5` aspect string into the URL-safe `4x5` form. */
export function aspectSlug(aspect: string): string {
  return aspect.replace(/:/g, "x");
}

/** File name for the placeholder of a given role + aspect. */
export function placeholderFilename(role: string, aspect: string): string {
  return `${role}-${aspectSlug(aspect)}.svg`;
}

/**
 * Build a single placeholder SVG for one role + aspect. Centered label,
 * soft branded backdrop, faint inset frame so the image area reads as a
 * placeholder rather than an empty rectangle. Output is normalized — no
 * trailing whitespace — so two builds with the same inputs produce
 * byte-identical files.
 */
export function buildPlaceholderSvg(
  role: string,
  aspect: string,
  palette: PlaceholderPalette,
): string {
  const [aw, ah] = parseAspect(aspect);
  const baseW = 1600;
  const baseH = Math.round((ah / aw) * baseW);

  // Frame inset 6% of the shorter dimension.
  const inset = Math.round(Math.min(baseW, baseH) * 0.06);
  const frameStrokeWidth = Math.max(2, Math.round(Math.min(baseW, baseH) * 0.004));

  const labelSize = Math.round(Math.min(baseW, baseH) * 0.05);
  const subLabelSize = Math.round(Math.min(baseW, baseH) * 0.028);

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${baseW} ${baseH}" width="${baseW}" height="${baseH}" preserveAspectRatio="xMidYMid slice">`,
    `  <rect width="${baseW}" height="${baseH}" fill="${palette.backgroundAlt}"/>`,
    `  <rect x="${inset}" y="${inset}" width="${baseW - inset * 2}" height="${baseH - inset * 2}" fill="none" stroke="${palette.muted}" stroke-width="${frameStrokeWidth}" stroke-dasharray="${frameStrokeWidth * 4} ${frameStrokeWidth * 3}" opacity="0.5"/>`,
    `  <g font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" text-anchor="middle">`,
    `    <text x="${baseW / 2}" y="${baseH / 2 - labelSize * 0.15}" font-size="${labelSize}" font-weight="500" fill="${palette.foreground}" opacity="0.85">${escape(role)}</text>`,
    `    <text x="${baseW / 2}" y="${baseH / 2 + labelSize * 0.95}" font-size="${subLabelSize}" font-weight="400" fill="${palette.muted}">${escape(aspect)} · placeholder</text>`,
    `  </g>`,
    `</svg>`,
    "",
  ];
  return lines.join("\n");
}

function parseAspect(aspect: string): [number, number] {
  const m = /^(\d+)\s*:\s*(\d+)$/.exec(aspect);
  if (!m) throw new Error(`placeholders: aspect must look like "16:9", got "${aspect}"`);
  return [parseInt(m[1]!, 10), parseInt(m[2]!, 10)];
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Rewrite every `https://placeholder.local/<role>/<aspect>` URL in a
 * markup string to the real on-disk theme path. Pure string replacement
 * — works on serialized templates and parts alike.
 */
export function rewritePlaceholderUrls(markup: string, themeSlug: string): string {
  const baseUrl = `/wp-content/themes/${themeSlug}/assets/placeholders`;
  // Match the host followed by /<role>/<aspect> where role is a-z/0-9/_
  // and aspect is digits + 'x' + digits (already URL-safe).
  return markup.replace(
    /https:\/\/placeholder\.local\/([a-z0-9_-]+)\/(\d+x\d+)/gi,
    (_match, role: string, aspect: string) => `${baseUrl}/${role}-${aspect}.svg`,
  );
}
