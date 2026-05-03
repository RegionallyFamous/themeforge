/**
 * Headless screenshot pipeline — scaffold only.
 *
 * Capturing real screenshots of a built theme requires running it inside
 * WordPress. The two viable hosts (per the roadmap):
 *
 *   1. WordPress Playground — runs WP in the browser via WASM. No server
 *      install needed. Headless via Playwright + the Playground URL
 *      schema. Fastest setup, best for CI.
 *   2. Local WP install — for any case Playground doesn't cover (heavy
 *      WC blocks, custom plugins). Slower; needs MySQL.
 *
 * Neither is implementable as a pure-Node module — both need a browser
 * runtime and a running WordPress. This module exists to document the
 * intended interface and to surface a clear error if someone tries to
 * use it without the supporting infrastructure in place.
 *
 * The `marketing/screenshots-brief.md` file produced by the bundler is
 * the authoritative manual checklist until this is wired up. Each entry
 * names the page, viewport width, and what should be on screen.
 */

import type { MarketingAssets } from "../pipeline/marketing.js";

export interface ScreenshotJob {
  /** Source file path of the built theme `.zip`. */
  themeZip: string;
  /** Where to write `<page>-<width>.png` files. */
  outputDir: string;
  /** Brief describing what shots to take (from the marketing stage). */
  brief: MarketingAssets["screenshots_brief"];
}

export interface ScreenshotResult {
  written: string[]; // absolute paths to the captured PNG files
}

/**
 * Capture every screenshot in `brief`. Throws until a host is wired up
 * (Phase 8 ships the contract; the actual implementation lands when the
 * Playground integration is built out).
 */
export async function captureScreenshots(_job: ScreenshotJob): Promise<ScreenshotResult> {
  throw new Error(
    [
      "captureScreenshots: no screenshot host is wired up.",
      "",
      "To enable this in your environment, install one of:",
      "  - WordPress Playground (browser WASM) — fastest path; uses Playwright.",
      "  - A local WordPress + WooCommerce install — slower, needs MySQL.",
      "",
      "Until then, follow `<theme>/marketing/screenshots-brief.md` and capture each shot manually,",
      "saving as `marketing/screenshots/<page>-<width>.png` next to the theme bundle.",
    ].join("\n"),
  );
}
