/**
 * Shared LLM call wrapper.
 *
 * Every LLM stage in the pipeline goes through `LLM.call`. The wrapper:
 *  - pins the model
 *  - forces structured output via tool-use (the tool's input_schema is
 *    derived from the caller's zod schema)
 *  - validates the tool input through zod a second time (defense in
 *    depth — Claude's server-side validation isn't 100% strict)
 *  - on validation failure, replays the conversation with the error fed
 *    back as a `tool_result`, up to `maxRetries` times
 *  - logs every request and response to `.forge-log/<runId>/<stage>-NN.json`
 *    so a failed stage can be replayed and inspected
 *
 * No streaming. Stages return JSON; we wait for the full body.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageParam, Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  STAGE_TEMPERATURES,
  type StageId,
} from "./config.js";

// ── Public types ────────────────────────────────────────────────────────

export interface LLMConfig {
  /** Override the SDK client (mostly for tests). */
  client?: Pick<Anthropic, "messages">;
  /** Pinned model. Defaults to `DEFAULT_MODEL`. */
  model?: string;
  /** Identifies a build run for log grouping. Defaults to an ISO timestamp. */
  runId?: string;
  /** Override the log directory root. Defaults to `.forge-log`. */
  logRoot?: string;
  /** When true, skip writing logs entirely. Useful in unit tests. */
  silent?: boolean;
  /** Retries on schema validation failure. Defaults to `DEFAULT_MAX_RETRIES`. */
  maxRetries?: number;
}

export interface LLMCallOptions<T> {
  stage: StageId;
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  /** Defaults to `STAGE_TEMPERATURES[stage]`. */
  temperature?: number;
  maxTokens?: number;
  /** Tool name advertised to Claude. Defaults to `emit`. */
  toolName?: string;
  /** Tool description advertised to Claude. Defaults to a generic line. */
  toolDescription?: string;
}

export interface LLM {
  call<T>(opts: LLMCallOptions<T>): Promise<T>;
}

export class SchemaValidationError extends Error {
  constructor(message: string, public readonly issues: z.ZodIssue[]) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

// ── Factory ─────────────────────────────────────────────────────────────

export function createLLM(config: LLMConfig = {}): LLM {
  // Bump SDK-level retries from the default 2 to 5 so transient 429s
  // from rate-limit windows resolve themselves rather than failing the
  // whole pipeline. The SDK uses exponential backoff with jitter and
  // honors the `retry-after` header when present.
  const client = config.client ?? new Anthropic({ maxRetries: 5 });
  const model = config.model ?? DEFAULT_MODEL;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const runId = config.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const logRoot = config.logRoot ?? ".forge-log";
  const silent = config.silent ?? false;

  return {
    async call<T>(opts: LLMCallOptions<T>): Promise<T> {
      const temperature = opts.temperature ?? STAGE_TEMPERATURES[opts.stage];
      const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
      const toolName = opts.toolName ?? "emit";
      const toolDescription =
        opts.toolDescription ??
        `Emit the structured output for the ${opts.stage} stage.`;

      // Anthropic's tool input_schema validator requires JSON Schema
      // (draft 2020-12). The `openApi3` target produces OpenAPI-flavored
      // output (`nullable: true`, etc.) which the API rejects. The
      // default jsonSchema7 target is forward-compatible with 2020-12
      // for the primitives we use (object/array/string/number/enum).
      const inputSchema = zodToJsonSchema(opts.schema, { target: "jsonSchema7" });
      const tool: Tool = {
        name: toolName,
        description: toolDescription,
        input_schema: inputSchema as Tool["input_schema"],
      };

      const messages: MessageParam[] = [{ role: "user", content: opts.userPrompt }];
      let lastIssues: z.ZodIssue[] = [];

      // Opus 4.7+ deprecated the `temperature` parameter (the model
      // handles sampling internally). Older models (Sonnet 4.6, Haiku
      // 4.5) still accept it. Detect by id prefix and omit when needed.
      const supportsTemperature = !/^claude-opus-4-(7|[8-9]|\d{2,})/.test(model);

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const requestBody = {
          model,
          max_tokens: maxTokens,
          ...(supportsTemperature ? { temperature } : {}),
          system: opts.systemPrompt,
          tools: [tool],
          tool_choice: { type: "tool" as const, name: toolName },
          messages,
        };

        const response = (await client.messages.create(requestBody)) as Message;
        if (!silent) writeLog(logRoot, runId, opts.stage, attempt, requestBody, response);

        const toolUse = response.content.find(
          (c): c is ToolUseBlock => c.type === "tool_use" && c.name === toolName,
        );
        if (!toolUse) {
          throw new Error(
            `LLM stage "${opts.stage}" attempt ${attempt}: no \`${toolName}\` tool use in response (stop_reason=${response.stop_reason})`,
          );
        }

        const parsed = opts.schema.safeParse(toolUse.input);
        if (parsed.success) return parsed.data;

        lastIssues = parsed.error.issues;
        if (attempt === maxRetries) break;

        // Append the assistant turn (the bad tool_use) and a user turn
        // with the validation feedback, then retry.
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: formatValidationFeedback(parsed.error),
              is_error: true,
            },
          ],
        });
      }

      throw new SchemaValidationError(
        `LLM stage "${opts.stage}" failed schema validation after ${maxRetries + 1} attempts`,
        lastIssues,
      );
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatValidationFeedback(error: z.ZodError): string {
  const lines = ["Your previous tool_use input failed validation:"];
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    lines.push(`  - ${path}: ${issue.message}`);
  }
  lines.push("Re-emit the tool call with corrected input that satisfies every constraint.");
  return lines.join("\n");
}

function writeLog(
  logRoot: string,
  runId: string,
  stage: string,
  attempt: number,
  request: unknown,
  response: unknown,
): void {
  try {
    const dir = join(logRoot, runId);
    mkdirSync(dir, { recursive: true });
    const filename = join(dir, `${stage}-attempt-${String(attempt).padStart(2, "0")}.json`);
    writeFileSync(filename, JSON.stringify({ request, response }, null, 2), "utf8");
  } catch {
    // Logging failures must never block a build.
  }
}
