/** @jsxRuntime classic */
/** @jsx h */

import { expect } from "@std/expect";
import { renderToStaticMarkup } from "npm:react-dom@^19.1.0/server";
import { createElement as h } from "react";

import { HomepageFooterDock } from "../src/homepage/HomepageFooterDock.tsx";

Deno.test("homepage footer dock keeps editorial meta, index, and action slots ordered", () => {
  const html = renderToStaticMarkup(
    <HomepageFooterDock
      meta={<span data-test-meta>BUILD · AUTO · 绵阳市</span>}
      index={<input aria-label="搜索项目" />}
      action={<button type="button">MESSAGE</button>}
    />,
  );

  expect(html.match(/<footer/g)?.length).toBe(1);
  expect(html).toContain(
    '<footer aria-label="首页控制栏" class="homepage-footer-dock">',
  );
  expect(html).toContain('class="homepage-footer-dock__meta"');
  expect(html).toContain('class="homepage-footer-dock__index"');
  expect(html).toContain('class="homepage-footer-dock__action"');
  expect(html).not.toContain("homepage-footer-dock__left");
  expect(html).not.toContain("homepage-footer-dock__middle");
  expect(html).not.toContain("homepage-footer-dock__right");

  const meta = html.indexOf("data-test-meta");
  const index = html.indexOf('aria-label="搜索项目"');
  const action = html.indexOf(">MESSAGE</button>");
  expect(meta).toBeGreaterThan(-1);
  expect(meta).toBeLessThan(index);
  expect(index).toBeLessThan(action);

  expect(html.indexOf("homepage-footer-dock__meta")).toBeLessThan(
    html.indexOf("homepage-footer-dock__index"),
  );
  expect(html.indexOf("homepage-footer-dock__index")).toBeLessThan(
    html.indexOf("homepage-footer-dock__action"),
  );
});

Deno.test("location content is structurally inside the dock meta slot", () => {
  const html = renderToStaticMarkup(
    <HomepageFooterDock
      meta={
        <section aria-label="城市背景状态" className="homepage-location-status">
          背景 · Shanghai
        </section>
      }
      index={null}
      action={null}
    />,
  );

  const metaStart = html.indexOf('class="homepage-footer-dock__meta"');
  const location = html.indexOf('class="homepage-location-status"');
  const metaEnd = html.indexOf("</div>", location);

  expect(metaStart).toBeLessThan(location);
  expect(metaEnd).toBeGreaterThan(location);
});
