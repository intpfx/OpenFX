/**
 * CryptoDice — π-based encryption utilities
 *
 * Extracted from the SGR framework (core/serve.js).
 * Refactored to pure functional TypeScript.
 *
 * Encrypts/decrypts strings using digits derived from π decimals.
 * Not cryptographically secure — a novelty/curiosity.
 */

const CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-={}[]|\\:;\"'<>,.?/~`";

/** Extract the encryption digit from π at a given decimal point position. */
const piDigit = (point: number): number => {
  const pi = Math.PI.toFixed(point);
  return parseInt(pi.charAt(point + 1), 10);
};

/**
 * Encrypt a string using π-digit-based position shifting.
 * Each point defines an encryption round: the π digit at that decimal position
 * determines how many times each character gets shifted.
 */
export const encrypt = (gene: string, points: number[] = [1, 4, 2, 9]): string => {
  let geneCode = gene;

  for (const point of points) {
    const digit = piDigit(point);
    let tempCode = "";

    for (const char of geneCode) {
      const charIndex = CHARS.indexOf(char);
      if (charIndex === -1) {
        tempCode += char;
        continue;
      }

      for (let i = 1; i < digit + 1; i++) {
        let index = i * digit + charIndex;
        if (index >= CHARS.length) {
          index = index % CHARS.length;
        }
        tempCode += CHARS.charAt(index);
      }
    }

    geneCode = tempCode;
  }

  return geneCode;
};

/**
 * Decrypt a string previously encrypted with {@link encrypt}.
 * Must use the same points array in the same order.
 */
export const decrypt = (geneCode: string, points: number[] = [1, 4, 2, 9]): string => {
  let gene = geneCode;
  const reversedPoints = [...points].reverse();

  for (const point of reversedPoints) {
    const digit = piDigit(point);
    let tempCode = "";

    for (let i = 0; i < gene.length; i += digit) {
      const char = gene.charAt(i);
      const charIndex = CHARS.indexOf(char);
      if (charIndex === -1) {
        tempCode += char;
        continue;
      }

      let originalCharIndex = charIndex - digit;
      if (originalCharIndex < 0) {
        originalCharIndex = CHARS.length + originalCharIndex;
      }

      tempCode += CHARS.charAt(originalCharIndex);
    }

    gene = tempCode;
  }

  return gene;
};

/** Generate a random "gene" string of alphanumeric+symbol characters. */
const randomGene = (): string => {
  const geneLength = Math.floor(Math.random() * 5) + 4;
  let gene = "";
  for (let i = 0; i < geneLength; i++) {
    gene += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return gene;
};

/** Generate an array of random gene strings. */
export const randomGenes = (count: number): string[] => {
  const genes: string[] = [];
  for (let i = 0; i < count; i++) {
    genes.push(randomGene());
  }
  return genes;
};

/** Generate a random points array for encryption/decryption. */
export const randomPoints = (): number[] => {
  const points = new Set<number>();
  const times = Math.floor(Math.random() * 5) + 1;

  while (points.size < times) {
    const point = Math.floor(Math.random() * 5) + 1;
    if (point !== 0) points.add(point);
  }

  return Array.from(points);
};
