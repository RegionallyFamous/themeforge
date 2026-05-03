# Kickoff prompt

Paste this into Claude Code on the first run inside this repo:

---

You're picking up a project I scoped with another agent. The full
brief is in `CLAUDE.md` at the repo root. Read that first, in full,
before doing anything else. Then read these in order:

1. `docs/architecture.md` — the pipeline detail.
2. `docs/pattern-library.md` — pattern format spec (the moat).
3. `docs/brand-spec.md` — input format spec.
4. `docs/roadmap.md` — phased build plan.

Then look at:

- `samples/coffee-roaster/brand-spec.json` — example input.
- `samples/coffee-roaster/output/` — hand-built reference of what the
  pipeline should eventually produce. This is the target, not committed
  output.
- `patterns/hero/hero-split.json`, `patterns/product-grid/grid-3up.json`,
  `patterns/footer/footer-rich.json` — three example patterns showing
  the JSON-tree format.

Then build **Phase 1** from the roadmap: the deterministic theme-builder
primitives. No LLM yet. Goal is a serializer that takes a pattern's
JSON tree plus a slot-resolution map and emits WordPress block markup
that round-trips through `@wordpress/block-serialization-default-parser`
back to an equivalent tree. Start by writing failing tests against
the `hero-split` pattern using the hand-built `index.html` excerpt as
the expected output. Then make them pass.

When Phase 1 tests are green, stop and report. Don't get ahead of the
phase.

A few hard rules from `CLAUDE.md` that are easy to miss:

- LLMs never emit raw block markup. They operate on the JSON tree.
- Patterns are handcrafted. Don't generate them.
- Cart and checkout templates use fixed scaffolds. Don't freestyle them.
- Block markup output is normalized: 1-space indent, LF line endings,
  trailing newline. Diffs across runs should be minimal.

---
