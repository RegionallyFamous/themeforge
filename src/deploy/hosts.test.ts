import { describe, it, expect } from "vitest";
import { HOSTS, NoHostConfiguredError, pickHost } from "./hosts.js";

describe("deploy hosts", () => {
  it("ships with the Studio adapter registered out of the box", () => {
    expect(HOSTS.studio).toBeDefined();
    expect(HOSTS.studio?.id).toBe("studio");
  });

  it("pickHost(undefined) returns the only host when one is registered", () => {
    expect(pickHost(undefined).id).toBe("studio");
  });

  it("pickHost(\"studio\") returns the studio host", () => {
    expect(pickHost("studio").id).toBe("studio");
  });

  it("pickHost(unknownId) throws a clear unknown-host error", () => {
    expect(() => pickHost("nonexistent")).toThrow(/no host with id/);
  });

  it("pickHost requires --host when more than one is registered", () => {
    HOSTS["b"] = { id: "b", name: "B", async deploy() { return { url: "" }; } };
    try {
      expect(() => pickHost(undefined)).toThrow(/pass --host/);
    } finally {
      delete HOSTS["b"];
    }
  });

  it("NoHostConfiguredError carries setup instructions when the registry is empty", () => {
    // Snapshot + clear the registry for one assertion, restore after.
    const snapshot = { ...HOSTS };
    for (const k of Object.keys(HOSTS)) delete HOSTS[k];
    try {
      expect(() => pickHost(undefined)).toThrow(NoHostConfiguredError);
      try {
        pickHost(undefined);
        expect.fail("expected pickHost to throw");
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).toContain("WordPress Playground");
        expect(msg).toContain("manifest.ts");
        expect(msg).toContain("HOSTS");
      }
    } finally {
      Object.assign(HOSTS, snapshot);
    }
  });
});
