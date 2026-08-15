import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { describe, expect, it } from "vitest";
import { BALANCE_SIDEBAR_SETTINGS_NAMESPACE } from "./index.ts";

describe("balance sidebar settings registration", () => {
  it("uses a namespace accepted by the DSH settings provider", () => {
    expect(settingsNamespace(BALANCE_SIDEBAR_SETTINGS_NAMESPACE)).toBe(
      "balance-sidebar",
    );
  });
});
