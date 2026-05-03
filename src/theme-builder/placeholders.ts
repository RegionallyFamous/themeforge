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
 * Build a single placeholder SVG for one role + aspect.
 *
 * Picks a visual style based on the role name so the resulting set of
 * placeholders feels like deliberate design choices, not wireframes:
 *
 *   - hero/lifestyle/centerpiece roles → a soft palette gradient with
 *     a subtle abstract shape (wave / circle / diagonal). Reads as art.
 *   - category/feature/tile roles → a flat brand color with a small
 *     centered glyph. Reads as a category card.
 *   - logo/headshot roles → muted backdrop + simple geometric mark.
 *   - everything else → the gradient style.
 *
 * Output is normalized (no trailing whitespace, no random IDs) so two
 * builds with the same inputs produce byte-identical files.
 */
export function buildPlaceholderSvg(
  role: string,
  aspect: string,
  palette: PlaceholderPalette,
): string {
  const [aw, ah] = parseAspect(aspect);
  const baseW = 1600;
  const baseH = Math.round((ah / aw) * baseW);

  const style = pickStyle(role);
  const idx = roleHash(role); // deterministic palette pick per role

  switch (style) {
    case "block":
      return renderBlock(baseW, baseH, palette, idx, role);
    case "logo":
      return renderLogo(baseW, baseH, palette);
    case "gradient":
    default:
      return renderGradient(baseW, baseH, palette, idx);
  }
}

type PlaceholderStyle = "gradient" | "block" | "logo";

function pickStyle(role: string): PlaceholderStyle {
  const r = role.toLowerCase();
  if (/(category|tile|feature|card)/.test(r)) return "block";
  if (/(logo|payment|press|brand)/.test(r)) return "logo";
  return "gradient";
}

/**
 * Stable [0, 1, 2, 3] index from a role string. Lets us rotate which
 * brand color a role uses without anything random — same role always
 * gets the same color.
 */
function roleHash(role: string): number {
  let h = 0;
  for (const ch of role) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 4;
}

/**
 * Soft diagonal gradient between two palette colors. Adds a low-opacity
 * abstract wave for visual interest without dominating.
 */
function renderGradient(
  baseW: number,
  baseH: number,
  palette: PlaceholderPalette,
  idx: number,
): string {
  // Pair light + dark from the palette so the gradient has body.
  const stops: Array<[string, string]> = [
    [palette.background, palette.primary],
    [palette.backgroundAlt, palette.foreground],
    [palette.primary, palette.foreground],
    [palette.background, palette.backgroundAlt],
  ];
  const [from, to] = stops[idx % stops.length]!;
  const waveOpacity = 0.18;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${baseW} ${baseH}" width="${baseW}" height="${baseH}" preserveAspectRatio="xMidYMid slice">`,
    `  <defs>`,
    `    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `      <stop offset="0" stop-color="${from}"/>`,
    `      <stop offset="1" stop-color="${to}"/>`,
    `    </linearGradient>`,
    `  </defs>`,
    `  <rect width="${baseW}" height="${baseH}" fill="url(#g)"/>`,
    // Soft wave/curve — anchors the eye without becoming decoration
    `  <path d="M0,${baseH * 0.7} C${baseW * 0.25},${baseH * 0.55} ${baseW * 0.55},${baseH * 0.85} ${baseW},${baseH * 0.65} L${baseW},${baseH} L0,${baseH} Z" fill="${to}" opacity="${waveOpacity}"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

/**
 * Flat brand color block with a small centered geometric mark. Reads as
 * a category card or feature tile.
 */
function renderBlock(
  baseW: number,
  baseH: number,
  palette: PlaceholderPalette,
  idx: number,
  role: string,
): string {
  // Rotate through the chromatic palette colors per role so a 3-up of
  // category tiles ends up with three distinct colors.
  const colors = [palette.primary, palette.foreground, palette.backgroundAlt, palette.muted];
  const fill = colors[idx % colors.length]!;
  const isLight = isLightColor(fill);
  const accent = isLight ? palette.foreground : palette.background;
  const minDim = Math.min(baseW, baseH);
  const markSize = minDim * 0.18;
  const cx = baseW / 2;
  const cy = baseH / 2;

  // Pick a glyph based on role so the set of category tiles reads as
  // a group of related-but-distinct categories rather than identical
  // squares.
  const glyph = pickGlyph(role, cx, cy, markSize, accent);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${baseW} ${baseH}" width="${baseW}" height="${baseH}" preserveAspectRatio="xMidYMid slice">`,
    `  <rect width="${baseW}" height="${baseH}" fill="${fill}"/>`,
    `  ${glyph}`,
    `</svg>`,
    "",
  ].join("\n");
}

/**
 * Muted backdrop with a simple wordmark-style block — for press logos,
 * payment icons, brand placeholders.
 */
function renderLogo(baseW: number, baseH: number, palette: PlaceholderPalette): string {
  const minDim = Math.min(baseW, baseH);
  const barW = baseW * 0.45;
  const barH = minDim * 0.14;
  const cx = baseW / 2;
  const cy = baseH / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${baseW} ${baseH}" width="${baseW}" height="${baseH}" preserveAspectRatio="xMidYMid slice">`,
    `  <rect width="${baseW}" height="${baseH}" fill="${palette.backgroundAlt}"/>`,
    `  <rect x="${cx - barW / 2}" y="${cy - barH / 2}" width="${barW}" height="${barH}" rx="${barH * 0.2}" fill="${palette.foreground}" opacity="0.55"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

function pickGlyph(role: string, cx: number, cy: number, size: number, color: string): string {
  const r = role.toLowerCase();
  if (/(square|tile|category|feature|card)/.test(r)) {
    // Concentric squares
    return `<rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${size * 0.05}" opacity="0.7"/><rect x="${cx - size / 4}" y="${cy - size / 4}" width="${size / 2}" height="${size / 2}" fill="${color}" opacity="0.7"/>`;
  }
  // Default: outline circle + filled disc, reads as a generic mark
  return `<circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="none" stroke="${color}" stroke-width="${size * 0.05}" opacity="0.7"/><circle cx="${cx}" cy="${cy}" r="${size / 4}" fill="${color}" opacity="0.7"/>`;
}

/** Rough perceived-luminance check (WCAG-ish). */
function isLightColor(hex: string): boolean {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return true;
  const v = m[1]!;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
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
