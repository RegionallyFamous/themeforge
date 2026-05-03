# Pattern Library

The pattern library is the moat. It's also the bottleneck for the
quality of every theme this tool ever produces. Take it seriously.

## Format

Each pattern is a single JSON file under `patterns/<category>/<id>.json`.

```jsonc
{
  "id": "hero-split",
  "name": "Hero — Split",
  "category": "hero",
  "description": "Two-column hero. Copy left, image right. Works at any width.",

  "compatible_templates": ["index", "page", "front-page"],
  "compatible_moods": ["editorial", "heritage", "lux-mono", "nordic", "apothecary"],

  "slots": {
    "headline":   { "type": "text",       "max_chars": 80,  "tone": "hero" },
    "subhead":    { "type": "text",       "max_chars": 200, "tone": "supporting" },
    "cta_label":  { "type": "text",       "max_chars": 24,  "tone": "cta" },
    "cta_url":    { "type": "url",        "default": "/shop" },
    "image":      { "type": "image_role", "role": "hero",   "aspect": "4:5" }
  },

  "theme_tokens": [
    "color.background",
    "color.foreground",
    "color.primary",
    "typography.heading",
    "typography.body",
    "spacing.section"
  ],

  "tree": [
    {
      "name": "core/group",
      "attrs": { "align": "full", "tagName": "section" },
      "innerBlocks": [
        {
          "name": "core/columns",
          "attrs": { "verticalAlignment": "center" },
          "innerBlocks": [
            {
              "name": "core/column",
              "attrs": { "width": "55%" },
              "innerBlocks": [
                { "name": "core/heading", "attrs": { "level": 1 }, "slot": "headline" },
                { "name": "core/paragraph", "slot": "subhead" },
                {
                  "name": "core/buttons",
                  "innerBlocks": [
                    { "name": "core/button", "slot": { "label": "cta_label", "url": "cta_url" } }
                  ]
                }
              ]
            },
            {
              "name": "core/column",
              "attrs": { "width": "45%" },
              "innerBlocks": [
                { "name": "core/image", "slot": "image" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Slot types

| Type           | Resolved value                                     |
| -------------- | -------------------------------------------------- |
| `text`         | A string. `max_chars` is enforced.                 |
| `url`          | A URL string. Validates as URL.                    |
| `image_role`   | A reference to an image slot. Becomes a placeholder + `IMAGE_BRIEF.md` entry. |
| `link`         | `{ label, url }`. Both required.                   |
| `enum`         | One of the values listed in `options`.             |
| `repeater`     | `{ count: number, items: <slot tree> }` — for lists like USP strips. |

`tone` on text slots is a hint to the customizer LLM:
- `hero` — short, punchy, brand-led
- `supporting` — explanatory, audience-led
- `cta` — verb-first, ≤4 words
- `microcopy` — disclaimers, badges, ≤6 words
- `body` — paragraph copy

### `compatible_moods`

The list of mood archetypes this pattern looks good in. The
template-planner uses this to filter the candidate set when picking
patterns for a theme. A pattern that only looks right in a single mood
should still be in the library — diversity is the point.

### `theme_tokens`

The list of theme.json tokens this pattern reads. The validator uses
this to verify the generated theme.json defines all needed tokens.

## Categories (initial 10)

These are the categories Phase 2 must cover. Each gets at least one
pattern to start, ideally two.

| Category            | Used in templates                | Initial count |
| ------------------- | -------------------------------- | ------------- |
| `hero`              | index, page, front-page          | 2 |
| `product-grid`      | index, archive-product           | 2 |
| `category-showcase` | index, front-page                | 1 |
| `usp-strip`         | index, front-page                | 1 |
| `testimonial`       | index, page                      | 1 |
| `newsletter`        | index, page, footer area         | 1 |
| `footer`            | parts/footer                     | 1 |
| `single-product`    | single-product                   | 1 |
| `faq`               | page, single-product             | 1 |

That's 11 patterns to start. Phase 9 expands to 40–60 across all
categories plus header parts and cart/checkout chrome.

## Authoring workflow

1. Open WordPress with WooCommerce installed.
2. In the site editor, build the pattern visually.
3. Copy the block markup.
4. Run `npm run pattern:import <category> <id>` — paste markup, the
   tool auto-converts to JSON tree, prompts for slot annotation.
5. Annotate slots: which texts become slots, which images, which CTAs.
6. Annotate `theme_tokens` and `compatible_moods`.
7. Run `npm run pattern:check <id>` — round-trips, renders to a
   sandbox WP install, screenshots at three breakpoints.
8. Commit.

The import-and-annotate flow keeps authoring fast. Hand-writing JSON
trees from scratch is masochism.

## What makes a good pattern

- **Slot count is small** (3–7). More slots = more LLM cost + more
  failure surface.
- **Layout is robust** at narrow widths. Test at 360px first.
- **Theme tokens, not hardcoded colors.** A pattern that hardcodes
  `#ff6600` is broken. Every color reads from theme.json.
- **No copy specifics in defaults.** Defaults should be obviously
  placeholder ("Your headline here"). The customizer always replaces
  them.
- **Self-contained.** No assumed sibling blocks. Patterns compose by
  stacking; they don't peek at each other.

## What's *not* a pattern

- Page-level layouts. Those are templates.
- Headers and footers. Those are template parts (still JSON tree, but
  live in `parts/` not `patterns/`).
- Cart and checkout layouts. Those are fixed scaffolds — see
  `src/theme-builder/scaffolds/`.
