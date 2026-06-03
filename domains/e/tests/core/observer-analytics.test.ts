import { assertEquals } from "jsr:@std/assert";

import { ObserverAnalytics, type ReplayBundle } from "../../src/mod.ts";

Deno.test("ObserverAnalytics summarizes replay facts without mutating them", () => {
  const analytics = new ObserverAnalytics({
    createId: fixedIds("insight-1", "memory-1", "report-1"),
    now: fixedNow(1000),
  });
  const report = analytics.analyze({
    ...emptyBundle(),
    turnRecords: [{
      id: "turn-1",
      agentId: "agent-1",
      sessionId: "session-1",
      taskId: null,
      startedAt: 1,
      inputMessageIds: [],
      promptDigest: "digest",
      events: [],
      eventEngineRecords: [],
      toolExecutions: [],
      boundaryRequests: [],
      proposedActions: [],
      appliedActions: [],
      modelRoutes: [],
      finalState: "blocked",
    }],
  });

  assertEquals(report.metrics.blockedTurns, 1);
  assertEquals(report.insights[0].type, "risk");
  assertEquals(report.memoryProposals[0].agentId, "agent-1");
});

function emptyBundle(): ReplayBundle {
  return {
    turnRecords: [],
    proposedActions: [],
    appliedActions: [],
    peerMessages: [],
    subagentTasks: [],
    evolutionProposals: [],
    adversarialAudits: [],
    observerReports: [],
    evolutionSandboxReports: [],
    socialRelations: [],
    channelMessages: [],
    dreamNarratives: [],
  };
}

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
