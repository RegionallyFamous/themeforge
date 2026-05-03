/**
 * Pattern library loader.
 *
 * Walks `patterns/<category>/*.json`, parses each file as a `PatternDef`,
 * runs lightweight structural validation, and returns the full library
 * keyed by pattern id. The pipeline reaches into this set when planning
 * templates and resolving slot references.
 *
 * No LLM, no caching layer. The whole library is small enough to read
 * from disk on every invocation; build orchestration can hold the
 * result for the duration of a run.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PatternDef } from "../pipeline/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../..");
const DEFAULT_PATTERNS_DIR = resolve(REPO_ROOT, "patterns");

export interface LibraryEntry {
  pattern: PatternDef;
  filePath: string;
}

export type PatternLibrary = Map<string, LibraryEntry>;

export function loadPatternLibrary(patternsDir: string = DEFAULT_PATTERNS_DIR): PatternLibrary {
  const lib: PatternLibrary = new Map();
  for (const file of walkJsonFiles(patternsDir)) {
    const raw = readFileSync(file, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`pattern-library: ${file} is not valid JSON: ${(err as Error).message}`);
    }
    const pattern = assertPatternShape(parsed, file);
    if (lib.has(pattern.id)) {
      const prev = lib.get(pattern.id)!.filePath;
      throw new Error(`pattern-library: duplicate pattern id "${pattern.id}" in ${file} and ${prev}`);
    }
    lib.set(pattern.id, { pattern, filePath: file });
  }
  return lib;
}

function walkJsonFiles(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (st.isFile() && entry.endsWith(".json")) out.push(full);
    }
  }
  // Stable order so test diffs and audit output don't churn between runs.
  return out.sort();
}

/**
 * Structural validation only — confirms the keys we depend on are
 * present and well-typed enough to feed the serializer. Deep zod-level
 * validation lands in Phase 4 alongside the LLM stage schemas.
 */
function assertPatternShape(value: unknown, file: string): PatternDef {
  if (!isObject(value)) throw new Error(`${file}: pattern must be an object`);
  const required = [
    "id",
    "name",
    "category",
    "description",
    "compatible_templates",
    "compatible_moods",
    "slots",
    "theme_tokens",
    "tree",
  ] as const;
  for (const key of required) {
    if (!(key in value)) throw new Error(`${file}: missing required field "${key}"`);
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error(`${file}: \`id\` must be a non-empty string`);
  }
  if (!Array.isArray(value.tree) || value.tree.length === 0) {
    throw new Error(`${file}: \`tree\` must be a non-empty array`);
  }
  if (!isObject(value.slots)) throw new Error(`${file}: \`slots\` must be an object`);
  return value as unknown as PatternDef;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
