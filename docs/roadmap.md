# Roadmap

Phased build plan. Don't get ahead of the phase. Each phase has a
concrete completion check.

## Phase 1 — Theme builder primitives (no LLM)

**Goal**: deterministic JSON-tree → block-markup serializer + theme.json
builder + validator. Fully tested. No LLM. No patterns yet.

Deliverables:
- `src/theme-builder/serializer.ts`: walks a JSON tree, emits block
  markup. Handles slot resolution. Round-trip safe.
- `src/theme-builder/theme-json.ts`: builds a valid `theme.json` from a
  typed `ThemeTokens` object.
- `src/theme-builder/validator.ts`: parses block markup back to a tree
  and verifies equivalence.
- Unit tests with hand-written input/output fixtures.

Completion check:
```bash
npm test  # all theme-builder tests green
```

## Phase 2 — Starter pattern library

**Goal**: 11 hand-authored patterns, validated end-to-end by stitching
together a working block theme manually.

Deliverables:
- 2 hero, 2 product-grid, 1 each: category-showcase, usp-strip,
  testimonial, newsletter, footer, single-product, faq.
- Each pattern: JSON file + a manual screenshot at 1440 / 768 / 360.
- A hand-stitched index.html template that uses 5 of them and renders
  correctly in a fresh WordPress + WooCommerce install.

Completion check: install the hand-stitched theme in WP, click through
the homepage, no broken layouts at three breakpoints.

## Phase 3 — Brand spec form

**Goal**: operator can run `npm run forge new` and produce a valid
brand-spec.json.

Deliverables:
- `src/brand-spec/schema.ts`: zod schema matching
  `schemas/brand-spec.schema.json`.
- `src/brand-spec/form.ts`: CLI prompt flow.
- Mood cards rendered to terminal (best effort; web form is later).
- Logo color extraction via `node-vibrant`.

Completion check: form produces a JSON that validates and matches
`samples/coffee-roaster/brand-spec.json` shape.

## Phase 4 — theme.json generator

**Goal**: first LLM stage. Brand spec → theme.json + style variations.

Deliverables:
- `src/pipeline/llm.ts`: shared LLM wrapper (model pinning, retries,
  schema validation, logging).
- `src/pipeline/theme-json-generator.ts`: prompt + schema. Output is a
  validated ThemeTokens object passed to the theme.json builder.
- 4 style variation transformations: light, dark, editorial, mono.

Completion check: run on coffee-roaster spec, get a theme.json that
validates and visually matches the spec (palette, type, density).

## Phase 5 — Template planner + pattern customizer

**Goal**: pipeline now produces complete templates.

Deliverables:
- `src/pipeline/brand-interpreter.ts`: enriches the spec with copy
  directives and niche-aware product taxonomy.
- `src/pipeline/template-planner.ts`: picks pattern IDs per template.
- `src/pipeline/pattern-customizer.ts`: fills slots, returns resolution
  maps.
- All glued together by `src/pipeline/run.ts`.

Completion check: end-to-end run on coffee-roaster spec produces an
output that renders correctly in WP and looks like the hand-built
sample (modulo copy/imagery).

## Phase 6 — Bundler + IMAGE_BRIEF

**Goal**: produce a sellable bundle on disk.

Deliverables:
- `src/theme-builder/bundler.ts`: writes the theme directory, runs
  full validation, generates IMAGE_BRIEF.md from image-role usages.
- Theme zip output via `archiver`.
- Placeholder SVG generator (theme-tinted, role-labeled).

Completion check: `npm run forge build` on coffee-roaster spec
produces a `.zip` that installs in a fresh WP, activates without
errors, and shows polished placeholders.

## Phase 7 — Style variations

**Goal**: every build ships 4–6 variations.

Deliverables:
- `src/pipeline/variations/`: light, dark, editorial, playful, mono.
- Variations written to `theme/styles/*.json`.
- Naming heuristics so variation names match brand voice.

Completion check: install the bundle, switch between variations in
Appearance → Styles, all render without breakage.

## Phase 8 — Marketing assets

**Goal**: theme bundle includes the marketplace listing draft.

Deliverables:
- `src/pipeline/marketing.ts`: generates description, feature list,
  changelog stub, demo-store concept brief.
- Headless screenshot pipeline (Playwright + WP Playground or local WP).
- Screenshots at 1440 / 768 / 360 for the homepage and one product page.

Completion check: bundle includes `marketing/` with all assets ready
to paste into ThemeForest / Mojo / own site.

## Phase 9 — Pattern library expansion

**Goal**: 40–60 patterns across all surfaces. This is ongoing work,
not a one-shot phase. Tracked in a separate `patterns/BACKLOG.md`.

## Phase 10 — Demo deployer (optional)

**Goal**: one-command deploy of a built theme to a public preview URL.

Two paths to consider:
- Static: WordPress Playground hosted on Cloudflare Pages, demo data
  baked in.
- Dynamic: a managed WP host (Kinsta / WP Engine), automated via API.

Decide based on traffic patterns and cost when ready.

---

## Out of scope (for now)

- Image generation.
- Theme.json visual editor.
- Customer-facing UI.
- Classic PHP theme support.
- Multilingual themes (single-locale themes only at first).
- A/B testing demos against each other.
