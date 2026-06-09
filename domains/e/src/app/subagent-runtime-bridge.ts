import type {
  CreateSubagentTaskInput,
  SubagentTaskKernel,
} from "../core/subagent-task.ts";
import type {
  EventRecord,
  KernelError,
  SubagentTask,
  TurnRecord,
} from "../core/types.ts";

export interface SubagentRuntimeContext {
  allowedTools: string[];
  inheritedContext?: unknown;
}

export interface SubagentRuntimeAdapter {
  run(task: SubagentTask, context: SubagentRuntimeContext): Promise<unknown>;
}

export interface RunSubagentTaskInput<TInput = unknown>
  extends CreateSubagentTaskInput<TInput> {
  allowedTools?: string[];
  inheritedContext?: unknown;
  turnRecord?: TurnRecord;
}

export interface SubagentRuntimeBridgeOptions {
  subagents: SubagentTaskKernel;
  adapter: SubagentRuntimeAdapter;
  now?: () => number;
  createId?: () => string;
}

export interface SubagentRuntimeBridgeResult<TResult = unknown> {
  task: SubagentTask<unknown, TResult>;
  allowedTools: string[];
  output?: TResult;
  error?: KernelError;
  turnRecord?: TurnRecord;
}

export class SubagentRuntimeBridge {
  readonly #subagents: SubagentTaskKernel;
  readonly #adapter: SubagentRuntimeAdapter;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: SubagentRuntimeBridgeOptions) {
    this.#subagents = options.subagents;
    this.#adapter = options.adapter;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async run<TInput = unknown, TResult = unknown>(
    input: RunSubagentTaskInput<TInput>,
  ): Promise<SubagentRuntimeBridgeResult<TResult>> {
    const allowedTools = input.allowedTools ?? [];
    let turnRecord = input.turnRecord;

    const created = await this.#subagents.create(input);
    turnRecord = maybeRecordSubagentRuntimeEvent(
      turnRecord,
      "subagent:task_created",
      created,
      this.#createId,
      this.#now,
    );

    const running = await this.#subagents.start(created.id);
    turnRecord = maybeRecordSubagentRuntimeEvent(
      turnRecord,
      "subagent:task_started",
      running,
      this.#createId,
      this.#now,
    );

    try {
      const output = await this.#adapter.run(running, {
        allowedTools,
        inheritedContext: input.inheritedContext,
      }) as TResult;
      const completed = await this.#subagents.complete<TResult>(running.id, output);
      const terminalEvent = completed.state === "completed"
        ? "subagent:task_completed"
        : "subagent:task_failed";
      turnRecord = maybeRecordSubagentRuntimeEvent(
        turnRecord,
        terminalEvent,
        completed,
        this.#createId,
        this.#now,
      );

      if (completed.state === "completed") {
        return {
          task: completed,
          allowedTools,
          output: completed.result,
          turnRecord,
        };
      }

      return {
        task: completed,
        allowedTools,
        error: completed.error ?? {
          code: "subagent_result_invalid",
          message: "Subagent result did not satisfy its schema.",
        },
        turnRecord,
      };
    } catch (error) {
      const failed = await this.#subagents.fail(running.id, toKernelError(error));
      turnRecord = maybeRecordSubagentRuntimeEvent(
        turnRecord,
        "subagent:task_failed",
        failed,
        this.#createId,
        this.#now,
      );
      return {
        task: failed as SubagentTask<unknown, TResult>,
        allowedTools,
        error: failed.error,
        turnRecord,
      };
    }
  }
}

export function recordSubagentRuntimeEvent(
  record: TurnRecord,
  type:
    | "subagent:task_created"
    | "subagent:task_started"
    | "subagent:task_completed"
    | "subagent:task_failed",
  task: SubagentTask,
  createId: () => string = crypto.randomUUID,
  now: () => number = Date.now,
): TurnRecord {
  const event: EventRecord = {
    id: createId(),
    type,
    at: now(),
    payload: task,
  };
  return { ...record, events: [...record.events, event] };
}

export function toKernelError(error: unknown): KernelError {
  if (isKernelError(error)) {
    return error;
  }
  return {
    code: "subagent_runtime_error",
    message: error instanceof Error ? error.message : String(error),
  };
}

function maybeRecordSubagentRuntimeEvent(
  record: TurnRecord | undefined,
  type:
    | "subagent:task_created"
    | "subagent:task_started"
    | "subagent:task_completed"
    | "subagent:task_failed",
  task: SubagentTask,
  createId: () => string,
  now: () => number,
): TurnRecord | undefined {
  if (!record) return undefined;
  return recordSubagentRuntimeEvent(record, type, task, createId, now);
}

function isKernelError(value: unknown): value is KernelError {
  return typeof value === "object" && value !== null &&
    typeof (value as KernelError).code === "string" &&
    typeof (value as KernelError).message === "string";
}
