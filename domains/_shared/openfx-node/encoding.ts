const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const combined = (first << 16) | (second << 8) | third;
    output += BASE64_ALPHABET[(combined >>> 18) & 63];
    output += BASE64_ALPHABET[(combined >>> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(combined >>> 6) & 63] : "=";
    output += index + 2 < bytes.length ? BASE64_ALPHABET[combined & 63] : "=";
  }
  return output.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new TypeError("Invalid base64url value.");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const output: number[] = [];

  for (let index = 0; index < padded.length; index += 4) {
    const values = padded.slice(index, index + 4).split("").map((character) =>
      character === "=" ? 0 : BASE64_ALPHABET.indexOf(character)
    );
    if (values.some((entry) => entry < 0)) {
      throw new TypeError("Invalid base64url value.");
    }
    const combined = (values[0]! << 18) | (values[1]! << 12) |
      (values[2]! << 6) | values[3]!;
    output.push((combined >>> 16) & 0xff);
    if (padded[index + 2] !== "=") output.push((combined >>> 8) & 0xff);
    if (padded[index + 3] !== "=") output.push(combined & 0xff);
  }
  return Uint8Array.from(output);
}

export function canonicalJson(value: unknown): string {
  const encoded = JSON.stringify(sortJson(value));
  if (encoded === undefined) {
    throw new TypeError("Value is not JSON serializable.");
  }
  return encoded;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = sortJson(child);
    }
    return result;
  }
  return value;
}
