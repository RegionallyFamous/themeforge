import { describe, it, expect } from "vitest";
import { importPatternFromMarkup } from "./import.js";

describe("importPatternFromMarkup", () => {
  it("parses a single heading + paragraph into a tree with literal content", () => {
    const markup = [
      "<!-- wp:heading {\"level\":1} -->",
      "<h1 class=\"wp-block-heading\">Welcome to the shop</h1>",
      "<!-- /wp:heading -->",
      "<!-- wp:paragraph -->",
      "<p>Single-origin beans roasted weekly.</p>",
      "<!-- /wp:paragraph -->",
    ].join("\n");

    const result = importPatternFromMarkup(markup, { category: "hero", id: "hero-test" });
    expect(result.pattern.id).toBe("hero-test");
    expect(result.pattern.tree).toHaveLength(2);

    expect(result.pattern.tree[0]).toMatchObject({
      name: "core/heading",
      attrs: { level: 1 },
      content: "Welcome to the shop",
    });
    expect(result.pattern.tree[1]).toMatchObject({
      name: "core/paragraph",
      content: "Single-origin beans roasted weekly.",
    });
  });

  it("preserves nested innerBlocks structure", () => {
    const markup = [
      "<!-- wp:group {\"align\":\"full\"} -->",
      "<div class=\"wp-block-group alignfull\">",
      "<!-- wp:heading -->",
      "<h2 class=\"wp-block-heading\">Inside</h2>",
      "<!-- /wp:heading -->",
      "</div>",
      "<!-- /wp:group -->",
    ].join("\n");
    const result = importPatternFromMarkup(markup, { category: "test", id: "x" });
    expect(result.pattern.tree[0]?.name).toBe("core/group");
    expect(result.pattern.tree[0]?.innerBlocks?.[0]?.name).toBe("core/heading");
  });

  it("scaffolds a PatternDef with empty annotations the operator must fill in", () => {
    const markup = "<!-- wp:paragraph --><p>hi</p><!-- /wp:paragraph -->";
    const result = importPatternFromMarkup(markup, { category: "test", id: "x" });
    expect(result.pattern.slots).toEqual({});
    expect(result.pattern.theme_tokens).toEqual([]);
    expect(result.pattern.compatible_templates).toEqual([]);
    expect(result.pattern.compatible_moods).toEqual([]);
    expect(result.pattern.description).toMatch(/TODO/);
  });

  it("falls back to a Title Case name from the id", () => {
    const markup = "<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->";
    const result = importPatternFromMarkup(markup, { category: "test", id: "hero-split" });
    expect(result.pattern.name).toBe("Hero Split");
  });

  it("flags unknown block types so the operator knows to add renderers", () => {
    const markup = [
      "<!-- wp:custom/never-heard-of -->",
      "<div></div>",
      "<!-- /wp:custom/never-heard-of -->",
    ].join("\n");
    const result = importPatternFromMarkup(markup, { category: "test", id: "x" });
    expect(result.unknownBlocks).toContain("custom/never-heard-of");
  });

  it("emits no unknown-blocks warning when every block is in the registry", () => {
    const markup = [
      "<!-- wp:group -->",
      "<div class=\"wp-block-group\">",
      "<!-- wp:paragraph -->",
      "<p>ok</p>",
      "<!-- /wp:paragraph -->",
      "</div>",
      "<!-- /wp:group -->",
    ].join("\n");
    const result = importPatternFromMarkup(markup, { category: "test", id: "x" });
    expect(result.unknownBlocks).toEqual([]);
  });

  it("rejects empty markup loud", () => {
    expect(() => importPatternFromMarkup("", { category: "test", id: "x" })).toThrow(/no parseable blocks/);
    expect(() => importPatternFromMarkup("   \n  ", { category: "test", id: "x" })).toThrow(/no parseable blocks/);
  });
});
