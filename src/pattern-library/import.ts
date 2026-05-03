/**
 * Convert pasted WordPress block markup into a `PatternDef` skeleton.
 *
 * The site editor's "Copy" produces block markup with embedded JSON in
 * comments. This module turns that markup back into the JSON tree
 * representation our serializer consumes — so a designer can build a
 * pattern visually in WP, paste the markup, and get an unannotated
 * skeleton ready for slot annotation.
 *
 * What this module *does* annotate automatically:
 *   - block name, attrs, children (from the parser)
 *   - inline `content` for headings/paragraphs (preserves literal text)
 *   - the wrapping PatternDef metadata (id, category, empty slots, etc.)
 *
 * What you have to annotate by hand afterwards:
 *   - which text becomes a slot vs. stays literal
 *   - which images become image_role slots
 *   - the pattern's slots / theme_tokens / compatible_templates / compatible_moods fields
 *
 * That's the explicit Phase 2 authoring workflow per `docs/pattern-library.md`.
 */

import { parse as parseBlocks } from "@wordpress/block-serialization-default-parser";
import type { BlockNode, PatternDef } from "../pipeline/types.js";

interface ParsedBlock {
  blockName: string | null;
  attrs: Record<string, unknown> | null;
  innerBlocks: ParsedBlock[];
  innerHTML: string;
  innerContent: Array<string | null>;
}

export interface ImportOptions {
  category: string;
  id: string;
  /** Override the human-friendly name. Defaults to a Title Case of the id. */
  name?: string;
}

export interface ImportResult {
  pattern: PatternDef;
  /** Block names found in the markup that don't have a renderer. The
   *  operator should verify these are intentional or add the renderers. */
  unknownBlocks: string[];
}

export function importPatternFromMarkup(markup: string, opts: ImportOptions): ImportResult {
  const parsed = parseBlocks(markup) as ParsedBlock[];

  // Drop any top-level freeform whitespace blocks (parser emits these
  // for blank lines between top-level blocks).
  const meaningful = parsed.filter(
    (b) => b.blockName !== null || b.innerHTML.trim().length > 0,
  );

  if (meaningful.length === 0) {
    throw new Error("import: no parseable blocks found in markup");
  }

  const tree: BlockNode[] = meaningful.map(toNode);
  const unknownBlocks = collectUnknownBlocks(tree);

  return {
    pattern: {
      id: opts.id,
      name: opts.name ?? titleCase(opts.id),
      category: opts.category,
      description: `TODO: describe ${opts.id}.`,
      compatible_templates: [],
      compatible_moods: [],
      slots: {},
      theme_tokens: [],
      tree,
    },
    unknownBlocks,
  };
}

function toNode(b: ParsedBlock): BlockNode {
  if (b.blockName === null) {
    // Treat freeform content as an html block so the round trip stays sane.
    return { name: "core/html", content: b.innerHTML };
  }
  const node: BlockNode = { name: b.blockName };
  if (b.attrs && Object.keys(b.attrs).length > 0) {
    node.attrs = b.attrs;
  }
  if (b.innerBlocks.length > 0) {
    node.innerBlocks = b.innerBlocks.map(toNode);
  }
  // Capture inline text content for heading/paragraph leafs so the
  // operator sees the original copy in their pattern skeleton — they
  // can decide which strings to convert into slots and which to keep
  // literal.
  const inlineText = extractInlineText(b);
  if (inlineText !== undefined) node.content = inlineText;
  return node;
}

function extractInlineText(b: ParsedBlock): string | undefined {
  if (b.innerBlocks.length > 0) return undefined;
  if (b.innerHTML.trim().length === 0) return undefined;
  // Strip the immediate wrapping element to recover the text. Best-effort
  // — exotic markup falls through; the operator can clean it up.
  const m = /^\s*<[^>]+>([\s\S]*?)<\/[^>]+>\s*$/.exec(b.innerHTML);
  return m ? m[1] : undefined;
}

const KNOWN_BLOCKS = new Set([
  "core/group", "core/columns", "core/column", "core/heading", "core/paragraph",
  "core/buttons", "core/button", "core/image", "core/spacer", "core/separator",
  "core/site-title", "core/template-part", "core/navigation", "core/html",
  "core/post-template", "core/post-title", "core/post-excerpt", "core/post-content",
  "core/post-date", "core/post-author", "core/post-featured-image",
  "core/query", "core/query-pagination",
  "core/query-pagination-previous", "core/query-pagination-next", "core/query-pagination-numbers",
  "woocommerce/product-collection", "woocommerce/product-image", "woocommerce/product-price",
  "woocommerce/product-summary", "woocommerce/add-to-cart-form", "woocommerce/product-rating",
  "woocommerce/product-image-gallery", "woocommerce/cart", "woocommerce/checkout",
  "forge/link-list", "forge/faq-list", "forge/marquee-strip", "forge/team-grid",
]);

function collectUnknownBlocks(tree: BlockNode[]): string[] {
  const seen = new Set<string>();
  function walk(n: BlockNode) {
    if (!KNOWN_BLOCKS.has(n.name)) seen.add(n.name);
    for (const c of n.innerBlocks ?? []) walk(c);
  }
  for (const n of tree) walk(n);
  return [...seen].sort();
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(" ");
}
