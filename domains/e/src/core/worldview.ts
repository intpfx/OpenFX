import type { WorldViewStatement } from "./types.ts";

export interface WorldViewCandidate {
  kind: WorldViewStatement["kind"];
  content: string;
  confidence: number;
  source: string;
}

export function proposeWorldViewCandidates(input: {
  agentId: string;
  memories: Array<{ id: string; content: string; salience: number }>;
  createId?: () => string;
  now?: () => number;
}): WorldViewStatement[] {
  const createId = input.createId ?? crypto.randomUUID;
  const now = input.now ?? Date.now;
  return input.memories
    .filter((memory) => memory.salience >= 7)
    .map((memory): WorldViewStatement => ({
      id: createId(),
      agentId: input.agentId,
      kind: inferKind(memory.content),
      content: memory.content,
      confidence: Math.min(1, memory.salience / 10),
      source: `memory:${memory.id}`,
      updatedAt: now(),
    }));
}

export function mergeWorldViewStatements(
  statements: WorldViewStatement[],
): WorldViewStatement[] {
  const merged = new Map<string, WorldViewStatement>();
  for (const statement of statements) {
    const key = `${statement.kind}:${statement.content.toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing || statement.confidence > existing.confidence) {
      merged.set(key, statement);
    }
  }
  return markWorldViewConflicts([...merged.values()]);
}

export function selectPromptWorldViewStatements(
  statements: WorldViewStatement[],
  budget: number,
): WorldViewStatement[] {
  return statements
    .filter((statement) =>
      statement.confidence >= 0.7 && (statement.conflictWith?.length ?? 0) === 0
    )
    .sort((a, b) => b.confidence - a.confidence || b.updatedAt - a.updatedAt)
    .slice(0, budget);
}

function markWorldViewConflicts(
  statements: WorldViewStatement[],
): WorldViewStatement[] {
  return statements.map((statement) => {
    const conflicts = statements
      .filter((candidate) =>
        candidate.id !== statement.id &&
        candidate.kind === statement.kind &&
        contradicts(statement.content, candidate.content)
      )
      .map((candidate) => candidate.id);
    return conflicts.length ? { ...statement, conflictWith: conflicts } : statement;
  });
}

function inferKind(content: string): WorldViewStatement["kind"] {
  const normalized = content.toLowerCase();
  if (normalized.includes("prefer") || normalized.includes("喜欢")) return "preference";
  if (normalized.includes("must") || normalized.includes("必须")) return "constraint";
  return "belief";
}

function contradicts(left: string, right: string): boolean {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  return (normalizedLeft.includes("not ") &&
    stripNegation(normalizedLeft) === normalizedRight) ||
    (normalizedRight.includes("not ") &&
      stripNegation(normalizedRight) === normalizedLeft);
}

function stripNegation(value: string): string {
  return value.replace(/\bnot\s+/g, "").trim();
}
