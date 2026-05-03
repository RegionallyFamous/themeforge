/**
 * Concrete `Prompter` implementation backed by `@inquirer/prompts`.
 *
 * Only the CLI imports this — keeps tests free of the (heavyweight,
 * ESM-only, terminal-dependent) inquirer surface.
 */

import { input, select, confirm, number } from "@inquirer/prompts";
import type { Prompter, SelectChoice } from "./form.js";

export function inquirerPrompter(): Prompter {
  return {
    async text(message, opts) {
      return input({
        message,
        default: opts?.default,
        validate: opts?.validate ? (v: string) => opts.validate!(v) : undefined,
      });
    },

    async number(message, opts) {
      const result = await number({
        message,
        default: opts.default,
        min: opts.min,
        max: opts.max,
        required: true,
        step: 1,
      });
      // `required: true` guarantees a number; the union type is just the
      // generic interface for the optional-by-default case.
      if (typeof result !== "number") {
        throw new Error(`expected a number, got ${result}`);
      }
      return result;
    },

    async select<T extends string>(
      message: string,
      choices: SelectChoice<T>[],
      opts?: { default?: T },
    ): Promise<T> {
      return select<T>({
        message,
        choices: choices.map((c) => ({
          name: c.name,
          value: c.value,
          description: c.description,
        })),
        default: opts?.default,
      });
    },

    async confirm(message, opts) {
      return confirm({ message, default: opts?.default });
    },
  };
}
