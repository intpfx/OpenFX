/** @jsxRuntime classic */
/** @jsx h */

import { expect } from "@std/expect";
import { renderToStaticMarkup } from "npm:react-dom@^19.1.0/server";
import { createElement as h } from "react";

import { HomepageLocationPosterView } from "../src/homepage/HomepageLocationPoster.tsx";

const noop = () => {};

Deno.test("location poster permission view is an accessible focused dialog", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure={null}
      place={null}
      posterUrl={null}
      state="needs-permission"
      suspended={false}
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );

  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain("用你所在的城市生成首页背景");
  expect(html).toContain("允许定位并生成");
  expect(html).toContain("暂不使用");
});

Deno.test("location poster ready view exposes a compact city status", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure={null}
      place={{ city: "Shanghai", country: "China" }}
      posterUrl="blob:openfx-poster"
      state="ready"
      suspended={false}
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );

  expect(html).toContain("背景 · Shanghai");
  expect(html).toContain("Map Poster");
  expect(html).toContain("重新定位");
  expect(html).toContain('src="blob:openfx-poster"');
  expect(html).toContain("© OpenStreetMap contributors");
  expect(html).toContain('href="https://www.openstreetmap.org/copyright"');
  expect(html).toContain('target="_blank"');
});

Deno.test("location poster failure never invents a city label", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure="low-accuracy"
      place={null}
      posterUrl="blob:stale-poster"
      state="error"
      suspended={false}
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );

  expect(html).toContain("定位精度不足");
  expect(html).toContain("重试");
  expect(html).not.toContain("Shanghai");
  expect(html).not.toContain('src="blob:stale-poster"');
});

Deno.test("location poster denied view directs users to site settings without retry", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure="denied"
      place={null}
      posterUrl={null}
      state="denied"
      suspended={false}
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );

  expect(html).toContain("请在浏览器的网站设置中重新开启定位权限。");
  expect(html).toContain("关闭");
  expect(html).not.toContain("重试");
});

Deno.test("location poster suspension hides controls but preserves the background", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure={null}
      place={{ city: "Shanghai", country: "China" }}
      posterUrl="blob:openfx-poster"
      state="ready"
      suspended
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );

  expect(html).toContain('src="blob:openfx-poster"');
  expect(html).not.toContain("重新定位");
  expect(html).toContain("© OpenStreetMap contributors");
});

Deno.test("location poster keeps one attribution while a retained poster is rendering", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure={null}
      place={{ city: "Shanghai", country: "China" }}
      posterUrl="blob:openfx-poster"
      state="rendering"
      suspended={false}
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );

  expect(html).toContain("正在生成城市背景");
  expect(html.match(/© OpenStreetMap contributors/g)?.length).toBe(1);
});

Deno.test("permission dialog owns the single retained-poster attribution", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure={null}
      place={{ city: "Shanghai", country: "China" }}
      posterUrl="blob:openfx-poster"
      state="requesting"
      suspended={false}
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );
  const dialogStart = html.indexOf('role="dialog"');
  const attribution = html.indexOf("© OpenStreetMap contributors");
  const dialogEnd = html.indexOf("</section>", attribution);

  expect(html.match(/© OpenStreetMap contributors/g)?.length).toBe(1);
  expect(html).toContain("homepage-location-gate-attribution");
  expect(dialogStart).toBeLessThan(attribution);
  expect(dialogEnd).toBeGreaterThan(attribution);
});
