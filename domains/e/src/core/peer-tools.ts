import type { CancellationToken } from "./types.ts";
import type { PeerCommunicationKernel } from "./peer-communication.ts";
import type { ToolDefinition } from "./tool-runner.ts";

export interface PeerToolOptions {
  peers: PeerCommunicationKernel;
  cancellation: CancellationToken;
  defaultAwaitTimeoutMs?: number;
}

export function createPeerTools(options: PeerToolOptions): ToolDefinition[] {
  return [
    {
      name: "peer_list",
      validateArgs(args) {
        return Object.keys(asRecord(args)).length === 0 ? { ok: true, args: {} } : {
          ok: false,
          error: { code: "invalid_tool_args", message: "peer_list takes no args." },
        };
      },
      run() {
        return options.peers.list();
      },
    },
    {
      name: "peer_send",
      validateArgs(args) {
        const record = asRecord(args);
        return typeof record.senderAgentId === "string" &&
            typeof record.targetAgentId === "string"
          ? { ok: true, args: record }
          : {
            ok: false,
            error: {
              code: "invalid_tool_args",
              message: "peer_send requires senderAgentId and targetAgentId.",
            },
          };
      },
      run(args) {
        const record = args as Record<string, unknown>;
        return options.peers.send({
          senderAgentId: record.senderAgentId as string,
          targetAgentId: record.targetAgentId as string,
          body: record.body,
          conversationId: typeof record.conversationId === "string"
            ? record.conversationId
            : undefined,
          ttlMs: typeof record.ttlMs === "number" ? record.ttlMs : undefined,
          maxHops: typeof record.maxHops === "number" ? record.maxHops : undefined,
        });
      },
    },
    {
      name: "peer_get",
      validateArgs(args) {
        const record = asRecord(args);
        return typeof record.messageId === "string" ? { ok: true, args: record } : {
          ok: false,
          error: {
            code: "invalid_tool_args",
            message: "peer_get.messageId is required.",
          },
        };
      },
      run(args) {
        return options.peers.get((args as Record<string, string>).messageId);
      },
    },
    {
      name: "peer_await",
      validateArgs(args) {
        const record = asRecord(args);
        return typeof record.messageId === "string" ? { ok: true, args: record } : {
          ok: false,
          error: {
            code: "invalid_tool_args",
            message: "peer_await.messageId is required.",
          },
        };
      },
      run(args) {
        const record = args as Record<string, unknown>;
        return options.peers.awaitMessage(record.messageId as string, {
          timeoutMs: typeof record.timeoutMs === "number"
            ? record.timeoutMs
            : options.defaultAwaitTimeoutMs ?? 30_000,
          cancellation: options.cancellation,
        });
      },
    },
  ];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
