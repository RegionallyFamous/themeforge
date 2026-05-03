import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createLLM, SchemaValidationError } from "./llm.js";

/**
 * Build a fake Anthropic client that returns a sequence of canned
 * responses. Each call shifts the next response off the queue and
 * records the request body for assertions.
 */
function fakeClient(responses: Array<{ tool_use_input?: unknown; stop_reason?: string }>) {
  const calls: unknown[] = [];
  const queue = [...responses];
  return {
    calls,
    messages: {
      create: vi.fn(async (body: unknown) => {
        calls.push(body);
        const next = queue.shift();
        if (!next) throw new Error("fakeClient: ran out of canned responses");
        if (next.tool_use_input === undefined) {
          // No tool_use — simulate a model that refused or stopped early
          return {
            id: "msg_x",
            type: "message",
            role: "assistant",
            model: "claude-test",
            stop_reason: next.stop_reason ?? "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [{ type: "text", text: "I refuse." }],
          };
        }
        return {
          id: "msg_x",
          type: "message",
          role: "assistant",
          model: "claude-test",
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [
            { type: "tool_use", id: "tu_x", name: "emit", input: next.tool_use_input },
          ],
        };
      }),
    },
  } as unknown as { calls: unknown[]; messages: { create: ReturnType<typeof vi.fn> } };
}

const TokenSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  density: z.enum(["airy", "balanced", "dense"]),
});

describe("createLLM", () => {
  it("returns the parsed payload on a single successful tool_use", async () => {
    const client = fakeClient([{ tool_use_input: { primary: "#A8531E", density: "airy" } }]);
    const llm = createLLM({ client: client as never, silent: true });
    const result = await llm.call({
      stage: "theme-json-generator",
      systemPrompt: "sys",
      userPrompt: "go",
      schema: TokenSchema,
    });
    expect(result).toEqual({ primary: "#A8531E", density: "airy" });
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  it("retries with validation feedback when zod rejects the first tool_use", async () => {
    const client = fakeClient([
      { tool_use_input: { primary: "not-a-color", density: "airy" } },
      { tool_use_input: { primary: "#A8531E", density: "airy" } },
    ]);
    const llm = createLLM({ client: client as never, silent: true });
    const result = await llm.call({
      stage: "theme-json-generator",
      systemPrompt: "sys",
      userPrompt: "go",
      schema: TokenSchema,
    });
    expect(result.primary).toBe("#A8531E");
    expect(client.messages.create).toHaveBeenCalledTimes(2);

    // Second request includes the assistant's bad tool_use plus a
    // tool_result message containing the validation error.
    const secondReq = client.calls[1] as { messages: Array<{ role: string; content: unknown }> };
    expect(secondReq.messages).toHaveLength(3);
    expect(secondReq.messages[1]?.role).toBe("assistant");
    expect(secondReq.messages[2]?.role).toBe("user");
    const toolResult = (secondReq.messages[2]?.content as Array<{ type: string; content?: string; is_error?: boolean }>)[0];
    expect(toolResult?.type).toBe("tool_result");
    expect(toolResult?.is_error).toBe(true);
    expect(toolResult?.content).toMatch(/primary/);
  });

  it("throws SchemaValidationError when retries are exhausted", async () => {
    const client = fakeClient([
      { tool_use_input: { primary: "bad", density: "airy" } },
      { tool_use_input: { primary: "still-bad", density: "airy" } },
      { tool_use_input: { primary: "nope", density: "airy" } },
    ]);
    const llm = createLLM({ client: client as never, silent: true, maxRetries: 2 });
    await expect(
      llm.call({
        stage: "theme-json-generator",
        systemPrompt: "sys",
        userPrompt: "go",
        schema: TokenSchema,
      }),
    ).rejects.toThrow(SchemaValidationError);
    expect(client.messages.create).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("throws a clear error when the response contains no tool_use block", async () => {
    const client = fakeClient([{ stop_reason: "end_turn" }]);
    const llm = createLLM({ client: client as never, silent: true });
    await expect(
      llm.call({
        stage: "theme-json-generator",
        systemPrompt: "sys",
        userPrompt: "go",
        schema: TokenSchema,
      }),
    ).rejects.toThrow(/no `emit` tool use/);
  });

  it("forwards the pinned model and stage temperature to the SDK call", async () => {
    const client = fakeClient([{ tool_use_input: { primary: "#000000", density: "dense" } }]);
    const llm = createLLM({ client: client as never, silent: true, model: "claude-pinned" });
    await llm.call({
      stage: "theme-json-generator",
      systemPrompt: "sys",
      userPrompt: "go",
      schema: TokenSchema,
    });
    const req = client.calls[0] as { model: string; temperature: number; tool_choice: { name: string } };
    expect(req.model).toBe("claude-pinned");
    expect(req.temperature).toBe(0.2); // theme-json-generator default
    expect(req.tool_choice.name).toBe("emit");
  });
});
