/**
 * Test helper: a `Prompter` that returns canned answers in order.
 *
 * Each call records what was asked (message + the chosen value) so tests
 * can assert on the dialogue, not just the final draft. Calling it more
 * times than there are queued answers throws — that catches the case
 * where the form added a step the test forgot to script.
 */

import type { Prompter, SelectChoice } from "./form.js";

export type MockAnswer =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "select"; value: string }
  | { kind: "confirm"; value: boolean };

export interface MockTranscriptEntry {
  kind: MockAnswer["kind"];
  message: string;
  value: MockAnswer["value"];
  /** Whatever was passed in as the default — useful for asserting that
   *  prior steps seeded sensible defaults. */
  defaultPresented?: unknown;
  /** For select prompts: the choices the prompter was asked to render. */
  choices?: ReadonlyArray<{ name: string; value: string }>;
}

export interface MockPrompter extends Prompter {
  transcript: MockTranscriptEntry[];
  remaining(): number;
}

export function mockPrompter(answers: MockAnswer[]): MockPrompter {
  const queue = [...answers];
  const transcript: MockTranscriptEntry[] = [];

  function shift(
    expectedKind: MockAnswer["kind"],
    message: string,
    extra?: Pick<MockTranscriptEntry, "defaultPresented" | "choices">,
  ): MockAnswer {
    const next = queue.shift();
    if (!next) {
      throw new Error(
        `mockPrompter: ran out of answers at "${message}" (expected ${expectedKind})`,
      );
    }
    if (next.kind !== expectedKind) {
      throw new Error(
        `mockPrompter: at "${message}" expected ${expectedKind} answer but next queued is ${next.kind}`,
      );
    }
    transcript.push({ kind: next.kind, message, value: next.value, ...extra });
    return next;
  }

  return {
    async text(message: string, opts?: { default?: string }): Promise<string> {
      const a = shift("text", message, { defaultPresented: opts?.default });
      return a.value as string;
    },
    async number(
      message: string,
      opts: { min: number; max: number; default?: number },
    ): Promise<number> {
      const a = shift("number", message, { defaultPresented: opts.default });
      return a.value as number;
    },
    async select<T extends string>(
      message: string,
      choices: SelectChoice<T>[],
      opts?: { default?: T },
    ): Promise<T> {
      const a = shift("select", message, {
        defaultPresented: opts?.default,
        choices: choices.map((c) => ({ name: c.name, value: c.value })),
      });
      const value = a.value as T;
      if (!choices.some((c) => c.value === value)) {
        throw new Error(
          `mockPrompter: select at "${message}" answered "${value}" but choices were [${choices.map((c) => c.value).join(", ")}]`,
        );
      }
      return value;
    },
    async confirm(message: string, opts?: { default?: boolean }): Promise<boolean> {
      const a = shift("confirm", message, { defaultPresented: opts?.default });
      return a.value as boolean;
    },
    transcript,
    remaining: () => queue.length,
  };
}

// ── Convenience builders for keeping test scripts readable ──────────────

export const text = (value: string): MockAnswer => ({ kind: "text", value });
export const num = (value: number): MockAnswer => ({ kind: "number", value });
export const sel = (value: string): MockAnswer => ({ kind: "select", value });
export const yes = (): MockAnswer => ({ kind: "confirm", value: true });
export const no = (): MockAnswer => ({ kind: "confirm", value: false });
