/**
 * WordPress Studio deploy adapter.
 *
 * Studio (the Automattic local-WP app) is a great fit for this project:
 * each Studio site is a full WordPress install at a known path, the
 * `studio` CLI exposes WP-CLI passthrough plus site lifecycle, and
 * sites already have local URLs (`http://localhost:NNNN`) we can hand
 * to the screenshot pipeline.
 *
 * Deploy flow:
 *   1. discover available sites via `studio site list --format json`
 *   2. resolve `target` (site name, slug, id, or path) to a single site
 *   3. wipe + copy the theme bundle into `<site>/wp-content/themes/<slug>`
 *   4. start the site if it's not already running
 *   5. ensure WooCommerce is installed + active (idempotent)
 *   6. activate the theme
 *   7. return the local URL
 *
 * Everything is shelled out to `studio` so this works against whatever
 * Studio version the user has installed — no SDK coupling.
 */

import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DeployHost, DeployResult, DeployTarget } from "./hosts.js";
import type { DeploymentManifest } from "./manifest.js";

export interface StudioSite {
  id: string;
  name: string;
  path: string;          // absolute filesystem path
  port: number;
  url: string;           // e.g. "http://localhost:8881"
  running: boolean;
}

// Surface for tests + future-proofing — every shell call goes through
// here so a test can swap in a stub without monkey-patching child_process.
export interface StudioCli {
  /** `studio site list --format json` → parsed array. */
  listSites(): Promise<StudioSite[]>;
  /** `studio site start --path <path> --skip-browser`. */
  startSite(path: string): Promise<void>;
  /** `studio wp --path <path> <...args>` — WP-CLI passthrough. */
  wp(path: string, args: string[]): Promise<{ stdout: string; stderr: string; status: number }>;
}

export interface StudioHostOptions {
  /** Override the CLI plumbing (tests). Defaults to a real `studio` shell. */
  cli?: StudioCli;
  /** When false, skip the WooCommerce install/activate step. Default true. */
  ensureWoo?: boolean;
  /**
   * When true, import WooCommerce's bundled sample_products.xml after
   * activation if no products exist yet. Idempotent — checked via the
   * post count before importing. Default true.
   */
  loadSampleData?: boolean;
}

export function createStudioHost(options: StudioHostOptions = {}): DeployHost {
  const cli = options.cli ?? defaultStudioCli();
  const ensureWoo = options.ensureWoo ?? true;
  const loadSampleData = options.loadSampleData ?? true;

  return {
    id: "studio",
    name: "WordPress Studio (local)",
    async deploy(manifest: DeploymentManifest, target: DeployTarget): Promise<DeployResult> {
      const sites = await cli.listSites();
      if (sites.length === 0) {
        throw new Error(
          "studio: no Studio sites found. Create one in the Studio app first.",
        );
      }
      const site = resolveTargetSite(sites, target.target);

      const themeName = manifest.theme.slug;
      const destDir = join(site.path, "wp-content/themes", themeName);

      // Replace the theme dir cleanly — partial leftovers from a prior
      // deploy can leave WP confused about which version is "current".
      if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });
      mkdirSync(destDir, { recursive: true });
      cpSync(manifest.bundle.themeDir, destDir, { recursive: true });

      const notes: string[] = [`Theme installed at ${destDir}.`];

      if (!site.running) {
        await cli.startSite(site.path);
        notes.push(`Started site (was offline).`);
      }

      if (ensureWoo) {
        // Idempotent — install no-ops if WC is already present, activate
        // is a noop if already active. We don't fail the deploy if WC
        // can't be installed (network outage, plugin repo down) — the
        // rest of the theme still works for non-WC pages.
        const wcInstall = await cli.wp(site.path, [
          "plugin", "install", "woocommerce", "--activate",
        ]);
        if (wcInstall.status === 0) {
          notes.push(`WooCommerce installed/activated.`);

          // WC enables a "Coming Soon" overlay by default on fresh
          // installs which hides the storefront behind a launch
          // splash. For preview/screenshot purposes we want the actual
          // store visible — turn it off (idempotent).
          await cli.wp(site.path, ["option", "update", "woocommerce_coming_soon", "no"]);

          if (loadSampleData) {
            const importNote = await maybeImportSampleData(cli, site.path);
            if (importNote) notes.push(importNote);
          }
        } else {
          notes.push(
            `WooCommerce install failed (continuing): ${wcInstall.stderr.trim().slice(0, 120) || "unknown reason"}`,
          );
        }
      }

      const themeActivate = await cli.wp(site.path, [
        "theme", "activate", themeName,
      ]);
      if (themeActivate.status !== 0) {
        throw new Error(
          `studio: failed to activate theme "${themeName}" — ${themeActivate.stderr.trim() || "(no stderr)"}`,
        );
      }
      notes.push(`Theme "${themeName}" activated.`);

      return {
        url: site.url,
        deployId: `studio:${site.id}`,
        notes: notes.join(" "),
      };
    },
  };
}

// ── WooCommerce sample data ─────────────────────────────────────────────

/**
 * If the site has 0 products, install the WordPress Importer plugin
 * and import WooCommerce's bundled `sample_products.xml`. Idempotent:
 * skips the import when products already exist (re-deploys are safe).
 *
 * Returns a one-line status to surface back in the deploy notes, or
 * `null` when nothing actionable happened.
 */
async function maybeImportSampleData(cli: StudioCli, sitePath: string): Promise<string | null> {
  // Studio sandboxes PHP with ABSPATH at `/wordpress`, not the host
  // filesystem path. Existence check + the wp-cli `import` command both
  // run inside that sandbox, so we work with a WP-relative path.
  // Resolution from cwd=/wordpress produces /wordpress/wp-content/... —
  // which is what PHP sees.
  const sampleXmlRel = "wp-content/plugins/woocommerce/sample-data/sample_products.xml";
  const sampleXmlHost = join(sitePath, sampleXmlRel);
  if (!existsSync(sampleXmlHost) || !statSync(sampleXmlHost).isFile()) {
    return `WC sample data XML not found at ${sampleXmlHost}; skipped.`;
  }

  // Count existing products. If any exist, we leave them alone — don't
  // want to duplicate on a re-deploy.
  const countRes = await cli.wp(sitePath, [
    "post", "list", "--post_type=product", "--format=count",
  ]);
  const productCount = parseInt(countRes.stdout.trim(), 10);
  if (Number.isFinite(productCount) && productCount > 0) {
    return `${productCount} products already in DB; skipping sample import.`;
  }

  // The WP Importer is the standard route for the WC sample XML.
  const importerInstall = await cli.wp(sitePath, [
    "plugin", "install", "wordpress-importer", "--activate",
  ]);
  if (importerInstall.status !== 0) {
    return `wordpress-importer install failed; skipped sample import: ${importerInstall.stderr.trim().slice(0, 120)}`;
  }

  const importRes = await cli.wp(sitePath, [
    "import", sampleXmlRel, "--authors=skip",
  ]);
  if (importRes.status !== 0) {
    return `WC sample import failed: ${importRes.stderr.trim().slice(0, 160) || "(no stderr)"}`;
  }
  return `Imported WooCommerce sample products.`;
}

// ── Default CLI implementation ──────────────────────────────────────────

function defaultStudioCli(): StudioCli {
  return {
    async listSites() {
      const { stdout, status, stderr } = await runStudio(["site", "list", "--format", "json"]);
      if (status !== 0) {
        throw new Error(`studio: 'studio site list' exited ${status}: ${stderr.trim()}`);
      }
      // The CLI mixes ANSI spinner escapes (e.g. `\x1b[K`, `\x1b[?25l`)
      // into stdout before the JSON. A naive `\[…\]` regex matches the
      // ANSI bracket as the opening `[`, so we anchor on the literal
      // JSON-array opening `[{` and the closing `}]` instead. Every
      // `studio site list` payload is a non-empty array of objects, so
      // this is reliable in practice.
      const m = stdout.match(/\[\{[\s\S]+\}\]/);
      if (!m) {
        throw new Error(`studio: couldn't find a JSON array in 'site list' output`);
      }
      return JSON.parse(m[0]) as StudioSite[];
    },
    async startSite(path: string) {
      const { status, stderr } = await runStudio([
        "site", "start", "--path", path, "--skip-browser", "--skip-log-details",
      ]);
      if (status !== 0) {
        throw new Error(`studio: failed to start site at ${path}: ${stderr.trim()}`);
      }
    },
    async wp(path: string, args: string[]) {
      return runStudio(["wp", "--path", path, ...args]);
    },
  };
}

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

async function runStudio(args: string[]): Promise<RunResult> {
  // Lazy import so tests that stub the cli don't pull in child_process
  // (and so the file remains import-safe in environments without it).
  const { spawn } = await import("node:child_process");
  return new Promise((resolveP, rejectP) => {
    const child = spawn("studio", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (b: Buffer) => { stdout += b.toString("utf8"); });
    child.stderr?.on("data", (b: Buffer) => { stderr += b.toString("utf8"); });
    child.on("error", rejectP);
    child.on("close", (code) => resolveP({ stdout, stderr, status: code ?? 0 }));
  });
}

// ── Target resolution ───────────────────────────────────────────────────

function resolveTargetSite(sites: StudioSite[], target: string): StudioSite {
  // Match in order: exact id, exact path, name (case-insensitive),
  // path basename (`bazaar` matches `~/Studio/bazaar`).
  const trimmed = target.trim();
  const lc = trimmed.toLowerCase();

  const byId       = sites.find((s) => s.id === trimmed);
  if (byId) return byId;
  const byPath     = sites.find((s) => s.path === trimmed);
  if (byPath) return byPath;
  const byName     = sites.find((s) => s.name.toLowerCase() === lc);
  if (byName) return byName;
  const byBasename = sites.find(
    (s) => s.path.split("/").pop()?.toLowerCase() === lc,
  );
  if (byBasename) return byBasename;

  throw new Error(
    `studio: no site matching "${target}". Available: ${sites
      .map((s) => `${s.name} (${s.path.split("/").pop()})`)
      .join(", ")}`,
  );
}

export const __testing = { resolveTargetSite };
