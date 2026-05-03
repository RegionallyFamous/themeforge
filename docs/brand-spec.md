# Brand Spec

The brand spec is the single source of truth for a theme build. The
operator authors it via the CLI form (`npm run forge new`); the
pipeline consumes it as JSON.

Every theme bundle commits its `brand-spec.json` so re-running the
pipeline against the same spec is reproducible (modulo LLM
nondeterminism, which we can mitigate with seed/temperature controls).

## Schema

Authoritative JSON Schema lives in `schemas/brand-spec.schema.json`.
The TypeScript type (zod-derived) lives in `src/brand-spec/schema.ts`.

```ts
type BrandSpec = {
  version: 1;

  store: {
    name: string;          // "Bellwether Coffee"
    tagline: string;       // "Single-origin, slow-roasted, shipped fresh."
    description: string;   // 2–3 sentences on what they sell.
    niche: string;         // "specialty coffee", "yoga apparel", etc.
  };

  voice: {
    formality: 1 | 2 | 3 | 4 | 5;     // 1 = very casual, 5 = formal
    playfulness: 1 | 2 | 3 | 4 | 5;   // 1 = serious, 5 = playful
    premiumness: 1 | 2 | 3 | 4 | 5;   // 1 = accessible, 5 = ultra-premium
  };

  audience: {
    description: string;   // One sentence on the buyer.
  };

  mood: {
    primary: MoodArchetype;
    secondary?: MoodArchetype;
  };

  color: {
    source: "palette_card" | "hex_input" | "logo_extract";
    palette: string[];     // 3–6 hex colors. First is primary.
    base: "light" | "dark";
  };

  typography: {
    pairing: TypographyPairing;
    headline_font?: string;  // optional override
    body_font?: string;
  };

  density: "airy" | "balanced" | "dense";

  references: Array<{
    url: string;
    notes?: string;        // What about it inspired you.
  }>;

  locale: string;          // "en_US", default
};

type MoodArchetype =
  | "apothecary"     // muted, herbal, considered, serif-led
  | "editorial"      // magazine-style, big type, lots of whitespace
  | "brutalist"      // raw, monospaced, high-contrast
  | "botanical"      // organic, leafy, soft, illustrative
  | "heritage"       // old-world, crafted, warm, slab serifs
  | "nordic"         // minimal, calm, soft palettes, sans-serif
  | "playful"        // bright, rounded, energetic
  | "y2k"            // bold gradients, glossy, retro-futurist
  | "sport"          // strong, kinetic, sans-serif, primary colors
  | "lux-mono"       // single accent, high contrast, restraint
  | "coastal"        // breezy, sandy, soft blues and warm whites
  | "sci";           // technical, precise, grids, mono accents

type TypographyPairing =
  | "modern_sans"        // Inter / system stack
  | "elegant_serif"      // Playfair / EB Garamond
  | "editorial_mix"      // Display serif + neutral sans body
  | "industrial"         // Mono + condensed sans
  | "humanist"           // Source Sans + slab
  | "surprise_me";       // pipeline picks based on mood
```

## Form (CLI)

Implemented in `src/brand-spec/form.ts`. Roughly 5–7 minutes to
complete. Order:

1. **Store basics** — name, tagline, description, niche (4 short text
   prompts).
2. **Mood** — visual cards (rendered as ASCII art / colored swatches
   in terminal; a web form later). Pick one or two.
3. **Voice** — three sliders (1–5 each). The default is set by the
   chosen mood; user can override.
4. **Audience** — one-line who-buys.
5. **Color** — three options:
   - "Pick a palette card" — show 6 curated palettes derived from the
     mood.
   - "Paste hex codes" — 3–6 hex.
   - "Extract from logo" — path to logo image, run `vibrant.js`,
     present extracted swatches for confirmation.
6. **Typography** — pairing card or "surprise me".
7. **Density** — airy / balanced / dense.
8. **References** — optional, up to 3 URLs.

Mood selection in step 2 should pre-fill steps 3, 4 (voice defaults),
6 (typography pairing), and 7 (density default). Users who want speed
just confirm; users who want control override.

## Validation

`brand-spec.json` must validate against the schema before any
pipeline stage runs. Validation errors fail loud with a path to the
offending field.

The form persists progress to `.forge-drafts/<slug>.json` between
steps so a half-completed form survives terminal interruption.

## Sample

A complete filled spec is at `samples/coffee-roaster/brand-spec.json`.
Use it as the canonical example for testing the pipeline before any
LLM is wired in.
