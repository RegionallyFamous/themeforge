# Pattern library backlog

Roadmap for ongoing pattern work. Phase 9 of the build plan
(`docs/roadmap.md`) is explicitly "ongoing, not a one-shot phase" —
this file tracks what's done, what's next, and the rationale.

**Library size: 41 patterns across 17 categories.** The 40-pattern
floor is met; further expansion targets the 60-pattern ceiling and
fills out the long-tail surfaces (more single-product variants, account
pages, additional headers and footers).

## Authoring rules (worth re-reading before adding)

- Slot count stays small (3–7). More slots = more LLM cost + more failure surface.
- Layout robust at 360px first.
- Theme tokens, no hardcoded hexes.
- Defaults are obviously placeholder ("Your headline here").
- Self-contained. Patterns compose by stacking; no peeking at siblings.
- Test by drop-in to a real WP install. Round-trip alone isn't enough — visual breakage at narrow widths is the most common bug.

See `docs/pattern-library.md` for the format spec and authoring workflow.

## Done in the last expansion (21 → 41)

- **header**: header-classic, header-centered, header-stacked
- **hero**: hero-text-only, hero-marquee
- **product-grid**: grid-2up, grid-4up, grid-feature
- **category-showcase**: category-strip, category-feature
- **usp-strip**: usp-row-five
- **testimonial**: testimonial-grid, testimonial-with-photo
- **newsletter**: newsletter-inline
- **footer**: footer-minimal, footer-three-column, footer-trust
- **single-product**: single-product-gallery, single-product-immersive
- **faq**: faq-columns, faq-flat
- **about**: about-split, about-team
- **press**: press-strip, press-quotes
- **contact**: contact-form
- **blog**: blog-grid, single-post
- **shipping**: shipping-strip
- **locations**: hours-and-locations
- **cart**: cart-trust-band

## Next up (toward the 60 ceiling — prioritized)

In rough order of marginal value (biggest gap × highest reuse first):

### Hero (4 → 5)
- **`hero-video-loop`** — full-width muted autoplay loop with overlay copy. Needs a `video_role` slot type extension; defer until that lands.

### Product grid (5 → 7)
- **`grid-with-filters`** — wraps `woocommerce/product-collection` with the standard filter chrome (price, attribute). Higher complexity — pair with a filter-pattern test fixture.
- **`grid-on-sale`** — product collection filtered to on-sale items, with a clear sale eyebrow.

### Category showcase (3 → 4)
- **`category-marquee`** — scrolling row of category labels with optional images. Playful / sport.

### USP strip (2 → 3)
- **`usp-strip-icons`** — same structure as `usp-strip-three` but each column leads with an SVG icon. Needs an `icon_role` slot type or a small icon-pack convention.

### Testimonial (3 → 4)
- **`testimonial-marquee`** — horizontally scrolling quotes (5–8 items via repeater). Loud social proof.

### Newsletter (2 → 3)
- **`newsletter-popup-prompt`** — discrete bottom-band signup prompt rather than a full banner.

### Single product (3 → 5)
- **`single-product-bundle`** — primary product up top, "frequently bought together" repeater below.
- **`single-product-tabs`** — tabbed accordion below the buy block (description, ingredients, shipping). Needs a tabs renderer or a forge/* expansion.

### About (2 → 3)
- **`about-timeline`** — vertical timeline of milestones. Repeater of `{ year, title, body }`.

### New categories to consider

- **`account`** — wrapper chrome around `woocommerce/customer-account`.
- **`recipes`** — ingredient + step pattern for makers (coffee brewing, candle burning, etc.).
- **`subscription`** — pattern showing a subscription box's contents and cadence.
- **`comparison-table`** — side-by-side product or plan comparison.

## Cart / checkout chrome (1 → 3)

Cart and checkout pages use fixed scaffolds (per architecture decision
#4). The planner can't restructure them, but the chrome around them
benefits from dedicated patterns:

- ✅ **`cart-trust-band`** — three reassurance items above the cart block.
- **`checkout-side-summary`** — sidebar pattern that pairs with `woocommerce/checkout`'s order summary.
- **`cart-cross-sell`** — recommendations row below the cart block.

## Header refactor follow-ups

Phase 9 made headers a first-class category and the orchestrator now
uses the planner's pick when one is provided, falling back to the
hardcoded skeleton otherwise. Open work:

- Promote the hardcoded skeleton into a "default" tag on `header-classic` so the orchestrator can drop the duplicate code.
- Add a `compatible_templates: ["parts/header"]`-only category check to the planner's required `parts.header`. Currently optional for backward compatibility.
- Sticky-header variant (CSS-driven, no JS).

## How to grow the library

1. Pick a row above. Read the existing pattern in the same category for shape.
2. Build the JSON tree. Either author by hand or paste markup from the WP editor into `npm run pattern:import <category> <id>` for a scaffolded skeleton.
3. Annotate slots / theme_tokens / compatible_templates / compatible_moods.
4. Verify with `npm run pattern:check <id>` (shape + serializer + round-trip).
5. Drop into a real WP install at 360 / 768 / 1440 to catch visual breakage.
6. Update `patterns/README.md` and check it off above.

Every new pattern automatically gets serializer + round-trip coverage
via `src/pattern-library/loader.test.ts` — no test changes needed.
