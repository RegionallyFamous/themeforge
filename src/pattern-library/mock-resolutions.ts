/**
 * Generate a minimal valid `SlotResolution` map for a pattern.
 *
 * Used by tests and dev tools to exercise a pattern through the
 * serializer without standing up the full pipeline. The values here are
 * deliberately bland (`[slot_id]` for text, `/slot_id` for urls) so it
 * is obvious in any rendered preview that slots haven't been customized.
 */

import type { PatternDef, SlotDef, SlotResolution } from "../pipeline/types.js";

export function mockResolutionsFor(pattern: PatternDef): Record<string, SlotResolution> {
  const out: Record<string, SlotResolution> = {};
  for (const [slotId, slotDef] of Object.entries(pattern.slots)) {
    out[slotId] = mockFor(slotId, slotDef);
  }
  return out;
}

function mockFor(slotId: string, def: SlotDef): SlotResolution {
  switch (def.type) {
    case "text":
      return { type: "text", value: `[${slotId}]` };
    case "url":
      return { type: "url", value: def.default ?? `/${slotId}` };
    case "image_role":
      return {
        type: "image_role",
        role: def.role,
        aspect: def.aspect,
        alt: `${def.role} placeholder`,
      };
    case "link":
      return { type: "link", label: `[${slotId}]`, url: `/${slotId}` };
    case "enum":
      return { type: "enum", value: def.options[0] ?? "" };
    case "repeater": {
      const min = Math.max(def.min, 1);
      const items: Array<Record<string, SlotResolution>> = [];
      for (let i = 0; i < min; i++) {
        const item: Record<string, SlotResolution> = {};
        for (const [key, itemDef] of Object.entries(def.items)) {
          item[key] = mockFor(`${slotId}[${i}].${key}`, itemDef);
        }
        items.push(item);
      }
      return { type: "repeater", items };
    }
  }
}
