import { type IncomingMessage, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Buffer } from "node:buffer";

import type { HttpJsonRequest, HttpJsonResponse } from "./omlx-client.ts";
import type { TextStreamRequester } from "./omlx-client.ts";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_STREAM_RESPONSE_BYTES = 1024 * 1024;

export const requestJson = (
  request: HttpJsonRequest,
): Promise<HttpJsonResponse> => {
  if (
    request.protocol === "http:" &&
    request.hostname !== "127.0.0.1" && request.hostname !== "::1"
  ) return Promise.reject(new Error("plaintext_http_must_be_loopback"));
  return new Promise((resolve, reject) => {
    const payload = request.body === undefined ? "" : JSON.stringify(request.body);
    const headers = {
      ...(payload
        ? {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(payload)),
        }
        : {}),
      ...request.headers,
    };
    const options = {
      protocol: request.protocol,
      hostname: request.hostname,
      port: request.port,
      path: request.path,
      method: request.method,
      headers,
    };
    const receive = (response: IncomingMessage) => {
      const chunks: Uint8Array[] = [];
      let length = 0;
      response.on("data", (chunk: Uint8Array) => {
        length += chunk.length;
        if (length > MAX_RESPONSE_BYTES) {
          outgoing.destroy(new Error("http_response_too_large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: response.statusCode ?? 0,
            body: text ? JSON.parse(text) : null,
          });
        } catch (error) {
          reject(error);
        }
      });
    };
    // Perry only attempts native lowering for a direct built-in call. Keeping the
    // function in a conditional variable returned undefined in the compiled probe.
    // Runtime client I/O is still guarded by the real integration smoke.
    const outgoing = request.protocol === "https:"
      ? httpsRequest(options, receive)
      : httpRequest(options, receive);
    outgoing.setTimeout(
      8_000,
      () => outgoing.destroy(new Error("http_timeout")),
    );
    outgoing.on("error", reject);
    if (payload) outgoing.write(payload);
    outgoing.end();
  });
};

export const requestTextStream: TextStreamRequester = (request, onChunk) => {
  if (request.protocol !== "http:" || request.hostname !== "127.0.0.1") {
    return Promise.reject(new Error("stream_endpoint_must_be_loopback_http"));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let responseRef: IncomingMessage | null = null;
    let outgoing: ReturnType<typeof httpRequest> | null = null;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      responseRef?.destroy();
      outgoing?.destroy();
      reject(error);
    };
    const succeed = (status: number): void => {
      if (settled) return;
      settled = true;
      resolve({ status });
    };
    const payload = request.body === undefined ? "" : JSON.stringify(request.body);
    outgoing = httpRequest({
      protocol: request.protocol,
      hostname: request.hostname,
      port: request.port,
      path: request.path,
      method: request.method,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(payload)),
        accept: "text/event-stream",
      },
    }, (response) => {
      responseRef = response;
      let responseBytes = 0;
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        if (settled) return;
        responseBytes += Buffer.byteLength(chunk);
        if (responseBytes > MAX_STREAM_RESPONSE_BYTES) {
          fail(new Error("http_stream_response_too_large"));
          return;
        }
        try {
          onChunk(chunk);
        } catch {
          fail(new Error("http_stream_consumer_failed"));
        }
      });
      response.on("end", () => succeed(response.statusCode ?? 0));
      response.on(
        "error",
        (error) =>
          fail(error instanceof Error ? error : new Error("http_stream_failed")),
      );
    });
    outgoing.setTimeout(
      30_000,
      () => fail(new Error("http_stream_timeout")),
    );
    outgoing.on(
      "error",
      (error) => fail(error instanceof Error ? error : new Error("http_stream_failed")),
    );
    outgoing.end(payload);
  });
};
