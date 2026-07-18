import {
  NODE_PORT,
  PROTOCOL_VERSION,
  validatePairingCode,
} from "../../../../domains/_shared/openfx-node/mod.ts";
import type { TelemetrySample } from "../../../../domains/_shared/openfx-node/types.ts";
import type { HttpJsonRequest, JsonRequester } from "./omlx-client.ts";

export interface PairNodeInput {
  serverUrl: string;
  code: string;
  name: string;
  publicIpv6: string;
}

export interface PairedNode {
  id: string;
  name: string;
}

export interface PairNodeResult {
  node: PairedNode;
  nodeSecret: string;
}

export interface AuthenticatedNodeInput {
  serverUrl: string;
  nodeId: string;
  nodeSecret: string;
}

export interface HeartbeatInput extends AuthenticatedNodeInput {
  publicIpv6: string;
  availability: "online" | "offline" | "degraded";
}

export interface ControlPlaneClient {
  pair(input: PairNodeInput): Promise<PairNodeResult>;
  heartbeat(input: HeartbeatInput): Promise<void>;
  telemetry(
    input: AuthenticatedNodeInput & { sample: TelemetrySample },
  ): Promise<void>;
  events(input: AuthenticatedNodeInput & { events: unknown[] }): Promise<void>;
}

export const createControlPlaneClient = (
  requestJson: JsonRequester,
): ControlPlaneClient => ({
  async pair(input) {
    const origin = httpsOrigin(input.serverUrl);
    const code = input.code.trim().toUpperCase();
    if (!validatePairingCode(code)) throw new Error("node_pairing_invalid");
    const response = await requestJson(nodeRequest(origin, "/api/node/pair", {
      code,
      name: input.name.trim(),
      protocolVersion: PROTOCOL_VERSION,
      publicIpv6: input.publicIpv6,
      port: NODE_PORT,
    }));
    const body = objectValue(response.body);
    const node = objectValue(body.node);
    if (
      response.status !== 201 || body.ok !== true ||
      typeof node.id !== "string" || typeof node.name !== "string" ||
      typeof body.nodeSecret !== "string" || body.nodeSecret.length === 0
    ) throw new Error(errorCode(body, response.status));
    return {
      node: { id: node.id, name: node.name },
      nodeSecret: body.nodeSecret,
    };
  },
  async heartbeat(input) {
    await sendAuthenticated(requestJson, input, "/api/node/heartbeat", {
      nodeId: input.nodeId,
      protocolVersion: PROTOCOL_VERSION,
      publicIpv6: input.publicIpv6,
      port: NODE_PORT,
      availability: input.availability,
    });
  },
  async telemetry(input) {
    await sendAuthenticated(requestJson, input, "/api/node/telemetry", {
      nodeId: input.nodeId,
      protocolVersion: PROTOCOL_VERSION,
      sample: input.sample,
    });
  },
  async events(input) {
    await sendAuthenticated(requestJson, input, "/api/node/events", {
      nodeId: input.nodeId,
      protocolVersion: PROTOCOL_VERSION,
      events: input.events,
    });
  },
});

const sendAuthenticated = async (
  requestJson: JsonRequester,
  input: AuthenticatedNodeInput,
  path: string,
  body: unknown,
): Promise<void> => {
  const request = nodeRequest(httpsOrigin(input.serverUrl), path, body);
  request.headers = { authorization: `Bearer ${input.nodeSecret}` };
  const response = await requestJson(request);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(errorCode(objectValue(response.body), response.status));
  }
};

const nodeRequest = (
  origin: URL,
  path: string,
  body: unknown,
): HttpJsonRequest => ({
  protocol: "https:",
  hostname: origin.hostname,
  port: origin.port ? Number(origin.port) : 443,
  path,
  method: "POST",
  body,
});

const httpsOrigin = (value: string): URL => {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || !url.hostname) {
    throw new Error("https_required");
  }
  return new URL(url.origin);
};

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const errorCode = (body: Record<string, unknown>, status: number): string =>
  typeof body.error === "string" ? body.error : `control_plane_http_${status}`;
