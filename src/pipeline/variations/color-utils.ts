/**
 * Tiny hex ↔ HSL helpers for the variation transformations.
 *
 * Just enough for invert-lightness and desaturate operations — we don't
 * need a full color library for four deterministic transforms.
 */

export type HSL = readonly [h: number, s: number, l: number];

export function hexToHsl(hex: string): HSL {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`hexToHsl: not a 6-digit hex: ${hex}`);
  const v = m[1]!;
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (n: number) => {
    const v = Math.round(Math.max(0, Math.min(1, n)) * 255)
      .toString(16)
      .padStart(2, "0");
    return v;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Mirror lightness around 0.5 (e.g. L=0.95 → L=0.05). Hue and saturation unchanged. */
export function invertLightness(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, 1 - l);
}

/** Drop saturation to zero, preserve perceived lightness. */
export function desaturate(hex: string): string {
  const [, , l] = hexToHsl(hex);
  return hslToHex(0, 0, l);
}

/**
 * Multiply saturation by a factor. Clamped to [0, 1]. Pure neutrals
 * (s=0) stay neutral — multiplying zero never produces hue.
 */
export function adjustSaturation(hex: string, factor: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(0, Math.min(1, s * factor)), l);
}

/**
 * Rotate hue by `degrees` (positive = clockwise, e.g. 30 shifts orange
 * toward yellow). Pure neutrals are returned unchanged so we don't
 * invent a hue for grayscale.
 */
export function rotateHue(hex: string, degrees: number): string {
  const [h, s, l] = hexToHsl(hex);
  if (s === 0) return hex;
  const newH = ((h * 360 + degrees) % 360 + 360) % 360 / 360;
  return hslToHex(newH, s, l);
}
