/** @jsxRuntime classic */
/** @jsx h */

import { expect } from "@std/expect";
import { renderToStaticMarkup } from "npm:react-dom@^19.1.0/server";
import { createElement as h, type ReactNode } from "react";

import { HomepageFooterDock } from "../src/homepage/HomepageFooterDock.tsx";
import { HomepageLocationPosterView } from "../src/homepage/HomepageLocationPoster.tsx";

const noop = () => {};
const inDock = (status: ReactNode) => (
  <HomepageFooterDock meta={status} index={null} action={null} />
);

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
      renderStatus={inDock}
    />,
  );

  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain("用你所在的城市生成首页背景");
  expect(html).toContain("允许定位并生成");
  expect(html).toContain("暂不使用");
});

Deno.test("location poster ready view renders city controls inside the dock", () => {
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
      renderStatus={inDock}
    />,
  );

  expect(html).toContain("BACKGROUND");
  expect(html).toContain("Shanghai");
  expect(html).toContain("© OSM");
  expect(html).toContain('aria-label="重新定位"');
  expect(html).toContain('src="blob:openfx-poster"');
  expect(html).not.toContain("Map Poster");
  expect(html).toContain('href="https://www.openstreetmap.org/copyright"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain("homepage-location-attribution");
  expect(html).not.toContain("homepage-poster-attribution");
  const dockMeta = html.indexOf('class="homepage-footer-dock__meta"');
  const readyStatus = html.indexOf('class="homepage-location-status"');
  expect(dockMeta).toBeLessThan(readyStatus);
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
      renderStatus={inDock}
    />,
  );

  expect(html).toContain("定位精度不足");
  expect(html).toContain("重试");
  expect(html).not.toContain("Shanghai");
  expect(html).not.toContain('src="blob:stale-poster"');
});

Deno.test("location poster denied view is concise and has no retry", () => {
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
      renderStatus={inDock}
    />,
  );

  expect(html).toContain("BACKGROUND");
  expect(html).toContain("定位权限未开启");
  expect(html).toContain("请在浏览器的网站设置中重新允许定位。");
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
      renderStatus={inDock}
    />,
  );

  expect(html).toContain('src="blob:openfx-poster"');
  expect(html).not.toContain("重新定位");
  expect(html).toContain("© OpenStreetMap contributors");
  expect(html).toContain("homepage-poster-attribution");
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
      renderStatus={inDock}
    />,
  );

  expect(html).toContain("正在生成城市背景");
  expect(html.match(/© OpenStreetMap contributors/g)?.length).toBe(1);
  expect(html).toContain("homepage-location-attribution");
  expect(html).not.toContain("homepage-poster-attribution");
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
      renderStatus={inDock}
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

Deno.test("suspended permission request keeps its retained-poster attribution outside hidden controls", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure={null}
      place={{ city: "Shanghai", country: "China" }}
      posterUrl="blob:openfx-poster"
      state="requesting"
      suspended
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
      renderStatus={inDock}
    />,
  );

  expect(html.match(/© OpenStreetMap contributors/g)?.length).toBe(1);
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain("homepage-location-gate-attribution");
  expect(html).toContain("homepage-poster-attribution");
});
