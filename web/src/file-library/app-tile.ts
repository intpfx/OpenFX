export function getLibraryAppTileColor(appId: string): string {
  let hash = 2_166_136_261;
  for (const character of appId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }

  const unsigned = hash >>> 0;
  const hue = unsigned % 360;
  const saturation = 54 + (unsigned >>> 8) % 18;
  const lightness = 32 + (unsigned >>> 16) % 9;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}
