/** @jsxRuntime classic */
/** @jsx h */

import { expect } from "@std/expect";
import { renderToStaticMarkup } from "npm:react-dom@^19.1.0/server";
import { createElement as h } from "react";
import { HomepageThemeControlView } from "../src/homepage/HomepageThemeControl.tsx";

Deno.test("theme control is one accessible typographic button", () => {
  const html = renderToStaticMarkup(
    <HomepageThemeControlView mode="auto" onToggle={() => {}} />,
  );
  expect(html.match(/<button/g)?.length).toBe(1);
  expect(html).toContain('class="homepage-theme-control"');
  expect(html).toContain("THEME");
  expect(html).toContain("AUTO");
  expect(html).toContain("当前主题：自动；切换为浅色");
});
