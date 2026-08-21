import type { ComponentType } from "react";

export type VisualPluginStatus = Readonly<{
  id: string;
  label: string;
  index: number;
  total: number;
}>;

export type VisualPluginRendererProps = Readonly<{
  onStatusChange: (status: VisualPluginStatus) => void;
}>;

export type FloatingVisualPluginDefinition = Readonly<{
  id: string;
  name: string;
  sourceLabel: string;
  sourceHref: string;
  Renderer: ComponentType<VisualPluginRendererProps>;
}>;
