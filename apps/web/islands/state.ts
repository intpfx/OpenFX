import { signal } from "@preact/signals";

/** Whether the UNLOCK has been triggered (reveals hidden cards, hides locked card) */
export const unlockedProjectIds = signal<string[]>([]);

/** Current brand word ("FENGXIAO" | "OpenFX") */
export const currentBrand = signal<"FENGXIAO" | "OpenFX">("FENGXIAO");

/** UI brand state that flips immediately when the logo transition starts. */
export const uiBrand = signal<"FENGXIAO" | "OpenFX">("FENGXIAO");
