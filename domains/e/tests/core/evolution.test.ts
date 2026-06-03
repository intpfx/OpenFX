import { assertEquals, assertRejects } from "jsr:@std/assert";

import { EvolutionKernel, InMemoryKvStore } from "../../src/mod.ts";

Deno.test("EvolutionKernel stores proposals and adversarial audits", async () => {
  const store = new InMemoryKvStore();
  const evolution = new EvolutionKernel({
    store,
    createId: fixedIds("proposal-1", "audit-1"),
    now: fixedNow(1000),
  });

  const proposal = await evolution.propose({
    agentId: "agent-1",
    title: "Tighten memory ranking",
    rationale: "Observed noisy recall.",
    changes: [{
      target: "memory_policy",
      description: "Prefer high-confidence hindsight.",
      risk: "medium",
    }],
  });
  const audit = await evolution.audit({
    proposalId: proposal.id,
    auditorAgentId: "agent-auditor",
    verdict: "approve",
    findings: ["bounded proposal"],
  });

  assertEquals((await evolution.getProposal(proposal.id))?.state, "approved");
  assertEquals((await evolution.listProposals("agent-1"))[0].id, proposal.id);
  assertEquals((await evolution.listAudits(proposal.id))[0], audit);
});

Deno.test("EvolutionKernel prevents agents from auditing their own proposals", async () => {
  const store = new InMemoryKvStore();
  const evolution = new EvolutionKernel({
    store,
    createId: fixedIds("proposal-1"),
    now: fixedNow(1000),
  });

  const proposal = await evolution.propose({
    agentId: "agent-1",
    title: "Self approve",
    rationale: "Should be rejected by policy.",
    changes: [],
  });

  await assertRejects(
    () =>
      evolution.audit({
        proposalId: proposal.id,
        auditorAgentId: "agent-1",
        verdict: "approve",
        findings: [],
      }),
    Error,
    "same agent",
  );
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
