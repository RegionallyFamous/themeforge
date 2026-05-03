import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleTheme, BundleValidationError } from "./bundler.js";
import { runPipeline } from "../pipeline/run.js";
import { loadPatternLibrary } from "../pattern-library/loader.js";
import { mockResolutionsFor } from "../pattern-library/mock-resolutions.js";
import { BrandSpecSchema } from "../brand-spec/schema.js";
import type { LLM, LLMCallOptions } from "../pipeline/llm.js";
import type { StageId } from "../pipeline/config.js";
import type { ThemeMetadata } from "./scaffolds.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const lib = loadPatternLibrary();

const sampleSpec = BrandSpecSchema.parse(
  JSON.parse(readFileSync(resolve(repoRoot, "samples/coffee-roaster/brand-spec.json"), "utf8")),
);

const meta: ThemeMetadata = {
  name: "Bellwether Coffee",
  slug: "bellwether-coffee",
  description: sampleSpec.store.tagline,
  author: "woo-theme-forge",
  version: "1.0.0",
};

/** Same canned-LLM trick as run.test.ts. */
function pipelineLLM(): LLM {
  const enriched = {
    copy_directives: ["Use 'roast' as a verb.", "Mention origin every section.", "Avoid hyperbole."],
    sample_product_categories: ["Single Origin", "Espresso", "Subscriptions"],
    sample_product_names: ["Yirgacheffe Konga", "House Espresso", "V60 Brewer", "Roastery Sub", "Tolima Decaf"],
  };
  const tokens = {
    palette: [
      { name: "Background",     slug: "background",     color: "#F6F1EA" },
      { name: "Background Alt", slug: "background-alt", color: "#E8D9C2" },
      { name: "Foreground",     slug: "foreground",     color: "#2E1F14" },
      { name: "Muted",          slug: "muted",          color: "#7A6757" },
      { name: "Primary",        slug: "primary",        color: "#A8531E" },
      { name: "Accent",         slug: "accent",         color: "#1A1A1A" },
    ],
    typography: {
      body:    { fontFamily: "Inter, system-ui, sans-serif", fontSize: "1.0625rem", lineHeight: "1.6" },
      heading: { fontFamily: "Fraunces, Georgia, serif",     fontWeight: "500",     lineHeight: "1.05" },
      fluidScale: [0.9, 1.0625, 1.4, 2, 3.25],
    },
    spacing: {
      sectionY: "clamp(4rem, 3rem + 4vw, 6.5rem)",
      contentMaxWidth: "720px",
      wideMaxWidth: "1240px",
    },
    radius: { sm: "0px", md: "0px", lg: "0px" },
    density: "airy" as const,
  };
  const plan = {
    templates: {
      index: ["hero-cover", "usp-strip-three", "grid-3up", "category-trio", "newsletter-banner"],
      "single-product": ["single-product-classic", "newsletter-banner"],
      "archive-product": ["grid-3up", "newsletter-banner"],
      page: ["hero-split", "newsletter-banner"],
    },
    parts: { footer: "footer-rich" },
  };

  const marketing = {
    headline: "A heritage-leaning, editorial WooCommerce theme for small-batch coffee roasters.",
    description:
      "A WooCommerce block theme designed for specialty coffee roasters who lead with the craft. Five style variations, polished placeholder images, and demo content patterns ready to fill with real products. Fluid typography and spacing carry through across breakpoints. Pairs the official WooCommerce cart and checkout blocks with editorial chrome, so you keep the proven storefront flows without losing the brand voice.",
    features: [
      "Full Site Editing block theme — edit every layout in the WP site editor.",
      "Five style variations switchable from Appearance → Styles.",
      "Newsletter, FAQ, testimonial, and category-showcase patterns included.",
      "Theme.json-driven palette, fluid type scale, and spacing tokens.",
      "Placeholder image system replaceable in one folder.",
    ],
    built_for:
      "Specialty coffee roasters, single-origin importers, and espresso bars that sell beans online and want a storefront whose typography and rhythm reflect the craft.",
    variations: [
      { slug: "light", branded_title: "First Light", one_liner: "Warm cream, generous spacing, serif headlines." },
      { slug: "dark", branded_title: "Deep Roast", one_liner: "Same shape, low-light palette, mood for evening browsing." },
      { slug: "editorial", branded_title: "Press", one_liner: "Bigger type, tighter rhythm, magazine feel." },
      { slug: "playful", branded_title: "Sunday", one_liner: "Saturated palette, pill buttons, looser breath." },
      { slug: "mono", branded_title: "Letterpress", one_liner: "Grayscale palette, single accent, gallery quiet." },
    ],
    demo_store_concept:
      "A demo site for a fictional Brooklyn roaster. Three featured single-origin coffees on the homepage with origin notes and roast dates, a category showcase pointing at Single Origin, Espresso, and Subscriptions, one customer testimonial about freshness, and a four-question FAQ covering shipping, brewing tips, returns, and wholesale.",
    screenshots_brief: [
      { page: "homepage", width: 1440, notes: "Full hero with image, the USP strip, and the first row of the product grid visible above the fold." },
      { page: "single-product", width: 1440, notes: "Product detail with image left, title + price + summary + add-to-cart right, FAQ below." },
      { page: "homepage", width: 360, notes: "Mobile homepage stacked: hero image, headline, CTA, then the USP strip wrapped to 1-column." },
    ],
  };

  return {
    async call<T>(opts: LLMCallOptions<T>): Promise<T> {
      const stage: StageId = opts.stage;
      if (stage === "brand-interpreter")    return enriched as T;
      if (stage === "theme-json-generator") return tokens as T;
      if (stage === "template-planner")     return plan as T;
      if (stage === "marketing")            return marketing as T;
      if (stage === "pattern-customizer") {
        const m = /"([^"]+)" pattern/.exec(opts.toolDescription ?? "");
        const id = m?.[1];
        if (!id) throw new Error("test pipelineLLM: could not infer pattern id");
        const entry = lib.get(id);
        if (!entry) throw new Error(`test pipelineLLM: unknown pattern "${id}"`);
        return { resolutions: mockResolutionsFor(entry.pattern) } as T;
      }
      throw new Error(`test pipelineLLM: unhandled stage ${stage}`);
    },
  };
}

describe("bundleTheme (end-to-end with mocked LLM)", () => {
  let outDir: string;
  let runRoot: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "forge-out-"));
    runRoot = mkdtempSync(join(tmpdir(), "forge-run-"));
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(runRoot, { recursive: true, force: true });
  });

  async function buildBundle(opts?: Partial<Parameters<typeof bundleTheme>[2]>) {
    const run = await runPipeline(sampleSpec, { llm: pipelineLLM(), library: lib });
    return bundleTheme(run, lib, {
      outputDir: outDir,
      runRoot,
      metadata: meta,
      ...opts,
    });
  }

  it("writes the full theme directory tree to outputDir/<slug>/", async () => {
    const result = await buildBundle();
    const themeDir = join(outDir, meta.slug);
    expect(existsSync(themeDir)).toBe(true);
    expect(result.themeDir).toBe(themeDir);

    for (const f of [
      "style.css",
      "functions.php",
      "theme.json",
      "IMAGE_BRIEF.md",
      "templates/index.html",
      "templates/single-product.html",
      "templates/archive-product.html",
      "templates/page.html",
      "templates/page-cart.html",
      "templates/page-checkout.html",
      "templates/404.html",
      "parts/header.html",
      "parts/footer.html",
      "styles/light.json",
      "styles/dark.json",
      "styles/editorial.json",
      "styles/playful.json",
      "styles/mono.json",
      "marketing/description.md",
      "marketing/features.md",
      "marketing/variations.md",
      "marketing/demo-concept.md",
      "marketing/screenshots-brief.md",
      "marketing/changelog.md",
    ]) {
      expect(existsSync(join(themeDir, f)), `missing ${f}`).toBe(true);
    }
  });

  it("rewrites every placeholder.local URL to the local theme asset path", async () => {
    await buildBundle();
    const indexHtml = readFileSync(join(outDir, meta.slug, "templates/index.html"), "utf8");
    expect(indexHtml).not.toContain("https://placeholder.local");
    expect(indexHtml).toContain(`/wp-content/themes/${meta.slug}/assets/placeholders/`);
    expect(indexHtml).toMatch(/\/assets\/placeholders\/[a-z0-9_-]+-\d+x\d+\.svg/);
  });

  it("generates a placeholder SVG for every distinct image role used", async () => {
    const result = await buildBundle();
    const placeholderDir = join(outDir, meta.slug, "assets/placeholders");
    expect(existsSync(placeholderDir)).toBe(true);
    const files = readdirSync(placeholderDir);
    expect(files.length).toBe(result.imageRoleCount);
    for (const f of files) {
      expect(f).toMatch(/\.svg$/);
      const svg = readFileSync(join(placeholderDir, f), "utf8");
      expect(svg).toMatch(/^<svg /);
      expect(svg.trimEnd()).toMatch(/<\/svg>$/);
    }
  });

  it("cart and checkout templates contain the official WooCommerce blocks", async () => {
    await buildBundle();
    const cart = readFileSync(join(outDir, meta.slug, "templates/page-cart.html"), "utf8");
    const checkout = readFileSync(join(outDir, meta.slug, "templates/page-checkout.html"), "utf8");
    expect(cart).toContain("wp:woocommerce/cart");
    expect(checkout).toContain("wp:woocommerce/checkout");
  });

  it("produces a zip alongside the theme directory by default", async () => {
    const result = await buildBundle();
    expect(result.zipPath).toBeDefined();
    expect(existsSync(result.zipPath!)).toBe(true);
    const stat = statSync(result.zipPath!);
    expect(stat.size).toBeGreaterThan(1000); // sanity floor
  });

  it("--no-zip path skips zip creation", async () => {
    const result = await buildBundle({ skipZip: true });
    expect(result.zipPath).toBeUndefined();
  });

  it("IMAGE_BRIEF.md mentions every collected role", async () => {
    const result = await buildBundle();
    const brief = readFileSync(join(outDir, meta.slug, "IMAGE_BRIEF.md"), "utf8");
    expect(brief).toContain("Image brief — Bellwether Coffee");
    expect(brief).toContain(`Total distinct images to source: **${result.imageRoleCount}**`);
    // Each placeholder file should be referenced in the brief.
    const placeholderFiles = readdirSync(join(outDir, meta.slug, "assets/placeholders"));
    for (const f of placeholderFiles) {
      expect(brief).toContain(f);
    }
  });

  it("style variation files on disk carry their branded titles", async () => {
    await buildBundle();
    // Coffee-roaster brand spec is heritage mood → branded titles below.
    const expected: Record<string, string> = {
      light: "First Light",
      dark: "Deep Roast",
      editorial: "Press",
      playful: "Sunday",
      mono: "Letterpress",
    };
    for (const [slug, title] of Object.entries(expected)) {
      const file = JSON.parse(
        readFileSync(join(outDir, meta.slug, "styles", `${slug}.json`), "utf8"),
      ) as { version: number; title: string };
      expect(file.version).toBe(3);
      expect(file.title, `styles/${slug}.json`).toBe(title);
    }
  });

  it("style.css contains the WP theme header with the brand name", async () => {
    await buildBundle();
    const css = readFileSync(join(outDir, meta.slug, "style.css"), "utf8");
    expect(css).toContain("Theme Name: Bellwether Coffee");
    expect(css).toContain("Version: 1.0.0");
  });

  it("marketing/ files contain the LLM-generated copy", async () => {
    await buildBundle();
    const dir = join(outDir, meta.slug, "marketing");

    const description = readFileSync(join(dir, "description.md"), "utf8");
    expect(description).toContain("# Bellwether Coffee");
    expect(description).toContain("heritage-leaning, editorial");
    expect(description).toContain("## Built for");
    expect(description).toContain("Compatibility");

    const features = readFileSync(join(dir, "features.md"), "utf8");
    expect(features).toMatch(/^# Bellwether Coffee — feature list/);
    expect(features).toContain("- Full Site Editing block theme");

    const variations = readFileSync(join(dir, "variations.md"), "utf8");
    for (const branded of ["First Light", "Deep Roast", "Press", "Sunday", "Letterpress"]) {
      expect(variations, `variations.md missing ${branded}`).toContain(branded);
    }

    const demo = readFileSync(join(dir, "demo-concept.md"), "utf8");
    expect(demo).toContain("Brooklyn roaster");

    const brief = readFileSync(join(dir, "screenshots-brief.md"), "utf8");
    expect(brief).toContain("`homepage` @ 1440px");
    expect(brief).toContain("`single-product` @ 1440px");
    expect(brief).toContain("`homepage` @ 360px");
    expect(brief).toContain("screenshots/homepage-1440.png");

    const changelog = readFileSync(join(dir, "changelog.md"), "utf8");
    expect(changelog).toContain("## 1.0.0");
    expect(changelog).toContain("Initial release.");
  });

  it("theme.json on disk parses to the same object the pipeline produced", async () => {
    const run = await runPipeline(sampleSpec, { llm: pipelineLLM(), library: lib });
    await bundleTheme(run, lib, { outputDir: outDir, runRoot, metadata: meta });
    const onDisk = JSON.parse(readFileSync(join(outDir, meta.slug, "theme.json"), "utf8"));
    expect(onDisk).toEqual(run.themeJson);
  });

  it("refuses to overwrite an existing theme directory by default", async () => {
    await buildBundle();
    await expect(buildBundle()).rejects.toThrow(/already exists/);
  });

  it("refuseOverwrite=false replaces an existing directory", async () => {
    await buildBundle();
    await expect(buildBundle({ refuseOverwrite: false })).resolves.toBeDefined();
  });

  it("validates after writing — markup that loses fidelity round-tripping aborts the bundle", async () => {
    const run = await runPipeline(sampleSpec, { llm: pipelineLLM(), library: lib });

    // Inject malformed attrs JSON. The parser silently drops the
    // unparseable block; re-emit doesn't reproduce the original, so
    // assertRoundTrip catches it.
    run.templates.index =
      '<!-- wp:group {"this": is not, json} -->\n<div></div>\n<!-- /wp:group -->\n';

    await expect(
      bundleTheme(run, lib, { outputDir: outDir, runRoot, metadata: meta }),
    ).rejects.toThrow(BundleValidationError);

    // The corrupted theme dir should not exist at the destination.
    expect(existsSync(join(outDir, meta.slug))).toBe(false);
  });
});

describe("bundleTheme detects when a placeholder file goes missing", () => {
  it("validation surfaces missing assets referenced from templates", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "forge-out-"));
    const runRoot = mkdtempSync(join(tmpdir(), "forge-run-"));
    try {
      const run = await runPipeline(sampleSpec, { llm: pipelineLLM(), library: lib });

      // Inject a reference to a placeholder that won't exist (no
      // corresponding image_role resolution feeds the brief).
      run.templates.index =
        run.templates.index! +
        '\n<!-- wp:image -->\n<figure class="wp-block-image"><img src="https://placeholder.local/missing_role/1x1" alt=""/></figure>\n<!-- /wp:image -->\n';

      await expect(
        bundleTheme(run, lib, {
          outputDir: outDir,
          runRoot,
          metadata: meta,
        }),
      ).rejects.toThrow(/missing_role-1x1\.svg/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(runRoot, { recursive: true, force: true });
    }
  });
});
