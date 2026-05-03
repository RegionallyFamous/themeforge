import { describe, it, expect } from "vitest";
import {
  buildStyleCss,
  buildFunctionsPhp,
  buildCartTemplate,
  buildCheckoutTemplate,
  build404Template,
  type ThemeMetadata,
} from "./scaffolds.js";
import { assertRoundTrip, validateMarkup } from "./validator.js";

const meta: ThemeMetadata = {
  name: "Bellwether Coffee",
  slug: "bellwether-coffee",
  description: "Single-origin coffee, slow-roasted in small batches.",
  author: "woo-theme-forge",
  authorUri: "https://woo-theme-forge.local",
  themeUri: "https://bellwethercoffee.test",
  version: "1.0.0",
};

describe("buildStyleCss", () => {
  it("emits the WP theme header with required fields", () => {
    const css = buildStyleCss(meta);
    expect(css).toMatch(/^\/\*/);
    expect(css).toContain("Theme Name: Bellwether Coffee");
    expect(css).toContain("Author: woo-theme-forge");
    expect(css).toContain("Description: Single-origin coffee, slow-roasted in small batches.");
    expect(css).toContain("Version: 1.0.0");
    expect(css).toContain("Text Domain: bellwether-coffee");
    expect(css).toContain("Requires at least:");
    expect(css).toContain("License:");
    expect(css.trim()).toMatch(/\*\/$/);
  });

  it("omits optional URIs when not supplied", () => {
    const css = buildStyleCss({ ...meta, authorUri: undefined, themeUri: undefined });
    expect(css).not.toContain("Author URI:");
    expect(css).not.toContain("Theme URI:");
  });
});

describe("buildFunctionsPhp", () => {
  it("emits a PHP file with theme support registrations", () => {
    const php = buildFunctionsPhp(meta);
    expect(php).toMatch(/^<\?php/);
    expect(php).toContain("add_theme_support( 'wp-block-styles' )");
    expect(php).toContain("add_theme_support( 'woocommerce' )");
    expect(php).toContain("after_setup_theme");
    expect(php).toContain("ABSPATH");
  });

  it("derives a sane PHP function name even when slug starts with a digit", () => {
    const php = buildFunctionsPhp({ ...meta, slug: "9-lives-shop" });
    // PHP functions can't start with a digit; we prefix with `t_`.
    expect(php).toMatch(/function t_9_lives_shop_setup/);
  });
});

describe("buildCartTemplate", () => {
  it("contains the woocommerce/cart block and our header/footer chrome", () => {
    const tpl = buildCartTemplate();
    expect(tpl).toContain("wp:woocommerce/cart");
    expect(tpl).toContain('wp:template-part {"slug":"header"');
    expect(tpl).toContain('wp:template-part {"slug":"footer"');
  });

  it("validates and round-trips", () => {
    const tpl = buildCartTemplate();
    expect(validateMarkup(tpl)).toEqual({ ok: true });
    expect(assertRoundTrip(tpl)).toEqual({ ok: true });
  });
});

describe("buildCheckoutTemplate", () => {
  it("contains the woocommerce/checkout block and our header/footer chrome", () => {
    const tpl = buildCheckoutTemplate();
    expect(tpl).toContain("wp:woocommerce/checkout");
    expect(tpl).toContain('wp:template-part {"slug":"header"');
    expect(tpl).toContain('wp:template-part {"slug":"footer"');
  });

  it("validates and round-trips", () => {
    const tpl = buildCheckoutTemplate();
    expect(validateMarkup(tpl)).toEqual({ ok: true });
    expect(assertRoundTrip(tpl)).toEqual({ ok: true });
  });
});

describe("build404Template", () => {
  it("contains the 'Not found' heading and a back-to-shop link", () => {
    const tpl = build404Template();
    expect(tpl).toContain("Not found");
    expect(tpl).toContain('href="/shop"');
    expect(tpl).toContain("Back to shop");
  });

  it("validates and round-trips", () => {
    const tpl = build404Template();
    expect(validateMarkup(tpl)).toEqual({ ok: true });
    expect(assertRoundTrip(tpl)).toEqual({ ok: true });
  });
});
