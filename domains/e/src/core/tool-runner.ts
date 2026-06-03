import type {
  AgentDecision,
  BoundaryRequest,
  KernelError,
  ProposedAction,
  ToolExecutionRecord,
} from "./types.ts";
import { SafetyActionGate } from "./safety-action-gate.ts";

export type ToolValidationResult = { ok: true; args: unknown } | {
  ok: false;
  error: KernelError;
};

export interface ToolDefinition {
  name: string;
  validateArgs(args: unknown): ToolValidationResult;
  proposeAction?: (args: unknown) => ProposedAction | null;
  run(args: unknown): Promise<unknown>;
}

export interface ToolRunnerContext {
  now: () => number;
  createId: () => string;
  safetyGate: SafetyActionGate;
}

export interface ToolRunnerResult {
  execution: ToolExecutionRecord;
  proposedAction?: ProposedAction;
  boundaryRequest?: BoundaryRequest;
  blocked: boolean;
}

export class ToolRunner {
  readonly #tools = new Map<string, ToolDefinition>();
  readonly #context: ToolRunnerContext;

  constructor(tools: ToolDefinition[], context: ToolRunnerContext) {
    this.#context = context;
    for (const tool of tools) {
      this.#tools.set(tool.name, tool);
    }
  }

  async run(
    decision: Extract<AgentDecision, { kind: "call_tool" }>,
  ): Promise<ToolRunnerResult> {
    const execution: ToolExecutionRecord = {
      id: this.#context.createId(),
      toolName: decision.toolName,
      state: "validating",
      args: decision.args,
      startedAt: this.#context.now(),
    };

    const tool = this.#tools.get(decision.toolName);
    if (!tool) {
      execution.state = "failed";
      execution.error = {
        code: "tool_not_authorized",
        message: `Tool is not registered: ${decision.toolName}`,
      };
      execution.endedAt = this.#context.now();
      return { execution, blocked: true };
    }

    const validation = tool.validateArgs(decision.args);
    if (!validation.ok) {
      execution.state = "failed";
      execution.error = validation.error;
      execution.endedAt = this.#context.now();
      return { execution, blocked: true };
    }

    const proposedAction = tool.proposeAction?.(validation.args) ?? null;
    if (proposedAction) {
      const preparedAction = this.#context.safetyGate.prepareAction(proposedAction);
      const boundaryRequest = this.#context.safetyGate.createBoundaryRequest(
        "Tool requires approval before producing side effects.",
        preparedAction,
      );

      execution.state = "waiting_boundary";
      execution.proposedActionId = preparedAction.id;
      execution.boundaryRequestId = boundaryRequest.id;
      execution.endedAt = this.#context.now();

      return {
        execution,
        proposedAction: boundaryRequest.action,
        boundaryRequest,
        blocked: false,
      };
    }

    execution.state = "running";
    const result = await tool.run(validation.args);
    execution.state = "succeeded";
    execution.result = result;
    execution.endedAt = this.#context.now();

    return { execution, blocked: false };
  }
}
