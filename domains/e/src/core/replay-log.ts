import type {
  AdversarialAudit,
  AppliedActionRecord,
  ChannelMessage,
  DreamNarrative,
  EvolutionProposal,
  EvolutionSandboxReport,
  ObserverAnalyticsReport,
  PeerMessage,
  ProposedAction,
  SocialRelation,
  SubagentTask,
  TurnRecord,
} from "./types.ts";

export interface ReplayBundle {
  turnRecords: TurnRecord[];
  proposedActions: ProposedAction[];
  appliedActions: AppliedActionRecord[];
  peerMessages: PeerMessage[];
  subagentTasks: SubagentTask[];
  evolutionProposals: EvolutionProposal[];
  adversarialAudits: AdversarialAudit[];
  observerReports: ObserverAnalyticsReport[];
  evolutionSandboxReports: EvolutionSandboxReport[];
  socialRelations: SocialRelation[];
  channelMessages: ChannelMessage[];
  dreamNarratives: DreamNarrative[];
}

export function exportTurnRecordsAsJsonl(records: TurnRecord[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

export function exportProposedActionsAsJsonl(actions: ProposedAction[]): string {
  return actions.map((action) => JSON.stringify(action)).join("\n");
}

export function exportReplayBundleAsJsonl(bundle: ReplayBundle): string {
  return [
    ...bundle.turnRecords.map((value) => ({ kind: "turn" as const, value })),
    ...bundle.proposedActions.map((value) => ({
      kind: "proposed_action" as const,
      value,
    })),
    ...bundle.appliedActions.map((value) => ({
      kind: "applied_action" as const,
      value,
    })),
    ...bundle.peerMessages.map((value) => ({ kind: "peer_message" as const, value })),
    ...bundle.subagentTasks.map((value) => ({ kind: "subagent_task" as const, value })),
    ...bundle.evolutionProposals.map((value) => ({
      kind: "evolution_proposal" as const,
      value,
    })),
    ...bundle.adversarialAudits.map((value) => ({
      kind: "adversarial_audit" as const,
      value,
    })),
    ...bundle.observerReports.map((value) => ({
      kind: "observer_report" as const,
      value,
    })),
    ...bundle.evolutionSandboxReports.map((value) => ({
      kind: "evolution_sandbox_report" as const,
      value,
    })),
    ...bundle.socialRelations.map((value) => ({
      kind: "social_relation" as const,
      value,
    })),
    ...bundle.channelMessages.map((value) => ({
      kind: "channel_message" as const,
      value,
    })),
    ...bundle.dreamNarratives.map((value) => ({
      kind: "dream_narrative" as const,
      value,
    })),
  ].map((entry) => JSON.stringify(entry)).join("\n");
}

export function parseReplayBundleJsonl(jsonl: string): ReplayBundle {
  const bundle: ReplayBundle = {
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

  for (const line of jsonl.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }

    const entry = JSON.parse(line) as { kind: string; value: unknown };
    if (entry.kind === "turn") {
      bundle.turnRecords.push(entry.value as TurnRecord);
    } else if (entry.kind === "proposed_action") {
      bundle.proposedActions.push(entry.value as ProposedAction);
    } else if (entry.kind === "applied_action") {
      bundle.appliedActions.push(entry.value as AppliedActionRecord);
    } else if (entry.kind === "peer_message") {
      bundle.peerMessages.push(entry.value as PeerMessage);
    } else if (entry.kind === "subagent_task") {
      bundle.subagentTasks.push(entry.value as SubagentTask);
    } else if (entry.kind === "evolution_proposal") {
      bundle.evolutionProposals.push(entry.value as EvolutionProposal);
    } else if (entry.kind === "adversarial_audit") {
      bundle.adversarialAudits.push(entry.value as AdversarialAudit);
    } else if (entry.kind === "observer_report") {
      bundle.observerReports.push(entry.value as ObserverAnalyticsReport);
    } else if (entry.kind === "evolution_sandbox_report") {
      bundle.evolutionSandboxReports.push(entry.value as EvolutionSandboxReport);
    } else if (entry.kind === "social_relation") {
      bundle.socialRelations.push(entry.value as SocialRelation);
    } else if (entry.kind === "channel_message") {
      bundle.channelMessages.push(entry.value as ChannelMessage);
    } else if (entry.kind === "dream_narrative") {
      bundle.dreamNarratives.push(entry.value as DreamNarrative);
    }
  }

  return bundle;
}
