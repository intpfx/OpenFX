/** @jsxRuntime classic */
/** @jsx h */

import { expect } from "@std/expect";
import { renderToStaticMarkup } from "npm:react-dom@^19.1.0/server";
import { createElement as h } from "react";

import { HomepageFooterDock } from "../src/homepage/HomepageFooterDock.tsx";

Deno.test("homepage footer dock is one semantic shell with three ordered slots", () => {
  const html = renderToStaticMarkup(
    <HomepageFooterDock
      left={<span data-test-slot="left">build</span>}
      middle={<span data-test-location="ready">Shanghai</span>}
      right={<button type="button">MESSAGE</button>}
    />,
  );

  expect(html.match(/<footer/g)?.length).toBe(1);
  expect(html).toContain(
    '<footer aria-label="首页控制栏" class="homepage-footer-dock">',
  );
  expect(html).toContain('class="homepage-footer-dock__left"');
  expect(html).toContain('class="homepage-footer-dock__middle"');
  expect(html).toContain('class="homepage-footer-dock__right"');

  const left = html.indexOf('data-test-slot="left"');
  const middle = html.indexOf('data-test-location="ready"');
  const right = html.indexOf(">MESSAGE</button>");
  expect(left).toBeGreaterThan(-1);
  expect(left).toBeLessThan(middle);
  expect(middle).toBeLessThan(right);
});

Deno.test("location content is structurally inside the dock middle slot", () => {
  const html = renderToStaticMarkup(
    <HomepageFooterDock
      left={null}
      middle={
        <section aria-label="城市背景状态" className="homepage-location-status">
          背景 · Shanghai
        </section>
      }
      right={null}
    />,
  );

  const middleStart = html.indexOf('class="homepage-footer-dock__middle"');
  const location = html.indexOf('class="homepage-location-status"');
  const middleEnd = html.indexOf("</div>", location);

  expect(middleStart).toBeLessThan(location);
  expect(middleEnd).toBeGreaterThan(location);
});
