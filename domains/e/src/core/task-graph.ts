import type { KvStore } from "../interfaces/kv-store.ts";
import type {
  AgentTask,
  AgentWorkOrder,
  ArtifactKind,
  KernelError,
  TaskPriority,
  TaskStatus,
  VerificationCommand,
} from "./types.ts";

export interface TaskGraphKernelOptions {
  store: KvStore;
  now?: () => number;
  createId?: () => string;
}

export interface CreateAgentTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assignedAgentIds?: string[];
  parentTaskId?: string;
  dependsOnTaskIds?: string[];
  projectId?: string;
  branchName?: string;
}

export interface AgentTaskFilter {
  status?: TaskStatus;
  assignedAgentId?: string;
  projectId?: string;
  limit?: number;
}

export interface CreateAgentWorkOrderInput {
  taskId: string;
  assignedAgentId: string;
  goal?: string;
  allowedPaths: string[];
  forbiddenActions?: string[];
  requiredArtifacts: ArtifactKind[];
  successCriteria: string[];
  verificationCommands?: VerificationCommand[];
  maxTurns?: number;
  fallbackPlan: string;
}

export class TaskGraphKernel {
  readonly #store: KvStore;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: TaskGraphKernelOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async create(input: CreateAgentTaskInput): Promise<AgentTask> {
    const now = this.#now();
    const task: AgentTask = {
      id: this.#createId(),
      title: requiredText(input.title, "title"),
      description: input.description?.trim() ?? "",
      status: "proposed",
      priority: input.priority ?? "medium",
      assignedAgentIds: input.assignedAgentIds ?? [],
      parentTaskId: input.parentTaskId,
      dependsOnTaskIds: input.dependsOnTaskIds ?? [],
      progress: 0,
      projectId: input.projectId,
      branchName: input.branchName,
      createdAt: now,
      updatedAt: now,
    };

    await this.#storeTask(task);
    return task;
  }

  async get(taskId: string): Promise<AgentTask | null> {
    return await this.#store.get<AgentTask>(agentTaskKey(taskId));
  }

  async list(filter: AgentTaskFilter = {}): Promise<AgentTask[]> {
    const tasks: AgentTask[] = [];
    for await (const entry of this.#store.list<AgentTask>(agentTaskPrefix())) {
      const task = entry.value;
      if (filter.status && task.status !== filter.status) continue;
      if (filter.projectId && task.projectId !== filter.projectId) continue;
      if (
        filter.assignedAgentId &&
        !task.assignedAgentIds.includes(filter.assignedAgentId)
      ) {
        continue;
      }
      tasks.push(task);
    }

    tasks.sort((left, right) =>
      right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)
    );
    return typeof filter.limit === "number" ? tasks.slice(0, filter.limit) : tasks;
  }

  async updateStatus(taskId: string, status: TaskStatus): Promise<AgentTask> {
    const task = await this.#requireTask(taskId);
    const validation = validateTaskTransition(task.status, status);
    if (!validation.ok) {
      throw new Error(validation.error.message);
    }

    const updated = {
      ...task,
      status,
      progress: statusProgress(status, task.progress),
      updatedAt: this.#now(),
    };
    await this.#storeTask(updated);
    return updated;
  }

  async assign(taskId: string, agentIds: string[]): Promise<AgentTask> {
    const task = await this.#requireTask(taskId);
    const updated = {
      ...task,
      assignedAgentIds: [...new Set(agentIds.filter((id) => id.trim().length > 0))],
      updatedAt: this.#now(),
    };
    await this.#storeTask(updated);
    return updated;
  }

  async detectReadyTasks(tasks?: AgentTask[]): Promise<AgentTask[]> {
    const candidates = tasks ?? await this.list();
    const byId = new Map(candidates.map((task) => [task.id, task]));
    return candidates
      .filter((task) => task.status === "proposed")
      .filter((task) =>
        task.dependsOnTaskIds.every((dependencyId) =>
          byId.get(dependencyId)?.status === "done"
        )
      )
      .sort((left, right) =>
        priorityRank(right.priority) - priorityRank(left.priority)
      );
  }

  async createWorkOrder(input: CreateAgentWorkOrderInput): Promise<AgentWorkOrder> {
    const task = await this.#requireTask(input.taskId);
    const workOrder: AgentWorkOrder = {
      id: this.#createId(),
      taskId: task.id,
      assignedAgentId: requiredText(input.assignedAgentId, "assignedAgentId"),
      goal: requiredText(input.goal ?? defaultWorkOrderGoal(task), "goal"),
      allowedPaths: input.allowedPaths,
      forbiddenActions: input.forbiddenActions ?? [],
      requiredArtifacts: input.requiredArtifacts,
      successCriteria: input.successCriteria,
      verificationCommands: input.verificationCommands ?? [],
      maxTurns: input.maxTurns ?? 4,
      fallbackPlan: input.fallbackPlan,
      createdAt: this.#now(),
    };

    const validation = validateAgentWorkOrder(workOrder);
    if (!validation.ok) {
      throw new Error(validation.error.message);
    }

    await this.#store.set(agentWorkOrderKey(workOrder.id), workOrder);
    await this.#store.set(taskWorkOrderKey(workOrder), { workOrderId: workOrder.id });
    return workOrder;
  }

  async listWorkOrders(taskId: string): Promise<AgentWorkOrder[]> {
    const workOrders: AgentWorkOrder[] = [];
    for await (
      const entry of this.#store.list<{ workOrderId: string }>(
        taskWorkOrderPrefix(taskId),
      )
    ) {
      const workOrder = await this.#store.get<AgentWorkOrder>(
        agentWorkOrderKey(entry.value.workOrderId),
      );
      if (workOrder) workOrders.push(workOrder);
    }
    return workOrders.sort((left, right) => left.createdAt - right.createdAt);
  }

  async #requireTask(taskId: string): Promise<AgentTask> {
    const task = await this.get(taskId);
    if (!task) throw new Error(`AgentTask not found: ${taskId}`);
    return task;
  }

  async #storeTask(task: AgentTask): Promise<void> {
    await this.#store.set(agentTaskKey(task.id), task);
  }
}

export function validateTaskTransition(
  from: TaskStatus,
  to: TaskStatus,
): { ok: true } | { ok: false; error: KernelError } {
  if (from === to) return { ok: true };
  const allowed = new Set<string>([
    "proposed->ready",
    "ready->running",
    "running->waiting_human",
    "running->blocked",
    "running->review",
    "running->failed",
    "waiting_human->running",
    "waiting_human->blocked",
    "waiting_human->cancelled",
    "blocked->ready",
    "review->done",
    "review->running",
    "failed->ready",
  ]);

  if (allowed.has(`${from}->${to}`)) return { ok: true };
  return {
    ok: false,
    error: {
      code: "invalid_task_transition",
      message: `Invalid task transition: ${from} -> ${to}`,
    },
  };
}

export function validateAgentWorkOrder(
  workOrder: AgentWorkOrder,
): { ok: true } | { ok: false; error: KernelError } {
  const textFields: Array<[string, string]> = [
    ["taskId", workOrder.taskId],
    ["assignedAgentId", workOrder.assignedAgentId],
    ["goal", workOrder.goal],
    ["fallbackPlan", workOrder.fallbackPlan],
  ];
  for (const [field, value] of textFields) {
    if (value.trim().length === 0) return invalidWorkOrder(field, "must not be empty");
  }
  if (workOrder.allowedPaths.length === 0) {
    return invalidWorkOrder("allowedPaths", "must contain at least one path");
  }
  if (workOrder.allowedPaths.some((path) => !isWorkspaceRelativePath(path))) {
    return invalidWorkOrder(
      "allowedPaths",
      "paths must be relative and cannot escape workspace",
    );
  }
  if (workOrder.requiredArtifacts.length === 0) {
    return invalidWorkOrder(
      "requiredArtifacts",
      "must contain at least one artifact kind",
    );
  }
  if (
    workOrder.successCriteria.length === 0 || workOrder.successCriteria.some(isBlank)
  ) {
    return invalidWorkOrder("successCriteria", "must contain non-empty criteria");
  }
  if (workOrder.maxTurns < 1) {
    return invalidWorkOrder("maxTurns", "must be greater than zero");
  }
  for (const command of workOrder.verificationCommands) {
    if (!isWorkspaceRelativePath(command.cwd)) {
      return invalidWorkOrder("verificationCommands.cwd", "must be workspace-relative");
    }
    if (command.program.trim().length === 0) {
      return invalidWorkOrder("verificationCommands.program", "must not be empty");
    }
  }
  return { ok: true };
}

export function agentTaskPrefix(): string {
  return "agent:task:record:";
}

export function agentTaskKey(taskId: string): string {
  return `${agentTaskPrefix()}${taskId}`;
}

export function agentWorkOrderKey(workOrderId: string): string {
  return `agent:work_order:record:${workOrderId}`;
}

export function taskWorkOrderPrefix(taskId: string): string {
  return `agent:task:${taskId}:work_order:`;
}

export function taskWorkOrderKey(workOrder: AgentWorkOrder): string {
  return `${
    taskWorkOrderPrefix(workOrder.taskId)
  }${workOrder.createdAt}:${workOrder.id}`;
}

function requiredText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${field} must not be empty.`);
  return trimmed;
}

function defaultWorkOrderGoal(task: AgentTask): string {
  return task.description.trim().length > 0
    ? `${task.title}: ${task.description}`
    : task.title;
}

function invalidWorkOrder(
  field: string,
  reason: string,
): { ok: false; error: KernelError } {
  return {
    ok: false,
    error: {
      code: "invalid_work_order",
      message: `Invalid work order ${field}: ${reason}`,
    },
  };
}

function isWorkspaceRelativePath(path: string): boolean {
  const trimmed = path.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(trimmed)) return false;
  return !trimmed.split(/[\\/]+/).includes("..");
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function priorityRank(priority: TaskPriority): number {
  return ({ low: 0, medium: 1, high: 2, critical: 3 })[priority];
}

function statusProgress(status: TaskStatus, current: number): number {
  if (status === "done") return 100;
  if (status === "review") return Math.max(current, 80);
  if (status === "running") return Math.max(current, 10);
  return current;
}
