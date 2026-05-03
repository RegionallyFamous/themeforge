/**
 * Headless screenshot capture.
 *
 * Drives a Chromium instance via `playwright-core` and grabs one
 * full-page PNG per entry in the marketing screenshots brief. Uses the
 * system Chrome via `executablePath` so the install is small (~5MB —
 * no bundled browser). Tested end-to-end against WordPress Studio: the
 * `studio` deploy adapter returns the `http://localhost:NNNN` URL this
 * module consumes.
 *
 * Fails cleanly when Chrome isn't available — surfaces a setup-required
 * message rather than a confusing Playwright trace.
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { MarketingAssets } from "../pipeline/marketing.js";

export interface CaptureOptions {
  /** Base URL of the running site (e.g. `http://localhost:8881`). */
  url: string;
  /** Directory to write PNGs into. Created if missing. */
  outputDir: string;
  /** Brief from the bundled marketing assets. */
  brief: MarketingAssets["screenshots_brief"];
  /** Override the Chrome executable. Defaults to common Mac path / env. */
  chromePath?: string;
  /** Per-shot navigation timeout in ms. Default 15000. */
  timeoutMs?: number;
}

export interface ScreenshotResult {
  written: string[];
}

/** Common Chrome locations to try when no explicit path is given. */
const DEFAULT_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export async function captureScreenshots(opts: CaptureOptions): Promise<ScreenshotResult> {
  const chromePath =
    opts.chromePath ?? process.env.CHROME_PATH ?? findChrome();
  if (!chromePath) {
    throw new Error(
      [
        "captureScreenshots: no Chrome / Chromium executable found.",
        "",
        "Tried:",
        ...DEFAULT_CHROME_PATHS.map((p) => `  - ${p}`),
        "",
        "Either install Google Chrome (https://www.google.com/chrome/), or",
        "set the CHROME_PATH env var / pass `chromePath` to the function.",
      ].join("\n"),
    );
  }

  // Lazy-import playwright so importing this module doesn't blow up
  // when playwright-core is missing in a stripped-down environment.
  let chromium: typeof import("playwright-core").chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch (err) {
    throw new Error(
      `captureScreenshots: playwright-core is not installed. Run \`npm install playwright-core\` and retry. (${(err as Error).message})`,
    );
  }

  mkdirSync(opts.outputDir, { recursive: true });
  const timeout = opts.timeoutMs ?? 15_000;

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  const written: string[] = [];

  try {
    // For `single-product` shots we need a real product permalink, not
    // the generic `?post_type=product` query which falls through to the
    // page template. Probe the shop page once and cache the first
    // product link for the whole batch.
    let firstProductUrl: string | null = null;
    const needsProduct = opts.brief.some((s) => s.page === "single-product");
    if (needsProduct) {
      firstProductUrl = await probeFirstProductUrl(browser, opts.url, timeout);
    }

    for (const shot of opts.brief) {
      const context = await browser.newContext({
        viewport: { width: shot.width, height: heightFor(shot.width) },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      let target: string;
      if (shot.page === "single-product" && firstProductUrl) {
        target = firstProductUrl;
      } else {
        target = `${stripTrailingSlash(opts.url)}${pathForShotPage(shot.page)}`;
      }

      try {
        await page.goto(target, { waitUntil: "networkidle", timeout });
      } catch {
        // Some pages (cart/checkout) on a brand-new install may 404 or
        // redirect mid-load. We still want a screenshot of what's there
        // — even an empty state — rather than aborting the whole batch.
        await page.goto(target, { waitUntil: "domcontentloaded", timeout });
      }

      const file = join(opts.outputDir, `${shot.page}-${shot.width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      written.push(file);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  return { written };
}

/**
 * Visit `/shop/` and return the href of the first product link found.
 * Used so single-product screenshots land on a real product page rather
 * than the empty `?post_type=product` listing. Returns null when no
 * products exist (caller falls back to the generic path).
 */
async function probeFirstProductUrl(
  browser: import("playwright-core").Browser,
  baseUrl: string,
  timeout: number,
): Promise<string | null> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${stripTrailingSlash(baseUrl)}/shop/`, {
      waitUntil: "domcontentloaded",
      timeout,
    });
    // The callback runs inside the browser; TypeScript doesn't have DOM
    // types in our compiler `lib`, so the `any` cast keeps tsc quiet
    // without leaking DOM globals into the rest of our codebase.
    const href = await page.evaluate(() => {
      const d = (globalThis as unknown as { document: any }).document;
      const link =
        d.querySelector("a.woocommerce-LoopProduct-link") ??
        d.querySelector(".wp-block-woocommerce-product-template a[href*='/product/']") ??
        d.querySelector("a[href*='/product/']");
      return (link as { href?: string } | null)?.href ?? null;
    });
    return href;
  } catch {
    return null;
  } finally {
    await ctx.close();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function findChrome(): string | undefined {
  for (const p of DEFAULT_CHROME_PATHS) {
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return undefined;
}

function pathForShotPage(page: MarketingAssets["screenshots_brief"][number]["page"]): string {
  switch (page) {
    case "homepage":         return "/";
    case "single-product":   return "/?post_type=product"; // first product if any
    case "archive-product":  return "/shop/";
    case "page":             return "/sample-page/";
    case "cart":             return "/cart/";
    case "checkout":         return "/checkout/";
  }
}

function heightFor(width: number): number {
  // Reasonable initial viewport height so the layout has something to
  // settle into before fullPage capture takes over.
  if (width >= 1280) return 900;
  if (width >= 768)  return 1024;
  return 800;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

// Re-export for tests (path mapping shouldn't drift from the WP routes
// the screenshot brief assumes).
export const __testing = { pathForShotPage, findChrome, heightFor };
