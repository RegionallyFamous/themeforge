/**
 * Brand-spec form drafts.
 *
 * The form persists its in-progress state to `.forge-drafts/<slug>.json`
 * after each step so a half-completed form survives a terminal hangup,
 * an Anthropic API outage during a later stage, or just an interrupted
 * coffee break. The directory is gitignored.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BrandSpec } from "./schema.js";

export const DEFAULT_DRAFTS_DIR = ".forge-drafts";

export type DraftSpec = Partial<BrandSpec>;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "untitled";
}

export function draftPath(slug: string, dir: string = DEFAULT_DRAFTS_DIR): string {
  return join(dir, `${slug}.json`);
}

export function saveDraft(slug: string, draft: DraftSpec, dir: string = DEFAULT_DRAFTS_DIR): string {
  const path = draftPath(slug, dir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(draft, null, 2) + "\n", "utf8");
  return path;
}

export function loadDraft(slug: string, dir: string = DEFAULT_DRAFTS_DIR): DraftSpec | null {
  const path = draftPath(slug, dir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DraftSpec;
  } catch {
    // A corrupted draft is treated as no draft — better to start fresh
    // than to fail loud on something the operator can't easily inspect.
    return null;
  }
}

export function deleteDraft(slug: string, dir: string = DEFAULT_DRAFTS_DIR): void {
  const path = draftPath(slug, dir);
  if (existsSync(path)) rmSync(path);
}
