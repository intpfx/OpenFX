import type { BoundaryRequest } from "../../../../domains/e/src/core/types.ts";
import type { ApprovalRequestRepository } from "./agent-runtime.ts";

export interface JsonStringPersistence {
  read(): Promise<string | null>;
  compareAndSet(expected: string | null, next: string): Promise<boolean>;
}

interface StoredRequests {
  version: 1;
  requests: BoundaryRequest[];
}

export class PersistentApprovalRequestRepository implements ApprovalRequestRepository {
  readonly #persistence: JsonStringPersistence;

  constructor(persistence: JsonStringPersistence) {
    this.#persistence = persistence;
  }

  async get(id: string): Promise<BoundaryRequest | null> {
    const request = parseRequests(await this.#persistence.read()).requests.find(
      (item) => item.id === id,
    );
    return request ? clone(request) : null;
  }

  async list(): Promise<BoundaryRequest[]> {
    return parseRequests(await this.#persistence.read()).requests
      .slice()
      .sort((left, right) => left.createdAt - right.createdAt)
      .map(clone);
  }

  async save(request: BoundaryRequest): Promise<void> {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const raw = await this.#persistence.read();
      const state = parseRequests(raw);
      const index = state.requests.findIndex((item) => item.id === request.id);
      const requests = index < 0
        ? [...state.requests, clone(request)]
        : state.requests.map((item, itemIndex) =>
          itemIndex === index ? clone(request) : item
        );
      if (
        await this.#persistence.compareAndSet(
          raw,
          JSON.stringify({ version: 1, requests }),
        )
      ) return;
    }
    throw new Error("approval_request_store_conflict");
  }
}

const parseRequests = (raw: string | null): StoredRequests => {
  if (raw === null || raw === "") return { version: 1, requests: [] };
  const parsed = JSON.parse(raw) as StoredRequests;
  if (parsed.version !== 1 || !Array.isArray(parsed.requests)) {
    throw new Error("approval_request_store_invalid");
  }
  return parsed;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
