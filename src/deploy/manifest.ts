/**
 * Phase 10 deployment manifest.
 *
 * Reads a built theme bundle off disk and produces a single JSON
 * artifact describing everything a downstream deploy script (WP
 * Playground, Kinsta API, WP Engine API, your own SSH script) needs to
 * stand up a public preview:
 *
 *   - the theme zip path + checksum
 *   - the theme slug, version, and metadata
 *   - the placeholder image set (so a deploy can swap in real photography)
 *   - the marketing assets (used as the demo-site copy)
 *   - per-template plan (so a deploy can stub realistic demo content)
 *   - suggested demo content (from marketing.demo_store_concept)
 *
 * The manifest is the **contract** the deployer reads — the
 * `forge deploy` command just reads it and hands it to whichever host
 * has been wired up. New host adapters land alongside this file.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";

export interface DeploymentManifest {
  /** Manifest schema version. Bump when the shape changes. */
  version: 1;
  generatedAt: string;          // ISO timestamp

  theme: {
    slug: string;               // directory + WP slug
    name: string;               // display name from style.css
    version: string;            // from style.css Version: line
    description: string;        // from style.css Description: line
  };

  bundle: {
    /** Absolute path to the built theme directory. */
    themeDir: string;
    /** Absolute path to the theme `.zip` (if produced). */
    zipPath?: string;
    /** SHA-256 of the zip, for integrity checks at the deploy host. */
    zipSha256?: string;
    /** Theme-relative paths of every file the bundler wrote. */
    files: string[];
  };

  placeholders: {
    /** Filenames of every SVG under `assets/placeholders/`. */
    files: string[];
    /** Total count — operator's image-sourcing punch list size. */
    count: number;
  };

  templates: {
    /** Filename → list of WP block names that appear at the top level. */
    summary: Record<string, string[]>;
  };

  variations: string[];        // file slugs of every styles/*.json

  marketing: {
    headline?: string;
    description?: string;
    demoStoreConcept?: string;
    screenshotsBriefPath?: string; // theme-relative
  };
}

export interface BuildManifestOptions {
  /** Absolute path to a theme directory produced by `bundleTheme`. */
  themeDir: string;
  /** Absolute path to the matching .zip (omit if --no-zip was passed). */
  zipPath?: string;
}

export function buildDeploymentManifest(options: BuildManifestOptions): DeploymentManifest {
  const { themeDir, zipPath } = options;
  if (!existsSync(themeDir) || !statSync(themeDir).isDirectory()) {
    throw new Error(`deploy: theme directory not found: ${themeDir}`);
  }

  const styleCssPath = join(themeDir, "style.css");
  if (!existsSync(styleCssPath)) {
    throw new Error(`deploy: ${themeDir} is not a built theme — missing style.css`);
  }

  const styleCss = readFileSync(styleCssPath, "utf8");
  const theme = parseThemeMetadata(styleCss, themeDir);
  const files = walkTheme(themeDir);

  const placeholderDir = join(themeDir, "assets/placeholders");
  const placeholders = existsSync(placeholderDir)
    ? readdirSync(placeholderDir).filter((f) => f.endsWith(".svg")).sort()
    : [];

  const templatesDir = join(themeDir, "templates");
  const templateSummary: Record<string, string[]> = {};
  if (existsSync(templatesDir)) {
    for (const f of readdirSync(templatesDir).sort()) {
      if (!f.endsWith(".html")) continue;
      const content = readFileSync(join(templatesDir, f), "utf8");
      templateSummary[f] = topLevelBlockNames(content);
    }
  }

  const stylesDir = join(themeDir, "styles");
  const variations = existsSync(stylesDir)
    ? readdirSync(stylesDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""))
        .sort()
    : [];

  const marketing = collectMarketing(themeDir);

  const manifest: DeploymentManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    theme,
    bundle: {
      themeDir,
      files,
    },
    placeholders: {
      files: placeholders,
      count: placeholders.length,
    },
    templates: { summary: templateSummary },
    variations,
    marketing,
  };

  if (zipPath && existsSync(zipPath)) {
    manifest.bundle.zipPath = zipPath;
    manifest.bundle.zipSha256 = sha256(readFileSync(zipPath));
  }

  return manifest;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function parseThemeMetadata(styleCss: string, themeDir: string): DeploymentManifest["theme"] {
  const grab = (key: string): string => {
    const m = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(styleCss);
    return m?.[1]?.trim() ?? "";
  };
  return {
    slug: relative(dirname(themeDir), themeDir),
    name: grab("Theme Name"),
    version: grab("Version"),
    description: grab("Description"),
  };
}

function walkTheme(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (st.isFile()) out.push(relative(root, full));
    }
  }
  return out.sort();
}

function topLevelBlockNames(markup: string): string[] {
  // Simple heuristic: scan for top-level `<!-- wp:NAME` openings and
  // self-closers at column 0. Templates have predictable indentation
  // (every nested block is +1 space) so this is reliable.
  const out: string[] = [];
  for (const line of markup.split("\n")) {
    const m = /^<!-- wp:([a-z0-9/-]+)/.exec(line);
    if (m) out.push(m[1]!.startsWith("woocommerce/") ? m[1]! : m[1]!.replace(/^([a-z0-9-]+)$/, "core/$1"));
  }
  return out;
}

function collectMarketing(themeDir: string): DeploymentManifest["marketing"] {
  const out: DeploymentManifest["marketing"] = {};

  const description = join(themeDir, "marketing/description.md");
  if (existsSync(description)) {
    const md = readFileSync(description, "utf8");
    const headlineMatch = /^_(.+)_$/m.exec(md);
    if (headlineMatch) out.headline = headlineMatch[1];
    // Body of the description: everything between the headline and the
    // first ## heading.
    const bodyMatch = /_(?:.+)_\n\n([\s\S]+?)(?:\n##\s|$)/.exec(md);
    if (bodyMatch) out.description = bodyMatch[1]!.trim();
  }

  const demo = join(themeDir, "marketing/demo-concept.md");
  if (existsSync(demo)) {
    const md = readFileSync(demo, "utf8");
    // First non-heading paragraph after the title.
    const m = /^# .+\n\n.+\n\n([\s\S]+?)$/.exec(md);
    if (m) out.demoStoreConcept = m[1]!.trim();
  }

  const brief = join(themeDir, "marketing/screenshots-brief.md");
  if (existsSync(brief)) out.screenshotsBriefPath = "marketing/screenshots-brief.md";

  return out;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
