/** @jsxRuntime classic */
/** @jsx h */

import { expect } from "@std/expect";
import { renderToStaticMarkup } from "npm:react-dom@^19.1.0/server";
import { createElement as h } from "react";
import { BuildVersion, createBuildVersion } from "../src/homepage/BuildVersion.tsx";

Deno.test("build version exposes compact and full metadata", () => {
  const info = createBuildVersion({
    hash: "local00",
    time: "2026-06-30T00:00:00Z",
  });
  expect(info.shortLabel).toBe("local00");
  expect(info.fullLabel).toBe("2026-06-30 00:00 UTC + local00");
  const html = renderToStaticMarkup(<BuildVersion info={info} />);
  expect(html).toContain(">BUILD<");
  expect(html).toContain(">local00<");
  expect(html).toContain("2026-06-30 00:00 UTC + local00");
});
