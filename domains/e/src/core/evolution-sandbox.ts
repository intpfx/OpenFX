import type {
  AdversarialAudit,
  EvolutionProposal,
  EvolutionSandboxReport,
  ProposedAction,
} from "./types.ts";

export interface EvolutionSandboxOptions {
  now?: () => number;
  createId?: () => string;
}

export class EvolutionSandbox {
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: EvolutionSandboxOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  validate(
    proposal: EvolutionProposal,
    audits: AdversarialAudit[],
  ): EvolutionSandboxReport {
    const approved = proposal.state === "approved" &&
      audits.some((audit) =>
        audit.proposalId === proposal.id && audit.verdict === "approve"
      );
    if (!approved) {
      return this.#report(
        proposal.id,
        "skipped",
        "Proposal has not passed adversarial audit.",
        [],
      );
    }

    const suggestedActions = proposal.changes.map((change): ProposedAction => ({
      id: this.#createId(),
      kind: "workspace_change",
      title: `Review ${change.target} change`,
      target: `policy://${change.target}`,
      preview: change.description,
      state: "draft",
    }));

    return this.#report(
      proposal.id,
      suggestedActions.length > 0 ? "validated" : "skipped",
      suggestedActions.length > 0
        ? "Proposal converted into draft actions for boundary review."
        : "Proposal has no changes to validate.",
      suggestedActions,
    );
  }

  #report(
    proposalId: string,
    state: EvolutionSandboxReport["state"],
    summary: string,
    suggestedActions: ProposedAction[],
  ): EvolutionSandboxReport {
    return {
      id: this.#createId(),
      proposalId,
      state,
      summary,
      suggestedActions,
      commandPlan: [],
      createdAt: this.#now(),
    };
  }
}
