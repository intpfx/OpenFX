import { assertEquals } from "jsr:@std/assert";

import { type EvolutionProposal, EvolutionSandbox } from "../../src/mod.ts";

Deno.test("EvolutionSandbox converts approved proposals into draft actions", () => {
  const sandbox = new EvolutionSandbox({
    createId: fixedIds("action-1", "report-1"),
    now: fixedNow(1000),
  });
  const proposal: EvolutionProposal = {
    id: "proposal-1",
    agentId: "agent-1",
    title: "Tune memory policy",
    rationale: "Noisy recall.",
    changes: [{
      target: "memory_policy",
      description: "Raise hindsight salience.",
      risk: "medium",
    }],
    state: "approved",
    createdAt: 1,
    updatedAt: 1,
  };

  const report = sandbox.validate(proposal, [{
    id: "audit-1",
    proposalId: "proposal-1",
    auditorAgentId: "auditor",
    verdict: "approve",
    findings: [],
    createdAt: 2,
  }]);

  assertEquals(report.state, "validated");
  assertEquals(report.suggestedActions[0].state, "draft");
  assertEquals(report.suggestedActions[0].target, "policy://memory_policy");
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
