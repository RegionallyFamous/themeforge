import { describe, it, expect } from "vitest";
import { HOSTS, NoHostConfiguredError, pickHost } from "./hosts.js";

describe("deploy hosts (Phase 10 stub)", () => {
  it("ships with no hosts registered by default — operator picks one", () => {
    expect(Object.keys(HOSTS)).toHaveLength(0);
  });

  it("pickHost throws NoHostConfiguredError with setup instructions when nothing is registered", () => {
    expect(() => pickHost(undefined)).toThrow(NoHostConfiguredError);
    try {
      pickHost(undefined);
      expect.fail("expected pickHost to throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("WordPress Playground");
      expect(msg).toContain("Kinsta");
      expect(msg).toContain("manifest.ts");
      expect(msg).toContain("HOSTS");
    }
  });

  it("pickHost(unknownId) throws a clear unknown-host error when hosts exist", () => {
    // Temporarily register a host for this test.
    HOSTS["test"] = {
      id: "test",
      name: "Test",
      async deploy() {
        return { url: "https://test.example.com" };
      },
    };
    try {
      expect(() => pickHost("nonexistent")).toThrow(/no host with id/);
      // Single registered host is auto-picked when host id omitted.
      expect(pickHost(undefined).id).toBe("test");
      expect(pickHost("test").id).toBe("test");
    } finally {
      delete HOSTS["test"];
    }
  });

  it("pickHost requires --host when more than one is registered", () => {
    HOSTS["a"] = { id: "a", name: "A", async deploy() { return { url: "" }; } };
    HOSTS["b"] = { id: "b", name: "B", async deploy() { return { url: "" }; } };
    try {
      expect(() => pickHost(undefined)).toThrow(/pass --host/);
    } finally {
      delete HOSTS["a"];
      delete HOSTS["b"];
    }
  });
});
