import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDeploymentManifest } from "./manifest.js";

let outDir: string;
let themeDir: string;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), "forge-deploy-"));
  themeDir = join(outDir, "bellwether-coffee");
  mkdirSync(themeDir, { recursive: true });

  // Minimum file set the manifest builder cares about.
  writeFileSync(
    join(themeDir, "style.css"),
    [
      "/*",
      "Theme Name: Bellwether Coffee",
      "Author: woo-theme-forge",
      "Description: Single-origin coffee theme.",
      "Version: 1.2.3",
      "*/",
    ].join("\n"),
  );

  mkdirSync(join(themeDir, "templates"));
  writeFileSync(
    join(themeDir, "templates/index.html"),
    [
      '<!-- wp:template-part {"slug":"header"} /-->',
      "<!-- wp:group -->",
      '<div class="wp-block-group"></div>',
      "<!-- /wp:group -->",
      '<!-- wp:template-part {"slug":"footer"} /-->',
    ].join("\n"),
  );

  mkdirSync(join(themeDir, "styles"));
  writeFileSync(join(themeDir, "styles/light.json"), JSON.stringify({ version: 3, title: "Light" }));
  writeFileSync(join(themeDir, "styles/dark.json"), JSON.stringify({ version: 3, title: "Dark" }));

  mkdirSync(join(themeDir, "assets/placeholders"), { recursive: true });
  writeFileSync(join(themeDir, "assets/placeholders/hero-16x9.svg"), "<svg></svg>");
  writeFileSync(join(themeDir, "assets/placeholders/tile-1x1.svg"), "<svg></svg>");

  mkdirSync(join(themeDir, "marketing"));
  writeFileSync(
    join(themeDir, "marketing/description.md"),
    [
      "# Bellwether Coffee",
      "",
      "_A heritage coffee theme._",
      "",
      "Long-form description goes here. Multi-sentence body.",
      "",
      "## Built for",
      "",
      "Specialty coffee roasters.",
    ].join("\n"),
  );
  writeFileSync(
    join(themeDir, "marketing/demo-concept.md"),
    [
      "# Demo concept",
      "",
      "Use this as the brief for the demo site.",
      "",
      "A demo site for a Brooklyn roaster with three featured coffees.",
    ].join("\n"),
  );
  writeFileSync(join(themeDir, "marketing/screenshots-brief.md"), "# Brief");
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe("buildDeploymentManifest", () => {
  it("returns version 1 with timestamp + theme metadata parsed from style.css", () => {
    const m = buildDeploymentManifest({ themeDir });
    expect(m.version).toBe(1);
    expect(m.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(m.theme.name).toBe("Bellwether Coffee");
    expect(m.theme.version).toBe("1.2.3");
    expect(m.theme.description).toBe("Single-origin coffee theme.");
    expect(m.theme.slug).toBe("bellwether-coffee");
  });

  it("walks the theme dir for the file list (sorted, theme-relative)", () => {
    const m = buildDeploymentManifest({ themeDir });
    expect(m.bundle.files).toContain("style.css");
    expect(m.bundle.files).toContain("templates/index.html");
    expect(m.bundle.files).toContain("styles/light.json");
    expect(m.bundle.files).toContain("assets/placeholders/hero-16x9.svg");
    expect(m.bundle.files).toEqual([...m.bundle.files].sort());
  });

  it("collects every placeholder filename and counts them", () => {
    const m = buildDeploymentManifest({ themeDir });
    expect(m.placeholders.files).toEqual(["hero-16x9.svg", "tile-1x1.svg"]);
    expect(m.placeholders.count).toBe(2);
  });

  it("summarizes top-level block names per template file", () => {
    const m = buildDeploymentManifest({ themeDir });
    expect(m.templates.summary["index.html"]).toEqual([
      "core/template-part",
      "core/group",
      "core/template-part",
    ]);
  });

  it("lists style variation slugs", () => {
    const m = buildDeploymentManifest({ themeDir });
    expect(m.variations).toEqual(["dark", "light"]);
  });

  it("extracts marketing headline + description + demo concept from markdown", () => {
    const m = buildDeploymentManifest({ themeDir });
    expect(m.marketing.headline).toBe("A heritage coffee theme.");
    expect(m.marketing.description).toContain("Long-form description");
    expect(m.marketing.demoStoreConcept).toContain("Brooklyn roaster");
    expect(m.marketing.screenshotsBriefPath).toBe("marketing/screenshots-brief.md");
  });

  it("includes zip path + sha256 when a zip is supplied", () => {
    const zipPath = join(outDir, "bellwether-coffee-1.2.3.zip");
    writeFileSync(zipPath, "PKfake-zip-bytes");
    const m = buildDeploymentManifest({ themeDir, zipPath });
    expect(m.bundle.zipPath).toBe(zipPath);
    expect(m.bundle.zipSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("omits zip metadata when no zip is supplied", () => {
    const m = buildDeploymentManifest({ themeDir });
    expect(m.bundle.zipPath).toBeUndefined();
    expect(m.bundle.zipSha256).toBeUndefined();
  });

  it("throws clearly when the theme dir doesn't look like a built theme", () => {
    const empty = mkdtempSync(join(tmpdir(), "forge-empty-"));
    expect(() => buildDeploymentManifest({ themeDir: empty })).toThrow(/style\.css/);
    rmSync(empty, { recursive: true, force: true });
  });

  it("throws when the theme dir doesn't exist at all", () => {
    expect(() =>
      buildDeploymentManifest({ themeDir: join(outDir, "does-not-exist") }),
    ).toThrow(/not found/);
  });
});
