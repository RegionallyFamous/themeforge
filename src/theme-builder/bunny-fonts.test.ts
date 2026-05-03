import { describe, it, expect } from "vitest";
import { fontFaceForFamily, primaryFamilyName, __testing } from "./bunny-fonts.js";

describe("primaryFamilyName", () => {
  it("returns the first family in a CSS font stack", () => {
    expect(primaryFamilyName("Inter, system-ui, sans-serif")).toBe("Inter");
    expect(primaryFamilyName("Fraunces, 'Iowan Old Style', serif")).toBe("Fraunces");
  });

  it("strips quotes around quoted family names", () => {
    expect(primaryFamilyName('"DM Sans", sans-serif')).toBe("DM Sans");
    expect(primaryFamilyName("'EB Garamond', serif")).toBe("EB Garamond");
  });
});

describe("fontFaceForFamily", () => {
  const family = (fontFamily: string) => ({
    name: primaryFamilyName(fontFamily),
    slug: "body" as const,
    fontFamily,
  });

  it("returns Bunny Fonts URLs for known free families", () => {
    const faces = fontFaceForFamily(family("Inter, system-ui, sans-serif"));
    expect(faces).toBeDefined();
    expect(faces!.length).toBeGreaterThan(0);
    for (const f of faces!) {
      expect(f.fontFamily).toBe("Inter");
      expect(f.src[0]).toMatch(/^https:\/\/fonts\.bunny\.net\/inter\/files\/inter-latin-\d+-(normal|italic)\.woff2$/);
    }
  });

  it("emits both normal and italic styles per weight (default 400/500/700)", () => {
    const faces = fontFaceForFamily(family("Fraunces, serif"))!;
    expect(faces.map((f) => `${f.fontWeight}-${f.fontStyle}`).sort()).toEqual(
      ["400-italic", "400-normal", "500-italic", "500-normal", "700-italic", "700-normal"].sort(),
    );
  });

  it("returns undefined when no family in the stack is in the Bunny lookup", () => {
    expect(fontFaceForFamily(family("Söhne, sans-serif"))).toBeUndefined();
    expect(fontFaceForFamily(family("Helvetica Now, Helvetica, Arial, sans-serif"))).toBeUndefined();
  });

  it("walks the stack and loads the first known free family — even when the primary is commercial", () => {
    // The LLM commonly outputs `<commercial>, <free fallback>, sans-serif`
    // — this is what makes typography actually load when an operator
    // asked for Söhne/GT America/etc.
    const faces = fontFaceForFamily(
      family("Söhne, 'Work Sans', Inter, ui-sans-serif, system-ui, sans-serif"),
    )!;
    expect(faces).toBeDefined();
    expect(faces[0]!.fontFamily).toBe("Work Sans");
    expect(faces[0]!.src[0]).toContain("/work-sans/files/work-sans-latin-");
  });

  it("ignores generic family keywords when walking the stack", () => {
    // `system-ui`, `serif`, `sans-serif`, `Helvetica`, etc. are not
    // loadable @font-face. Only real registered families get picked.
    const faces = fontFaceForFamily(
      family("system-ui, Helvetica, Inter, sans-serif"),
    )!;
    expect(faces[0]!.fontFamily).toBe("Inter");
  });

  it("respects a custom weight list", () => {
    const faces = fontFaceForFamily(family("Inter, sans-serif"), ["400"])!;
    expect(faces).toHaveLength(2); // normal + italic for one weight
  });

  it("uses kebab-cased Bunny slugs even when family name has spaces", () => {
    const faces = fontFaceForFamily(family("DM Sans, sans-serif"))!;
    expect(faces[0]!.src[0]).toContain("/dm-sans/files/dm-sans-latin-");
  });

  it("BUNNY_SLUGS table only contains lowercase keys (case-insensitive lookup contract)", () => {
    for (const key of Object.keys(__testing.BUNNY_SLUGS)) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});
