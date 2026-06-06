import { assertEquals } from "jsr:@std/assert";

import {
  type AgentTask,
  type AgentWorkOrder,
  type Artifact,
  exportProposedActionsAsJsonl,
  exportReplayBundleAsJsonl,
  exportTurnRecordsAsJsonl,
  parseReplayBundleJsonl,
  type ProposedAction,
  type RuntimeAdapterRecord,
  type TurnRecord,
} from "../../src/mod.ts";

Deno.test("ReplayLog exports turn records and actions as JSONL", () => {
  const turn = fixtureTurnRecord();
  const action = turn.proposedActions[0];
  const agentTask = fixtureAgentTask();
  const workOrder = fixtureWorkOrder();
  const artifact = fixtureArtifact();
  const adapterRecord = fixtureAdapterRecord();

  assertEquals(JSON.parse(exportTurnRecordsAsJsonl([turn])), turn);
  assertEquals(JSON.parse(exportProposedActionsAsJsonl([action])), action);

  const jsonl = exportReplayBundleAsJsonl({
    turnRecords: [turn],
    proposedActions: [action],
    appliedActions: turn.appliedActions,
    peerMessages: [],
    subagentTasks: [],
    evolutionProposals: [],
    adversarialAudits: [],
    observerReports: [],
    evolutionSandboxReports: [],
    socialRelations: [],
    channelMessages: [],
    dreamNarratives: [],
    agentTasks: [agentTask],
    workOrders: [workOrder],
    artifacts: [artifact],
    adapterRecords: [adapterRecord],
  });
  const parsed = parseReplayBundleJsonl(jsonl);

  assertEquals(parsed.turnRecords, [turn]);
  assertEquals(parsed.proposedActions, [action]);
  assertEquals(parsed.appliedActions, turn.appliedActions);
  assertEquals(parsed.agentTasks, [agentTask]);
  assertEquals(parsed.workOrders, [workOrder]);
  assertEquals(parsed.artifacts, [artifact]);
  assertEquals(parsed.adapterRecords, [adapterRecord]);
});

function fixtureTurnRecord(): TurnRecord {
  const action: ProposedAction = {
    id: "action-1",
    kind: "file_edit",
    title: "Edit file",
    target: "file://note.txt",
    state: "applied",
  };

  return {
    id: "turn-1",
    agentId: "agent-1",
    sessionId: "session-1",
    taskId: null,
    startedAt: 1000,
    endedAt: 1001,
    inputMessageIds: ["message-1"],
    promptDigest: "digest",
    decision: { kind: "complete", result: "done" },
    events: [],
    eventEngineRecords: [],
    toolExecutions: [],
    boundaryRequests: [],
    proposedActions: [action],
    appliedActions: [{
      id: "applied-1",
      actionId: "action-1",
      state: "applied",
      result: { ok: true },
      at: 1001,
    }],
    modelRoutes: [],
    finalState: "completed",
  };
}

function fixtureAgentTask(): AgentTask {
  return {
    id: "task-1",
    title: "Absorb framework value",
    description: "Keep product shell source out of core.",
    status: "done",
    priority: "high",
    assignedAgentIds: ["agent-1"],
    dependsOnTaskIds: [],
    progress: 100,
    createdAt: 900,
    updatedAt: 1000,
  };
}

function fixtureWorkOrder(): AgentWorkOrder {
  return {
    id: "work-1",
    taskId: "task-1",
    assignedAgentId: "agent-1",
    goal: "Implement runtime-neutral kernel.",
    allowedPaths: ["domains/e"],
    forbiddenActions: ["port Rust crates"],
    requiredArtifacts: ["patch_summary", "verification"],
    successCriteria: ["New tests cover framework primitives."],
    verificationCommands: [{
      cwd: ".",
      program: "deno",
      args: ["task", "--config", "domains/e/deno.json", "test"],
    }],
    maxTurns: 4,
    fallbackPlan: "Record boundary request for product-shell work.",
    createdAt: 950,
  };
}

function fixtureArtifact(): Artifact {
  return {
    id: "artifact-1",
    taskId: "task-1",
    turnId: "turn-1",
    kind: "patch_summary",
    path: "domains/e/src/core/task-graph.ts",
    summary: "Task graph kernel added.",
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function fixtureAdapterRecord(): RuntimeAdapterRecord {
  return {
    id: "adapter-1",
    kind: "git_timeline",
    operation: "status",
    state: "succeeded",
    result: { clean: true },
    at: 1000,
  };
}
