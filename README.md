# woo-theme-forge

Internal production tool that generates sellable WooCommerce block
themes from a guided brand-spec form.

This is **not** a customer-facing product. It's the operator's tool for
producing niche WooCommerce themes faster than hand-crafting allows,
with consistent quality across the catalog.

## Quick start

```bash
npm install
cp .env.example .env  # add ANTHROPIC_API_KEY
npm run forge new                                                  # interactive brand-spec form
npm run forge build samples/coffee-roaster/brand-spec.json         # 5-stage LLM pipeline + bundle
```

Output is written to `output/<theme-slug>/`:

```
output/<slug>/
  style.css                       theme header
  functions.php                   minimal bootstrap
  theme.json                      design tokens (palette, typography, spacing)
  IMAGE_BRIEF.md                  photography sourcing checklist
  templates/                      index, single-product, archive-product, page,
                                  page-cart, page-checkout, 404
  parts/                          header.html, footer.html
  styles/                         5 brand-flavored variations (Light, Dark,
                                  Editorial, Playful, Mono — branded per mood)
  assets/placeholders/            theme-tinted SVG placeholders, one per
                                  distinct image role
  marketing/                      description.md, features.md, variations.md,
                                  demo-concept.md, screenshots-brief.md,
                                  changelog.md
output/<slug>-<version>.zip       installable theme bundle
```

## CLI

```bash
forge new [-o path] [--resume <slug>]
  Interactive brand-spec form. Writes <slug>.brand-spec.json on
  completion. Auto-saves draft after every step to .forge-drafts/.

forge build <brand-spec.json> [-o ./output] [--no-zip] [--force]
  Full pipeline: brand-interpreter → theme-json-generator →
  template-planner → pattern-customizer (× N, parallel) → marketing →
  bundler. Writes a complete block theme + zip.

forge pattern check <id>
  Validate a single pattern: shape, slot resolution, serialization,
  byte-stable round-trip.

forge pattern import <category> <id> [-i input.html] [-o path]
  Convert pasted block markup into a PatternDef skeleton. Stdin or
  --input. Annotate slots/theme_tokens/compatible_* by hand.

forge deploy <themeDir> [--host <id>] [--target <value>] [--manifest-only]
  Phase 10: produce a deployment manifest and hand it to a registered
  host (WP Playground / Kinsta / WP Engine — wire up your own adapter
  in src/deploy/). --manifest-only prints the JSON for inspection.
```

## Architecture

See [`CLAUDE.md`](CLAUDE.md) for the canonical brief and
[`docs/architecture.md`](docs/architecture.md) for the pipeline detail.
Short version:

```
brand-spec.json
  → brand-interpreter (LLM)        → enriched spec
  → theme-json-generator (LLM)     → ThemeTokens → buildThemeJson
  → template-planner (LLM)         → which patterns per template
  → pattern-customizer (LLM × N)   → slot resolutions
  → marketing (LLM)                → description / features / etc.
  → serializer (deterministic)     → block markup
  → validator (deterministic)      → round-trip check
  → bundler (deterministic)        → theme dir + zip
```

LLMs operate on a typed JSON tree, never on raw block markup. A
deterministic serializer emits the WordPress block format and a
validator round-trips every file before promoting the bundle.

## Pattern library

41 hand-authored patterns across 17 categories — see
[`patterns/README.md`](patterns/README.md). Roadmap to expand toward
the 60-pattern ceiling lives in [`patterns/BACKLOG.md`](patterns/BACKLOG.md).

## Testing

```bash
npm test           # full suite
npm run typecheck  # tsc --noEmit
```

Live LLM tests are gated on `ANTHROPIC_API_KEY` and skipped without
it. To run the live theme-tokens stage end-to-end:

```bash
ANTHROPIC_API_KEY=sk-ant-... npx vitest run \
  src/pipeline/theme-json-generator.live.test.ts
```

## What's not done

Two deliverables genuinely require external infrastructure that
isn't installable from a Node.js process:

1. **Headless screenshot capture** — `src/theme-builder/screenshots.ts`
   defines the contract. Wire it to WP Playground or a local WP install
   to enable. Fallback: `marketing/screenshots-brief.md` is the
   authoritative manual checklist.
2. **Phase 10 deploy host** — `src/deploy/hosts.ts` ships with no
   adapters registered. Pick a host (WP Playground / Kinsta / WP
   Engine) and add an adapter that consumes the `DeploymentManifest`.

Beyond that, every phase of [`docs/roadmap.md`](docs/roadmap.md) is
complete and the pipeline runs end-to-end.

## License

Private. Internal tool.
