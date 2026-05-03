/**
 * Bunny Fonts integration.
 *
 * Bunny Fonts (https://fonts.bunny.net) is a privacy-respecting Google
 * Fonts mirror that ships the same woff2 files at predictable URLs. By
 * referencing fonts here in theme.json's `fontFace` array, WordPress
 * registers them as @font-face declarations and the brand's chosen
 * typography actually loads — instead of falling back to system fonts.
 *
 * For each known free font we list the weights worth shipping (400,
 * 500, 700 covers most theme needs). For unknown fonts (Söhne, Helvetica
 * Now, etc. — commercial families), `fontFaceForFamily` returns null
 * and the theme.json entry omits `fontFace`; the operator can drop
 * licensed files in later.
 */

import type { FontFamilyEntry } from "./theme-json.js";

interface FontFace {
  fontFamily: string;
  fontWeight: string;
  fontStyle: "normal" | "italic";
  src: string[];
}

/**
 * Map from a primary family name (case-insensitive) to its
 * kebab-cased Bunny Fonts slug. Add an entry whenever a typography
 * pairing in the brand-spec form references a new family.
 */
const BUNNY_SLUGS: Record<string, string> = {
  inter: "inter",
  "ibm plex sans": "ibm-plex-sans",
  "ibm plex serif": "ibm-plex-serif",
  "ibm plex mono": "ibm-plex-mono",
  fraunces: "fraunces",
  "playfair display": "playfair-display",
  "eb garamond": "eb-garamond",
  "source sans 3": "source-sans-3",
  "source sans pro": "source-sans-pro",
  "source serif 4": "source-serif-4",
  "source serif pro": "source-serif-pro",
  "noto sans": "noto-sans",
  "noto serif": "noto-serif",
  manrope: "manrope",
  "dm sans": "dm-sans",
  "dm serif display": "dm-serif-display",
  "dm serif text": "dm-serif-text",
  "space grotesk": "space-grotesk",
  "space mono": "space-mono",
  "jetbrains mono": "jetbrains-mono",
  poppins: "poppins",
  montserrat: "montserrat",
  lora: "lora",
  merriweather: "merriweather",
  cormorant: "cormorant",
  "cormorant garamond": "cormorant-garamond",
  "libre baskerville": "libre-baskerville",
  "libre franklin": "libre-franklin",
  "libre caslon text": "libre-caslon-text",
  raleway: "raleway",
  rubik: "rubik",
  "work sans": "work-sans",
  archivo: "archivo",
  "archivo black": "archivo-black",
  syne: "syne",
  "alegreya sans": "alegreya-sans",
  alegreya: "alegreya",
  "abril fatface": "abril-fatface",
  unbounded: "unbounded",
  "anton sc": "anton-sc",
  anton: "anton",
  bebas: "bebas-neue",
  "bebas neue": "bebas-neue",
  "noto serif display": "noto-serif-display",
};

const DEFAULT_WEIGHTS = ["400", "500", "700"];

/**
 * Parse a CSS font-family stack and return the first quoted-or-unquoted
 * family name. `Inter, system-ui, sans-serif` → `Inter`.
 */
export function primaryFamilyName(stack: string): string {
  const first = stack.split(",")[0]?.trim() ?? stack;
  return first.replace(/^["']|["']$/g, "").trim();
}

/**
 * Build a `fontFace` array for one family entry. Walks the CSS font
 * stack from primary onward and loads the first family found in the
 * Bunny lookup — so a stack like `Söhne, Work Sans, sans-serif` (where
 * the LLM picked a commercial primary and a free fallback) still gets
 * Work Sans loaded.
 *
 * Returns `undefined` when no family in the stack is known to Bunny.
 *
 * Defaults to weights 400, 500, 700 + their italics. Enough for a theme
 * that uses one body weight, one heading weight, and emphasis without
 * ballooning the font-load size.
 */
export function fontFaceForFamily(
  family: FontFamilyEntry,
  weights: string[] = DEFAULT_WEIGHTS,
): FontFace[] | undefined {
  const families = parseFontStack(family.fontFamily);
  let chosenName: string | undefined;
  let chosenSlug: string | undefined;
  for (const name of families) {
    const slug = BUNNY_SLUGS[name.toLowerCase()];
    if (slug) {
      chosenName = name;
      chosenSlug = slug;
      break;
    }
  }
  if (!chosenName || !chosenSlug) return undefined;

  const faces: FontFace[] = [];
  for (const weight of weights) {
    for (const style of ["normal", "italic"] as const) {
      faces.push({
        fontFamily: chosenName,
        fontWeight: weight,
        fontStyle: style,
        src: [`https://fonts.bunny.net/${chosenSlug}/files/${chosenSlug}-latin-${weight}-${style}.woff2`],
      });
    }
  }
  return faces;
}

/**
 * Parse a CSS font-family stack into individual family names, stripped
 * of quotes and trimmed. Drops generic family keywords (`sans-serif`,
 * `serif`, etc.) and the `system-ui` / `ui-*` family — none are
 * loadable via @font-face.
 */
function parseFontStack(stack: string): string[] {
  const GENERIC = new Set([
    "serif", "sans-serif", "monospace", "cursive", "fantasy",
    "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded",
    "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica",
    "arial", "sans", "noto", "georgia", "iowan old style",
  ]);
  return stack
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0 && !GENERIC.has(s.toLowerCase()));
}

export const __testing = { BUNNY_SLUGS };
