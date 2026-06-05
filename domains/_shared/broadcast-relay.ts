/**
 * broadcast-relay — BroadcastChannel 跨区域消息中继
 *
 * from intpfx/esn (Edge Storage Node) — 分布式 P2P 中继的核心路由层
 *
 * Deno Deploy 在全球多个 region 运行，同一 BroadcastChannel 名称的实例
 * 会在同一 region 内共享，但不同 region 之间隔离。这个模块利用
 * BroadcastChannel 做 region 间的消息路由——消息携带 `targetRegion`，
 * 只有目标 region 的实例才处理。
 *
 * 与 `ws-rpc` 配合使用：不同 region 的 WebSocket 连接可以通过 relay
 * 透明地通信，就像在同一台机器上一样。
 *
 * 使用方式：
 *
 * ```ts
 * import { createRelay } from "./broadcast-relay.ts";
 *
 * const region = Deno.env.get("DENO_REGION") || "local";
 * const relay = createRelay("MyApp", region);
 *
 * // 注册消息处理器
 * relay.on("query", async (msg, reply) => {
 *   const result = await processQuery(msg);
 *   await reply(result);
 * });
 *
 * // 向指定 region 发送消息并等待回复
 * const result = await relay.send("us-west2", { type: "query", id: 123 });
 * ```
 *
 * @module
 */

// ── 类型定义 ──

/** 中继消息体 */
export interface RelayMessage {
  type: string;
  targetRegion: string;
  sourceRegion: string;
  randomStamp?: string;
  [key: string]: unknown;
}

/** 消息处理器 */
type MessageHandler = (
  msg: RelayMessage,
  /** 向来源 region 发送回复 */
  reply: (data: Record<string, unknown>) => void,
) => Promise<void> | void;

/** 中继实例 */
export interface Relay {
  /** 向指定 region 发送消息，可选等待回复 */
  send: (targetRegion: string, msg: Omit<RelayMessage, "targetRegion" | "sourceRegion">) => Promise<Record<string, unknown> | void>;
  /** 注册特定 type 的处理器 */
  on: (type: string, handler: MessageHandler) => void;
  /** 注销处理器 */
  off: (type: string) => void;
  /** 关闭 BroadcastChannel */
  close: () => void;
}

// ── 实现 ──

const generateStamp = (): string => Math.random().toString(36).slice(2);

/**
 * 创建一个跨 region 消息中继
 *
 * @param channelName - BroadcastChannel 名称（同一应用内统一）
 * @param localRegion - 当前实例的 region 标识（如 Deno.env.get("DENO_REGION")）
 */
export const createRelay = (
  channelName: string,
  localRegion: string,
): Relay => {
  const bus = new BroadcastChannel(channelName);
  const handlers = new Map<string, MessageHandler>();
  const solver = new Map<string, (data: Record<string, unknown>) => void>();

  bus.onmessage = (event: MessageEvent<RelayMessage>) => {
    const msg = event.data;

    // 只处理发给当前 region 的消息
    if (msg.targetRegion !== localRegion) return;

    // 如果有 solver 在等这个 randomStamp，喂给它
    if (msg.randomStamp && solver.has(msg.randomStamp)) {
      const resolve = solver.get(msg.randomStamp)!;
      solver.delete(msg.randomStamp);
      resolve(msg);
      return;
    }

    // 查找对应的 type 处理器
    const handler = handlers.get(msg.type);
    if (!handler) {
      console.warn(`[broadcast-relay] 未知消息类型: ${msg.type}`);
      return;
    }

    // 提供一个 reply 函数，向来源 region 回消息
    const reply = (data: Record<string, unknown>) => {
      bus.postMessage({
        ...data,
        type: `${msg.type}_done`,
        targetRegion: msg.sourceRegion,
        sourceRegion: localRegion,
        randomStamp: msg.randomStamp,
      });
    };

    handler(msg, reply);
  };

  const relay: Relay = {
    send: async (targetRegion, msg): Promise<Record<string, unknown> | void> => {
      // 如果目标就是当前 region，直接用 handler 处理（无需经过 BroadcastChannel）
      if (targetRegion === localRegion) {
        const handler = handlers.get(msg.type as string);
        if (handler) {
          let resolved: Record<string, unknown> | undefined;
          await handler(
            { ...msg, targetRegion, sourceRegion: localRegion } as RelayMessage,
            (data) => { resolved = data; },
          );
          return resolved;
        }
        return;
      }

      // 跨 region：通过 BroadcastChannel 发送，等待回复
      const id = generateStamp();
      return new Promise<Record<string, unknown>>((resolve) => {
        solver.set(id, resolve);
        bus.postMessage({
          ...msg,
          targetRegion,
          sourceRegion: localRegion,
          randomStamp: id,
        } as RelayMessage);
      });
    },

    on: (type, handler) => {
      handlers.set(type, handler);
    },

    off: (type) => {
      handlers.set(type, () => {}); // 空操作而不是删除，避免 handler 为 undefined
    },

    close: () => {
      bus.close();
      handlers.clear();
      solver.clear();
    },
  };

  return relay;
};
