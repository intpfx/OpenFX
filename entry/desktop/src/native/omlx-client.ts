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
  onChunk: (chunk: string) => void,
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
  let callbacks = Promise.resolve();
  const calls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  const consumeLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const chunk = objectValue(JSON.parse(data));
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    const delta = objectValue(objectValue(choices[0]).delta);
    const text = stringValue(delta.content);
    if (text) {
      content += text;
      callbacks = callbacks.then(() => onDelta(text));
    }
    const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const raw of toolCalls) {
      const part = objectValue(raw);
      const index = Number.isSafeInteger(part.index) ? Number(part.index) : 0;
      const previous = calls.get(index) ?? { id: "", name: "", arguments: "" };
      const fn = objectValue(part.function);
      calls.set(index, {
        id: previous.id + stringValue(part.id),
        name: previous.name + stringValue(fn.name),
        arguments: previous.arguments + stringValue(fn.arguments),
      });
    }
  };
  const response = await requestStream({
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
    lineBuffer += chunk;
    let newline = lineBuffer.indexOf("\n");
    while (newline >= 0) {
      consumeLine(lineBuffer.slice(0, newline).replace(/\r$/, ""));
      lineBuffer = lineBuffer.slice(newline + 1);
      newline = lineBuffer.indexOf("\n");
    }
  });
  if (lineBuffer.trim()) consumeLine(lineBuffer.trim());
  await callbacks;
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
  const toolCalls = rawCalls.map((raw, index) => {
    const call = objectValue(raw);
    const fn = objectValue(call.function);
    return {
      id: stringValue(call.id) || `tool-${index + 1}`,
      name: stringValue(fn.name),
      arguments: parseArguments(fn.arguments),
    };
  }).filter((call) => call.name !== "");
  return { content: stringValue(message.content), toolCalls };
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
