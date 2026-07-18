import type { AuditEvent } from "../../../../domains/_shared/openfx-node/types.ts";

export interface AuditStorage {
  appendLine(line: string): Promise<void>;
  readText(): Promise<string>;
}

export interface AuditLog {
  append(
    event:
      & Omit<AuditEvent, "id" | "createdAt">
      & Partial<Pick<AuditEvent, "id" | "createdAt">>,
  ): Promise<AuditEvent>;
  list(limit?: number): Promise<AuditEvent[]>;
}

export interface AuditLogOptions {
  now?: () => number;
  createId?: () => string;
}

export const createAuditLog = (
  storage: AuditStorage,
  options: AuditLogOptions = {},
): AuditLog => {
  const now = options.now ?? Date.now;
  let sequence = 0;
  const createId = options.createId ?? (() => `audit-${now()}-${++sequence}`);
  return {
    async append(input) {
      const event: AuditEvent = {
        ...input,
        id: input.id ?? createId(),
        createdAt: input.createdAt ?? now(),
      };
      await storage.appendLine(`${JSON.stringify(event)}\n`);
      return event;
    },
    async list(limit = 1_000) {
      const events: AuditEvent[] = [];
      for (const line of (await storage.readText()).split("\n")) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as AuditEvent;
          if (
            event && typeof event.id === "string" &&
            typeof event.createdAt === "number"
          ) events.push(event);
        } catch {
          // A partial final line from an interrupted append is ignored.
        }
      }
      return events.slice(-Math.max(0, limit));
    },
  };
};
