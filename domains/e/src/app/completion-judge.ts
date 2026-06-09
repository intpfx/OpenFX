import type { Artifact, JsonSchema, KernelError, SubagentTask } from "../core/types.ts";
import type { ArtifactKernel } from "../core/artifact.ts";
import type { SubagentRuntimeBridge } from "./subagent-runtime-bridge.ts";

export type CompletionJudgeVerdict = "done" | "continue";
export type CompletionJudgeUnavailableStrategy = "fail_closed" | "fail_open";
export type CompletionScoreDimension =
  | "accuracy"
  | "completeness"
  | "consistency"
  | "format";

export type CompletionJudgeScores = Partial<Record<CompletionScoreDimension, number>>;

export interface CompletionJudgeDecision {
  verdict: CompletionJudgeVerdict;
  reason: string;
  scores?: CompletionJudgeScores;
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
}

export interface CompletionJudgeInput {
  parentTurnId: string;
  executorAgentId: string;
  judgeAgentId: string;
  goal: string;
  doneCriteria: string[];
  verifyCommand: string;
  evidence: string;
  taskId?: string;
  unavailableStrategy?: CompletionJudgeUnavailableStrategy;
}

export interface CompletionJudgeResult {
  verdict: CompletionJudgeVerdict;
  reason: string;
  scores: CompletionJudgeScores;
  task?: SubagentTask;
  artifact?: Artifact;
  error?: KernelError;
  failOpen: boolean;
}

export interface CompletionJudgeOptions {
  bridge: SubagentRuntimeBridge;
  artifacts?: ArtifactKernel;
}

export class CompletionJudge {
  readonly #bridge: SubagentRuntimeBridge;
  readonly #artifacts?: ArtifactKernel;

  constructor(options: CompletionJudgeOptions) {
    this.#bridge = options.bridge;
    this.#artifacts = options.artifacts;
  }

  async judge(input: CompletionJudgeInput): Promise<CompletionJudgeResult> {
    if (!hasVerifiableEvidence(input.evidence)) {
      return {
        verdict: "continue",
        reason:
          "Completion evidence must be concrete command output, not a summary or guess.",
        scores: {},
        failOpen: false,
      };
    }

    const result = await this.#bridge.run({
      parentTurnId: input.parentTurnId,
      parentAgentId: input.executorAgentId,
      agentId: input.judgeAgentId,
      prompt: buildCompletionJudgePrompt(input),
      input,
      resultSchema: completionJudgeDecisionSchema(),
      maxTurns: 1,
      allowedTools: [],
    });

    if (result.task.state !== "completed") {
      const failOpen = input.unavailableStrategy === "fail_open";
      const decision: CompletionJudgeResult = {
        verdict: failOpen ? "done" : "continue",
        reason: result.error?.message ??
          "Completion judge did not return a valid decision.",
        scores: {},
        task: result.task,
        error: result.error ?? result.task.error,
        failOpen,
      };
      return await this.#record(input, decision);
    }

    const decision = normalizeDecision(result.output);
    return await this.#record(input, {
      verdict: decision.verdict,
      reason: decision.reason,
      scores: normalizeScores(decision.scores),
      task: result.task,
      failOpen: false,
    });
  }

  async #record(
    input: CompletionJudgeInput,
    result: CompletionJudgeResult,
  ): Promise<CompletionJudgeResult> {
    if (!this.#artifacts) return result;
    const artifact = await this.#artifacts.record({
      taskId: input.taskId ?? result.task?.id ?? input.parentTurnId,
      turnId: input.parentTurnId,
      kind: "verification",
      summary: `Completion judge ${result.verdict}: ${result.reason}`,
      payload: {
        goal: input.goal,
        doneCriteria: input.doneCriteria,
        verifyCommand: input.verifyCommand,
        evidencePreview: input.evidence.slice(0, 1000),
        judgeAgentId: input.judgeAgentId,
        scores: result.scores,
        failOpen: result.failOpen,
      },
    });
    return { ...result, artifact };
  }
}

export function hasVerifiableEvidence(evidence: string): boolean {
  const text = evidence.trim();
  if (text.length < 40) return false;
  const lower = text.toLowerCase();
  return ![
    "推测",
    "应该",
    "probably",
    "assuming",
    "assume ",
    "guess",
  ].some((needle) => lower.includes(needle));
}

export function buildCompletionJudgePrompt(input: CompletionJudgeInput): string {
  return [
    "You are the completion judge. Decide whether the executor truly finished the goal.",
    `Goal: ${input.goal}`,
    `Done criteria:\n${input.doneCriteria.map((item) => `- ${item}`).join("\n")}`,
    `Verification command: ${input.verifyCommand}`,
    "Evidence:",
    "```",
    input.evidence.slice(0, 8000),
    "```",
    "Return JSON only with verdict, reason, scores, and optional strengths, weaknesses, suggestions.",
    'Use verdict "done" only when the evidence satisfies all criteria.',
  ].join("\n\n");
}

export function completionJudgeDecisionSchema(): JsonSchema {
  return { type: "object", required: ["verdict", "reason", "scores"] };
}

function normalizeDecision(value: unknown): CompletionJudgeDecision {
  if (!isRecord(value)) {
    return {
      verdict: "continue",
      reason: "Judge result was not an object.",
      scores: {},
    };
  }

  const verdict = value.verdict === "done" ? "done" : "continue";
  const reason = typeof value.reason === "string"
    ? value.reason
    : "Judge did not provide a reason.";

  return {
    verdict,
    reason,
    scores: isRecord(value.scores) ? normalizeScores(value.scores) : {},
    strengths: stringArray(value.strengths),
    weaknesses: stringArray(value.weaknesses),
    suggestions: stringArray(value.suggestions),
  };
}

function normalizeScores(value: unknown): CompletionJudgeScores {
  if (!isRecord(value)) return {};
  const scores: CompletionJudgeScores = {};
  for (
    const dimension of ["accuracy", "completeness", "consistency", "format"] as const
  ) {
    const score = value[dimension];
    if (typeof score === "number" && Number.isFinite(score)) {
      scores[dimension] = Math.max(0, Math.min(100, Math.round(score)));
    }
  }
  return scores;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
