import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node-vibrant before importing the wrapper. Real extraction runs
// against a libvips/jimp-backed image pipeline that's slow and not the
// thing we're trying to verify here — we want to know our ordering and
// dedupe logic is correct.
vi.mock("node-vibrant", () => {
  return {
    default: {
      from: vi.fn(),
    },
  };
});

import Vibrant from "node-vibrant";
import { extractPaletteFromLogo } from "./logo-extract.js";

const mockedFrom = (Vibrant as unknown as { from: ReturnType<typeof vi.fn> }).from;

function withPalette(palette: Record<string, { hex: string } | null>) {
  mockedFrom.mockReturnValue({
    getPalette: () => Promise.resolve(palette),
  });
}

describe("extractPaletteFromLogo", () => {
  beforeEach(() => {
    mockedFrom.mockReset();
  });

  it("emits hexes in DarkVibrant → LightMuted → DarkMuted → Vibrant → LightVibrant order", async () => {
    withPalette({
      DarkVibrant:  { hex: "#AA0000" },
      LightMuted:   { hex: "#EEEEEE" },
      DarkMuted:    { hex: "#444444" },
      Vibrant:      { hex: "#FF0000" },
      LightVibrant: { hex: "#FF9999" },
      Muted:        { hex: "#888888" },
    });
    const result = await extractPaletteFromLogo("/tmp/whatever.png");
    expect(result.palette).toEqual(["#aa0000", "#eeeeee", "#444444", "#ff0000", "#ff9999"]);
  });

  it("dedupes identical swatches across categories", async () => {
    withPalette({
      DarkVibrant:  { hex: "#FF0000" },
      LightMuted:   { hex: "#EEEEEE" },
      DarkMuted:    { hex: "#FF0000" }, // duplicate of DarkVibrant
      Vibrant:      { hex: "#FF0000" }, // duplicate again
      LightVibrant: { hex: "#FFAAAA" },
      Muted:        null,
    });
    const result = await extractPaletteFromLogo("/tmp/whatever.png");
    expect(result.palette).toEqual(["#ff0000", "#eeeeee", "#ffaaaa"]);
  });

  it("skips null swatches without breaking", async () => {
    withPalette({
      DarkVibrant:  { hex: "#222222" },
      LightMuted:   null,
      DarkMuted:    null,
      Vibrant:      { hex: "#999999" },
      LightVibrant: null,
      Muted:        null,
    });
    const result = await extractPaletteFromLogo("/tmp/whatever.png");
    expect(result.palette).toEqual(["#222222", "#999999"]);
  });

  it("never returns more than 5 colors even when all six swatches are unique", async () => {
    withPalette({
      DarkVibrant:  { hex: "#111111" },
      LightMuted:   { hex: "#222222" },
      DarkMuted:    { hex: "#333333" },
      Vibrant:      { hex: "#444444" },
      LightVibrant: { hex: "#555555" },
      Muted:        { hex: "#666666" },
    });
    const result = await extractPaletteFromLogo("/tmp/whatever.png");
    expect(result.palette).toHaveLength(5);
    expect(result.palette).not.toContain("#666666");
  });
});
