const argumentsByName = new Map(Deno.args.map((argument) => {
  const [name, ...value] = argument.split("=");
  return [name, value.join("=")];
}));

const inputPath = argumentsByName.get("--input") ||
  "source/data/shengdeng-focus.geojson";
const canonicalPath = argumentsByName.get("--canonical-output") ||
  "source/data/shengdeng-focus.geojson";
const outputPath = argumentsByName.get("--output") ||
  "source/data/shengdeng-focus-area.js";
const feature = JSON.parse(await Deno.readTextFile(inputPath));

if (
  feature?.type !== "Feature" || feature?.geometry?.type !== "Polygon" ||
  feature?.properties?.boundaryKind !== "product-focus-area" ||
  feature?.properties?.administrativeBoundary !== false
) {
  throw new TypeError(
    "Expected a non-administrative product-focus-area GeoJSON Polygon",
  );
}

const moduleSource = `const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

export const SHENGDENG_FOCUS_AREA = deepFreeze(${
  JSON.stringify(feature, null, 2)
});
`;

if (inputPath !== canonicalPath) {
  await Deno.writeTextFile(
    canonicalPath,
    `${JSON.stringify(feature, null, 2)}\n`,
  );
}
await Deno.writeTextFile(outputPath, moduleSource);
console.log(`Updated ${canonicalPath} and generated ${outputPath}`);
