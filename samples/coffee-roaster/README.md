# Coffee Roaster — Sample

This is the **target output** the pipeline should produce when run on
`brand-spec.json`. It's hand-built. Use it as the reference for what
"good" looks like end-to-end.

Files:

- `brand-spec.json` — the input.
- `output/style.css` — theme metadata header.
- `output/theme.json` — design tokens (palette, type, spacing, layout).
- `output/templates/index.html` — homepage template, block markup.
- `output/parts/header.html` — header part.
- `output/parts/footer.html` — footer part.
- `output/IMAGE_BRIEF.md` — image roles for the operator to source.
- `output/marketing/description.md` — marketplace listing draft.

When Phase 6 is wired up, running:

```bash
npm run forge build samples/coffee-roaster/brand-spec.json
```

…should produce something visually equivalent (modulo LLM
nondeterminism in copy and exact pattern selection) to the contents
of `output/`.

## Notes for whoever's building Phase 1–6

- `theme.json` here uses six color slugs: `background`, `background-alt`,
  `foreground`, `muted`, `primary`, `accent`. Keep these names — patterns
  reference them by slug.
- The hero in index.html corresponds to the `hero-split` pattern. Use
  it as the round-trip target when testing the serializer.
- Line endings are LF, indent is 1 space, trailing newline. Match this
  exactly in the serializer to keep diffs minimal across runs.
