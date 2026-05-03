/**
 * Public registry of style variations.
 *
 * The bundler iterates `ALL_VARIATIONS` and writes one
 * `theme/styles/<slug>.json` per entry. Adding a variation = drop a new
 * file in this directory and append it here. Per the architecture
 * decision, variations are pure deterministic transforms — no LLM call.
 */

import type { Variation } from "./types.js";
import { lightVariation } from "./light.js";
import { darkVariation } from "./dark.js";
import { editorialVariation } from "./editorial.js";
import { playfulVariation } from "./playful.js";
import { monoVariation } from "./mono.js";

export type { Variation, StyleVariationFile } from "./types.js";
export {
  lightVariation,
  darkVariation,
  editorialVariation,
  playfulVariation,
  monoVariation,
};

export const ALL_VARIATIONS: Variation[] = [
  lightVariation,
  darkVariation,
  editorialVariation,
  playfulVariation,
  monoVariation,
];
