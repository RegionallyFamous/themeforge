# Architecture

## Data flow

```
┌──────────────────┐
│ brand-spec.json  │  Operator-authored. Validated against
└────────┬─────────┘  schemas/brand-spec.schema.json.
         │
         ▼
┌──────────────────────────┐
│ brand-interpreter        │  LLM. Enriches brand spec with derived
│ (LLM, schema-constrained)│  copy directives, niche-aware product
└────────┬─────────────────┘  categories, and palette derivations.
         │
         ▼
┌──────────────────────────┐
│ theme-json-generator     │  LLM. Emits a theme.json that satisfies
│ (LLM, schema-constrained)│  the WordPress theme.json schema and
└────────┬─────────────────┘  encodes the brand spec into tokens.
         │                    Also emits 4–6 style variations.
         ▼
┌──────────────────────────┐
│ template-planner         │  LLM. For each WP template
│ (LLM)                    │  (index, single-product, archive-product,
└────────┬─────────────────┘  page-cart, page-checkout, page-404,
         │                    blog index, single post), picks an
         │                    ordered list of pattern IDs from the
         │                    library. Cart and checkout use fixed
         │                    scaffolds — planner only fills the
         │                    surrounding chrome.
         ▼
┌──────────────────────────┐
│ pattern-customizer       │  LLM. For each (pattern, template-context)
│ (LLM, one call/pattern)  │  pair, fills the pattern's slots: copy,
└────────┬─────────────────┘  image roles, cta urls, theme tokens.
         │                    Returns a typed slot-resolution object,
         │                    not block markup.
         ▼
┌──────────────────────────┐
│ serializer               │  Deterministic. Walks the pattern's JSON
│ (deterministic)          │  tree, applies slot resolutions, emits
└────────┬─────────────────┘  WordPress block markup.
         │
         ▼
┌──────────────────────────┐
│ validator                │  Deterministic. Re-parses the emitted
│ (deterministic)          │  markup, verifies round-trip equivalence,
└────────┬─────────────────┘  checks template completeness.
         │
         ▼
┌──────────────────────────┐
│ bundler                  │  Writes:
│ (deterministic)          │   - theme/  (block theme directory)
└────────┬─────────────────┘   - IMAGE_BRIEF.md
         │                     - marketing/  (description, screenshots)
         ▼
┌──────────────────┐
│ output/<theme>/  │
└──────────────────┘
```

## Boundaries between stages

Every inter-stage boundary is a typed JSON object. LLM stages always
return JSON that validates against a `zod` schema before being passed
to the next stage. If validation fails:

1. First retry: re-call the LLM with the validation error included.
2. Second retry: re-call with a stricter prompt + schema reminder.
3. After two failures: abort the build with a clear error pointing to
   the offending stage and payload.

Never silently fall through with malformed data.

## LLM call discipline

- Every LLM call goes through `src/pipeline/llm.ts` which:
  - Pins the model.
  - Logs request/response to `.forge-log/<run-id>/`.
  - Validates response against the stage schema.
  - Retries on validation failure.
- No streaming. Responses are JSON; we wait for the full body.
- Temperature is set per-stage (interpreter low, planner medium,
  customizer slightly higher). Defaults live in `pipeline/config.ts`.

## Pattern library mechanics

Patterns are JSON files describing a tree of WordPress blocks with
**named slots** for variation points. Format spec is in
`docs/pattern-library.md`. The library:

- Auto-registers from `patterns/<category>/*.json`.
- Each pattern declares: `id`, `category`, `compatible_templates`,
  `compatible_moods`, `slots`, `theme_tokens` (the tokens it reads
  from theme.json), and `tree` (the block tree).
- The pattern-customizer receives the slot definitions and returns a
  resolution map. The serializer applies the resolution.

Patterns never reference each other. They are leaf-level building
blocks. The template-planner is responsible for ordering and stitching.

## Style variations

A style variation is a `styles/<name>.json` file in the output theme.
WordPress reads these and lets the user switch between them under
Appearance → Styles.

Each variation is produced by applying a deterministic
**transformation function** to the base theme.json:

```ts
type Variation = {
  name: string;          // "Editorial", "Playful", "Mono", "Dark"
  apply: (themeJson: ThemeJson) => Partial<ThemeJson>;
};
```

Transformations live under `src/pipeline/variations/`. They are pure,
testable, and do not call LLMs. The base theme.json is the only input.

## Validator checks

Before a build is marked final, the validator must pass:

- All declared templates exist as files.
- Every emitted block markup file round-trips through
  `@wordpress/block-serialization-default-parser` to an equivalent tree.
- Cart and checkout templates contain `woocommerce/cart` and
  `woocommerce/checkout` blocks respectively.
- All theme.json color/font/spacing token references in patterns
  resolve to defined tokens.
- No empty slots remain in the output.
- IMAGE_BRIEF.md lists every distinct image role used.

A failing check aborts the build before anything is written outside
the run's temp directory.

## Run isolation

Every build runs in a temp directory under `.forge-runs/<run-id>/`.
On success, the bundler atomically renames it into
`output/<theme-slug>/`. On failure, the temp directory is preserved
for debugging.
