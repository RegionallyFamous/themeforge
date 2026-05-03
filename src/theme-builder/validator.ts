/**
 * Round-trip validator for serialized block markup.
 *
 * Phase 1 scope: confirm that markup we emit parses cleanly through
 * `@wordpress/block-serialization-default-parser` and re-serializes back
 * to byte-identical markup. Higher-level checks (template completeness,
 * required cart/checkout blocks, token resolution, image-brief coverage)
 * land in later phases when the pipeline produces those artifacts.
 */

import { parse as parseBlocks } from "@wordpress/block-serialization-default-parser";

export interface ValidationOk {
  ok: true;
}

export interface ValidationFail {
  ok: false;
  errors: ValidationError[];
}

export type ValidationResult = ValidationOk | ValidationFail;

export interface ValidationError {
  message: string;
  path: string;
}

interface ParsedBlock {
  blockName: string | null;
  attrs: Record<string, unknown> | null;
  innerBlocks: ParsedBlock[];
  innerHTML: string;
  innerContent: Array<string | null>;
}

/**
 * Walk a parsed tree and surface any structural problems:
 *
 *  - non-whitespace freeform content (the parser's signal that a block
 *    comment was malformed or a stray closer leaked through)
 *  - missing block name on a node that *also* has children (a corrupt
 *    block boundary, not just leading whitespace)
 */
export function validateMarkup(markup: string): ValidationResult {
  const parsed = parseBlocks(markup) as ParsedBlock[];
  const errors: ValidationError[] = [];
  walk(parsed, "$", errors);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function walk(blocks: ParsedBlock[], path: string, errors: ValidationError[]): void {
  blocks.forEach((b, i) => {
    const here = `${path}[${i}]`;
    if (b.blockName === null) {
      // A null blockName means "freeform" — text outside a block comment.
      // Whitespace-only is fine (it's the gap between sibling blocks);
      // anything else is a sign the markup is malformed.
      if (b.innerHTML.trim() !== "") {
        const sample = b.innerHTML.trim().slice(0, 80);
        errors.push({ message: `freeform content outside any block: "${sample}"`, path: here });
      }
      if (b.innerBlocks.length > 0) {
        errors.push({
          message: "freeform region has nested blocks (corrupt boundary)",
          path: here,
        });
      }
      return;
    }
    walk(b.innerBlocks, `${here}.innerBlocks`, errors);
  });
}

/**
 * Strict round-trip property: parsing the markup and re-emitting it from
 * the parser's tree must yield byte-identical output. This catches any
 * normalization the serializer is doing differently from the parser's
 * understanding.
 */
export function assertRoundTrip(markup: string): ValidationResult {
  const parsed = parseBlocks(markup) as ParsedBlock[];
  const reemitted = parsed.map(emitParsed).join("");
  if (reemitted === markup) return { ok: true };
  return {
    ok: false,
    errors: [
      {
        message: `markup is not byte-stable through parse+emit (len=${markup.length} vs ${reemitted.length})`,
        path: "$",
      },
    ],
  };
}

/**
 * Emit a parsed block back to markup using the parser-provided
 * `innerContent` shape (string segments interleaved with `null` markers
 * where child blocks slot in). Mirrors what `@wordpress/blocks` does
 * internally so we don't have to pull that whole package in.
 */
function emitParsed(b: ParsedBlock): string {
  if (b.blockName === null) return b.innerHTML;

  const cmName = b.blockName.startsWith("core/") ? b.blockName.slice("core/".length) : b.blockName;
  const attrsStr =
    b.attrs && Object.keys(b.attrs).length > 0 ? " " + JSON.stringify(b.attrs) : "";

  if (b.innerBlocks.length === 0 && b.innerHTML === "") {
    return `<!-- wp:${cmName}${attrsStr} /-->`;
  }

  let childIdx = 0;
  let body = "";
  for (const part of b.innerContent) {
    if (part === null) {
      const child = b.innerBlocks[childIdx++];
      if (child) body += emitParsed(child);
    } else {
      body += part;
    }
  }
  return `<!-- wp:${cmName}${attrsStr} -->${body}<!-- /wp:${cmName} -->`;
}
