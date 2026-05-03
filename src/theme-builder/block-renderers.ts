/**
 * Per-block renderers for the serializer.
 *
 * Each renderer encodes WordPress's save() output for one block type:
 * which HTML element it wraps in, which classes/styles it derives from
 * attrs, and how it consumes its slots.
 *
 * Add a new block type here as soon as a pattern needs it. Renderers
 * are intentionally small and self-contained.
 */

import type { BlockNode } from "../pipeline/types.js";
import {
  classAttr,
  commentClose,
  commentOpen,
  commentVoid,
  getImageSlot,
  getSlotByKey,
  getText,
  pad,
  paddingDecls,
  presetVar,
  renderChildren,
  styleAttr,
  type Renderer,
  type RenderCtx,
} from "./serializer.js";

export const renderers: Record<string, Renderer> = {};

// ── Helpers ──────────────────────────────────────────────────────────────

function colorClass(slug: unknown, kind: "color" | "background-color"): string | undefined {
  if (typeof slug !== "string" || slug.length === 0) return undefined;
  return `has-${slug}-${kind}`;
}

function fontSizeClass(slug: unknown): string | undefined {
  if (typeof slug !== "string" || slug.length === 0) return undefined;
  return `has-${slug}-font-size`;
}

function alignClass(align: unknown): string | undefined {
  if (typeof align !== "string") return undefined;
  if (align === "full") return "alignfull";
  if (align === "wide") return "alignwide";
  return `align${align}`;
}

function textAlignClass(align: unknown): string | undefined {
  if (typeof align !== "string") return undefined;
  return `has-text-align-${align}`;
}

/**
 * Render a container block: comment + html-open on one line each, children
 * indented +1, then html-close + comment-close on their own lines.
 */
function renderContainer(
  block: BlockNode,
  ctx: RenderCtx,
  htmlOpen: string,
  htmlClose: string,
): string {
  const inner = renderChildren(block.innerBlocks, ctx);
  const lines = [
    `${pad(ctx)}${commentOpen(block.name, block.attrs)}`,
    `${pad(ctx)}${htmlOpen}`,
  ];
  if (inner.length > 0) lines.push(inner);
  lines.push(`${pad(ctx)}${htmlClose}`);
  lines.push(`${pad(ctx)}${commentClose(block.name)}`);
  return lines.join("\n");
}

/**
 * Render a leaf block: comment + html (single line, content embedded) +
 * comment, all at the current indent.
 */
function renderLeaf(block: BlockNode, ctx: RenderCtx, html: string): string {
  return [
    `${pad(ctx)}${commentOpen(block.name, block.attrs)}`,
    `${pad(ctx)}${html}`,
    `${pad(ctx)}${commentClose(block.name)}`,
  ].join("\n");
}

function renderVoid(block: BlockNode, ctx: RenderCtx): string {
  return `${pad(ctx)}${commentVoid(block.name, block.attrs)}`;
}

// ── core/group ──────────────────────────────────────────────────────────

renderers["core/group"] = (block, ctx) => {
  const a = block.attrs ?? {};
  const tag = (a.tagName as string | undefined) ?? "div";
  const classes = ["wp-block-group"];
  classes.push(alignClass(a.align) ?? "");
  if (a.backgroundColor) {
    classes.push(`has-${a.backgroundColor}-background-color`, "has-background");
  }
  if (a.textColor) {
    classes.push(`has-${a.textColor}-color`, "has-text-color");
  }
  const decls = [
    ...paddingDecls(a),
    ...minHeightDecl(a),
    ...backgroundImageDecls(a),
  ];
  if (typeof (a.style as { color?: { background?: string } } | undefined)?.color?.background === "string") {
    decls.push(`background-color:${(a.style as { color: { background: string } }).color.background}`);
  }
  return renderContainer(
    block,
    ctx,
    `<${tag}${classAttr(classes)}${styleAttr(decls)}>`,
    `</${tag}>`,
  );
};

/**
 * Pull `style.background.backgroundImage` (and matching size/position)
 * out of group attrs into inline style declarations. Used to support
 * full-bleed-image hero patterns without dragging in `core/cover`.
 */
function backgroundImageDecls(attrs: Record<string, unknown> | undefined): string[] {
  const bg = (attrs?.style as { background?: { backgroundImage?: { url?: string }; backgroundSize?: string; backgroundPosition?: string } } | undefined)?.background;
  if (!bg) return [];
  const out: string[] = [];
  if (bg.backgroundImage?.url) out.push(`background-image:url('${bg.backgroundImage.url}')`);
  if (bg.backgroundSize) out.push(`background-size:${bg.backgroundSize}`);
  if (bg.backgroundPosition) out.push(`background-position:${bg.backgroundPosition}`);
  return out;
}

function minHeightDecl(attrs: Record<string, unknown> | undefined): string[] {
  const dim = (attrs?.style as { dimensions?: { minHeight?: string } } | undefined)?.dimensions;
  return dim?.minHeight ? [`min-height:${dim.minHeight}`] : [];
}

// ── core/columns ────────────────────────────────────────────────────────

renderers["core/columns"] = (block, ctx) => {
  const a = block.attrs ?? {};
  const classes = ["wp-block-columns"];
  classes.push(alignClass(a.align) ?? "");
  if (a.verticalAlignment) classes.push(`are-vertically-aligned-${a.verticalAlignment}`);
  return renderContainer(block, ctx, `<div${classAttr(classes)}>`, `</div>`);
};

// ── core/column ─────────────────────────────────────────────────────────

renderers["core/column"] = (block, ctx) => {
  const a = block.attrs ?? {};
  const classes = ["wp-block-column"];
  if (a.verticalAlignment) classes.push(`is-vertically-aligned-${a.verticalAlignment}`);
  const decls: string[] = [];
  if (typeof a.width === "string") decls.push(`flex-basis:${a.width}`);
  return renderContainer(
    block,
    ctx,
    `<div${classAttr(classes)}${styleAttr(decls)}>`,
    `</div>`,
  );
};

// ── core/heading ────────────────────────────────────────────────────────

renderers["core/heading"] = (block, ctx) => {
  const a = block.attrs ?? {};
  const level = typeof a.level === "number" ? a.level : 2;
  const tag = `h${level}`;
  const classes = ["wp-block-heading"];
  classes.push(textAlignClass(a.textAlign) ?? "");
  classes.push(colorClass(a.textColor, "color") ?? "");
  if (a.textColor) classes.push("has-text-color");
  classes.push(fontSizeClass(a.fontSize) ?? "");
  return renderLeaf(
    block,
    ctx,
    `<${tag}${classAttr(classes)}>${getText(block, ctx)}</${tag}>`,
  );
};

// ── core/paragraph ──────────────────────────────────────────────────────

renderers["core/paragraph"] = (block, ctx) => {
  const a = block.attrs ?? {};
  const classes: string[] = [];
  classes.push(textAlignClass(a.align) ?? "");
  classes.push(colorClass(a.textColor, "color") ?? "");
  if (a.textColor) classes.push("has-text-color");
  classes.push(fontSizeClass(a.fontSize) ?? "");
  return renderLeaf(
    block,
    ctx,
    `<p${classAttr(classes)}>${getText(block, ctx)}</p>`,
  );
};

// ── core/buttons ────────────────────────────────────────────────────────

renderers["core/buttons"] = (block, ctx) => {
  return renderContainer(
    block,
    ctx,
    `<div class="wp-block-buttons">`,
    `</div>`,
  );
};

// ── core/button ─────────────────────────────────────────────────────────

renderers["core/button"] = (block, ctx) => {
  const a = block.attrs ?? {};
  const labelRes = getSlotByKey(block, "text", ctx);
  const urlRes = getSlotByKey(block, "url", ctx);
  if (labelRes.type !== "text") {
    throw new Error(`core/button: text slot must resolve to text, got ${labelRes.type}`);
  }
  if (urlRes.type !== "url") {
    throw new Error(`core/button: url slot must resolve to url, got ${urlRes.type}`);
  }
  const linkClasses = ["wp-block-button__link"];
  // textColor maps to `has-{slug}-color` and adds `has-text-color`
  linkClasses.push(colorClass(a.textColor, "color") ?? "");
  // backgroundColor maps to `has-{slug}-background-color` and adds `has-background`
  linkClasses.push(colorClass(a.backgroundColor, "background-color") ?? "");
  if (a.textColor) linkClasses.push("has-text-color");
  if (a.backgroundColor) linkClasses.push("has-background");
  linkClasses.push("wp-element-button");

  const html = `<div class="wp-block-button"><a${classAttr(linkClasses)} href="${urlRes.value}">${labelRes.value}</a></div>`;
  return renderLeaf(block, ctx, html);
};

// ── core/image ──────────────────────────────────────────────────────────
//
// When `attrs.href` is set, the rendered img is wrapped in an anchor so
// the image is clickable. WP normally uses `linkDestination: "custom"`
// alongside `href`; we render based on `href` alone for simplicity since
// it's what controls the markup either way.

renderers["core/image"] = (block, ctx) => {
  const a = block.attrs ?? {};
  const img = getImageSlot(block, ctx);
  const classes = ["wp-block-image"];
  if (a.sizeSlug) classes.push(`size-${a.sizeSlug}`);
  const decls: string[] = [];
  if (a.aspectRatio) decls.push(`aspect-ratio:${a.aspectRatio}`);
  // Placeholder URL convention: aspect "4:5" → "4x5".
  const aspectSlug = img.aspect.replace(/:/g, "x");
  const src = `https://placeholder.local/${img.role}/${aspectSlug}`;
  const imgTag = `<img src="${src}" alt="${img.alt}"/>`;
  const inner = typeof a.href === "string" ? `<a href="${a.href}">${imgTag}</a>` : imgTag;
  const html = `<figure${classAttr(classes)}${styleAttr(decls)}>${inner}</figure>`;
  return renderLeaf(block, ctx, html);
};

// ── core/cover ──────────────────────────────────────────────────────────
//
// Full-bleed hero block. Renders an image background (when an `image`
// slot is provided), a dim/overlay span, and an inner-container that
// wraps the inner blocks. Mirrors WP's save-time markup so the WP
// editor recognizes it for further customization.

renderers["core/cover"] = (block, ctx) => {
  const a = block.attrs ?? {};
  const dimRatio = typeof a.dimRatio === "number" ? a.dimRatio : 50;
  const minHeight =
    typeof a.minHeight === "number"
      ? `${a.minHeight}${(a.minHeightUnit as string | undefined) ?? "px"}`
      : undefined;

  const classes = ["wp-block-cover"];
  classes.push(alignClass(a.align) ?? "");
  if (a.contentPosition && typeof a.contentPosition === "string") {
    classes.push("has-custom-content-position");
    classes.push(`is-position-${a.contentPosition.replace(/\s+/g, "-")}`);
  }
  const styleDecls: string[] = [];
  if (minHeight) styleDecls.push(`min-height:${minHeight}`);
  if (typeof a.customOverlayColor === "string") {
    styleDecls.push(`background-color:${a.customOverlayColor}`);
  }

  const dimClass = dimRatio === 0 ? "" : ` has-background-dim-${dimRatio} has-background-dim`;
  const dimSpan = `<span aria-hidden="true" class="wp-block-cover__background${dimClass}"></span>`;

  let imgTag = "";
  // Pull the image from a slot if the pattern declared one. Lets the
  // bundler rewrite the URL to a local placeholder.
  if (typeof block.slot === "string") {
    const img = getImageSlot(block, ctx);
    const aspectSlug = img.aspect.replace(/:/g, "x");
    const src = `https://placeholder.local/${img.role}/${aspectSlug}`;
    const focal =
      a.focalPoint && typeof a.focalPoint === "object"
        ? formatFocalPoint(a.focalPoint as { x?: number; y?: number })
        : null;
    const objectPosStyle = focal ? ` style="object-position:${focal}"` : "";
    const dataPos = focal ? ` data-object-position="${focal}"` : "";
    imgTag = `<img class="wp-block-cover__image-background" alt="${img.alt}" src="${src}"${objectPosStyle} data-object-fit="cover"${dataPos}/>`;
  }

  const innerHtml = renderChildren(block.innerBlocks, { ...ctx, indent: ctx.indent + 1 });
  const padOuter = pad(ctx);
  const padInner = " ".repeat(ctx.indent + 1);

  const lines = [
    `${padOuter}${commentOpen(block.name, block.attrs)}`,
    `${padOuter}<div${classAttr(classes)}${styleAttr(styleDecls)}>`,
    `${padInner}${dimSpan}`,
  ];
  if (imgTag) lines.push(`${padInner}${imgTag}`);
  lines.push(`${padInner}<div class="wp-block-cover__inner-container">`);
  if (innerHtml.length > 0) lines.push(innerHtml);
  lines.push(`${padInner}</div>`);
  lines.push(`${padOuter}</div>`);
  lines.push(`${padOuter}${commentClose(block.name)}`);
  return lines.join("\n");
};

function formatFocalPoint(fp: { x?: number; y?: number }): string {
  const x = typeof fp.x === "number" ? `${Math.round(fp.x * 100)}%` : "50%";
  const y = typeof fp.y === "number" ? `${Math.round(fp.y * 100)}%` : "50%";
  return `${x} ${y}`;
}

// ── core/spacer ─────────────────────────────────────────────────────────

renderers["core/spacer"] = (block, ctx) => {
  const a = block.attrs ?? {};
  const decls: string[] = [];
  if (typeof a.height === "string") decls.push(`height:${presetVar(a.height)}`);
  return renderLeaf(
    block,
    ctx,
    `<div${styleAttr(decls)} aria-hidden="true" class="wp-block-spacer"></div>`,
  );
};

// ── core/separator ──────────────────────────────────────────────────────

renderers["core/separator"] = (block, ctx) => {
  const a = block.attrs ?? {};
  const classes = ["wp-block-separator"];
  if (a.opacity) classes.push(`has-${a.opacity}-opacity`);
  if (typeof a.className === "string") classes.push(a.className);
  return renderLeaf(block, ctx, `<hr${classAttr(classes)}/>`);
};

// ── core/site-title (void, dynamic) ─────────────────────────────────────

renderers["core/site-title"] = (block, ctx) => renderVoid(block, ctx);

// ── core/template-part (void) ───────────────────────────────────────────

renderers["core/template-part"] = (block, ctx) => renderVoid(block, ctx);

// ── core/navigation (void) ──────────────────────────────────────────────

renderers["core/navigation"] = (block, ctx) => renderVoid(block, ctx);

// ── core/html (raw HTML pass-through, comment-wrapped) ──────────────────

renderers["core/html"] = (block, ctx) => {
  const literal = (block as { content?: unknown }).content;
  if (typeof literal !== "string") {
    throw new Error(`core/html: expected string \`content\``);
  }
  return renderLeaf(block, ctx, literal);
};

// ── core/post-template (container, no HTML wrapper) ─────────────────────

renderers["core/post-template"] = (block, ctx) => {
  const inner = renderChildren(block.innerBlocks, ctx);
  const lines = [`${pad(ctx)}${commentOpen(block.name, block.attrs)}`];
  if (inner.length > 0) lines.push(inner);
  lines.push(`${pad(ctx)}${commentClose(block.name)}`);
  return lines.join("\n");
};

// ── core/post-title (void, dynamic) ─────────────────────────────────────

renderers["core/post-title"] = (block, ctx) => renderVoid(block, ctx);

// ── woocommerce/product-collection ──────────────────────────────────────

renderers["woocommerce/product-collection"] = (block, ctx) => {
  return renderContainer(
    block,
    ctx,
    `<div class="wp-block-woocommerce-product-collection">`,
    `</div>`,
  );
};

// ── core/post-* (void, dynamic) ─────────────────────────────────────────

renderers["core/post-excerpt"]        = (block, ctx) => renderVoid(block, ctx);
renderers["core/post-content"]        = (block, ctx) => renderVoid(block, ctx);
renderers["core/post-date"]           = (block, ctx) => renderVoid(block, ctx);
renderers["core/post-author"]         = (block, ctx) => renderVoid(block, ctx);
renderers["core/post-featured-image"] = (block, ctx) => renderVoid(block, ctx);

// ── core/query (container, dynamic) ─────────────────────────────────────

renderers["core/query"] = (block, ctx) => {
  return renderContainer(block, ctx, `<div class="wp-block-query">`, `</div>`);
};

// ── core/query-pagination (container, no HTML wrapper) ──────────────────
//
// Same shape as core/post-template: comment open/close with children
// indented +1 between them, no element wrapper.

renderers["core/query-pagination"] = (block, ctx) => {
  const inner = renderChildren(block.innerBlocks, ctx);
  const lines = [`${pad(ctx)}${commentOpen(block.name, block.attrs)}`];
  if (inner.length > 0) lines.push(inner);
  lines.push(`${pad(ctx)}${commentClose(block.name)}`);
  return lines.join("\n");
};

renderers["core/query-pagination-previous"] = (block, ctx) => renderVoid(block, ctx);
renderers["core/query-pagination-next"]     = (block, ctx) => renderVoid(block, ctx);
renderers["core/query-pagination-numbers"]  = (block, ctx) => renderVoid(block, ctx);

// ── woocommerce/product-image-gallery (void, dynamic) ───────────────────

renderers["woocommerce/product-image-gallery"] = (block, ctx) => renderVoid(block, ctx);

// ── woocommerce/product-image (dynamic — void OR container) ─────────────
//
// Modern WC accepts the block as either void (no inner blocks — image
// only) or as a container holding extras like `woocommerce/product-sale-badge`.
// We dispatch on whether the pattern provided innerBlocks.

renderers["woocommerce/product-image"] = (block, ctx) => {
  if ((block.innerBlocks?.length ?? 0) === 0) return renderVoid(block, ctx);
  // No HTML wrapper — the inner blocks render directly between the
  // block comments (mirroring what WC patterns ship). Pattern matches
  // `core/post-template` style.
  const inner = renderChildren(block.innerBlocks, ctx);
  const lines = [`${pad(ctx)}${commentOpen(block.name, block.attrs)}`];
  if (inner.length > 0) lines.push(inner);
  lines.push(`${pad(ctx)}${commentClose(block.name)}`);
  return lines.join("\n");
};

// ── woocommerce/product-template (container, no HTML wrapper) ───────────
//
// The modern WC equivalent of `core/post-template` for product
// collections. Children render between the block comments at +1 indent
// and WC's runtime stamps each one out per product in the loop.

renderers["woocommerce/product-template"] = (block, ctx) => {
  const inner = renderChildren(block.innerBlocks, ctx);
  const lines = [`${pad(ctx)}${commentOpen(block.name, block.attrs)}`];
  if (inner.length > 0) lines.push(inner);
  lines.push(`${pad(ctx)}${commentClose(block.name)}`);
  return lines.join("\n");
};

// ── More dynamic WC blocks (void) ───────────────────────────────────────

renderers["woocommerce/product-sale-badge"]  = (block, ctx) => renderVoid(block, ctx);
renderers["woocommerce/featured-product"]    = (block, ctx) => renderVoid(block, ctx);
renderers["woocommerce/featured-category"]   = (block, ctx) => renderVoid(block, ctx);
renderers["woocommerce/product-categories"]  = (block, ctx) => renderVoid(block, ctx);
renderers["woocommerce/mini-cart"]           = (block, ctx) => renderVoid(block, ctx);
renderers["woocommerce/customer-account"]    = (block, ctx) => renderVoid(block, ctx);
renderers["woocommerce/product-search"]      = (block, ctx) => renderVoid(block, ctx);

// ── woocommerce/product-price (void, dynamic) ───────────────────────────

renderers["woocommerce/product-price"] = (block, ctx) => renderVoid(block, ctx);

// ── woocommerce/product-summary (void, dynamic) ─────────────────────────

renderers["woocommerce/product-summary"] = (block, ctx) => renderVoid(block, ctx);

// ── woocommerce/add-to-cart-form (void, dynamic) ────────────────────────

renderers["woocommerce/add-to-cart-form"] = (block, ctx) => renderVoid(block, ctx);

// ── woocommerce/product-rating (void, dynamic) ──────────────────────────

renderers["woocommerce/product-rating"] = (block, ctx) => renderVoid(block, ctx);

// ── woocommerce/cart, woocommerce/checkout (void, dynamic) ──────────────
//
// Used by the cart/checkout scaffolds. Per architecture decision #4 the
// pipeline never restructures these — they're emitted as bare void
// blocks and Woo renders the full UI server-side.

renderers["woocommerce/cart"] = (block, ctx) => renderVoid(block, ctx);
renderers["woocommerce/checkout"] = (block, ctx) => renderVoid(block, ctx);

// ── forge/link-list (compile-time expansion → core/list) ────────────────
//
// `forge/link-list` is not a real WordPress block. It's a pseudo-block
// the serializer expands into a `core/list` whose items are raw `<li>`
// elements driven by a `repeater` slot of `{label, url}` pairs. This
// keeps repeating link lists out of the LLM's pattern-customizer surface
// — it just fills a single repeater rather than authoring N list items.

// ── forge/faq-list (compile-time expansion → core/details items) ────────
//
// Consumes a repeater of `{ question, answer }` text-pair items and
// expands to a series of `core/details` blocks, one per item. Each
// `<details>` contains the question as the `<summary>` and the answer
// as a single inner `core/paragraph`. Same rationale as `forge/link-list`:
// keep repeating accordion items out of the LLM customizer surface.

renderers["forge/faq-list"] = (block, ctx) => {
  if (typeof block.slot !== "string") {
    throw new Error(`forge/faq-list: expected a string slot reference`);
  }
  const r = ctx.resolutions[block.slot];
  if (!r) throw new Error(`forge/faq-list: slot "${block.slot}" has no resolution`);
  if (r.type !== "repeater") {
    throw new Error(`forge/faq-list: slot "${block.slot}" must be a repeater, got ${r.type}`);
  }
  const itemPad = " ".repeat(ctx.indent + 1);
  const blocks: string[] = [];
  for (const item of r.items) {
    const q = item.question;
    const ans = item.answer;
    if (!q || q.type !== "text") {
      throw new Error(`forge/faq-list: each item needs a text \`question\``);
    }
    if (!ans || ans.type !== "text") {
      throw new Error(`forge/faq-list: each item needs a text \`answer\``);
    }
    blocks.push(
      [
        `${pad(ctx)}<!-- wp:details -->`,
        `${pad(ctx)}<details class="wp-block-details"><summary>${q.value}</summary>`,
        `${itemPad}<!-- wp:paragraph -->`,
        `${itemPad}<p>${ans.value}</p>`,
        `${itemPad}<!-- /wp:paragraph -->`,
        `${pad(ctx)}</details>`,
        `${pad(ctx)}<!-- /wp:details -->`,
      ].join("\n"),
    );
  }
  return blocks.join("\n");
};

renderers["forge/link-list"] = (block, ctx) => {
  if (typeof block.slot !== "string") {
    throw new Error(`forge/link-list: expected a string slot reference`);
  }
  const r = ctx.resolutions[block.slot];
  if (!r) throw new Error(`forge/link-list: slot "${block.slot}" has no resolution`);
  if (r.type !== "repeater") {
    throw new Error(`forge/link-list: slot "${block.slot}" must be a repeater, got ${r.type}`);
  }
  const itemPad = " ".repeat(ctx.indent + 1);
  const items = r.items.map((item) => {
    const label = item.label;
    const url = item.url;
    if (!label || label.type !== "text") {
      throw new Error(`forge/link-list: each item needs a text \`label\``);
    }
    if (!url || url.type !== "url") {
      throw new Error(`forge/link-list: each item needs a url \`url\``);
    }
    return `${itemPad}<li><a href="${url.value}">${label.value}</a></li>`;
  });
  return [
    `${pad(ctx)}<!-- wp:list -->`,
    `${pad(ctx)}<ul>`,
    ...items,
    `${pad(ctx)}</ul>`,
    `${pad(ctx)}<!-- /wp:list -->`,
  ].join("\n");
};

// ── forge/team-grid (compile-time expansion → core/columns of cards) ────
//
// Consumes a repeater of `{ headshot, name, role, bio }` and emits a
// columns block (4-up at desktop; WP wraps responsively below).

renderers["forge/team-grid"] = (block, ctx) => {
  if (typeof block.slot !== "string") {
    throw new Error(`forge/team-grid: expected a string slot reference`);
  }
  const r = ctx.resolutions[block.slot];
  if (!r) throw new Error(`forge/team-grid: slot "${block.slot}" has no resolution`);
  if (r.type !== "repeater") {
    throw new Error(`forge/team-grid: slot "${block.slot}" must be a repeater, got ${r.type}`);
  }

  const colPad   = " ".repeat(ctx.indent + 1);
  const innerPad = " ".repeat(ctx.indent + 2);
  const itemPad  = " ".repeat(ctx.indent + 3);

  const columns: string[] = [];
  for (const item of r.items) {
    const headshot = item.headshot;
    const name     = item.name;
    const role     = item.role;
    const bio      = item.bio;
    if (!headshot || headshot.type !== "image_role") {
      throw new Error(`forge/team-grid: each item needs an image_role \`headshot\``);
    }
    if (!name || name.type !== "text" || !role || role.type !== "text" || !bio || bio.type !== "text") {
      throw new Error(`forge/team-grid: each item needs text \`name\`, \`role\`, and \`bio\``);
    }
    const aspectSlug = headshot.aspect.replace(/:/g, "x");
    const src = `https://placeholder.local/${headshot.role}/${aspectSlug}`;

    columns.push(
      [
        `${colPad}<!-- wp:column -->`,
        `${colPad}<div class="wp-block-column">`,
        `${innerPad}<!-- wp:image {"sizeSlug":"medium","aspectRatio":"1/1"} -->`,
        `${innerPad}<figure class="wp-block-image size-medium" style="aspect-ratio:1/1"><img src="${src}" alt="${headshot.alt}"/></figure>`,
        `${innerPad}<!-- /wp:image -->`,
        `${innerPad}<!-- wp:heading {"level":3,"fontSize":"medium"} -->`,
        `${innerPad}<h3 class="wp-block-heading has-medium-font-size">${name.value}</h3>`,
        `${innerPad}<!-- /wp:heading -->`,
        `${innerPad}<!-- wp:paragraph {"fontSize":"small","textColor":"muted"} -->`,
        `${innerPad}<p class="has-muted-color has-text-color has-small-font-size">${role.value}</p>`,
        `${innerPad}<!-- /wp:paragraph -->`,
        `${innerPad}<!-- wp:paragraph {"fontSize":"small"} -->`,
        `${innerPad}<p class="has-small-font-size">${bio.value}</p>`,
        `${innerPad}<!-- /wp:paragraph -->`,
        `${colPad}</div>`,
        `${colPad}<!-- /wp:column -->`,
      ].join("\n"),
    );
    void itemPad; // reserved for any nested forge/* expansion we add later
  }

  return [
    `${pad(ctx)}<!-- wp:columns {"align":"wide"} -->`,
    `${pad(ctx)}<div class="wp-block-columns alignwide">`,
    ...columns,
    `${pad(ctx)}</div>`,
    `${pad(ctx)}<!-- /wp:columns -->`,
  ].join("\n");
};

// ── forge/marquee-strip (compile-time expansion → bullet-joined line) ───
//
// Consumes a repeater of `{ label }` items and emits a single centered
// paragraph with labels joined by " · ". Tagged `forge-marquee` so a
// child-theme stylesheet (or a future site-editor pattern) can layer
// scroll animation on top — the markup itself is static and degrades
// gracefully without any CSS.

renderers["forge/marquee-strip"] = (block, ctx) => {
  if (typeof block.slot !== "string") {
    throw new Error(`forge/marquee-strip: expected a string slot reference`);
  }
  const r = ctx.resolutions[block.slot];
  if (!r) throw new Error(`forge/marquee-strip: slot "${block.slot}" has no resolution`);
  if (r.type !== "repeater") {
    throw new Error(`forge/marquee-strip: slot "${block.slot}" must be a repeater, got ${r.type}`);
  }
  const labels = r.items.map((item) => {
    const label = item.label;
    if (!label || label.type !== "text") {
      throw new Error(`forge/marquee-strip: each item needs a text \`label\``);
    }
    return label.value;
  });
  const joined = labels.join(" · ");
  return [
    `${pad(ctx)}<!-- wp:paragraph {"align":"center","className":"forge-marquee"} -->`,
    `${pad(ctx)}<p class="has-text-align-center forge-marquee">${joined}</p>`,
    `${pad(ctx)}<!-- /wp:paragraph -->`,
  ].join("\n");
};
