/**
 * Render `MarketingAssets` (LLM output) into the markdown files that
 * end up under `<theme>/marketing/`.
 *
 * Each file is its own concern — easier for the operator to copy/paste
 * one section into a marketplace listing form than to chunk a single
 * monolithic README.
 */

import type { ThemeMetadata } from "../theme-builder/scaffolds.js";
import type { MarketingAssets } from "./marketing.js";

export interface MarketingFileSet {
  /** key = relative file path under `marketing/`, value = file contents */
  files: Record<string, string>;
}

export function renderMarketingFiles(
  assets: MarketingAssets,
  meta: ThemeMetadata,
): MarketingFileSet {
  return {
    files: {
      "description.md":        renderDescription(assets, meta),
      "features.md":           renderFeatures(assets, meta),
      "variations.md":         renderVariations(assets, meta),
      "demo-concept.md":       renderDemoConcept(assets, meta),
      "screenshots-brief.md":  renderScreenshotsBrief(assets, meta),
      // Machine-readable sidecar consumed by `forge deploy --screenshots`
      // and any future automation. Same content as the .md, in the
      // shape Playwright takes directly.
      "screenshots-brief.json": JSON.stringify(assets.screenshots_brief, null, 2) + "\n",
      "changelog.md":          renderChangelog(meta),
    },
  };
}

// ── Renderers ───────────────────────────────────────────────────────────

function renderDescription(a: MarketingAssets, meta: ThemeMetadata): string {
  return [
    `# ${meta.name}`,
    "",
    `_${a.headline}_`,
    "",
    a.description,
    "",
    "## Built for",
    "",
    a.built_for,
    "",
    "## Compatibility",
    "",
    "- WordPress 6.5+",
    "- WooCommerce 8.5+",
    "- PHP 7.4+",
    "",
  ].join("\n");
}

function renderFeatures(a: MarketingAssets, meta: ThemeMetadata): string {
  return [
    `# ${meta.name} — feature list`,
    "",
    "Copy and paste into the marketplace listing's features section.",
    "",
    ...a.features.map((f) => `- ${f}`),
    "",
  ].join("\n");
}

function renderVariations(a: MarketingAssets, meta: ThemeMetadata): string {
  const lines = [
    `# ${meta.name} — style variations`,
    "",
    `Five style variations ship with the theme. Customers switch between them under **Appearance → Styles** in the WordPress admin.`,
    "",
  ];
  for (const v of a.variations) {
    lines.push(`## ${v.branded_title}`);
    lines.push("");
    lines.push(`_File: \`styles/${v.slug}.json\`_`);
    lines.push("");
    lines.push(v.one_liner);
    lines.push("");
  }
  return lines.join("\n");
}

function renderDemoConcept(a: MarketingAssets, meta: ThemeMetadata): string {
  return [
    `# ${meta.name} — demo store concept`,
    "",
    "Use this as the brief for the demo site that ships alongside the theme.",
    "",
    a.demo_store_concept,
    "",
  ].join("\n");
}

function renderScreenshotsBrief(a: MarketingAssets, meta: ThemeMetadata): string {
  const lines = [
    `# ${meta.name} — screenshots brief`,
    "",
    "Capture each shot below. Filename suggestion: `<page>-<width>.png`.",
    "Save under `marketing/screenshots/`. The headless screenshot",
    "pipeline (Phase 8 wiring; see `docs/roadmap.md`) automates this once",
    "WP Playground or a local WP install is configured.",
    "",
  ];
  for (const [i, s] of a.screenshots_brief.entries()) {
    lines.push(`## ${i + 1}. \`${s.page}\` @ ${s.width}px`);
    lines.push("");
    lines.push(`Filename: \`screenshots/${s.page}-${s.width}.png\``);
    lines.push("");
    lines.push(s.notes);
    lines.push("");
  }
  return lines.join("\n");
}

function renderChangelog(meta: ThemeMetadata): string {
  // The LLM doesn't write the changelog — version is operator-supplied
  // metadata, not a creative decision. Stub the first entry deterministically.
  return [
    `# ${meta.name} — changelog`,
    "",
    `## ${meta.version}`,
    "",
    "- Initial release.",
    "",
  ].join("\n");
}
