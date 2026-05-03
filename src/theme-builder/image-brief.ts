/**
 * Walks a `PipelineRun` and produces:
 *  - a deduplicated list of every distinct (role, aspect) the theme
 *    actually uses (so the bundler knows which placeholder SVGs to
 *    write, and the validator knows what the theme references)
 *  - the IMAGE_BRIEF.md markdown the operator hands to a photographer
 */

import type { PipelineRun } from "../pipeline/run.js";
import type { CustomizedPattern, PatternDef, SlotDef } from "../pipeline/types.js";
import type { PatternLibrary } from "../pattern-library/loader.js";
import { placeholderFilename } from "./placeholders.js";

export interface ImageRoleAppearance {
  template: string;       // "templates/index.html", "parts/footer.html", etc.
  pattern_id: string;
  position: number;
  slot: string;           // slot name within the pattern
  alt: string;            // the customizer's chosen alt text
}

export interface ImageRoleUsage {
  role: string;
  aspect: string;         // "16:9"
  filename: string;       // "hero_centerpiece-16x9.svg"
  appearances: ImageRoleAppearance[];
}

export function collectImageRoles(
  run: PipelineRun,
  library: PatternLibrary,
): ImageRoleUsage[] {
  const byKey = new Map<string, ImageRoleUsage>();

  // Templates: walk every customized pattern instance.
  for (const [tpl, instances] of Object.entries(run.plan.templates)) {
    for (const instance of instances ?? []) {
      const customized = run.customized.get(`${tpl}:${instance.context.position}`);
      if (!customized) continue;
      const pattern = library.get(instance.pattern_id)?.pattern;
      if (!pattern) continue;
      ingest(
        byKey,
        pattern,
        customized,
        `templates/${tpl}.html`,
        instance.context.position,
      );
    }
  }

  // Footer template-part.
  const footerCustomized = run.customized.get("parts/footer");
  if (footerCustomized) {
    const footerPattern = library.get(run.plan.parts.footer)?.pattern;
    if (footerPattern) {
      ingest(byKey, footerPattern, footerCustomized, "parts/footer.html", 0);
    }
  }

  // Stable order: by role, then aspect.
  return [...byKey.values()].sort(
    (a, b) => a.role.localeCompare(b.role) || a.aspect.localeCompare(b.aspect),
  );
}

function ingest(
  byKey: Map<string, ImageRoleUsage>,
  pattern: PatternDef,
  customized: CustomizedPattern,
  templatePath: string,
  position: number,
): void {
  for (const [slotId, def] of Object.entries(pattern.slots)) {
    walkSlot(def, slotId, customized.resolutions[slotId], (role, aspect, alt, slotPath) => {
      const key = `${role}::${aspect}`;
      let usage = byKey.get(key);
      if (!usage) {
        usage = { role, aspect, filename: placeholderFilename(role, aspect), appearances: [] };
        byKey.set(key, usage);
      }
      usage.appearances.push({
        template: templatePath,
        pattern_id: pattern.id,
        position,
        slot: slotPath,
        alt,
      });
    });
  }
}

/**
 * Recurse through a slot definition + resolution pair, calling `emit`
 * for every image_role found (including those inside repeaters).
 */
function walkSlot(
  def: SlotDef,
  slotPath: string,
  res: unknown,
  emit: (role: string, aspect: string, alt: string, slotPath: string) => void,
): void {
  if (def.type === "image_role" && isImageResolution(res)) {
    emit(res.role, res.aspect, res.alt, slotPath);
    return;
  }
  if (def.type === "repeater" && isRepeaterResolution(res)) {
    res.items.forEach((item, i) => {
      for (const [k, sub] of Object.entries(def.items)) {
        walkSlot(sub, `${slotPath}[${i}].${k}`, item[k], emit);
      }
    });
  }
}

function isImageResolution(v: unknown): v is { role: string; aspect: string; alt: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { type?: string }).type === "image_role" &&
    typeof (v as { role?: unknown }).role === "string" &&
    typeof (v as { aspect?: unknown }).aspect === "string" &&
    typeof (v as { alt?: unknown }).alt === "string"
  );
}

function isRepeaterResolution(v: unknown): v is { items: Array<Record<string, unknown>> } {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { type?: string }).type === "repeater" &&
    Array.isArray((v as { items?: unknown }).items)
  );
}

// ── Markdown ────────────────────────────────────────────────────────────

export function renderImageBrief(
  usages: ImageRoleUsage[],
  themeName: string,
): string {
  const lines: string[] = [];
  lines.push(`# Image brief — ${themeName}`);
  lines.push("");
  lines.push(
    "This theme ships with placeholder SVGs at `assets/placeholders/`. Replace each with a real image at the same path before launch — the file name and aspect ratio determine where it appears.",
  );
  lines.push("");
  lines.push(`Total distinct images to source: **${usages.length}**`);
  lines.push("");

  if (usages.length === 0) {
    lines.push("_(No image roles in use — every image slot was either unused or resolved to a non-placeholder URL.)_");
    lines.push("");
    return lines.join("\n");
  }

  for (const u of usages) {
    lines.push(`## \`${u.role}\` — ${u.aspect}`);
    lines.push("");
    lines.push(`File: \`assets/placeholders/${u.filename}\``);
    lines.push("");
    lines.push("Appearances:");
    for (const a of u.appearances) {
      lines.push(`- \`${a.template}\` · ${a.pattern_id} · slot \`${a.slot}\` (position ${a.position})`);
    }
    lines.push("");
    // Use the first appearance's alt as the suggested content brief —
    // the customizer wrote it for that specific context.
    const first = u.appearances[0];
    if (first) {
      lines.push(`Suggested content: ${first.alt}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
