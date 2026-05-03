/**
 * Pipeline orchestrator.
 *
 * Drives the full chain end-to-end:
 *
 *   BrandSpec
 *     → brand-interpreter         (LLM)
 *     → theme-json-generator      (LLM)  + buildThemeJson + variations
 *     → template-planner          (LLM)
 *     → pattern-customizer × N    (LLM, parallel)
 *     → serialize per template + parts
 *
 * Returns an in-memory bundle. Writing it to disk is Phase 6's bundler.
 *
 * Header is a hardcoded skeleton in this phase; Phase 9 introduces
 * header patterns. Cart, checkout, and 404 are not produced — the
 * Phase 6 bundler will scaffold those from fixed templates.
 */

import { interpretBrand } from "./brand-interpreter.js";
import { generateThemeTokens } from "./theme-json-generator.js";
import { planTemplates } from "./template-planner.js";
import { customizePattern } from "./pattern-customizer.js";
import { generateMarketing, type MarketingAssets, type VariationSlugLiteral } from "./marketing.js";
import { buildThemeJson, type ThemeJson } from "../theme-builder/theme-json.js";
import { serialize } from "../theme-builder/serializer.js";
import { ALL_VARIATIONS, type StyleVariationFile, type Variation } from "./variations/index.js";
import { brandedTitle, type VariationSlug } from "./variations/naming.js";
import type { LLM } from "./llm.js";
import type { PatternLibrary } from "../pattern-library/loader.js";
import type { BrandSpec } from "../brand-spec/schema.js";
import type {
  BlockNode,
  CustomizedPattern,
  EnrichedBrandSpec,
  TemplateId,
  TemplatePlan,
  ThemeTokens,
} from "./types.js";

// ── Public types ────────────────────────────────────────────────────────

export interface PipelineDeps {
  llm: LLM;
  library: PatternLibrary;
}

export interface PipelineRun {
  brandSpec: BrandSpec;
  enrichedSpec: EnrichedBrandSpec;
  themeTokens: ThemeTokens;
  themeJson: ThemeJson;
  variations: Map<string, StyleVariationFile>;
  plan: TemplatePlan;
  /** Customized patterns keyed by `<template>:<position>` (footer is `parts/footer`). */
  customized: Map<string, CustomizedPattern>;
  /** Serialized template markup, including header/footer template-part references. */
  templates: Partial<Record<TemplateId, string>>;
  /** Serialized template-part markup. */
  parts: { header: string; footer: string };
  /** Marketplace-listing copy assets (Phase 8). */
  marketing: MarketingAssets;
}

// ── Run ─────────────────────────────────────────────────────────────────

export async function runPipeline(spec: BrandSpec, deps: PipelineDeps): Promise<PipelineRun> {
  const { llm, library } = deps;

  // 1. Brand interpretation.
  const enrichedSpec = await interpretBrand(spec, llm);

  // 2. Theme tokens → theme.json + style variations. Each variation
  //    gets a brand-flavored title from the per-mood naming table so
  //    the customer sees collection names that read on-brand instead
  //    of "Light" / "Dark" / "Mono".
  const themeTokens = await generateThemeTokens(enrichedSpec, llm);
  const themeJson = buildThemeJson(themeTokens);
  const mood = enrichedSpec.mood.primary;
  const variations = new Map<string, StyleVariationFile>(
    ALL_VARIATIONS.map((v: Variation) => {
      const file = v.apply(themeJson);
      return [
        v.slug,
        { ...file, title: brandedTitle(mood, v.slug as VariationSlug) },
      ];
    }),
  );

  // 3. Template plan.
  const plan = await planTemplates(enrichedSpec, library, llm);

  // 4. Customize every pattern instance in parallel. Independent LLM
  //    calls — the bottleneck is wall time, not the model itself.
  const jobs: Array<{ key: string; pattern_id: string; context: { template: TemplateId; position: number } }> = [];
  for (const [tpl, instances] of Object.entries(plan.templates) as Array<[TemplateId, NonNullable<TemplatePlan["templates"][TemplateId]>]>) {
    for (const instance of instances) {
      jobs.push({
        key: `${tpl}:${instance.context.position}`,
        pattern_id: instance.pattern_id,
        context: instance.context,
      });
    }
  }
  jobs.push({
    key: "parts/footer",
    pattern_id: plan.parts.footer,
    context: { template: "page", position: 0 },
  });
  if (plan.parts.header) {
    jobs.push({
      key: "parts/header",
      pattern_id: plan.parts.header,
      context: { template: "page", position: 0 },
    });
  }

  // 4a. Marketing assets run in parallel with the customizer fan-out —
  //     they don't depend on each other and both are LLM-bound.
  const marketingDeps = {
    spec: enrichedSpec,
    plan,
    variations: [...variations.entries()].map(([slug, file]) => ({
      slug: slug as VariationSlugLiteral,
      branded_title: file.title,
    })),
  };

  // Concurrency cap on the customizer fan-out. Sonnet's default org
  // rate limit is 30k input tokens/min; each customizer call sends the
  // brand spec + a pattern definition (~2k tokens), and the planner
  // alone consumes ~6k. Serial keeps us under that ceiling without
  // relying on retries. Higher tiers can bump this for shorter wall
  // time. The Anthropic SDK auto-retries 429s with backoff, so even at
  // limit=2 things eventually finish — just slower.
  const CUSTOMIZER_CONCURRENCY = 1;

  const [customizedList, marketing] = await Promise.all([
    runWithConcurrency(jobs, CUSTOMIZER_CONCURRENCY, async (job) => {
      const entry = library.get(job.pattern_id);
      if (!entry) {
        throw new Error(`pipeline: planner picked unknown pattern "${job.pattern_id}"`);
      }
      const customized = await customizePattern(enrichedSpec, entry.pattern, job.context, llm);
      return { key: job.key, customized };
    }),
    generateMarketing(marketingDeps, llm),
  ]);
  const customized = new Map<string, CustomizedPattern>(
    customizedList.map((r) => [r.key, r.customized]),
  );

  // 5. Serialize templates and parts.
  const templates: Partial<Record<TemplateId, string>> = {};
  for (const [tpl, instances] of Object.entries(plan.templates) as Array<[TemplateId, NonNullable<TemplatePlan["templates"][TemplateId]>]>) {
    const sections: string[] = [];
    sections.push(serialize([templatePartRef("header", "header")]));
    for (const instance of instances) {
      const entry = library.get(instance.pattern_id)!;
      const c = customized.get(`${tpl}:${instance.context.position}`)!;
      sections.push(serialize(entry.pattern.tree, c.resolutions));
    }
    sections.push(serialize([templatePartRef("footer", "footer")]));
    templates[tpl] = sections.join("\n\n") + "\n";
  }

  // Header markup: prefer a planner-picked pattern; otherwise emit the
  // hardcoded skeleton (functionally identical to header-classic, kept
  // as a safety net so header is never absent).
  let headerMarkup: string;
  if (plan.parts.header) {
    const headerEntry = library.get(plan.parts.header)!;
    const headerCustomized = customized.get("parts/header")!;
    headerMarkup = serialize(headerEntry.pattern.tree, headerCustomized.resolutions) + "\n";
  } else {
    headerMarkup = serialize(headerSkeleton(), {}) + "\n";
  }
  const footerEntry = library.get(plan.parts.footer)!;
  const footerCustomized = customized.get("parts/footer")!;
  const footerMarkup = serialize(footerEntry.pattern.tree, footerCustomized.resolutions) + "\n";

  return {
    brandSpec: spec,
    enrichedSpec,
    themeTokens,
    themeJson,
    variations,
    plan,
    customized,
    templates,
    parts: { header: headerMarkup, footer: footerMarkup },
    marketing,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Run `fn` over `items` with at most `limit` concurrent in-flight calls.
 * Preserves input order in the result. Used by the customizer fan-out
 * to stay under the per-minute token rate limit on the LLM provider.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function templatePartRef(slug: string, tagName: string): BlockNode {
  return { name: "core/template-part", attrs: { slug, tagName } };
}

/**
 * Hardcoded Phase 5 header: site title left, navigation right, hairline
 * separator beneath. Matches the shape of the hand-built sample header.
 * Phase 9 introduces actual header patterns.
 */
function headerSkeleton(): BlockNode[] {
  return [
    {
      name: "core/group",
      attrs: { align: "full", tagName: "header", layout: { type: "constrained" } },
      innerBlocks: [
        {
          name: "core/group",
          attrs: {
            align: "wide",
            style: {
              spacing: {
                padding: {
                  top: "var:preset|spacing|30",
                  bottom: "var:preset|spacing|30",
                },
              },
            },
            layout: { type: "flex", justifyContent: "space-between" },
          },
          innerBlocks: [
            { name: "core/site-title", attrs: { level: 0, fontSize: "medium" } },
            {
              name: "core/navigation",
              attrs: {
                layout: { type: "flex", justifyContent: "right" },
                fontSize: "small",
              },
            },
          ],
        },
        {
          name: "core/separator",
          attrs: { opacity: "css", className: "is-style-default" },
        },
      ],
    },
  ];
}
