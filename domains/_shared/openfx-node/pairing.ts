import { CROCKFORD_BASE32_ALPHABET, PAIRING_CODE_LENGTH } from "./constants.ts";

export type RandomBytes = (length: number) => Uint8Array;

export function generatePairingCode(randomBytes: RandomBytes): string {
  const random = randomBytes(PAIRING_CODE_LENGTH);
  if (random.length < PAIRING_CODE_LENGTH) {
    throw new TypeError(`randomBytes must return ${PAIRING_CODE_LENGTH} bytes.`);
  }
  return Array.from(
    random.slice(0, PAIRING_CODE_LENGTH),
    (value) => CROCKFORD_BASE32_ALPHABET[value & 31],
  ).join("");
}

export function validatePairingCode(value: string): boolean {
  return value.length === PAIRING_CODE_LENGTH &&
    Array.from(value).every((character) =>
      CROCKFORD_BASE32_ALPHABET.includes(character)
    );
}
