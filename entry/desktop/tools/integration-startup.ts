export interface StartupMessageReadOptions {
  timeoutMs: number;
  quietIntervalMs?: number;
  onMessage(message: Record<string, unknown>): void;
}

type ReadOutcome =
  | { kind: "read"; result: ReadableStreamReadResult<Uint8Array> }
  | { kind: "quiet" };

export const readStartupMessages = async (
  stream: ReadableStream<Uint8Array>,
  options: StartupMessageReadOptions,
): Promise<Record<string, unknown> | null> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const quietIntervalMs = Math.max(1, options.quietIntervalMs ?? 1_000);
  const deadline = Date.now() + options.timeoutMs;
  let buffer = "";
  let timedOut = false;
  let pendingRead = reader.read();
  try {
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        timedOut = true;
        return null;
      }
      const outcome = await readOrQuiet(
        pendingRead,
        Math.min(quietIntervalMs, remainingMs),
      );
      if (outcome.kind === "quiet") continue;
      if (outcome.result.done) return null;
      buffer += decoder.decode(outcome.result.value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          const parsed: unknown = JSON.parse(line);
          const message = objectValue(parsed);
          options.onMessage(message);
          if (message.phase === "ready" || message.ok === true) return message;
        }
        newline = buffer.indexOf("\n");
      }
      pendingRead = reader.read();
    }
  } finally {
    if (timedOut) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};

const readOrQuiet = (
  read: Promise<ReadableStreamReadResult<Uint8Array>>,
  quietMs: number,
): Promise<ReadOutcome> =>
  Promise.race([
    read.then((result): ReadOutcome => ({ kind: "read", result })),
    new Promise<ReadOutcome>((resolve) =>
      setTimeout(() => resolve({ kind: "quiet" }), quietMs)
    ),
  ]);

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
