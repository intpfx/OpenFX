import { BloubVisualPlugin } from "./bloub/BloubVisualPlugin.tsx";
import { NebulaOrbVisualPlugin } from "./nebula-orb/NebulaOrbVisualPlugin.tsx";
import type { FloatingVisualPluginDefinition } from "./visual-plugin.ts";

export const FLOATING_VISUAL_PLUGINS = [
  {
    id: "bloub",
    name: "Bloub",
    sourceLabel: "jeremy-prt/bloub",
    sourceHref: "https://github.com/jeremy-prt/bloub",
    Renderer: BloubVisualPlugin,
  },
  {
    id: "nebula-orb",
    name: "Nebula-Orb",
    sourceLabel: "SkentSun/Nebula-Orb",
    sourceHref: "https://github.com/SkentSun/Nebula-Orb",
    Renderer: NebulaOrbVisualPlugin,
  },
] as const satisfies readonly FloatingVisualPluginDefinition[];
