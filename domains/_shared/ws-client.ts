/**
 * ws-client — 浏览器端 WebSocket 连接管理器
 *
 * from intpfx/esn (Edge Storage Node) — TransEngine
 *
 * 封装浏览器 WebSocket 的完整生命周期：建连、心跳保活、自动重连、
 * 就绪 promise。与 `ws-rpc` 配合使用——ws-client 管连接，ws-rpc 管通信。
 *
 * 使用方式：
 *
 * ```ts
 * import { createWsClient } from "./ws-client.ts";
 * import { attachRpc, type RpcSocket } from "./ws-rpc.ts";
 *
 * const client = createWsClient("/socket");
 * const socket = await client.ready() as RpcSocket;
 * attachRpc(socket, {
 *   onMessage: async (msg) => { /* ... */ },
 * });
 *
 * const result = await socket.reply({ type: "query", id: 1 });
 * ```
 *
 * @module
 */

// ── 类型定义 ──

export interface WsClientOptions {
  /** 心跳间隔（毫秒，默认 10s） */
  heartbeatInterval?: number;
  /** 重连间隔（毫秒，默认 5s） */
  reconnectInterval?: number;
  /** 关闭后不重连的 code 列表（默认 [1000, 1006, 4000]） */
  noReconnectCodes?: number[];
  /** 调试日志 */
  debug?: boolean;
}

export interface WsClient {
  /** 获取当前 socket（可能为 null） */
  socket: WebSocket | null;
  /** 等待连接就绪（resolve 时 socket 已 open 且已发送 online） */
  ready: () => Promise<WebSocket>;
  /** 等待首次连接完成（resolve 时已收到服务端 online 回复） */
  linked: () => Promise<void>;
  /** 主动断开连接 */
  close: () => void;
}

// ── 实现 ──

const DEFAULT_OPTIONS: WsClientOptions = {
  heartbeatInterval: 10_000,
  reconnectInterval: 5_000,
  noReconnectCodes: [1000, 1006, 4000],
  debug: false,
};

const debugLog = (opts: WsClientOptions, ...args: unknown[]) => {
  if (opts.debug) console.log("[ws-client]", ...args);
};

/**
 * 创建浏览器 WebSocket 连接管理器
 *
 * @param url - WebSocket URL（如 "/socket" 自动补全协议和 host，
 *             也可以传完整 wss:// URL）
 * @param options - 配置项
 */
export const createWsClient = (
  url: string,
  options: WsClientOptions = {},
): WsClient => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let socket: WebSocket | null = null;
  let heartbeatId: ReturnType<typeof setInterval> | null = null;
  let reconnectId: ReturnType<typeof setInterval> | null = null;
  let _resolveSocketReady: (sock: WebSocket) => void;
  let _resolveLinkReady: () => void;

  const socketReadyPromise = new Promise<WebSocket>((resolve) => {
    _resolveSocketReady = resolve;
  });
  const linkReadyPromise = new Promise<void>((resolve) => {
    _resolveLinkReady = resolve;
  });

  const isConnected = (): boolean =>
    socket !== null && socket.readyState === WebSocket.OPEN;
  const isConnecting = (): boolean =>
    socket !== null && socket.readyState === WebSocket.CONNECTING;

  const closeSocket = () => {
    if (heartbeatId !== null) {
      clearInterval(heartbeatId);
      heartbeatId = null;
    }
    if (socket) {
      try { socket.close(4000, "主动关闭"); } catch { /* ignore */ }
      socket = null;
    }
  };

  const createSocket = (): WebSocket => {
    // 清除现有重连
    if (reconnectId !== null) {
      clearInterval(reconnectId);
      reconnectId = null;
    }

    // 已连接或正在连接则不重复创建
    if (isConnected() || isConnecting()) return socket!;

    // 补全 URL
    const wsUrl = url.startsWith("ws") || url.startsWith("wss")
      ? url
      : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${url}`;

    debugLog(opts, `正在连接: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      debugLog(opts, "连接已建立");
      _resolveSocketReady(ws);

      // 启动心跳
      heartbeatId = setInterval(() => {
        if (isConnected()) {
          ws.send(JSON.stringify({ type: "heartbeat" }));
        }
      }, opts.heartbeatInterval!);

      // 发送上线消息
      ws.send(JSON.stringify({ type: "online" }));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "online") {
          debugLog(opts, `已上线，region: ${msg.region ?? "unknown"}`);
          _resolveLinkReady();
        }
      } catch {
        // 非 JSON 消息，交给 ws-rpc 层处理
      }
    };

    ws.onclose = (event: CloseEvent) => {
      debugLog(opts, `连接关闭 code=${event.code}`);
      socket = null;
      if (heartbeatId !== null) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }

      // 特定 code 不重连
      if (opts.noReconnectCodes?.includes(event.code)) {
        return;
      }

      // 自动重连
      reconnectId = setInterval(() => {
        debugLog(opts, "尝试重新连接");
        socket = createSocket();
      }, opts.reconnectInterval!);
    };

    ws.onerror = () => {
      debugLog(opts, "连接出错");
      // onclose 会紧接着触发，重连逻辑在那边处理
    };

    socket = ws;
    return ws;
  };

  // 初始建连
  createSocket();

  return {
    get socket() { return socket; },

    ready: () => socketReadyPromise,

    linked: () => linkReadyPromise,

    close: () => {
      if (reconnectId !== null) {
        clearInterval(reconnectId);
        reconnectId = null;
      }
      closeSocket();
    },
  };
};
