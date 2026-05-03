import { describe, it, expect } from "vitest";
import { captureScreenshots } from "./screenshots.js";

describe("captureScreenshots (Phase 8 stub)", () => {
  it("throws a clear setup error explaining how to enable a host", async () => {
    await expect(
      captureScreenshots({
        themeZip: "/tmp/theme.zip",
        outputDir: "/tmp/screenshots",
        brief: [
          { page: "homepage", width: 1440, notes: "Hero + first product row." },
        ],
      }),
    ).rejects.toThrow(/no screenshot host is wired up/);
  });

  it("error message names the documented hosts", async () => {
    try {
      await captureScreenshots({ themeZip: "x", outputDir: "x", brief: [] });
      expect.fail("expected captureScreenshots to throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("WordPress Playground");
      expect(msg).toContain("local WordPress");
      expect(msg).toContain("screenshots-brief.md");
    }
  });
});
