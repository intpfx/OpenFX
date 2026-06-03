import type { KvStore } from "../interfaces/kv-store.ts";
import type { AdversarialAudit, EvolutionChange, EvolutionProposal } from "./types.ts";

export interface EvolutionKernelOptions {
  store: KvStore;
  now?: () => number;
  createId?: () => string;
}

export interface CreateEvolutionProposalInput {
  agentId: string;
  title: string;
  rationale: string;
  changes: EvolutionChange[];
}

export interface AuditEvolutionProposalInput {
  proposalId: string;
  auditorAgentId: string;
  verdict: AdversarialAudit["verdict"];
  findings: string[];
}

export class EvolutionKernel {
  readonly #store: KvStore;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: EvolutionKernelOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async propose(input: CreateEvolutionProposalInput): Promise<EvolutionProposal> {
    const proposal: EvolutionProposal = {
      id: this.#createId(),
      agentId: input.agentId,
      title: input.title,
      rationale: input.rationale,
      changes: input.changes,
      state: "ready_for_audit",
      createdAt: this.#now(),
      updatedAt: this.#now(),
    };

    await this.#storeProposal(proposal);
    return proposal;
  }

  async getProposal(proposalId: string): Promise<EvolutionProposal | null> {
    return await this.#store.get<EvolutionProposal>(evolutionProposalKey(proposalId));
  }

  async listProposals(agentId: string): Promise<EvolutionProposal[]> {
    const proposals: EvolutionProposal[] = [];
    for await (
      const entry of this.#store.list<{ proposalId: string }>(
        agentEvolutionProposalPrefix(agentId),
      )
    ) {
      const proposal = await this.getProposal(entry.value.proposalId);
      if (proposal) {
        proposals.push(proposal);
      }
    }
    return proposals;
  }

  async audit(input: AuditEvolutionProposalInput): Promise<AdversarialAudit> {
    const proposal = await this.getProposal(input.proposalId);
    if (!proposal) {
      throw new Error(`Evolution proposal not found: ${input.proposalId}`);
    }
    if (proposal.agentId === input.auditorAgentId) {
      throw new Error("Evolution proposal cannot be audited by the same agent.");
    }

    const audit: AdversarialAudit = {
      id: this.#createId(),
      proposalId: input.proposalId,
      auditorAgentId: input.auditorAgentId,
      verdict: input.verdict,
      findings: input.findings,
      createdAt: this.#now(),
    };

    await this.#store.set(adversarialAuditKey(audit.id), audit);
    await this.#store.set(evolutionProposalAuditKey(audit), { auditId: audit.id });
    await this.#storeProposal({
      ...proposal,
      state: audit.verdict === "approve" ? "approved" : "rejected",
      updatedAt: this.#now(),
    });
    return audit;
  }

  async listAudits(proposalId: string): Promise<AdversarialAudit[]> {
    const audits: AdversarialAudit[] = [];
    for await (
      const entry of this.#store.list<{ auditId: string }>(
        evolutionProposalAuditPrefix(proposalId),
      )
    ) {
      const audit = await this.#store.get<AdversarialAudit>(
        adversarialAuditKey(entry.value.auditId),
      );
      if (audit) {
        audits.push(audit);
      }
    }
    return audits;
  }

  async #storeProposal(proposal: EvolutionProposal): Promise<void> {
    await this.#store.set(evolutionProposalKey(proposal.id), proposal);
    await this.#store.set(agentEvolutionProposalKey(proposal), {
      proposalId: proposal.id,
    });
  }
}

export function evolutionProposalKey(proposalId: string): string {
  return `evolution:proposal:${proposalId}`;
}

export function agentEvolutionProposalPrefix(agentId: string): string {
  return `agent:${agentId}:evolution:proposal:`;
}

export function agentEvolutionProposalKey(proposal: EvolutionProposal): string {
  return `${
    agentEvolutionProposalPrefix(proposal.agentId)
  }${proposal.createdAt}:${proposal.id}`;
}

export function adversarialAuditKey(auditId: string): string {
  return `evolution:audit:${auditId}`;
}

export function evolutionProposalAuditPrefix(proposalId: string): string {
  return `evolution:proposal:${proposalId}:audit:`;
}

export function evolutionProposalAuditKey(audit: AdversarialAudit): string {
  return `${
    evolutionProposalAuditPrefix(audit.proposalId)
  }${audit.createdAt}:${audit.id}`;
}
