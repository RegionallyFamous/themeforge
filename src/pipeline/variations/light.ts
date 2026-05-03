/**
 * "Light" variation — identity transform that simply re-asserts the
 * base theme's tokens with a friendly title. Shipping a Light variation
 * (rather than relying on the base implicitly) lets WP show "Light" as
 * a selectable option alongside the others, which reads as intentional
 * rather than as the default-with-no-name.
 */

import type { Variation } from "./types.js";

export const lightVariation: Variation = {
  slug: "light",
  title: "Light",
  apply(_base) {
    return { version: 3, title: "Light" };
  },
};
