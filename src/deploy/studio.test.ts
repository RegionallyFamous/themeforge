import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStudioHost,
  __testing,
  type StudioCli,
  type StudioSite,
} from "./studio.js";
import type { DeploymentManifest } from "./manifest.js";

const SITES: StudioSite[] = [
  { id: "id-bazaar",     name: "Bazaar",     path: "/Users/x/Studio/bazaar",     port: 8883, url: "http://localhost:8883", running: false },
  { id: "id-miles",      name: "Miles",      path: "/Users/x/Studio/miles",      port: 8885, url: "http://localhost:8885", running: true  },
  { id: "id-tier-4",     name: "Tier 4",     path: "/Users/x/Studio/tier-4",     port: 8881, url: "http://localhost:8881", running: false },
];

// ── resolveTargetSite ──────────────────────────────────────────────────

describe("resolveTargetSite", () => {
  it("matches by id", () => {
    expect(__testing.resolveTargetSite(SITES, "id-miles").name).toBe("Miles");
  });

  it("matches by full path", () => {
    expect(__testing.resolveTargetSite(SITES, "/Users/x/Studio/bazaar").name).toBe("Bazaar");
  });

  it("matches by display name (case-insensitive)", () => {
    expect(__testing.resolveTargetSite(SITES, "tier 4").name).toBe("Tier 4");
    expect(__testing.resolveTargetSite(SITES, "BAZAAR").name).toBe("Bazaar");
  });

  it("matches by path basename", () => {
    expect(__testing.resolveTargetSite(SITES, "miles").name).toBe("Miles");
    expect(__testing.resolveTargetSite(SITES, "tier-4").name).toBe("Tier 4");
  });

  it("throws with the available sites listed when no match", () => {
    expect(() => __testing.resolveTargetSite(SITES, "nonexistent")).toThrow(
      /no site matching "nonexistent"/,
    );
  });
});

// ── JSON parsing regression (real `studio site list` output mixes
//    ANSI spinner escapes with the JSON body — the regex must skip
//    those and only grab the actual array)
describe("studio site list JSON extraction", () => {
  // Reproduce the shape of real `studio site list --format json` stdout:
  // ANSI spinner frames before the actual JSON, all mashed onto one line.
  const realLikeOutput =
    `\x1b[K\x1b[?25l⠋ Loading sites…\n` +
    `\x1b[1A\x1b[K\x1b[?25l✔ Found 6 sites\n` +
    `\x1b[?25h\x1b[K[{"id":"x","name":"Bazaar","path":"/Users/x/Studio/bazaar","port":8883,"phpVersion":"8.3","enableHttps":false,"adminUsername":"admin","adminPassword":"x","adminEmail":"x","isWpAutoUpdating":true,"autoStart":false,"running":false,"url":"http://localhost:8883"}]`;

  it("extracts the JSON array even when ANSI escapes contain `[` characters", () => {
    // The regex used by the adapter — assert it directly so a future
    // refactor that loosens the pattern fails this test.
    const m = realLikeOutput.match(/\[\{[\s\S]+\}\]/);
    expect(m).not.toBeNull();
    const arr = JSON.parse(m![0]);
    expect(arr).toHaveLength(1);
    expect(arr[0].name).toBe("Bazaar");
  });
});

// ── createStudioHost.deploy ─────────────────────────────────────────────

describe("createStudioHost (mocked CLI)", () => {
  let outDir: string;
  let bazaarPath: string;
  let themeDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "forge-studio-test-"));
    // Fake a Studio site directory tree
    bazaarPath = join(outDir, "fake-studio/bazaar");
    mkdirSync(join(bazaarPath, "wp-content/themes"), { recursive: true });
    mkdirSync(join(bazaarPath, "wp-content/plugins/woocommerce/sample-data"), { recursive: true });
    writeFileSync(
      join(bazaarPath, "wp-content/plugins/woocommerce/sample-data/sample_products.xml"),
      "<rss>fake</rss>",
    );

    // Fake a built theme dir to deploy
    themeDir = join(outDir, "theme/bellwether-coffee");
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(join(themeDir, "style.css"), "/* Theme Name: Bellwether Coffee */");
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  function makeManifest(): DeploymentManifest {
    return {
      version: 1,
      generatedAt: "2026-05-03T00:00:00Z",
      theme: { slug: "bellwether-coffee", name: "Bellwether Coffee", version: "1.0.0", description: "" },
      bundle: { themeDir, files: ["style.css"] },
      placeholders: { files: [], count: 0 },
      templates: { summary: {} },
      variations: [],
      marketing: {},
    };
  }

  /**
   * Build a fake CLI that records every call. `responses.wp` lets a
   * test customize *what* `wp` returns based on its args while keeping
   * the recording in one place — overriding the method directly would
   * lose the call log, which is what assertions key off.
   */
  function makeCli(responses?: {
    sites?: () => StudioSite[];
    wp?: (path: string, args: string[]) => { stdout: string; stderr: string; status: number };
  }): StudioCli & { calls: Array<{ cmd: string; args: unknown }> } {
    const calls: Array<{ cmd: string; args: unknown }> = [];
    const sitesFn = responses?.sites ?? (() => [
      { ...SITES[0]!, path: bazaarPath },
      // Patch the other sites so any path we'd touch is under outDir.
      { ...SITES[1]!, path: setupSiteDir("miles") },
      { ...SITES[2]!, path: setupSiteDir("tier-4") },
    ]);
    const wpFn = responses?.wp ?? (() => ({ stdout: "", stderr: "", status: 0 }));

    const fake: StudioCli = {
      async listSites() {
        calls.push({ cmd: "listSites", args: undefined });
        return sitesFn();
      },
      async startSite(path: string) {
        calls.push({ cmd: "startSite", args: { path } });
      },
      async wp(path: string, args: string[]) {
        calls.push({ cmd: "wp", args: { path, args } });
        return wpFn(path, args);
      },
    };
    return Object.assign(fake, { calls });
  }

  /** Set up a fake site dir under outDir (so deploys can write to it). */
  function setupSiteDir(name: string): string {
    const path = join(outDir, "fake-studio", name);
    mkdirSync(join(path, "wp-content/themes"), { recursive: true });
    return path;
  }

  it("copies the theme into <site>/wp-content/themes/<slug>", async () => {
    const cli = makeCli();
    const host = createStudioHost({ cli, ensureWoo: false, loadSampleData: false });
    await host.deploy(makeManifest(), { target: "Bazaar" });

    const dest = join(bazaarPath, "wp-content/themes/bellwether-coffee/style.css");
    expect(existsSync(dest)).toBe(true);
  });

  it("starts the site if it isn't already running", async () => {
    const cli = makeCli();
    const host = createStudioHost({ cli, ensureWoo: false, loadSampleData: false });
    await host.deploy(makeManifest(), { target: "Bazaar" });

    const startCalls = cli.calls.filter((c) => c.cmd === "startSite");
    expect(startCalls).toHaveLength(1);
  });

  it("skips startSite when the target is already running", async () => {
    // Use the helper's setupSiteDir so the deploy can write the theme.
    const milesPath = join(outDir, "fake-studio/miles");
    mkdirSync(join(milesPath, "wp-content/themes"), { recursive: true });
    const cli = makeCli({
      sites: () => [
        { ...SITES[0]!, path: bazaarPath },
        { ...SITES[1]!, path: milesPath, running: true },
      ],
    });
    const host = createStudioHost({ cli, ensureWoo: false, loadSampleData: false });
    await host.deploy(makeManifest(), { target: "Miles" });

    expect(cli.calls.find((c) => c.cmd === "startSite")).toBeUndefined();
  });

  it("activates the theme via wp theme activate <slug>", async () => {
    const cli = makeCli();
    const host = createStudioHost({ cli, ensureWoo: false, loadSampleData: false });
    await host.deploy(makeManifest(), { target: "Bazaar" });

    const activate = cli.calls.find(
      (c) =>
        c.cmd === "wp" &&
        Array.isArray((c.args as { args: string[] }).args) &&
        (c.args as { args: string[] }).args[0] === "theme" &&
        (c.args as { args: string[] }).args[1] === "activate",
    );
    expect(activate).toBeDefined();
    expect((activate?.args as { args: string[] }).args).toEqual([
      "theme", "activate", "bellwether-coffee",
    ]);
  });

  it("installs+activates WooCommerce when ensureWoo is on", async () => {
    const cli = makeCli();
    const host = createStudioHost({ cli, loadSampleData: false });
    await host.deploy(makeManifest(), { target: "Bazaar" });

    const wcInstall = cli.calls.find(
      (c) =>
        c.cmd === "wp" &&
        (c.args as { args: string[] }).args.join(" ") === "plugin install woocommerce --activate",
    );
    expect(wcInstall).toBeDefined();
  });

  it("imports WC sample data when no products exist (loadSampleData=true)", async () => {
    const cli = makeCli({
      wp: (_path, args) => {
        if (args.includes("post") && args.includes("--post_type=product")) {
          return { stdout: "0\n", stderr: "", status: 0 };
        }
        return { stdout: "", stderr: "", status: 0 };
      },
    });
    const host = createStudioHost({ cli });
    const result = await host.deploy(makeManifest(), { target: "Bazaar" });

    const importerInstall = cli.calls.find(
      (c) =>
        c.cmd === "wp" &&
        (c.args as { args: string[] }).args.join(" ").includes("wordpress-importer --activate"),
    );
    expect(importerInstall).toBeDefined();

    const importCmd = cli.calls.find(
      (c) =>
        c.cmd === "wp" &&
        (c.args as { args: string[] }).args[0] === "import",
    );
    expect(importCmd).toBeDefined();
    expect((importCmd?.args as { args: string[] }).args).toContain("--authors=skip");
    expect(result.notes).toContain("Imported WooCommerce sample products");
  });

  it("skips sample import when products already exist (idempotent re-deploy)", async () => {
    const cli = makeCli({
      wp: (_path, args) => {
        if (args.includes("post") && args.includes("--post_type=product")) {
          return { stdout: "27\n", stderr: "", status: 0 };
        }
        return { stdout: "", stderr: "", status: 0 };
      },
    });
    const host = createStudioHost({ cli });
    const result = await host.deploy(makeManifest(), { target: "Bazaar" });

    const importCmd = cli.calls.find(
      (c) =>
        c.cmd === "wp" &&
        (c.args as { args: string[] }).args[0] === "import",
    );
    expect(importCmd).toBeUndefined();
    expect(result.notes).toContain("27 products already in DB");
  });

  it("returns the local URL + a deployId scoped to the studio site", async () => {
    const cli = makeCli();
    const host = createStudioHost({ cli, ensureWoo: false, loadSampleData: false });
    const result = await host.deploy(makeManifest(), { target: "Bazaar" });

    expect(result.url).toBe("http://localhost:8883");
    expect(result.deployId).toBe("studio:id-bazaar");
  });

  it("replaces an existing theme dir cleanly (no stale files)", async () => {
    // Pre-seed an old version of the theme with a stale file
    const stalePath = join(bazaarPath, "wp-content/themes/bellwether-coffee");
    mkdirSync(stalePath, { recursive: true });
    writeFileSync(join(stalePath, "stale-file.txt"), "should be removed");

    const cli = makeCli();
    const host = createStudioHost({ cli, ensureWoo: false, loadSampleData: false });
    await host.deploy(makeManifest(), { target: "Bazaar" });

    expect(existsSync(join(stalePath, "stale-file.txt"))).toBe(false);
    expect(existsSync(join(stalePath, "style.css"))).toBe(true);
  });

  it("throws when `studio site list` returns no sites", async () => {
    const cli = makeCli({ sites: () => [] });
    const host = createStudioHost({ cli });
    await expect(
      host.deploy(makeManifest(), { target: "anything" }),
    ).rejects.toThrow(/no Studio sites found/);
  });

  it("throws with available sites listed when target doesn't match anything", async () => {
    const cli = makeCli();
    const host = createStudioHost({ cli, ensureWoo: false, loadSampleData: false });
    await expect(
      host.deploy(makeManifest(), { target: "ghost-site" }),
    ).rejects.toThrow(/no site matching "ghost-site"/);
  });

  it("propagates a failed theme activation as a deploy failure", async () => {
    const cli = makeCli({
      wp: (_path, args) => {
        if (args[0] === "theme" && args[1] === "activate") {
          return { stdout: "", stderr: "Theme not found.", status: 1 };
        }
        return { stdout: "", stderr: "", status: 0 };
      },
    });
    const host = createStudioHost({ cli, ensureWoo: false, loadSampleData: false });
    await expect(
      host.deploy(makeManifest(), { target: "Bazaar" }),
    ).rejects.toThrow(/failed to activate theme.*Theme not found/);
  });
});
