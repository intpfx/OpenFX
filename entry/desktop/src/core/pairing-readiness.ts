import { validatePairingCode } from "../../../../domains/_shared/openfx-node/pairing.ts";
import { isPublicIpv6 } from "./system-parsers.ts";

export interface PairingNetworkState {
  publicIpv6: string | null;
  ipv6Addresses: readonly string[];
  observedIpv6?: readonly string[];
  mismatch?: boolean;
}

export interface PairingReadinessInput {
  serverUrl: string;
  pairingCode: string;
  nodeName: string;
  network: PairingNetworkState | null;
  submitting: boolean;
}

export interface PairingReadiness {
  canSubmit: boolean;
  serverUrlValid: boolean;
  pairingCodeValid: boolean;
  nodeNameValid: boolean;
  publicIpv6Valid: boolean;
  statusMessage: string;
}

export const derivePairingReadiness = (
  input: PairingReadinessInput,
): PairingReadiness => {
  const serverUrlValid = isHttpsOrigin(input.serverUrl);
  const pairingCodeValid = validatePairingCode(input.pairingCode);
  const nodeNameValid = input.nodeName.trim().length > 0;
  const publicIpv6Valid = hasMatchingPublicIpv6(input.network);
  const fieldsValid = serverUrlValid && pairingCodeValid && nodeNameValid &&
    publicIpv6Valid;

  return {
    canSubmit: fieldsValid && !input.submitting,
    serverUrlValid,
    pairingCodeValid,
    nodeNameValid,
    publicIpv6Valid,
    statusMessage: readinessMessage({
      submitting: input.submitting,
      serverUrlValid,
      pairingCodeValid,
      nodeNameValid,
      publicIpv6Valid,
    }),
  };
};

const isHttpsOrigin = (value: string): boolean => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
};

const hasMatchingPublicIpv6 = (
  network: PairingNetworkState | null,
): boolean => {
  const publicIpv6 = network?.publicIpv6?.toLowerCase() ?? "";
  if (!network || !isPublicIpv6(publicIpv6) || network.mismatch === true) {
    return false;
  }
  const local = network.ipv6Addresses.map((value) => value.toLowerCase());
  const observed = (network.observedIpv6 ?? []).map((value) => value.toLowerCase());
  return local.includes(publicIpv6) && observed.includes(publicIpv6);
};

const readinessMessage = (state: {
  submitting: boolean;
  serverUrlValid: boolean;
  pairingCodeValid: boolean;
  nodeNameValid: boolean;
  publicIpv6Valid: boolean;
}): string => {
  if (state.submitting) return "正在配对，请勿重复提交。";
  if (!state.serverUrlValid) return "请输入有效的 HTTPS 服务端地址。";
  if (!state.pairingCodeValid) return "请输入 8 位 Crockford Base32 配对码。";
  if (!state.nodeNameValid) return "请输入节点名称。";
  if (!state.publicIpv6Valid) return "需要本机与外部观察一致的公网 IPv6。";
  return "已满足安全配对条件。";
};
