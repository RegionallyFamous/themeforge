/**
 * Phase 6 bundler.
 *
 * Takes a `PipelineRun` (everything Phase 5 produces in memory) and
 * writes a complete WordPress block theme to disk. Atomically: builds
 * inside `.forge-runs/<runId>/<slug>/` and renames into place only after
 * validation passes. Optionally zips the result.
 *
 * Files produced:
 *
 *   <slug>/
 *     style.css                       theme header
 *     functions.php                   minimal bootstrap
 *     theme.json                      design tokens (Phase 4 output)
 *     IMAGE_BRIEF.md                  operator's image-sourcing checklist
 *     templates/
 *       index.html                    Phase 5 stitched
 *       single-product.html           Phase 5 stitched
 *       archive-product.html          Phase 5 stitched
 *       page.html                     Phase 5 stitched
 *       page-cart.html                fixed scaffold
 *       page-checkout.html            fixed scaffold
 *       404.html                      fixed scaffold
 *     parts/
 *       header.html
 *       footer.html
 *     styles/
 *       light.json | dark.json | editorial.json | mono.json
 *     assets/
 *       placeholders/
 *         <role>-<aspect>.svg         one per distinct image role
 */

import archiver from "archiver";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PipelineRun } from "../pipeline/run.js";
import type { PatternLibrary } from "../pattern-library/loader.js";
import type { TemplateId } from "../pipeline/types.js";
import { assertRoundTrip } from "./validator.js";
import {
  buildPlaceholderSvg,
  paletteForPlaceholders,
  placeholderFilename,
  rewritePlaceholderUrls,
} from "./placeholders.js";
import {
  build404Template,
  buildCartTemplate,
  buildCheckoutTemplate,
  buildFunctionsPhp,
  buildStyleCss,
  type ThemeMetadata,
} from "./scaffolds.js";
import { collectImageRoles, renderImageBrief } from "./image-brief.js";
import { renderMarketingFiles } from "../pipeline/marketing-render.js";

// ── Public API ──────────────────────────────────────────────────────────

export interface BundlerOptions {
  /** Where the final theme directory + zip land. */
  outputDir: string;
  /** Theme metadata for style.css, functions.php, zip name. */
  metadata: ThemeMetadata;
  /** Override the temp build directory root. Defaults to `.forge-runs`. */
  runRoot?: string;
  /** Build identifier; defaults to an ISO timestamp. */
  runId?: string;
  /** Skip the .zip step. Default false. */
  skipZip?: boolean;
  /** Refuse to overwrite an existing theme directory. Default true. */
  refuseOverwrite?: boolean;
}

export interface BundleResult {
  themeDir: string;
  zipPath?: string;
  files: string[];           // every relative path written under the theme dir
  imageRoleCount: number;
}

export async function bundleTheme(
  run: PipelineRun,
  library: PatternLibrary,
  options: BundlerOptions,
): Promise<BundleResult> {
  const runId = options.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = options.runRoot ?? ".forge-runs";
  const refuseOverwrite = options.refuseOverwrite ?? true;
  const slug = options.metadata.slug;

  const tempDir = resolve(runRoot, runId, slug);
  const finalDir = resolve(options.outputDir, slug);

  if (refuseOverwrite && existsSync(finalDir)) {
    throw new Error(
      `bundler: ${finalDir} already exists. Pass refuseOverwrite=false or remove it first.`,
    );
  }

  // Fresh temp dir.
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  const written: string[] = [];

  // 1. theme.json
  writeRel(tempDir, "theme.json", JSON.stringify(run.themeJson, null, 2) + "\n", written);

  // 2. style.css + functions.php
  writeRel(tempDir, "style.css", buildStyleCss(options.metadata), written);
  writeRel(tempDir, "functions.php", buildFunctionsPhp(options.metadata), written);

  // 3. Templates (Phase 5 stitched + scaffolds), with placeholder URLs
  //    rewritten to local theme paths.
  const stitchedTemplateFiles = stitchedTemplateFilenames(run);
  for (const [templateId, markup] of stitchedTemplateFiles) {
    const rewritten = rewritePlaceholderUrls(markup, slug);
    writeRel(tempDir, `templates/${TEMPLATE_FILENAMES[templateId]}`, rewritten, written);
  }
  // Fixed scaffolds — only if the Phase 5 plan didn't already produce them.
  writeIfMissing(tempDir, "templates/page-cart.html", buildCartTemplate(), written);
  writeIfMissing(tempDir, "templates/page-checkout.html", buildCheckoutTemplate(), written);
  writeIfMissing(tempDir, "templates/404.html", build404Template(), written);

  // 4. Template parts.
  writeRel(tempDir, "parts/header.html", rewritePlaceholderUrls(run.parts.header, slug), written);
  writeRel(tempDir, "parts/footer.html", rewritePlaceholderUrls(run.parts.footer, slug), written);

  // 5. Style variations.
  for (const [varSlug, file] of run.variations.entries()) {
    writeRel(tempDir, `styles/${varSlug}.json`, JSON.stringify(file, null, 2) + "\n", written);
  }

  // 6. Image roles → placeholder SVGs + IMAGE_BRIEF.md
  const imageRoles = collectImageRoles(run, library);
  const palette = paletteForPlaceholders(run.themeJson);
  for (const usage of imageRoles) {
    writeRel(
      tempDir,
      `assets/placeholders/${usage.filename}`,
      buildPlaceholderSvg(usage.role, usage.aspect, palette),
      written,
    );
  }
  writeRel(tempDir, "IMAGE_BRIEF.md", renderImageBrief(imageRoles, options.metadata.name), written);

  // 7. Marketing assets — one markdown file per section.
  const marketingFiles = renderMarketingFiles(run.marketing, options.metadata);
  for (const [relPath, contents] of Object.entries(marketingFiles.files)) {
    writeRel(tempDir, `marketing/${relPath}`, contents, written);
  }

  // 8. Validate every block-markup file we just wrote.
  validateBundle(tempDir);

  // 8. Atomic-ish promotion to final location.
  if (existsSync(finalDir)) {
    if (refuseOverwrite) {
      throw new Error(
        `bundler: ${finalDir} appeared after we started; refusing to overwrite`,
      );
    }
    rmSync(finalDir, { recursive: true, force: true });
  }
  mkdirSync(dirname(finalDir), { recursive: true });
  renameSync(tempDir, finalDir);

  // 9. Optional zip.
  let zipPath: string | undefined;
  if (!options.skipZip) {
    zipPath = resolve(options.outputDir, `${slug}-${options.metadata.version}.zip`);
    if (existsSync(zipPath)) rmSync(zipPath);
    await createZip(finalDir, zipPath, slug);
  }

  return {
    themeDir: finalDir,
    zipPath,
    files: written.sort(),
    imageRoleCount: imageRoles.length,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

const TEMPLATE_FILENAMES: Record<TemplateId, string> = {
  index: "index.html",
  "front-page": "front-page.html",
  "single-product": "single-product.html",
  "archive-product": "archive-product.html",
  "page-cart": "page-cart.html",
  "page-checkout": "page-checkout.html",
  "page-404": "404.html",
  page: "page.html",
};

function stitchedTemplateFilenames(
  run: PipelineRun,
): Array<[TemplateId, string]> {
  return Object.entries(run.templates).map(([id, markup]) => [id as TemplateId, markup!]);
}

function writeRel(
  rootDir: string,
  relPath: string,
  contents: string,
  recorded: string[],
): void {
  const full = join(rootDir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
  recorded.push(relPath);
}

function writeIfMissing(
  rootDir: string,
  relPath: string,
  contents: string,
  recorded: string[],
): void {
  if (recorded.includes(relPath)) return;
  writeRel(rootDir, relPath, contents, recorded);
}

function validateBundle(themeDir: string): void {
  const errors: string[] = [];

  // Round-trip every .html in templates/ and parts/.
  for (const sub of ["templates", "parts"]) {
    const dir = join(themeDir, sub);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".html")) continue;
      const full = join(dir, entry);
      const content = readFileSync(full, "utf8") as string;
      const result = assertRoundTrip(content);
      if (!result.ok) {
        errors.push(`${sub}/${entry}: round-trip failed (${result.errors.map((e) => e.message).join("; ")})`);
      }
    }
  }

  // Cart/checkout blocks must be present in their respective scaffolds.
  const requirePresent = (relPath: string, marker: string) => {
    const full = join(themeDir, relPath);
    if (!existsSync(full)) {
      errors.push(`${relPath}: missing entirely`);
      return;
    }
    const content = readFileSync(full, "utf8") as string;
    if (!content.includes(marker)) {
      errors.push(`${relPath}: must contain "${marker}"`);
    }
  };
  requirePresent("templates/page-cart.html", "wp:woocommerce/cart");
  requirePresent("templates/page-checkout.html", "wp:woocommerce/checkout");

  // theme.json must exist and parse.
  const themeJsonPath = join(themeDir, "theme.json");
  if (!existsSync(themeJsonPath)) {
    errors.push("theme.json: missing");
  } else {
    try {
      JSON.parse(readFileSync(themeJsonPath, "utf8") as string);
    } catch (e) {
      errors.push(`theme.json: invalid JSON (${(e as Error).message})`);
    }
  }

  // Every image referenced in the templates must have a corresponding
  // placeholder file on disk.
  const placeholderDir = join(themeDir, "assets/placeholders");
  const referencedAssets = new Set<string>();
  for (const sub of ["templates", "parts"]) {
    const dir = join(themeDir, sub);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".html")) continue;
      const content = readFileSync(join(dir, entry), "utf8") as string;
      for (const m of content.matchAll(/\/assets\/placeholders\/([^"\s]+\.svg)/g)) {
        referencedAssets.add(m[1]!);
      }
    }
  }
  for (const ref of referencedAssets) {
    if (!existsSync(join(placeholderDir, ref))) {
      errors.push(`assets/placeholders/${ref}: referenced but not present`);
    }
  }

  if (errors.length > 0) {
    throw new BundleValidationError(errors);
  }
}

export class BundleValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`bundle validation failed:\n  - ${errors.join("\n  - ")}`);
    this.name = "BundleValidationError";
  }
}

function createZip(srcDir: string, destZip: string, prefix: string): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const out = createWriteStream(destZip);
    const archive = archiver("zip", { zlib: { level: 9 } });
    out.on("close", () => resolveP());
    out.on("error", rejectP);
    archive.on("error", rejectP);
    archive.pipe(out);
    // archiver requires the source directory to exist.
    if (!statSync(srcDir).isDirectory()) {
      rejectP(new Error(`bundler: zip source ${srcDir} is not a directory`));
      return;
    }
    archive.directory(srcDir, prefix);
    archive.finalize().catch(rejectP);
  });
}
