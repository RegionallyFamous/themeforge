#!/usr/bin/env node
/**
 * woo-theme-forge CLI entrypoint.
 *
 * `new` is wired up in Phase 3. `build` lands in Phase 6. Pattern
 * subcommands come online with the pattern import flow.
 *
 * See docs/roadmap.md.
 */

import { writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
// Load .env with override so a value in .env wins over an empty/stale
// ANTHROPIC_API_KEY in the parent shell (Claude Desktop sets one to "").
import { config as loadDotenv } from "dotenv";
loadDotenv({ override: true });
import { runForm } from "../brand-spec/form.js";
import { inquirerPrompter } from "../brand-spec/prompter-inquirer.js";
import {
  saveDraft,
  loadDraft,
  deleteDraft,
  slugify,
  draftPath,
} from "../brand-spec/drafts.js";
import { BrandSpecSchema } from "../brand-spec/schema.js";
import { createLLM } from "../pipeline/llm.js";
import { runPipeline } from "../pipeline/run.js";
import { loadPatternLibrary } from "../pattern-library/loader.js";
import { mockResolutionsFor } from "../pattern-library/mock-resolutions.js";
import { bundleTheme } from "../theme-builder/bundler.js";
import { serialize } from "../theme-builder/serializer.js";
import { assertRoundTrip, validateMarkup } from "../theme-builder/validator.js";
import { importPatternFromMarkup } from "../pattern-library/import.js";
import { buildDeploymentManifest } from "../deploy/manifest.js";
import { pickHost, HOSTS, NoHostConfiguredError } from "../deploy/hosts.js";
import { captureScreenshots } from "../theme-builder/screenshots.js";

const program = new Command();

program
  .name("forge")
  .description("Generate sellable WooCommerce block themes from a brand spec.")
  .version("0.1.0");

program
  .command("new")
  .description("Interactive form: produce a new brand-spec.json")
  .option("-o, --output <path>", "Where to write the spec (defaults to <slug>.brand-spec.json)")
  .option("--resume <slug>", "Resume an in-progress draft from .forge-drafts/<slug>.json")
  .action(async (opts: { output?: string; resume?: string }) => {
    const prompter = inquirerPrompter();
    let initialDraft = undefined;
    let draftSlug = opts.resume ?? null;

    if (opts.resume) {
      const loaded = loadDraft(opts.resume);
      if (!loaded) {
        console.error(chalk.red(`No draft at ${draftPath(opts.resume)}`));
        process.exitCode = 1;
        return;
      }
      initialDraft = loaded;
      console.log(chalk.dim(`Resuming draft: ${draftPath(opts.resume)}`));
    }

    const spec = await runForm(prompter, {
      initial: initialDraft,
      onProgress: (draft) => {
        // Once we have a store name we can pick a slug; before that, draft
        // saves are skipped (no good handle).
        if (!draftSlug && draft.store?.name) draftSlug = slugify(draft.store.name);
        if (draftSlug) saveDraft(draftSlug, draft);
      },
    });

    const outPath = opts.output ?? `${slugify(spec.store.name)}.brand-spec.json`;
    if (existsSync(outPath)) {
      console.error(chalk.red(`Refusing to overwrite ${outPath}; pass --output to choose a path.`));
      process.exitCode = 1;
      return;
    }
    writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n", "utf8");
    console.log(chalk.green(`✓ Wrote ${outPath}`));

    if (draftSlug) {
      deleteDraft(draftSlug);
    }
  });

program
  .command("build <brandSpecPath>")
  .description("Build a theme bundle from a brand-spec.json")
  .option("-o, --output <dir>", "Output directory", process.env.DEFAULT_OUTPUT_DIR ?? "./output")
  .option("--no-zip", "Skip producing a .zip alongside the theme directory")
  .option("--force", "Overwrite an existing theme directory at the output path")
  .option("--author <name>", "Author name written to style.css", "woo-theme-forge")
  .option("--author-uri <url>", "Author URI written to style.css")
  .option("--theme-uri <url>", "Theme URI written to style.css")
  .option("--version <semver>", "Theme version written to style.css", "1.0.0")
  .action(
    async (
      brandSpecPath: string,
      opts: {
        output: string;
        zip: boolean;
        force?: boolean;
        author: string;
        authorUri?: string;
        themeUri?: string;
        version: string;
      },
    ) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error(
          chalk.red("ANTHROPIC_API_KEY is not set. Add it to .env or export it before building."),
        );
        process.exitCode = 1;
        return;
      }

      const absSpecPath = resolvePath(brandSpecPath);
      if (!existsSync(absSpecPath)) {
        console.error(chalk.red(`Brand spec not found: ${absSpecPath}`));
        process.exitCode = 1;
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(readFileSync(absSpecPath, "utf8"));
      } catch (e) {
        console.error(chalk.red(`Failed to parse ${absSpecPath}: ${(e as Error).message}`));
        process.exitCode = 1;
        return;
      }

      const specResult = BrandSpecSchema.safeParse(parsed);
      if (!specResult.success) {
        console.error(chalk.red(`Brand spec failed validation:`));
        for (const issue of specResult.error.issues) {
          console.error(chalk.red(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`));
        }
        process.exitCode = 1;
        return;
      }
      const spec = specResult.data;

      const slug = slugify(spec.store.name);
      const llm = createLLM({});
      const library = loadPatternLibrary();

      const pipelineSpinner = ora("Running pipeline (5 LLM stages)").start();
      let run;
      try {
        run = await runPipeline(spec, { llm, library });
      } catch (e) {
        pipelineSpinner.fail("Pipeline failed");
        console.error(chalk.red((e as Error).message));
        process.exitCode = 1;
        return;
      }
      pipelineSpinner.succeed(
        `Pipeline complete (${Object.keys(run.templates).length} templates, ${run.customized.size} customized patterns)`,
      );

      const bundleSpinner = ora("Bundling theme").start();
      let result;
      try {
        result = await bundleTheme(run, library, {
          outputDir: opts.output,
          metadata: {
            name: spec.store.name,
            slug,
            description: spec.store.tagline,
            author: opts.author,
            authorUri: opts.authorUri,
            themeUri: opts.themeUri,
            version: opts.version,
            textDomain: slug,
          },
          skipZip: opts.zip === false,
          refuseOverwrite: !opts.force,
        });
      } catch (e) {
        bundleSpinner.fail("Bundling failed");
        console.error(chalk.red((e as Error).message));
        process.exitCode = 1;
        return;
      }
      bundleSpinner.succeed(`Bundle written: ${result.themeDir}`);

      console.log(chalk.green(`✓ ${result.files.length} files written`));
      console.log(chalk.green(`✓ ${result.imageRoleCount} placeholder images generated`));
      if (result.zipPath) {
        console.log(chalk.green(`✓ Zip: ${result.zipPath}`));
      }
    },
  );

const pattern = program.command("pattern").description("Pattern library tools");

pattern
  .command("check <id>")
  .description("Validate a pattern: shape, slot resolution, serialization, byte-stable round-trip")
  .action(async (id: string) => {
    const lib = loadPatternLibrary();
    const entry = lib.get(id);
    if (!entry) {
      console.error(chalk.red(`No pattern with id "${id}".`));
      console.error(chalk.dim(`Available: ${[...lib.keys()].sort().join(", ")}`));
      process.exitCode = 1;
      return;
    }

    const { pattern: p, filePath } = entry;
    console.log(chalk.dim(`File: ${filePath}`));
    console.log(chalk.dim(`Category: ${p.category}`));
    console.log(chalk.dim(`Compatible templates: ${p.compatible_templates.join(", ")}`));
    console.log(chalk.dim(`Compatible moods: ${p.compatible_moods.join(", ")}`));
    console.log(chalk.dim(`Slots (${Object.keys(p.slots).length}): ${Object.keys(p.slots).join(", ") || "(none)"}`));
    console.log("");

    const resolutions = mockResolutionsFor(p);
    let markup: string;
    try {
      markup = serialize(p.tree, resolutions);
    } catch (e) {
      console.error(chalk.red(`✗ Serialization failed: ${(e as Error).message}`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green(`✓ Serializes (${markup.split("\n").length} lines)`));

    const valid = validateMarkup(markup);
    if (!valid.ok) {
      console.error(chalk.red(`✗ Validation failed:`));
      for (const err of valid.errors) console.error(chalk.red(`    ${err.path}: ${err.message}`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green(`✓ Validates (no orphan freeform content)`));

    const round = assertRoundTrip(markup);
    if (!round.ok) {
      console.error(chalk.red(`✗ Round-trip failed:`));
      for (const err of round.errors) console.error(chalk.red(`    ${err.path}: ${err.message}`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green(`✓ Round-trips byte-for-byte`));
    console.log("");
    console.log(chalk.dim(`Visual check still required — install in WP at three breakpoints (1440 / 768 / 360).`));
  });

pattern
  .command("import <category> <id>")
  .description("Convert a pasted block-markup blob into a pattern JSON skeleton (slots stay unannotated)")
  .option("-i, --input <path>", "Read markup from a file instead of stdin")
  .option(
    "-o, --output <path>",
    "Write to this path (defaults to patterns/<category>/<id>.json)",
  )
  .action(async (category: string, id: string, opts: { input?: string; output?: string }) => {
    let markup: string;
    if (opts.input) {
      if (!existsSync(opts.input)) {
        console.error(chalk.red(`Input file not found: ${opts.input}`));
        process.exitCode = 1;
        return;
      }
      markup = readFileSync(opts.input, "utf8");
    } else {
      // Read from stdin
      markup = await readStdin();
      if (markup.trim().length === 0) {
        console.error(chalk.red(`No markup on stdin. Pipe block markup or pass --input <path>.`));
        process.exitCode = 1;
        return;
      }
    }

    let result;
    try {
      result = importPatternFromMarkup(markup, { category, id });
    } catch (e) {
      console.error(chalk.red(`Import failed: ${(e as Error).message}`));
      process.exitCode = 1;
      return;
    }

    const outPath = opts.output ?? resolvePath(`patterns/${category}/${id}.json`);
    if (existsSync(outPath)) {
      console.error(chalk.red(`Refusing to overwrite ${outPath}; pass --output to choose a different path.`));
      process.exitCode = 1;
      return;
    }
    writeFileSync(outPath, JSON.stringify(result.pattern, null, 2) + "\n", "utf8");
    console.log(chalk.green(`✓ Wrote ${outPath}`));
    console.log(chalk.dim(`Next: open the file and annotate the slots, theme_tokens, compatible_templates, and compatible_moods fields.`));
    if (result.unknownBlocks.length > 0) {
      console.log("");
      console.log(chalk.yellow(`Unknown blocks (no renderer registered) — verify before committing:`));
      for (const name of result.unknownBlocks) console.log(chalk.yellow(`  - ${name}`));
    }
  });

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

program
  .command("deploy <themeDir>")
  .description("Deploy a built theme bundle to a configured host (Phase 10)")
  .option("--host <id>", "Host adapter id (omit when only one is registered)")
  .option("--zip <path>", "Path to the .zip alongside the theme dir; auto-detected if omitted")
  .option("--target <value>", "Host-specific target (URL prefix, project id, etc.)")
  .option("--manifest-only", "Skip the deploy step and just print the deployment manifest")
  .option(
    "--screenshots [dir]",
    "After deploy, capture every shot in marketing/screenshots-brief.json. Optional dir override (default: <themeDir>/marketing/screenshots/)",
  )
  .action(
    async (
      themeDir: string,
      opts: {
        host?: string;
        zip?: string;
        target?: string;
        manifestOnly?: boolean;
        screenshots?: string | boolean;
      },
    ) => {
      const absDir = resolvePath(themeDir);

      let manifest;
      try {
        let zipPath = opts.zip ? resolvePath(opts.zip) : undefined;
        if (!zipPath) {
          // Convention: bundler writes <slug>-<version>.zip alongside the dir.
          // Try to find one matching `<themeDir-basename>-*.zip`.
          const parent = resolvePath(themeDir, "..");
          const slug = absDir.split("/").pop() ?? "";
          if (existsSync(parent)) {
            const candidates = readdirSync(parent)
              .filter((f) => f.startsWith(`${slug}-`) && f.endsWith(".zip"))
              .sort();
            if (candidates.length > 0) zipPath = resolvePath(parent, candidates[candidates.length - 1]!);
          }
        }
        manifest = buildDeploymentManifest({ themeDir: absDir, zipPath });
      } catch (e) {
        console.error(chalk.red((e as Error).message));
        process.exitCode = 1;
        return;
      }

      if (opts.manifestOnly) {
        console.log(JSON.stringify(manifest, null, 2));
        return;
      }

      const hostIds = Object.keys(HOSTS);
      if (hostIds.length === 0) {
        // No host configured — print the manifest for inspection and the
        // explanatory error so the operator knows what to do next.
        try {
          pickHost(opts.host); // throws NoHostConfiguredError
        } catch (e) {
          if (e instanceof NoHostConfiguredError) {
            console.log(chalk.dim("Manifest preview (deploy host not yet configured):\n"));
            console.log(JSON.stringify(manifest, null, 2));
            console.log("");
            console.error(chalk.red(e.message));
          } else {
            console.error(chalk.red((e as Error).message));
          }
        }
        process.exitCode = 1;
        return;
      }

      let host;
      try {
        host = pickHost(opts.host);
      } catch (e) {
        console.error(chalk.red((e as Error).message));
        process.exitCode = 1;
        return;
      }

      if (!opts.target) {
        console.error(chalk.red(`--target is required for host "${host.id}"`));
        process.exitCode = 1;
        return;
      }

      const spinner = ora(`Deploying to ${host.name}…`).start();
      let deployedUrl: string | null = null;
      try {
        const result = await host.deploy(manifest, { target: opts.target });
        deployedUrl = result.url;
        spinner.succeed(`Deployed to ${result.url}`);
        if (result.deployId) console.log(chalk.dim(`Deploy id: ${result.deployId}`));
        if (result.notes) console.log(chalk.dim(result.notes));
      } catch (e) {
        spinner.fail(`Deploy failed: ${(e as Error).message}`);
        process.exitCode = 1;
        return;
      }

      if (opts.screenshots && deployedUrl) {
        const briefPath = resolvePath(absDir, "marketing/screenshots-brief.json");
        if (!existsSync(briefPath)) {
          console.error(
            chalk.red(`--screenshots: missing ${briefPath} (was the theme built without the marketing stage?)`),
          );
          process.exitCode = 1;
          return;
        }
        const brief = JSON.parse(readFileSync(briefPath, "utf8"));
        const outputDir =
          typeof opts.screenshots === "string"
            ? resolvePath(opts.screenshots)
            : resolvePath(absDir, "marketing/screenshots");

        const shotSpinner = ora(`Capturing ${brief.length} screenshots…`).start();
        try {
          const shots = await captureScreenshots({ url: deployedUrl, outputDir, brief });
          shotSpinner.succeed(`Captured ${shots.written.length} screenshot${shots.written.length === 1 ? "" : "s"}`);
          console.log(chalk.dim(`Output: ${outputDir}`));
        } catch (e) {
          shotSpinner.fail(`Screenshot capture failed: ${(e as Error).message}`);
          process.exitCode = 1;
        }
      }
    },
  );

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
