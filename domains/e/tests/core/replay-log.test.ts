import { assertEquals } from "jsr:@std/assert";

import {
  exportProposedActionsAsJsonl,
  exportReplayBundleAsJsonl,
  exportTurnRecordsAsJsonl,
  parseReplayBundleJsonl,
  type ProposedAction,
  type TurnRecord,
} from "../../src/mod.ts";

Deno.test("ReplayLog exports turn records and actions as JSONL", () => {
  const turn = fixtureTurnRecord();
  const action = turn.proposedActions[0];

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
  });
  const parsed = parseReplayBundleJsonl(jsonl);

  assertEquals(parsed.turnRecords, [turn]);
  assertEquals(parsed.proposedActions, [action]);
  assertEquals(parsed.appliedActions, turn.appliedActions);
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
