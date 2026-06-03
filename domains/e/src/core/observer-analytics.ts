import type { ReplayBundle } from "./replay-log.ts";
import type {
  MemoryProposal,
  ObserverAnalyticsReport,
  ObserverInsight,
} from "./types.ts";

export interface ObserverAnalyticsOptions {
  now?: () => number;
  createId?: () => string;
}

export class ObserverAnalytics {
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: ObserverAnalyticsOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  analyze(bundle: ReplayBundle): ObserverAnalyticsReport {
    const blockedTurns = bundle.turnRecords.filter((turn) =>
      turn.finalState === "blocked"
    );
    const toolFailures = bundle.turnRecords.flatMap((turn) => turn.toolExecutions)
      .filter((tool) => tool.state === "failed");
    const boundaryRejections = bundle.turnRecords.flatMap((turn) =>
      turn.boundaryRequests
    )
      .filter((request) => request.state === "rejected");
    const peerTimeouts = bundle.peerMessages.filter((message) =>
      message.state === "expired" ||
      message.error?.code === "peer_await_timeout"
    );

    const insights: ObserverInsight[] = [];
    if (blockedTurns.length > 0) {
      insights.push(this.#insight(
        "risk",
        "warn",
        `${blockedTurns.length} turn(s) ended blocked.`,
        blockedTurns.map((turn) => turn.id),
      ));
    }
    if (toolFailures.length > 0) {
      insights.push(this.#insight(
        "pattern",
        "warn",
        `${toolFailures.length} tool execution(s) failed.`,
        toolFailures.map((tool) => tool.id),
      ));
    }
    if (peerTimeouts.length > 0) {
      insights.push(this.#insight(
        "risk",
        "warn",
        `${peerTimeouts.length} peer message(s) timed out or expired.`,
        peerTimeouts.map((message) => message.envelope.id),
      ));
    }

    const memoryProposals = insights.map((insight): MemoryProposal => ({
      id: this.#createId(),
      agentId: bundle.turnRecords[0]?.agentId ?? "unknown",
      content: insight.content,
      source: `observer:${insight.id}`,
      salience: insight.severity === "block" ? 9 : 6,
      createdAt: this.#now(),
    }));

    return {
      id: this.#createId(),
      metrics: {
        turns: bundle.turnRecords.length,
        blockedTurns: blockedTurns.length,
        toolFailures: toolFailures.length,
        boundaryRejections: boundaryRejections.length,
        peerTimeouts: peerTimeouts.length,
      },
      insights,
      memoryProposals,
      createdAt: this.#now(),
    };
  }

  #insight(
    type: ObserverInsight["type"],
    severity: ObserverInsight["severity"],
    content: string,
    sourceIds: string[],
  ): ObserverInsight {
    return {
      id: this.#createId(),
      type,
      severity,
      content,
      sourceIds,
      createdAt: this.#now(),
    };
  }
}
