/**
 * Deterministic JSON-tree → WordPress block markup serializer.
 *
 * Walks a pattern's block tree, applies slot resolutions, and emits
 * normalized block markup (1-space indent, LF line endings). The output
 * round-trips through `@wordpress/block-serialization-default-parser`.
 *
 * Per-block knowledge (which classes/styles/elements a block emits) is
 * encoded in the renderer registry below. Adding a new block type means
 * adding a renderer here.
 */

import type { BlockNode, SlotResolution } from "../pipeline/types.js";
import { renderers } from "./block-renderers.js";

export interface SerializeOptions {
  /** Indent depth (in spaces) for the top-level blocks. Default 0. */
  initialIndent?: number;
}

export function serialize(
  tree: BlockNode[],
  resolutions: Record<string, SlotResolution> = {},
  options: SerializeOptions = {},
): string {
  const ctx: RenderCtx = {
    resolutions,
    indent: options.initialIndent ?? 0,
  };
  return tree.map((b) => renderBlock(b, ctx)).join("\n");
}

// ── Internals shared with block renderers ───────────────────────────────

export interface RenderCtx {
  resolutions: Record<string, SlotResolution>;
  indent: number;
}

export type Renderer = (block: BlockNode, ctx: RenderCtx) => string;

export function renderBlock(block: BlockNode, ctx: RenderCtx): string {
  const r = renderers[block.name];
  if (!r) throw new Error(`serializer: no renderer registered for block "${block.name}"`);
  return r(block, ctx);
}

export function renderChildren(blocks: BlockNode[] | undefined, parentCtx: RenderCtx): string {
  if (!blocks || blocks.length === 0) return "";
  const childCtx: RenderCtx = { ...parentCtx, indent: parentCtx.indent + 1 };
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    // `gap: "blank"` inserts a separator before this block within its
    // sibling list. Suppressed at position 0 — leading blanks would just
    // create whitespace at the top of the parent's children.
    if (i > 0 && b.gap === "blank") out.push("");
    out.push(renderBlock(b, childCtx));
  }
  return out.join("\n");
}

export function pad(ctx: RenderCtx): string {
  return " ".repeat(ctx.indent);
}

/**
 * WordPress comment header. Empty/missing attrs render as the bare
 * `<!-- wp:NAME -->` form (no `{}`), which is what the WP block save
 * functions emit and what the parser is happy round-tripping.
 */
export function commentOpen(name: string, attrs: Record<string, unknown> | undefined): string {
  return `<!-- wp:${commentName(name)}${attrsJson(attrs)} -->`;
}

export function commentClose(name: string): string {
  return `<!-- /wp:${commentName(name)} -->`;
}

/** Self-closing comment form, e.g. `<!-- wp:site-title {"level":0} /-->`. */
export function commentVoid(name: string, attrs: Record<string, unknown> | undefined): string {
  return `<!-- wp:${commentName(name)}${attrsJson(attrs)} /-->`;
}

function commentName(name: string): string {
  return name.startsWith("core/") ? name.slice("core/".length) : name;
}

function attrsJson(attrs: Record<string, unknown> | undefined): string {
  if (!attrs || Object.keys(attrs).length === 0) return "";
  return " " + JSON.stringify(attrs);
}

export function classAttr(classes: ReadonlyArray<string | undefined | false>): string {
  const filtered = classes.filter((c): c is string => Boolean(c));
  if (filtered.length === 0) return "";
  return ` class="${filtered.join(" ")}"`;
}

export function styleAttr(decls: ReadonlyArray<string | undefined | false>): string {
  const filtered = decls.filter((d): d is string => Boolean(d));
  if (filtered.length === 0) return "";
  return ` style="${filtered.join(";")}"`;
}

/**
 * Convert a WordPress preset reference (`var:preset|category|slug`) into
 * the equivalent CSS variable. Any other string passes through unchanged.
 */
export function presetVar(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "");
  const m = /^var:preset\|([^|]+)\|(.+)$/.exec(value);
  if (!m) return value;
  return `var(--wp--preset--${m[1]}--${m[2]})`;
}

export function paddingDecls(attrs: Record<string, unknown> | undefined): string[] {
  const padding = (attrs?.style as { spacing?: { padding?: Record<string, unknown> } } | undefined)
    ?.spacing?.padding;
  if (!padding || typeof padding !== "object") return [];
  const out: string[] = [];
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const v = padding[side];
    if (v != null) out.push(`padding-${side}:${presetVar(v)}`);
  }
  return out;
}

/**
 * Resolve a `slot: "id"` reference where the slot is a text slot,
 * or a literal `content: "..."` field embedded in the pattern.
 */
export function getText(block: BlockNode, ctx: RenderCtx): string {
  const literal = (block as { content?: unknown }).content;
  if (typeof literal === "string") return literal;
  if (typeof block.slot !== "string") {
    throw new Error(`${block.name}: needs slot or content for text`);
  }
  const r = ctx.resolutions[block.slot];
  if (!r) throw new Error(`${block.name}: slot "${block.slot}" has no resolution`);
  if (r.type !== "text") {
    throw new Error(`${block.name}: slot "${block.slot}" expected text, got ${r.type}`);
  }
  return r.value;
}

/** Resolve a slot keyed under an object slot map (e.g. `{ url: "cta_url" }`). */
export function getSlotByKey(block: BlockNode, key: string, ctx: RenderCtx): SlotResolution {
  if (!block.slot || typeof block.slot === "string") {
    throw new Error(`${block.name}: expected object slot map`);
  }
  const slotId = block.slot[key];
  if (!slotId) throw new Error(`${block.name}: slot map missing key "${key}"`);
  const r = ctx.resolutions[slotId];
  if (!r) throw new Error(`${block.name}: slot "${slotId}" has no resolution`);
  return r;
}

export function getImageSlot(
  block: BlockNode,
  ctx: RenderCtx,
): { role: string; aspect: string; alt: string } {
  if (typeof block.slot !== "string") {
    throw new Error(`${block.name}: expected image_role slot`);
  }
  const r = ctx.resolutions[block.slot];
  if (!r) throw new Error(`${block.name}: slot "${block.slot}" has no resolution`);
  if (r.type !== "image_role") {
    throw new Error(`${block.name}: slot "${block.slot}" expected image_role, got ${r.type}`);
  }
  return { role: r.role, aspect: r.aspect, alt: r.alt };
}
