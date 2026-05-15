import { expect } from "@std/expect";

import {
  buildRedirectUrl,
  createMemoryDownipStore,
  handleDownipRedirectRequest,
  handleDownipUpdateRequest,
} from "../utils/downip.ts";

Deno.test("POST /update stores valid mappings and GET /update returns them", async () => {
  const store = createMemoryDownipStore();

  const postResponse = await handleDownipUpdateRequest(
    new Request("http://localhost/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        home: { ipv6: "2001:db8::1", port: 3000 },
      }),
    }),
    store,
  );

  const postBody = await postResponse.json();
  expect(postResponse.status).toBe(200);
  expect(postBody.count).toBe(1);
  expect(postBody.stored.home.ipv6).toBe("2001:db8::1");

  const getResponse = await handleDownipUpdateRequest(
    new Request("http://localhost/update"),
    store,
  );
  const getBody = await getResponse.json();

  expect(getResponse.status).toBe(200);
  expect(getBody.mapping.home.port).toBe(3000);
});

Deno.test("redirect handler builds ipv6 target from stored route", async () => {
  const store = createMemoryDownipStore({
    home: { ipv6: "2001:db8::1", port: 3000 },
  });

  const response = await handleDownipRedirectRequest(
    new Request("http://localhost/home/dashboard?tab=overview"),
    { key: "home", rest: "dashboard" },
    store,
  );

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    buildRedirectUrl("2001:db8::1", "/dashboard", "?tab=overview", {
      scheme: "http",
      port: "3000",
    }),
  );
});
