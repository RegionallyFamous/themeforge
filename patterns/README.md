# Patterns

Handcrafted block patterns. The pipeline never invents these — it
selects, orders, and fills slots.

Each pattern is a single JSON file under
`patterns/<category>/<id>.json`. Format spec:
[`docs/pattern-library.md`](../docs/pattern-library.md).

## What's here

Forty-one patterns across seventeen categories — over the Phase 9 floor
of 40. Roadmap for further expansion lives in
[`patterns/BACKLOG.md`](BACKLOG.md).

```
header/header-classic.json                 Site title left, nav right (default)
header/header-centered.json                Site title centered above nav
header/header-stacked.json                 Site title + tagline left, nav right
hero/hero-split.json                       Two-column hero, copy + image
hero/hero-cover.json                       Centered cover hero, image above
hero/hero-text-only.json                   Image-free, big centered text + CTA
hero/hero-marquee.json                     Centered hero + kinetic strip below
product-grid/grid-3up.json                 3-up Product Collection grid
product-grid/grid-2up.json                 2-up featured products (larger images)
product-grid/grid-4up.json                 4-up grid for deeper catalogs
product-grid/grid-list.json                Vertical product list (one per row)
product-grid/grid-feature.json             1 large + 2 small featured products
category-showcase/category-trio.json       Three category cards in a row
category-showcase/category-strip.json      Five compact category tiles
category-showcase/category-feature.json    Two large category cards with body
usp-strip/usp-strip-three.json             Three value-prop columns
usp-strip/usp-row-five.json                Five inline microcopy items
testimonial/testimonial-single.json        Single pull-quote with attribution
testimonial/testimonial-grid.json          Three customer quotes side by side
testimonial/testimonial-with-photo.json    Headshot left, quote right
newsletter/newsletter-banner.json          Full-width signup banner
newsletter/newsletter-inline.json          Two-column inline signup
footer/footer-rich.json                    Four-column footer with newsletter
footer/footer-minimal.json                 Brand + nav + copyright on one line
footer/footer-three-column.json            Brand + shop + support, no newsletter
footer/footer-trust.json                   Brand line + payment icons + copyright
single-product/single-product-classic.json Two-column image / title+price+ATC
single-product/single-product-gallery.json Image gallery + product detail
single-product/single-product-immersive.json Full-bleed image, centered buy block
faq/faq-accordion.json                     Repeater of <details> Q&A items
faq/faq-columns.json                       Two-column accordions
faq/faq-flat.json                          Q&A pairs as flat sections (no toggle)
about/about-split.json                     Story image + body text split
about/about-team.json                      Team-member grid (repeater)
press/press-strip.json                     Row of "as seen in" logos
press/press-quotes.json                    Two press quotes with publications
contact/contact-form.json                  Contact details + inline form
blog/blog-grid.json                        3-up post grid (core/query)
blog/single-post.json                      Single post body layout
shipping/shipping-strip.json               One-line trust band
locations/hours-and-locations.json         Address + hours for brick-and-mortar
cart/cart-trust-band.json                  Trust strip designed to sit above wp:woocommerce/cart
```

## Adding a pattern

See `docs/pattern-library.md` § Authoring workflow. Short version:
build it visually in the WP site editor, paste the markup into

```bash
cat /tmp/markup.html | npm run pattern:import <category> <id>
```

The import flow scaffolds a `PatternDef` skeleton and flags any unknown
block types. Open the file, annotate `slots` / `theme_tokens` /
`compatible_templates` / `compatible_moods`, and commit.

## Validating

```bash
npm run pattern:check <id>
```

Verifies the file shape, that it serializes with mock resolutions,
parses cleanly, and round-trips byte-for-byte through the WordPress
parser. Visual breakage at narrow widths is the most common bug — also
install in WP at three breakpoints (1440 / 768 / 360).
