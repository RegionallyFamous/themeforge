# woo-theme-forge

You are working on an internal production tool that generates sellable
WooCommerce **block themes** from a structured brand spec. The operator
(one person, the theme seller) fills out a guided brand-spec form and the
tool emits a complete, polished, marketplace-ready theme bundle.

This file is the canonical brief. Read it in full before writing code.
Then read `docs/architecture.md`, `docs/pattern-library.md`, and
`docs/roadmap.md`. Do not re-litigate decisions captured here without
proposing a change in writing first.

## Mission

Compress "idea for a niche WooCommerce theme" → "marketplace-listed
theme + demo site + assets" from weeks to hours. The economic thesis is
**catalog velocity at quality**: niche theme buyers (coffee roasters,
yoga studios, candle makers) want themes that look made-for-them. Pure
hand-craft is too slow to cover the long tail. AI-assisted production
hits the long tail at marketplace-quality polish.

The customer never touches AI. They buy a normal theme.

## Architectural decisions (fixed)

These are settled. Don't deviate without writing a doc.

1. **Target: WordPress block themes (FSE), not classic PHP themes.**
   Block themes are `theme.json` + HTML with block markup. Structured,
   declarative, validatable. PHP themes are out of scope.

2. **LLMs do not emit raw block markup.** Block markup is HTML with
   JSON-in-comments — small JSON errors silently break templates. The
   pipeline uses an intermediate **JSON tree** representation for
   patterns and templates. A deterministic serializer turns the tree
   into block markup. LLMs operate on the JSON tree, never on the
   final string.

3. **Patterns are handcrafted, not AI-generated.** The pattern library
   is the moat. AI's role is **selection, ordering, and slot-filling**,
   never invention. Every pattern is hand-authored, hand-tested in
   real WordPress, and committed under `patterns/`.

4. **Cart and checkout templates use fixed scaffolds.** Always use the
   official `woocommerce/cart` and `woocommerce/checkout` blocks. The
   AI may only customize surrounding chrome (trust badges, header,
   footer). It must never restructure these templates.

5. **Validator runs on every build.** Before bundling, the pipeline
   parses the emitted block markup back into a tree and verifies it
   round-trips. A theme that fails validation is never written to disk
   as a finished bundle.

6. **Imagery is placeholder-only.** No image generation, no stock API.
   The pipeline emits a polished placeholder system (theme-tinted SVGs
   labeled with role + aspect ratio) plus an `IMAGE_BRIEF.md` listing
   every slot for the operator to source against. The placeholder
   system must look intentional, not unfinished.

7. **Style variations are first-class.** Every theme ships 4–6 style
   variations under `styles/*.json`. Variations override **only**
   theme.json tokens — never patterns. They are produced by
   deterministic transformations of the base spec, not fresh LLM calls.

8. **Tech stack: Node.js + TypeScript.** Block parsing/serialization
   uses `@wordpress/blocks` (or a focused subset we re-implement). LLM
   calls go through `@anthropic-ai/sdk`. Schema validation uses `zod`.
   CLI uses `commander` and `@inquirer/prompts`.

## Pipeline (one direction, typed boundaries)

```
brand-spec.json (input)
   ↓ brand-interpreter   (LLM, schema-constrained)
enriched-brand-spec
   ↓ theme-json-generator (LLM, schema-constrained)
theme.json + style variations
   ↓ template-planner    (LLM)
template plan (which patterns slot into each template, in what order)
   ↓ pattern-customizer  (LLM, per pattern)
filled patterns (JSON tree with all slots resolved)
   ↓ serializer          (deterministic)
block markup HTML files
   ↓ validator           (deterministic)
verified theme bundle
   ↓ bundler             (deterministic)
.zip + IMAGE_BRIEF.md + marketing copy + screenshots
```

Each stage has a typed input and output. LLM stages return JSON that
validates against a schema; if validation fails, the pipeline retries
with the validation error as feedback (max 2 retries, then fail loud).

## Repository layout

```
/CLAUDE.md                       This file.
/README.md                       Human-facing overview.
/KICKOFF.md                      First-message prompt for Claude Code.
/package.json                    Node deps + scripts.
/tsconfig.json
/.env.example                    ANTHROPIC_API_KEY etc.
/docs/
  architecture.md                Pipeline + data flow detail.
  brand-spec.md                  Brand spec format spec.
  pattern-library.md             Pattern format spec + catalog plan.
  roadmap.md                     Phased build plan.
/schemas/
  brand-spec.schema.json         JSON Schema for brand-spec.json.
/patterns/                       Handcrafted pattern library.
  hero/, product-grid/, ...      One JSON file per pattern variant.
/src/
  cli/                           CLI entrypoint + commands.
  pipeline/                      One file per pipeline stage.
  brand-spec/                    Schema, form, parser.
  pattern-library/               Loader + slot resolution.
  theme-builder/                 Block tree → markup serializer,
                                 theme.json builder, validator,
                                 bundler.
/samples/coffee-roaster/         Reference: filled brand spec +
                                 expected output theme.
```

## Conventions

- TypeScript strict mode. No `any` in public APIs.
- Every LLM call is wrapped by a function that validates the response
  against a zod schema before returning.
- Every external file the pipeline writes is run through the validator
  before being marked final.
- Tests live next to source (`foo.ts` + `foo.test.ts`), use `vitest`.
- Block markup output is normalized: 1-space indent, LF line endings,
  trailing newline. Diffs across runs should be minimal.
- No PHP code in the tool itself. (Themes may include `functions.php`
  but it's templated, never hand-written per theme.)

## What this tool will *not* do

- It will not run inside WordPress. It produces theme bundles offline.
- It will not generate images.
- It will not invent block patterns. Patterns are committed to the repo.
- It will not produce classic PHP themes.
- It will not auto-deploy themes (separate phase, see roadmap).
- It will not be exposed to end customers. It's an internal tool.

## How to extend

- **New pattern**: drop a JSON file under `patterns/<category>/`.
  Validate via `npm run pattern:check <id>`. Patterns auto-register.
- **New template**: add it to `src/theme-builder/templates.ts` with
  the list of compatible pattern categories.
- **New mood archetype**: add it to the brand-spec mood enum and add a
  matching transformation set under `src/pipeline/moods/`.
- **New style variation transformation**: add to
  `src/pipeline/variations/`. Each transformation is a pure function
  `(theme.json) → theme.json`.

## Roadmap snapshot

We build in phases. Don't get ahead of the phase. See `docs/roadmap.md`.

- **Phase 1**: theme-builder primitives (serializer, theme.json builder,
  validator). Deterministic, fully tested. No LLM yet.
- **Phase 2**: 10 starter patterns covering core templates. Validated
  end-to-end by hand-assembling a theme and rendering it in WordPress.
- **Phase 3**: brand-spec schema, CLI form, sample saves and loads.
- **Phase 4**: theme.json generator (first LLM stage).
- **Phase 5**: template planner + pattern customizer.
- **Phase 6**: end-to-end run produces the coffee-roaster sample.
- **Phase 7**: bundler + IMAGE_BRIEF + style variations.
- **Phase 8**: marketing asset generator (description, screenshots).
- **Phase 9**: pattern library expansion (40–60 patterns total).

## When in doubt

The thing that ships theme #5 in 4 hours is the thing that wins.
Anything that doesn't move that needle is a distraction.
