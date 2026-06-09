import type { JsonSchema, KernelError, SubagentTask } from "../core/types.ts";
import type {
  RunSubagentTaskInput,
  SubagentRuntimeBridge,
} from "./subagent-runtime-bridge.ts";

export interface CollaborationStep {
  agentId: string;
  task: string;
  context?: string;
  resultSchema?: JsonSchema;
  allowedTools?: string[];
  maxTurns?: number;
}

export interface CollaborationStepResult<TResult = unknown> {
  agentId: string;
  taskId: string;
  role: "worker" | "creator" | "reviewer";
  state: SubagentTask["state"];
  output: string;
  result?: TResult;
  error?: KernelError;
  elapsedMs: number;
}

export interface CollaborationRecipeRunnerOptions {
  bridge: SubagentRuntimeBridge;
  now?: () => number;
}

export interface SequentialRunInput {
  parentTurnId: string;
  parentAgentId: string;
  steps: CollaborationStep[];
}

export interface ParallelRunInput {
  parentTurnId: string;
  parentAgentId: string;
  agentIds: string[];
  task: string;
  perAgentContext?: Record<string, string>;
  resultSchema?: JsonSchema;
  allowedTools?: string[];
}

export interface CriticReviewInput {
  parentTurnId: string;
  parentAgentId: string;
  creatorAgentId: string;
  reviewerAgentId: string;
  task: string;
  reviewCriteria?: string;
  maxRounds?: number;
  creatorAllowedTools?: string[];
  reviewerAllowedTools?: string[];
}

export interface SequentialRunResult {
  kind: "sequential";
  steps: CollaborationStepResult[];
  finalOutput: string;
}

export interface ParallelRunResult {
  kind: "parallel";
  steps: CollaborationStepResult[];
  finalOutput: string;
  errors: KernelError[];
}

export interface CriticReviewResult {
  kind: "critic_review";
  steps: CollaborationStepResult[];
  approved: boolean;
  rounds: number;
  finalDraft: string;
  reviewerFeedback: string[];
}

export interface TextResult {
  output: string;
  [key: string]: unknown;
}

export interface ReviewResult extends TextResult {
  approved: boolean;
  feedback?: string;
}

export class CollaborationRecipeRunner {
  readonly #bridge: SubagentRuntimeBridge;
  readonly #now: () => number;

  constructor(options: CollaborationRecipeRunnerOptions) {
    this.#bridge = options.bridge;
    this.#now = options.now ?? Date.now;
  }

  async sequential(input: SequentialRunInput): Promise<SequentialRunResult> {
    if (input.steps.length < 2) {
      throw new Error("sequential requires at least two collaboration steps.");
    }

    const results: CollaborationStepResult[] = [];
    let previousOutput = "";

    for (const [index, step] of input.steps.entries()) {
      const result = await this.#runTextStep({
        parentTurnId: input.parentTurnId,
        parentAgentId: input.parentAgentId,
        agentId: step.agentId,
        prompt: buildSequentialPrompt(step, index, previousOutput),
        input: { task: step.task, context: step.context, previousOutput },
        resultSchema: step.resultSchema ?? textResultSchema(),
        maxTurns: step.maxTurns,
        allowedTools: step.allowedTools,
        role: "worker",
      });
      results.push(result);
      if (result.state !== "completed") break;
      previousOutput = result.output;
    }

    return { kind: "sequential", steps: results, finalOutput: previousOutput };
  }

  async parallel(input: ParallelRunInput): Promise<ParallelRunResult> {
    if (input.agentIds.length < 2) {
      throw new Error("parallel requires at least two agent ids.");
    }

    const steps = await Promise.all(input.agentIds.map((agentId) =>
      this.#runTextStep({
        parentTurnId: input.parentTurnId,
        parentAgentId: input.parentAgentId,
        agentId,
        prompt: buildParallelPrompt(
          input.task,
          input.perAgentContext?.[agentId],
        ),
        input: { task: input.task, context: input.perAgentContext?.[agentId] },
        resultSchema: input.resultSchema ?? textResultSchema(),
        allowedTools: input.allowedTools,
        role: "worker",
      })
    ));

    return {
      kind: "parallel",
      steps,
      finalOutput: steps
        .filter((step) => step.state === "completed")
        .map((step) => step.output)
        .join("\n\n"),
      errors: steps.flatMap((step) => step.error ? [step.error] : []),
    };
  }

  async criticReview(input: CriticReviewInput): Promise<CriticReviewResult> {
    const maxRounds = Math.max(1, Math.min(input.maxRounds ?? 3, 8));
    const steps: CollaborationStepResult[] = [];
    const reviewerFeedback: string[] = [];

    const draft = await this.#runTextStep({
      parentTurnId: input.parentTurnId,
      parentAgentId: input.parentAgentId,
      agentId: input.creatorAgentId,
      prompt: input.task,
      input: { task: input.task },
      resultSchema: textResultSchema(),
      allowedTools: input.creatorAllowedTools,
      role: "creator",
    });
    steps.push(draft);
    if (draft.state !== "completed") {
      return {
        kind: "critic_review",
        steps,
        approved: false,
        rounds: 0,
        finalDraft: draft.output,
        reviewerFeedback,
      };
    }

    let currentDraft = draft.output;
    let approved = false;
    let rounds = 0;

    for (rounds = 1; rounds <= maxRounds; rounds++) {
      const review = await this.#runTextStep<ReviewResult>({
        parentTurnId: input.parentTurnId,
        parentAgentId: input.parentAgentId,
        agentId: input.reviewerAgentId,
        prompt: buildReviewPrompt(input.task, currentDraft, input.reviewCriteria),
        input: { task: input.task, draft: currentDraft },
        resultSchema: reviewResultSchema(),
        allowedTools: input.reviewerAllowedTools ?? [],
        role: "reviewer",
      });
      steps.push(review);

      const reviewResult = asRecord(review.result);
      const feedback = typeof reviewResult?.feedback === "string"
        ? reviewResult.feedback
        : review.output;
      reviewerFeedback.push(feedback);
      approved = reviewResult?.approved === true ||
        /^approved\b/i.test(review.output.trim());
      if (approved || review.state !== "completed") break;

      const revised = await this.#runTextStep({
        parentTurnId: input.parentTurnId,
        parentAgentId: input.parentAgentId,
        agentId: input.creatorAgentId,
        prompt: buildRevisionPrompt(input.task, currentDraft, feedback),
        input: { task: input.task, draft: currentDraft, feedback },
        resultSchema: textResultSchema(),
        allowedTools: input.creatorAllowedTools,
        role: "creator",
      });
      steps.push(revised);
      if (revised.state !== "completed") break;
      currentDraft = revised.output;
    }

    return {
      kind: "critic_review",
      steps,
      approved,
      rounds,
      finalDraft: currentDraft,
      reviewerFeedback,
    };
  }

  async #runTextStep<TResult = TextResult>(
    input: RunSubagentTaskInput & { role: CollaborationStepResult["role"] },
  ): Promise<CollaborationStepResult<TResult>> {
    const startedAt = this.#now();
    const result = await this.#bridge.run<unknown, TResult>(input);
    const endedAt = this.#now();
    const output = extractOutput(result.output ?? result.task.result);

    return {
      agentId: input.agentId,
      taskId: result.task.id,
      role: input.role,
      state: result.task.state,
      output,
      result: result.output,
      error: result.error ?? result.task.error,
      elapsedMs: endedAt - startedAt,
    };
  }
}

export function textResultSchema(): JsonSchema {
  return { type: "object", required: ["output"] };
}

export function reviewResultSchema(): JsonSchema {
  return { type: "object", required: ["output", "approved"] };
}

function buildSequentialPrompt(
  step: CollaborationStep,
  index: number,
  previousOutput: string,
): string {
  return [
    `Task: ${step.task}`,
    step.context ? `Context:\n${step.context}` : "",
    index > 0 && previousOutput
      ? `Previous step output:\n${previousOutput.slice(0, 4000)}`
      : "",
    "Return a JSON object with an output string.",
  ].filter(Boolean).join("\n\n");
}

function buildParallelPrompt(task: string, context?: string): string {
  return [
    `Task: ${task}`,
    context ? `Focus:\n${context}` : "",
    "Work from your assigned perspective and return a JSON object with an output string.",
  ].filter(Boolean).join("\n\n");
}

function buildReviewPrompt(
  task: string,
  draft: string,
  criteria?: string,
): string {
  return [
    "Review this draft strictly.",
    `Original task:\n${task}`,
    criteria ? `Review criteria:\n${criteria}` : "",
    `Draft:\n${draft.slice(0, 8000)}`,
    "Return JSON with output, approved, and optional feedback.",
  ].filter(Boolean).join("\n\n");
}

function buildRevisionPrompt(
  task: string,
  draft: string,
  feedback: string,
): string {
  return [
    `Original task:\n${task}`,
    `Current draft:\n${draft.slice(0, 8000)}`,
    `Reviewer feedback:\n${feedback}`,
    "Revise the draft and return JSON with an output string.",
  ].join("\n\n");
}

function extractOutput(result: unknown): string {
  if (typeof result === "string") return result;
  if (isRecord(result) && typeof result.output === "string") return result.output;
  return result === undefined ? "" : JSON.stringify(result);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
