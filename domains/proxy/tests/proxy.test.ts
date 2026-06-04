import { expect } from "@std/expect";

import { buildProxyTargetUrl } from "../server/handler.ts";

Deno.test("proxy target uses full url query when provided", () => {
  const target = buildProxyTargetUrl(
    new Request(
      "http://localhost/api/proxy?url=https%3A%2F%2Fexample.com%2Fdocs%3Fa%3D1",
    ),
  );

  expect(target?.toString()).toBe("https://example.com/docs?a=1");
});

Deno.test("proxy target keeps upstream fallback for relative url query", () => {
  const previous = Deno.env.get("OPENFX_PROXY_UPSTREAM");
  Deno.env.set("OPENFX_PROXY_UPSTREAM", "https://upstream.example/base");

  try {
    const target = buildProxyTargetUrl(
      new Request("http://localhost/api/proxy?url=%2Fdocs%3Fa%3D1"),
    );

    expect(target?.toString()).toBe("https://upstream.example/base/docs?a=1");
  } finally {
    if (previous === undefined) {
      Deno.env.delete("OPENFX_PROXY_UPSTREAM");
    } else {
      Deno.env.set("OPENFX_PROXY_UPSTREAM", previous);
    }
  }
});
