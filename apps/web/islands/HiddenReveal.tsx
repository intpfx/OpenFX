import { useSignalEffect } from "@preact/signals";
import { unlockedProjectIds } from "./state.ts";

/**
 * Reveals hidden project cards and hides locked card when unlock is triggered.
 * Uses DOM manipulation on the server-rendered HTML so most content stays static.
 */
export default function HiddenReveal() {
  useSignalEffect(() => {
    const activeIds = new Set(unlockedProjectIds.value);

    document.querySelectorAll<HTMLElement>(".hidden-card").forEach((card) => {
      const id = card.dataset.cardId ?? "";
      card.classList.toggle("revealed", activeIds.has(id));
    });
  });

  return null; // invisible island, just side-effects
}
