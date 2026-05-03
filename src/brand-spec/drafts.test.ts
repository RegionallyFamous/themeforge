import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveDraft, loadDraft, deleteDraft, slugify, draftPath } from "./drafts.js";

describe("slugify", () => {
  it("normalizes a brand name into a kebab-case slug", () => {
    expect(slugify("Bellwether Coffee")).toBe("bellwether-coffee");
  });

  it("strips diacritics, punctuation, and collapses whitespace", () => {
    expect(slugify("Café  & Co. — Roastery!")).toBe("cafe-co-roastery");
  });

  it("falls back to 'untitled' for empty/symbol-only input", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("!!!")).toBe("untitled");
  });

  it("caps slug length at 50 chars", () => {
    expect(slugify("a".repeat(80))).toHaveLength(50);
  });
});

describe("draft persistence", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "forge-drafts-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("saveDraft writes a JSON file at the expected path", () => {
    const path = saveDraft("acme", { store: { name: "Acme", tagline: "t", description: "d", niche: "n" } }, dir);
    expect(path).toBe(draftPath("acme", dir));
    expect(existsSync(path)).toBe(true);
  });

  it("loadDraft returns the partial spec previously saved", () => {
    saveDraft("acme", { store: { name: "Acme", tagline: "t", description: "d", niche: "n" } }, dir);
    const loaded = loadDraft("acme", dir);
    expect(loaded?.store?.name).toBe("Acme");
  });

  it("loadDraft returns null when no draft exists", () => {
    expect(loadDraft("nonexistent", dir)).toBeNull();
  });

  it("loadDraft returns null on corrupt JSON instead of throwing", () => {
    const path = saveDraft("acme", {}, dir);
    // Corrupt the file
    require("node:fs").writeFileSync(path, "not json {", "utf8");
    expect(loadDraft("acme", dir)).toBeNull();
  });

  it("deleteDraft removes the file and is safe to call when missing", () => {
    saveDraft("acme", {}, dir);
    deleteDraft("acme", dir);
    expect(existsSync(draftPath("acme", dir))).toBe(false);
    // Calling again on a missing draft is a no-op, not an error.
    expect(() => deleteDraft("acme", dir)).not.toThrow();
  });

  it("save → load round-trips a multi-field draft", () => {
    const draft = {
      version: 1 as const,
      store: { name: "Bellwether", tagline: "t", description: "d", niche: "specialty coffee" },
      mood: { primary: "heritage" as const },
      voice: { formality: 3, playfulness: 2, premiumness: 4 },
    };
    saveDraft("bellwether", draft, dir);
    expect(loadDraft("bellwether", dir)).toEqual(draft);
  });
});
