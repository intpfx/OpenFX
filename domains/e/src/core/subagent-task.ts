import type { KvStore } from "../interfaces/kv-store.ts";
import { validateJsonSchema } from "./json-schema.ts";
import type { KernelError, SubagentTask } from "./types.ts";

export interface SubagentTaskKernelOptions {
  store: KvStore;
  now?: () => number;
  createId?: () => string;
}

export interface CreateSubagentTaskInput<TInput = unknown> {
  parentTurnId: string;
  parentAgentId: string;
  agentId: string;
  prompt: string;
  input?: TInput;
  isolation?: SubagentTask["isolation"];
  resultSchema: SubagentTask["resultSchema"];
  maxTurns?: number;
}

export class SubagentTaskKernel {
  readonly #store: KvStore;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: SubagentTaskKernelOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async create<TInput = unknown>(
    input: CreateSubagentTaskInput<TInput>,
  ): Promise<SubagentTask<TInput>> {
    const task: SubagentTask<TInput> = {
      id: this.#createId(),
      parentTurnId: input.parentTurnId,
      parentAgentId: input.parentAgentId,
      agentId: input.agentId,
      prompt: input.prompt,
      input: input.input,
      isolation: input.isolation ?? "none",
      resultSchema: input.resultSchema,
      maxTurns: input.maxTurns ?? 4,
      state: "queued",
      createdAt: this.#now(),
      updatedAt: this.#now(),
    };

    await this.#storeTask(task);
    return task;
  }

  async get(taskId: string): Promise<SubagentTask | null> {
    return await this.#store.get<SubagentTask>(subagentTaskKey(taskId));
  }

  async listForParentTurn(parentTurnId: string): Promise<SubagentTask[]> {
    const tasks: SubagentTask[] = [];
    for await (
      const entry of this.#store.list<{ taskId: string }>(
        subagentParentTurnPrefix(parentTurnId),
      )
    ) {
      const task = await this.get(entry.value.taskId);
      if (task) {
        tasks.push(task);
      }
    }
    return tasks;
  }

  async start(taskId: string): Promise<SubagentTask> {
    const task = await this.#requireTask(taskId);
    if (task.state !== "queued") {
      return task;
    }
    return await this.#storeTask({ ...task, state: "running", updatedAt: this.#now() });
  }

  async complete<TResult = unknown>(
    taskId: string,
    result: TResult,
  ): Promise<SubagentTask<unknown, TResult>> {
    const task = await this.#requireTask(taskId);
    const validation = validateJsonSchema(task.resultSchema, result);
    if (!validation.ok) {
      return await this.fail(
        taskId,
        validation.error ?? {
          code: "subagent_result_invalid",
          message: "Subagent result does not match schema.",
        },
      ) as SubagentTask<unknown, TResult>;
    }

    return await this.#storeTask({
      ...task,
      state: "completed",
      result,
      updatedAt: this.#now(),
    }) as SubagentTask<unknown, TResult>;
  }

  async fail(taskId: string, error: KernelError): Promise<SubagentTask> {
    const task = await this.#requireTask(taskId);
    return await this.#storeTask({
      ...task,
      state: "failed",
      error,
      updatedAt: this.#now(),
    });
  }

  async cancel(taskId: string, reason: string): Promise<SubagentTask> {
    const task = await this.#requireTask(taskId);
    return await this.#storeTask({
      ...task,
      state: "cancelled",
      error: { code: "subagent_task_cancelled", message: reason },
      updatedAt: this.#now(),
    });
  }

  async #requireTask(taskId: string): Promise<SubagentTask> {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Subagent task not found: ${taskId}`);
    }
    return task;
  }

  async #storeTask<TInput, TResult>(
    task: SubagentTask<TInput, TResult>,
  ): Promise<SubagentTask<TInput, TResult>> {
    await this.#store.set(subagentTaskKey(task.id), task);
    await this.#store.set(subagentParentTurnKey(task), { taskId: task.id });
    return task;
  }
}

export function subagentTaskKey(taskId: string): string {
  return `subagent:task:${taskId}`;
}

export function subagentParentTurnPrefix(parentTurnId: string): string {
  return `turn:${parentTurnId}:subagent:`;
}

export function subagentParentTurnKey(task: SubagentTask): string {
  return `${subagentParentTurnPrefix(task.parentTurnId)}${task.createdAt}:${task.id}`;
}
