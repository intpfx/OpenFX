import {
  projectGeographicPoint,
  YONGCHANG_WORLD,
} from "./community-world-model.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LOD_ORDER = Object.freeze({ context: 0, town: 1, detail: 2 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function chunkIdsForBounds(bounds) {
  const columns = Math.ceil(YONGCHANG_WORLD.width / YONGCHANG_WORLD.chunkSize);
  const rows = Math.ceil(YONGCHANG_WORLD.height / YONGCHANG_WORLD.chunkSize);
  const minColumn = clamp(
    Math.floor(bounds.minX / YONGCHANG_WORLD.chunkSize),
    0,
    columns - 1,
  );
  const maxColumn = clamp(
    Math.floor(bounds.maxX / YONGCHANG_WORLD.chunkSize),
    0,
    columns - 1,
  );
  const minRow = clamp(
    Math.floor(bounds.minY / YONGCHANG_WORLD.chunkSize),
    0,
    rows - 1,
  );
  const maxRow = clamp(
    Math.floor(bounds.maxY / YONGCHANG_WORLD.chunkSize),
    0,
    rows - 1,
  );
  const chunks = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      chunks.push(`c${column}-r${row}`);
    }
  }
  return Object.freeze(chunks);
}

export function prepareWorldFeatures(features) {
  return Object.freeze(features.map((feature) => {
    const points = feature.coordinates.map(([longitude, latitude]) =>
      projectGeographicPoint({ longitude, latitude })
    );
    const bounds = points.reduce((current, point) => ({
      minX: Math.min(current.minX, point.x),
      minY: Math.min(current.minY, point.y),
      maxX: Math.max(current.maxX, point.x),
      maxY: Math.max(current.maxY, point.y),
    }), {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    });
    const path = points.map((point, index) =>
      `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`
    ).join("") + (feature.closed ? "Z" : "");
    return Object.freeze({
      ...feature,
      points: Object.freeze(points),
      bounds: Object.freeze(bounds),
      chunks: chunkIdsForBounds(bounds),
      path,
    });
  }));
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, String(value));
  }
  return element;
}

function safeClass(value) {
  return String(value || "default").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function createPaperDefinitions() {
  const definitions = svgElement("defs");
  const paperPattern = svgElement("pattern", {
    id: "world-paper-grain",
    width: 96,
    height: 96,
    patternUnits: "userSpaceOnUse",
  });
  paperPattern.append(
    svgElement("path", {
      d: "M-8 24C22 8 42 11 74 1M18 103C37 74 61 73 104 58",
      fill: "none",
      stroke: "#73806b",
      "stroke-width": 2,
      opacity: 0.08,
    }),
    svgElement("circle", {
      cx: 20,
      cy: 68,
      r: 3,
      fill: "#253029",
      opacity: 0.05,
    }),
    svgElement("circle", {
      cx: 76,
      cy: 34,
      r: 2,
      fill: "#b75d49",
      opacity: 0.08,
    }),
  );
  const riverGradient = svgElement("linearGradient", {
    id: "world-river-gradient",
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 1,
  });
  riverGradient.append(
    svgElement("stop", { offset: "0%", "stop-color": "#9ed5dd" }),
    svgElement("stop", { offset: "55%", "stop-color": "#74bdca" }),
    svgElement("stop", { offset: "100%", "stop-color": "#b5dfe3" }),
  );
  const focusGradient = svgElement("linearGradient", {
    id: "focus-ground-gradient",
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
  });
  focusGradient.append(
    svgElement("stop", { offset: "0%", "stop-color": "#f1ddbd" }),
    svgElement("stop", { offset: "52%", "stop-color": "#e7d3b2" }),
    svgElement("stop", { offset: "100%", "stop-color": "#c7d1ae" }),
  );
  definitions.append(paperPattern, riverGradient, focusGradient);
  return definitions;
}

function createUrbanFabric(prepared) {
  const counts = new Map();
  for (const feature of prepared) {
    if (feature.kind !== "road") continue;
    for (const chunk of feature.chunks) {
      counts.set(chunk, (counts.get(chunk) || 0) + 1);
    }
  }
  const group = svgElement("g", {
    class: "scene-urban-fabric",
    "aria-hidden": "true",
  });
  for (const [chunk, count] of counts) {
    if (count < 3) continue;
    const match = /^c(\d+)-r(\d+)$/.exec(chunk);
    if (!match) continue;
    const column = Number(match[1]);
    const row = Number(match[2]);
    const inset = 42 + (column * 17 + row * 29) % 38;
    group.append(svgElement("rect", {
      x: column * YONGCHANG_WORLD.chunkSize + inset,
      y: row * YONGCHANG_WORLD.chunkSize + inset,
      width: Math.max(40, YONGCHANG_WORLD.chunkSize - inset * 2),
      height: Math.max(40, YONGCHANG_WORLD.chunkSize - inset * 2),
      rx: 72,
      class: "scene-urban-cell",
      "data-density": Math.min(5, Math.ceil(count / 4)),
      "data-chunks": chunk,
      "data-lod": "context",
    }));
  }
  return group;
}

function createFocusAsset(asset) {
  const group = svgElement("g", {
    class: `scene-focus-asset scene-focus-${asset.kind}`,
    transform:
      `translate(${asset.center.x} ${asset.center.y}) rotate(${asset.angle})`,
    "data-focus-asset-id": asset.id,
    "data-palette": asset.palette,
    "data-lod": "town",
    "data-chunks": asset.chunk,
  });
  const halfWidth = asset.width / 2;
  const halfDepth = asset.depth / 2;

  if (asset.kind === "courtyard") {
    group.append(
      svgElement("rect", {
        class: "scene-focus-courtyard-ground",
        x: -halfWidth,
        y: -halfDepth,
        width: asset.width,
        height: asset.depth,
        rx: 5,
      }),
      svgElement("circle", {
        class: "scene-focus-courtyard-tree",
        cx: -asset.width * 0.18,
        cy: 0,
        r: 5.5,
      }),
      svgElement("path", {
        class: "scene-focus-courtyard-seat",
        d: `M${asset.width * 0.06},${asset.depth * 0.16}h${asset.width * 0.25}`,
      }),
    );
  } else {
    const faceOffset = Math.max(3, asset.height * 0.42);
    group.append(
      svgElement("rect", {
        class: "scene-focus-building-shadow",
        x: -halfWidth + faceOffset,
        y: -halfDepth + faceOffset,
        width: asset.width,
        height: asset.depth,
        rx: 3,
      }),
      svgElement("path", {
        class: "scene-focus-building-face",
        d: `M${-halfWidth},${halfDepth - 2}L${halfWidth},${
          halfDepth - 2
        }L${halfWidth},${halfDepth + faceOffset}L${-halfWidth},${
          halfDepth + faceOffset
        }Z`,
      }),
      svgElement("rect", {
        class: "scene-focus-building-roof",
        x: -halfWidth,
        y: -halfDepth,
        width: asset.width,
        height: asset.depth,
        rx: 3,
      }),
      svgElement("path", {
        class: "scene-focus-building-ridge",
        d: `M${-halfWidth + 4},0H${halfWidth - 4}`,
      }),
    );
  }

  const details = svgElement("g", {
    class: "scene-focus-asset-details",
    "data-lod": "detail",
    "data-chunks": asset.chunk,
  });
  if (asset.kind === "courtyard") {
    details.append(
      svgElement("circle", {
        class: "scene-focus-courtyard-canopy",
        cx: -asset.width * 0.18,
        cy: -1.5,
        r: 3.2,
      }),
      svgElement("circle", {
        class: "scene-focus-courtyard-lantern",
        cx: asset.width * 0.28,
        cy: -asset.depth * 0.2,
        r: 1.9,
      }),
    );
  } else {
    details.append(
      svgElement("circle", {
        class: "scene-focus-building-window",
        cx: -asset.width * 0.22,
        cy: asset.depth / 2 + Math.max(3, asset.height * 0.42) - 2,
        r: 1.6,
      }),
      svgElement("circle", {
        class: "scene-focus-building-window",
        cx: asset.width * 0.22,
        cy: asset.depth / 2 + Math.max(3, asset.height * 0.42) - 2,
        r: 1.6,
      }),
    );
  }
  group.append(details);
  return group;
}

export function renderFocusDistrict(layer, district) {
  if (!district) {
    layer.replaceChildren();
    return;
  }
  const ground = svgElement("path", {
    class: "scene-focus-district-ground",
    d: district.path,
    "data-lod": "context",
    "data-chunks": district.chunks.join(" "),
  });
  const edge = svgElement("path", {
    class: "scene-focus-district-edge",
    d: district.path,
    "data-lod": "town",
    "data-chunks": district.chunks.join(" "),
  });
  layer.replaceChildren(
    ground,
    ...district.assets.map(createFocusAsset),
    edge,
  );
}

export function renderCommunityWorld(
  svg,
  preparedFeatures,
  focusDistrict = null,
) {
  svg.setAttribute(
    "viewBox",
    `0 0 ${YONGCHANG_WORLD.width} ${YONGCHANG_WORLD.height}`,
  );
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "基于公开地理数据绘制的永昌镇老城区艺术化矢量骨架",
  );

  const background = svgElement("rect", {
    class: "scene-world-paper",
    width: YONGCHANG_WORLD.width,
    height: YONGCHANG_WORLD.height,
    fill: "url(#world-paper-grain)",
  });
  const layers = new Map([
    ["land", svgElement("g", { class: "scene-world-layer scene-world-land" })],
    [
      "water",
      svgElement("g", { class: "scene-world-layer scene-world-water" }),
    ],
    [
      "waterway",
      svgElement("g", { class: "scene-world-layer scene-world-waterways" }),
    ],
    ["road", svgElement("g", { class: "scene-world-layer scene-world-roads" })],
    [
      "building",
      svgElement("g", { class: "scene-world-layer scene-world-buildings" }),
    ],
  ]);

  for (const feature of preparedFeatures) {
    const path = svgElement("path", {
      d: feature.path,
      class: `scene-world-feature scene-world-${
        safeClass(feature.kind)
      } scene-world-${safeClass(feature.classification)}`,
      "data-feature-id": feature.id,
      "data-lod": feature.lod,
      "data-chunks": feature.chunks.join(" "),
    });
    if (feature.name) path.setAttribute("data-name", feature.name);
    layers.get(feature.kind)?.append(path);
  }

  const focusLayer = svgElement("g", {
    id: "scene_focus_geometry",
    class: "scene-focus-geometry",
  });
  const focusDistrictLayer = svgElement("g", {
    id: "scene_focus_district",
    class: "scene-focus-district",
    "aria-hidden": "true",
  });
  renderFocusDistrict(focusDistrictLayer, focusDistrict);
  svg.replaceChildren(
    createPaperDefinitions(),
    background,
    ...[
      layers.get("land"),
      createUrbanFabric(preparedFeatures),
      focusDistrictLayer,
      layers.get("water"),
      layers.get("waterway"),
      layers.get("road"),
      layers.get("building"),
      focusLayer,
    ],
  );
  return Object.freeze({
    focusLayer,
    focusDistrictLayer,
    featureCount: preparedFeatures.length,
  });
}

export function updateWorldRenderVisibility(svg, lod, visibleChunks) {
  const visible = new Set(visibleChunks);
  const maximumLod = LOD_ORDER[lod] ?? 0;
  for (const element of svg.querySelectorAll("[data-lod][data-chunks]")) {
    const featureLod = LOD_ORDER[element.dataset.lod] ?? 0;
    const chunks = element.dataset.chunks.split(" ");
    const shouldHide = featureLod > maximumLod ||
      !chunks.some((chunk) => visible.has(chunk));
    element.toggleAttribute("hidden", shouldHide);
  }
}
