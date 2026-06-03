import type { StreamRule } from "./types.ts";

export interface StreamGuardMatch {
  ruleId: string;
  action: StreamRule["action"];
  severity: StreamRule["severity"];
  reminder?: string;
  matchedText: string;
}

export interface StreamGuardResult {
  content: string;
  matches: StreamGuardMatch[];
  aborted: boolean;
  reminderMessages: string[];
}

export class StreamGuard {
  readonly #rules: StreamRule[];

  constructor(rules: StreamRule[]) {
    this.#rules = rules;
  }

  inspectChunk(contentSoFar: string, chunk: string): StreamGuardResult {
    const content = contentSoFar + chunk;
    const matches = this.#rules
      .map((rule) => matchRule(rule, content))
      .filter((match): match is StreamGuardMatch => match !== null);

    return {
      content,
      matches,
      aborted: matches.some((match) =>
        match.severity === "block" || match.action === "abort_and_retry"
      ),
      reminderMessages: matches
        .filter((match) => match.action === "inject_reminder" && match.reminder)
        .map((match) => match.reminder as string),
    };
  }

  inspectChunks(chunks: Iterable<string>): StreamGuardResult {
    let content = "";
    const allMatches: StreamGuardMatch[] = [];
    const reminderMessages: string[] = [];

    for (const chunk of chunks) {
      const result = this.inspectChunk(content, chunk);
      content = result.content;
      allMatches.push(...result.matches);
      reminderMessages.push(...result.reminderMessages);

      if (result.aborted) {
        return {
          content,
          matches: dedupeMatches(allMatches),
          aborted: true,
          reminderMessages: [...new Set(reminderMessages)],
        };
      }
    }

    return {
      content,
      matches: dedupeMatches(allMatches),
      aborted: false,
      reminderMessages: [...new Set(reminderMessages)],
    };
  }
}

function matchRule(rule: StreamRule, content: string): StreamGuardMatch | null {
  const index = content.indexOf(rule.pattern);
  if (index === -1) {
    return null;
  }

  return {
    ruleId: rule.id,
    action: rule.action,
    severity: rule.severity,
    reminder: rule.reminder,
    matchedText: content.slice(index, index + rule.pattern.length),
  };
}

function dedupeMatches(matches: StreamGuardMatch[]): StreamGuardMatch[] {
  const seen = new Set<string>();
  const deduped: StreamGuardMatch[] = [];

  for (const match of matches) {
    const key = `${match.ruleId}:${match.matchedText}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(match);
    }
  }

  return deduped;
}
