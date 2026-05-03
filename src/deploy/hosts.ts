/**
 * Phase 10 deploy hosts.
 *
 * Defines the `DeployHost` interface and registers built-in adapters.
 * The default registration is the Studio adapter (Automattic's local-WP
 * app) — see `studio.ts`. Add another host by dropping an adapter file
 * alongside this one, importing it below, and adding it to `HOSTS`.
 */

import type { DeploymentManifest } from "./manifest.js";
import { createStudioHost } from "./studio.js";

export interface DeployTarget {
  /** Host-specific destination identifier (URL prefix, project id, etc.). */
  target: string;
  /** Anything else the host needs at deploy time (credentials, region, ...). */
  config?: Record<string, unknown>;
}

export interface DeployResult {
  /** Public URL of the deployed preview. */
  url: string;
  /** Host-specific deployment id, useful for teardown / inspection. */
  deployId?: string;
  /** Anything the host wants to surface back to the operator. */
  notes?: string;
}

export interface DeployHost {
  id: string;
  /** Human-readable name for CLI listings. */
  name: string;
  deploy(manifest: DeploymentManifest, target: DeployTarget): Promise<DeployResult>;
}

/**
 * Built-in host registry. The Studio adapter ships out of the box;
 * other adapters (WP Playground, Kinsta API, WP Engine API) drop in
 * here as they're implemented.
 */
export const HOSTS: Record<string, DeployHost> = {
  studio: createStudioHost(),
};

export class NoHostConfiguredError extends Error {
  constructor() {
    super(
      [
        "deploy: no host adapter is wired up.",
        "",
        "Phase 10 of the roadmap leaves the host choice to you. Two paths the",
        "roadmap considers:",
        "",
        "  1. WordPress Playground (browser WASM) hosted on Cloudflare Pages.",
        "     Static, cheap, no MySQL. Good fit for marketing previews.",
        "  2. A managed WP host (Kinsta / WP Engine) automated via their API.",
        "     Real WP, supports plugins / dynamic content. Costs more.",
        "",
        "To enable: add a `DeployHost` adapter under `src/deploy/`, import it in",
        "`hosts.ts`, and register it in the `HOSTS` map. The deploy CLI will",
        "pick it up automatically.",
        "",
        "The deployment manifest (see `src/deploy/manifest.ts`) is the contract",
        "every host adapter consumes — start there.",
      ].join("\n"),
    );
    this.name = "NoHostConfiguredError";
  }
}

/**
 * Resolve a host by id, throwing `NoHostConfiguredError` when nothing
 * is registered. Wraps the lookup so callers get the helpful setup
 * message rather than a vague undefined-host error.
 */
export function pickHost(hostId: string | undefined): DeployHost {
  const ids = Object.keys(HOSTS);
  if (ids.length === 0) throw new NoHostConfiguredError();

  if (!hostId) {
    if (ids.length === 1) return HOSTS[ids[0]!]!;
    throw new Error(
      `deploy: more than one host registered, pass --host <id>. Available: ${ids.join(", ")}`,
    );
  }
  const host = HOSTS[hostId];
  if (!host) {
    throw new Error(`deploy: no host with id "${hostId}". Registered: ${ids.join(", ")}`);
  }
  return host;
}
