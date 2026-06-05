/**
 * ws-rpc — WebSocket 请求/响应模式
 *
 * from intpfx/esn (Edge Storage Node) — P2P WebSocket 中继核心模式
 *
 * 原生 WebSocket 是"发后不管"（fire-and-forget），但很多场景需要
 * 请求/响应语义：发一条消息，等一条回复。`ws-rpc` 在 WebSocket
 * 之上封装了 reply() 机制，用 randomStamp 匹配请求和响应。
 *
 * 使用方式：
 *
 * ```ts
 * import { attachRpc } from "./ws-rpc.ts";
 *
 * // 服务端：收到连接后挂载 RPC
 * Deno.serve((req) => {
 *   const { socket, response } = Deno.upgradeWebSocket(req);
 *   attachRpc(socket, {
 *     onOnline: async (msg) => { /* 节点上线处理 */ },
 *     onMessage: async (msg, reply) => {
 *       if (msg.type === "query") {
 *         const result = await someQuery(msg);
 *         return result; // 自动回复
 *       }
 *     },
 *   });
 *   return response;
 * });
 *
 * // 客户端：发起请求等待回复
 * const result = await socket.reply({ type: "query", fileName: "test.txt" });
 * ```
 *
 * @module
 */

// ── 类型定义 ──

/** WebSocket 扩展 — 加上 RPC 能力 */
export interface RpcSocket extends WebSocket {
  /** 请求/响应匹配器 map（randomStamp → resolve） */
  solver: Map<string, (value: unknown) => void>;
  /** 响应队列（FIFO） */
  queue: Promise<unknown>[];
  /** 请求/响应模式：发消息并等待回复 */
  reply: (message: Record<string, unknown>) => Promise<unknown>;
}

/** RPC 消息处理句柄 */
export interface RpcHandlers {
  /** 节点上线事件（可选） */
  onOnline?: (msg: Record<string, unknown>, socket: RpcSocket) => Promise<void>;
  /** 通用消息处理（可选）——返回值会作为 reply 发送回去 */
  onMessage?: (
    msg: Record<string, unknown>,
    socket: RpcSocket,
  ) => Promise<Record<string, unknown> | void>;
  /** 节点下线事件（可选） */
  onOffline?: (socket: RpcSocket, code: number, reason: string) => Promise<void>;
  /** 序列化（默认用 JSON.stringify） */
  serialize?: (data: Record<string, unknown>) => Promise<Uint8Array> | Uint8Array;
  /** 反序列化（默认用 JSON.parse） */
  deserialize?: (data: MessageEvent) => Promise<Record<string, unknown>>;
}

// ── 工具 ──

/** 生成随机标记用于匹配请求/响应 */
const generateStamp = (): string => Math.random().toString(36).slice(2);

// ── 核心 ──

const defaults = {
  serialize: (data: Record<string, unknown>): Uint8Array =>
    new TextEncoder().encode(JSON.stringify(data)),
  deserialize: async (event: MessageEvent): Promise<Record<string, unknown>> =>
    JSON.parse(new TextDecoder().decode(event.data)),
};

/**
 * 在 WebSocket 上挂载 RPC 能力（reply/solver/queue）
 *
 * - `socket.reply(msg)` — 发送消息并等待回复，通过 randomStamp 匹配
 * - `socket.solver` — randomStamp → resolve 的匹配表
 * - `socket.queue` — 先进先出的响应 promise 队列
 *
 * handlers.onMessage 的返回值会自动带上 randomStamp 发回对方
 */
export const attachRpc = (
  ws: WebSocket,
  handlers: RpcHandlers = {},
): RpcSocket => {
  const socket = ws as RpcSocket;
  const { serialize, deserialize, onOnline, onMessage, onOffline } = {
    ...defaults,
    ...handlers,
  };

  socket.solver = new Map();
  socket.queue = [];

  socket.reply = async (
    message: Record<string, unknown>,
  ): Promise<unknown> => {
    if (socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket 未连接");
    }

    if (!message.randomStamp) {
      const id = generateStamp();
      socket.queue.push(
        new Promise((resolve) => socket.solver.set(id, resolve)),
      );
      message.randomStamp = id;
    }

    socket.send(await serialize(message));

    if (socket.queue.length > 0) {
      return await socket.queue.shift();
    }
  };

  socket.onopen = () => {
    console.log("[ws-rpc] 连接已建立");
  };

  socket.onmessage = async (event: MessageEvent) => {
    try {
      const msg = await deserialize(event);

      // 如果有 solver 在等这个 randomStamp，先喂给 solver
      if (msg.randomStamp && socket.solver.has(msg.randomStamp as string)) {
        const resolve = socket.solver.get(msg.randomStamp as string)!;
        socket.solver.delete(msg.randomStamp as string);
        resolve(msg);
        return;
      }

      switch (msg.type) {
        case "online": {
          await onOnline?.(msg, socket);
          break;
        }
        default: {
          if (onMessage) {
            const result = await onMessage(msg, socket);
            if (result) {
              // 把 randomStamp 带回去让对方匹配
              const reply = {
                ...result,
                randomStamp: msg.randomStamp,
              };
              socket.send(await serialize(reply));
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error("[ws-rpc] 消息处理出错:", err);
    }
  };

  socket.onclose = (event: CloseEvent) => {
    console.log(`[ws-rpc] 连接关闭 code=${event.code}`);
    onOffline?.(socket, event.code, event.reason);
  };

  socket.onerror = (event: Event) => {
    console.error("[ws-rpc] 连接出错:", event);
  };

  return socket;
};
