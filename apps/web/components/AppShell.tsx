import type { ComponentChildren } from "preact";

export function AppShell(props: { children: ComponentChildren }) {
  return <main class="page">{props.children}</main>;
}
