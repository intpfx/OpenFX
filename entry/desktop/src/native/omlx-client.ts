import { AGENT_TOOLS } from "../core/agent-tools.ts";

export interface HttpJsonRequest {
  protocol: "http:" | "https:";
  hostname: string;
  port: number;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
}

export interface HttpJsonResponse {
  status: number;
  body: unknown;
}

export type JsonRequester = (
  request: HttpJsonRequest,
) => Promise<HttpJsonResponse>;

export type TextStreamRequester = (
  request: HttpJsonRequest,
  onChunk: (chunk: string) => void | Promise<void>,
) => Promise<{ status: number }>;

export interface OmlxToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface OmlxChatResult {
  content: string;
  toolCalls: OmlxToolCall[];
}

export interface OmlxClient {
  readonly tools: unknown[];
  chat(
    message: string,
    onDelta?: (delta: string) => void | Promise<void>,
  ): Promise<OmlxChatResult>;
  status(): Promise<{ online: boolean; errorMessage: string | null }>;
}

const MAX_SSE_LINE_CHARS = 64 * 1024;
const MAX_SSE_INPUT_CHARS = 1024 * 1024;
const MAX_SSE_LINES = 4096;
const MAX_SSE_FRAMES = 1024;
const MAX_CONTENT_CHARS = 256 * 1024;
const MAX_TOOL_CALLS = 32;
const MAX_TOOL_ARGUMENT_CHARS = 64 * 1024;
const MAX_TOOL_ID_CHARS = 256;
const MAX_TOOL_NAME_CHARS = 128;

const tools = AGENT_TOOLS.map((tool) => ({
  type: "function",
  function: {
    name: tool.id,
    description: tool.description,
    parameters: tool.inputSchema,
  },
}));

export const createOmlxClient = (
  requestJson: JsonRequester,
  requestStream?: TextStreamRequester,
): OmlxClient => {
  const client: OmlxClient = {
    tools,
    async chat(message, onDelta) {
      if (requestStream && onDelta) {
        return await streamChat(client.tools, message, requestStream, onDelta);
      }
      const response = await requestJson({
        protocol: "http:",
        hostname: "127.0.0.1",
        port: 8000,
        path: "/v1/chat/completions",
        method: "POST",
        body: {
          model: "local",
          messages: [{ role: "user", content: message }],
          tools: client.tools,
        },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`omlx_http_${response.status}`);
      }
      return parseChatResponse(response.body);
    },
    async status() {
      try {
        await client.chat("Reply with a short status acknowledgement.");
        return { online: true, errorMessage: null };
      } catch (error) {
        return {
          online: false,
          errorMessage: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  return client;
};

const streamChat = async (
  tools: unknown[],
  message: string,
  requestStream: TextStreamRequester,
  onDelta: (delta: string) => void | Promise<void>,
): Promise<OmlxChatResult> => {
  let lineBuffer = "";
  let content = "";
  let inputChars = 0;
  let lineCount = 0;
  let frameCount = 0;
  let streamError: Error | null = null;
  let callbackError: Error | null = null;
  let callbacks = Promise.resolve();
  const calls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  const consumeLine = (line: string): void => {
    lineCount += 1;
    if (lineCount > MAX_SSE_LINES) {
      throw new Error("omlx_sse_too_many_lines");
    }
    if (line.length > MAX_SSE_LINE_CHARS) {
      throw new Error("omlx_sse_line_too_large");
    }
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data) return;
    frameCount += 1;
    if (frameCount > MAX_SSE_FRAMES) {
      throw new Error("omlx_sse_too_many_frames");
    }
    if (data === "[DONE]") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error("omlx_sse_invalid_json");
    }
    const chunk = objectValue(parsed);
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    const delta = objectValue(objectValue(choices[0]).delta);
    const text = stringValue(delta.content);
    if (text) {
      if (content.length + text.length > MAX_CONTENT_CHARS) {
        throw new Error("omlx_content_too_large");
      }
      content += text;
      callbacks = observeRejection(
        callbacks.then(async () => {
          if (callbackError) return;
          try {
            await onDelta(text);
          } catch {
            callbackError = new Error("omlx_delta_callback_failed");
            throw callbackError;
          }
        }),
      );
    }
    const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const raw of toolCalls) {
      const part = objectValue(raw);
      const index = Number.isSafeInteger(part.index) ? Number(part.index) : 0;
      const previous = calls.get(index) ?? { id: "", name: "", arguments: "" };
      const fn = objectValue(part.function);
      const id = previous.id + stringValue(part.id);
      const name = previous.name + stringValue(fn.name);
      const argumentsText = previous.arguments + stringValue(fn.arguments);
      if (!calls.has(index) && calls.size >= MAX_TOOL_CALLS) {
        throw new Error("omlx_too_many_tool_calls");
      }
      if (id.length > MAX_TOOL_ID_CHARS) {
        throw new Error("omlx_tool_id_too_large");
      }
      if (name.length > MAX_TOOL_NAME_CHARS) {
        throw new Error("omlx_tool_name_too_large");
      }
      if (argumentsText.length > MAX_TOOL_ARGUMENT_CHARS) {
        throw new Error("omlx_tool_arguments_too_large");
      }
      calls.set(index, {
        id,
        name,
        arguments: argumentsText,
      });
    }
  };
  let response: { status: number };
  try {
    response = await requestStream({
      protocol: "http:",
      hostname: "127.0.0.1",
      port: 8000,
      path: "/v1/chat/completions",
      method: "POST",
      body: {
        model: "local",
        messages: [{ role: "user", content: message }],
        tools,
        stream: true,
      },
    }, (chunk) => {
      if (callbackError) throw callbackError;
      if (streamError) throw streamError;
      try {
        inputChars += chunk.length;
        if (inputChars > MAX_SSE_INPUT_CHARS) {
          throw new Error("omlx_sse_input_too_large");
        }
        lineBuffer += chunk;
        let lineStart = 0;
        let newline = lineBuffer.indexOf("\n", lineStart);
        while (newline >= 0) {
          consumeLine(lineBuffer.slice(lineStart, newline).replace(/\r$/, ""));
          lineStart = newline + 1;
          newline = lineBuffer.indexOf("\n", lineStart);
        }
        if (lineStart > 0) lineBuffer = lineBuffer.slice(lineStart);
        if (lineBuffer.length > MAX_SSE_LINE_CHARS) {
          throw new Error("omlx_sse_line_too_large");
        }
      } catch (error) {
        streamError = error instanceof Error ? error : new Error("omlx_sse_invalid");
        throw streamError;
      }
      return callbacks;
    });
  } catch (error) {
    if (streamError) throw streamError;
    if (callbackError) throw callbackError;
    throw error;
  }
  if (streamError) throw streamError;
  if (lineBuffer.trim()) consumeLine(lineBuffer.trim());
  await callbacks;
  if (callbackError) throw callbackError;
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`omlx_http_${response.status}`);
  }
  return {
    content,
    toolCalls: [...calls.entries()].sort(([left], [right]) => left - right).map(([
      index,
      call,
    ]) => ({
      id: call.id || `tool-${index + 1}`,
      name: call.name,
      arguments: parseArguments(call.arguments),
    })).filter((call) => call.name !== ""),
  };
};

const parseChatResponse = (value: unknown): OmlxChatResult => {
  const root = objectValue(value);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const message = objectValue(objectValue(choices[0]).message);
  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  if (rawCalls.length > MAX_TOOL_CALLS) {
    throw new Error("omlx_too_many_tool_calls");
  }
  const toolCalls = rawCalls.map((raw, index) => {
    const call = objectValue(raw);
    const fn = objectValue(call.function);
    const id = stringValue(call.id) || `tool-${index + 1}`;
    const name = stringValue(fn.name);
    if (id.length > MAX_TOOL_ID_CHARS) {
      throw new Error("omlx_tool_id_too_large");
    }
    if (name.length > MAX_TOOL_NAME_CHARS) {
      throw new Error("omlx_tool_name_too_large");
    }
    if (
      typeof fn.arguments === "string" &&
      fn.arguments.length > MAX_TOOL_ARGUMENT_CHARS
    ) {
      throw new Error("omlx_tool_arguments_too_large");
    }
    return {
      id,
      name,
      arguments: parseArguments(fn.arguments),
    };
  }).filter((call) => call.name !== "");
  const content = stringValue(message.content);
  if (content.length > MAX_CONTENT_CHARS) {
    throw new Error("omlx_content_too_large");
  }
  return { content, toolCalls };
};

const parseArguments = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return {};
  try {
    return objectValue(JSON.parse(value));
  } catch {
    return {};
  }
};

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const stringValue = (value: unknown): string => typeof value === "string" ? value : "";

const observeRejection = (promise: Promise<void>): Promise<void> => {
  promise.then(
    () => {},
    () => {},
  );
  return promise;
};
