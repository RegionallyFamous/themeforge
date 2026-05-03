import { describe, it, expect } from "vitest";
import { __testing } from "./screenshots.js";

describe("screenshots — path mapping", () => {
  it("maps every brief page name to a sensible WordPress path", () => {
    const m = __testing.pathForShotPage;
    expect(m("homepage")).toBe("/");
    expect(m("archive-product")).toBe("/shop/");
    expect(m("page")).toBe("/sample-page/");
    expect(m("cart")).toBe("/cart/");
    expect(m("checkout")).toBe("/checkout/");
    expect(m("single-product")).toMatch(/post_type=product/);
  });

  it("picks viewport heights appropriate to the requested width", () => {
    expect(__testing.heightFor(1440)).toBeGreaterThanOrEqual(800);
    expect(__testing.heightFor(768)).toBeGreaterThanOrEqual(800);
    expect(__testing.heightFor(360)).toBeGreaterThanOrEqual(600);
  });
});
