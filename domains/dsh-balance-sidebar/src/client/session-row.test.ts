// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { SessionRowCostInjector } from "./session-row.ts";

function appendSessionRow(sessionId: string): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("role", "treeitem");
  row.append(
    document.createElement("span"),
    document.createElement("span"),
    document.createElement("button"),
  );
  Object.defineProperty(row, "__reactFiber$balanceSidebarTest", {
    enumerable: true,
    value: {
      memoizedProps: {
        node: { id: sessionId, updatedAt: 1 },
      },
    },
  });
  document.body.append(row);
  return row;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("SessionRowCostInjector", () => {
  it("does not mutate a cost chip when its rendered value is unchanged", async () => {
    const row = appendSessionRow("session-1");
    const injector = new SessionRowCostInjector();
    const costs = new Map([["session-1", 0.25]]);

    injector.setCosts(costs);
    await Promise.resolve();

    const chip = row.querySelector("[data-balance-sidebar-chip]");
    expect(chip).toBeInstanceOf(HTMLSpanElement);
    const originalTextNode = chip?.firstChild;

    injector.setCosts(costs);
    await Promise.resolve();

    expect(chip?.firstChild).toBe(originalTextNode);
  });
});
