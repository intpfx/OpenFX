import type { H3Event } from "h3";
import { getRequestHeaders, getRequestURL, readRawBody } from "h3";

export const createWebRequest = async (
  event: H3Event,
  method?: string,
): Promise<Request> => {
  const nextMethod = method ?? event.method;
  const headers = new Headers(
    Object.entries(getRequestHeaders(event)).filter(
      (entry): entry is [string, string] => {
        return typeof entry[1] === "string";
      },
    ),
  );

  if (nextMethod === "GET" || nextMethod === "HEAD") {
    return new Request(getRequestURL(event), { method: nextMethod, headers });
  }

  const body = await readRawBody(event, false);
  return new Request(getRequestURL(event), {
    method: nextMethod,
    headers,
    body: body ?? undefined,
  });
};
