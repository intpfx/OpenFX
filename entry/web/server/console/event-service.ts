import { TELEMETRY_RETENTION_MS } from "../../../../domains/_shared/openfx-node/mod.ts";
import type { ConsoleStore } from "./store.ts";

const ROOT = ["openfx-console"] as const;
const EVENT_RETENTION_MS = TELEMETRY_RETENTION_MS;
const EVENT_PAGE_SIZE = 256;

export type ConsoleEventType =
  | "telemetry"
  | "agent.delta"
  | "approval.requested"
  | "approval.resolved"
  | "heartbeat";

export interface StoredConsoleEvent {
  id: number;
  type: ConsoleEventType;
  data: unknown;
  createdAt: number;
}

export interface ConsoleEventService {
  append(type: ConsoleEventType, data: unknown): Promise<StoredConsoleEvent>;
  snapshot(req: Request): Promise<Response>;
  stream(req: Request): Promise<Response>;
}

export const createConsoleEventService = (options: {
  store: Promise<ConsoleStore>;
  now: () => number;
  pollMs: number;
  requireSession: (req: Request) => Promise<Response | null>;
}): ConsoleEventService => {
  const listeners = new Set<(event: StoredConsoleEvent) => void>();

  const append = async (
    type: ConsoleEventType,
    data: unknown,
  ): Promise<StoredConsoleEvent> => {
    const store = await options.store;
    const counterKey = [...ROOT, "event-counter"] as const;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const counter = await store.get<number>(counterKey);
      const id = (counter?.value ?? 0) + 1;
      const event = {
        id,
        type,
        data,
        createdAt: options.now(),
      } satisfies StoredConsoleEvent;
      if (
        await store.atomic({
          checks: [{ key: counterKey, versionstamp: counter?.versionstamp ?? null }],
          sets: [
            { key: counterKey, value: id },
            {
              key: [...ROOT, "events", id],
              value: event,
              options: { expireIn: EVENT_RETENTION_MS },
            },
          ],
        })
      ) {
        for (const listener of listeners) listener(event);
        return event;
      }
    }
    throw new Error("event_counter_conflict");
  };

  const snapshot = async (req: Request): Promise<Response> => {
    const denied = await options.requireSession(req);
    if (denied) return denied;
    const events = await retainedEvents(
      await options.store,
      parseLastEventId(req),
      options.now(),
    );
    return new Response(
      `: keepalive\n\n${events.map(formatSseEvent).join("")}`,
      { headers: sseHeaders() },
    );
  };

  const stream = async (req: Request): Promise<Response> => {
    const denied = await options.requireSession(req);
    if (denied) return denied;
    const initialId = parseLastEventId(req);
    const backlog = await retainedEvents(await options.store, initialId, options.now());
    const encoder = new TextEncoder();
    let listener: ((event: StoredConsoleEvent) => void) | undefined;
    let keepalive: number | undefined;
    let poller: number | undefined;
    let polling = false;
    let lastSent = backlog.at(-1)?.id ?? initialId;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
        for (const event of backlog) {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        }
        listener = (event) => {
          if (event.id <= lastSent) return;
          lastSent = event.id;
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        };
        listeners.add(listener);
        poller = setInterval(async () => {
          if (polling) return;
          polling = true;
          try {
            const events = await retainedEvents(
              await options.store,
              lastSent,
              options.now(),
            );
            for (const event of events) listener?.(event);
          } catch {
            // A transient KV read failure must not terminate an established stream.
          } finally {
            polling = false;
          }
        }, options.pollMs);
        keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            cleanup();
          }
        }, 15_000);
      },
      cancel: cleanup,
    });

    function cleanup(): void {
      if (listener) listeners.delete(listener);
      if (keepalive !== undefined) clearInterval(keepalive);
      if (poller !== undefined) clearInterval(poller);
    }

    return new Response(body, { headers: sseHeaders() });
  };

  return { append, snapshot, stream };
};

export const formatSseEvent = (
  event: Pick<StoredConsoleEvent, "id" | "type" | "data">,
): string =>
  `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;

const retainedEvents = async (
  store: ConsoleStore,
  after: number,
  now: number,
): Promise<StoredConsoleEvent[]> =>
  (await store.list<StoredConsoleEvent>({
    prefix: [...ROOT, "events"],
    start: [...ROOT, "events", after + 1],
    limit: EVENT_PAGE_SIZE,
  }))
    .map((entry) => entry.value)
    .filter((event) => event.createdAt >= now - EVENT_RETENTION_MS)
    .sort((left, right) => left.id - right.id);

const parseLastEventId = (req: Request): number => {
  const value = Number(req.headers.get("last-event-id") ?? "0");
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
};

const sseHeaders = (): HeadersInit => ({
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
});
