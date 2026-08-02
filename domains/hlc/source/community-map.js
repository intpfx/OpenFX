import {
  createSceneContentViewModel,
  createSceneRouteHash,
  getScenePlace,
  getSceneService,
  parseSceneRouteHash,
  SCENE_GEOGRAPHY,
  SCENE_PLACES,
} from "./community-map-model.js";
import {
  createSceneArtRects,
  getSceneArtZoom,
  isScenePlaceArtLod,
} from "./community-art-model.js";
import {
  clampWorldCamera,
  clampWorldCameraToRect,
  createFocusAreaGeoJson,
  focusAreaGeoJsonToWorldPoints,
  getVisibleWorldChunks,
  getWorldLod,
  projectGeographicPoint,
  unprojectWorldPoint,
  viewportToWorldPoint,
  YONGCHANG_WORLD,
} from "./community-world-model.js";
import { createFocusDistrict } from "./community-focus-model.js";
import {
  prepareWorldFeatures,
  renderCommunityWorld,
  renderFocusDistrict,
  updateWorldRenderVisibility,
} from "./community-world-renderer.js";
import { SHENGDENG_FOCUS_AREA } from "./data/shengdeng-focus-area.js";
import { YONGCHANG_SCENE_DATA } from "./data/yongchang-scene-data.js";

const LEGACY_PAGE_BY_ENTRANCE = Object.freeze({
  article_entrance: "article-page",
  more_entrance: "feature-page",
  original_entrance: "original-page",
  public_entrance: "public-page",
});

function placeArtLayer(element, rect) {
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

function requestArtLayer(element) {
  if (element.dataset.loaded === "true") return;
  const source = element.querySelector("source[data-srcset]");
  const image = element.querySelector("img[data-src]");
  if (source) source.srcset = source.dataset.srcset;
  if (image) image.src = image.dataset.src;
  element.dataset.loaded = "true";
}

function getArtTargetLayout(rect, artTarget) {
  const xs = artTarget.polygon.map(([x]) => x);
  const ys = artTarget.polygon.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const localPoints = artTarget.polygon.map(([x, y]) => [
    (x - minX) / rangeX * 100,
    (y - minY) / rangeY * 100,
  ]);

  return {
    x: rect.x + minX * rect.width,
    y: rect.y + minY * rect.height,
    width: rangeX * rect.width,
    height: rangeY * rect.height,
    labelX: (artTarget.labelPosition.x - minX) / rangeX * 100,
    labelY: (artTarget.labelPosition.y - minY) / rangeY * 100,
    focusPoint: {
      x: rect.x + artTarget.labelPosition.x * rect.width,
      y: rect.y + artTarget.labelPosition.y * rect.height,
    },
    localPoints,
  };
}

function positionPlaceButton(button, item, rect) {
  const layout = getArtTargetLayout(rect, item.artTarget);
  const clipPath = layout.localPoints
    .map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`)
    .join(", ");
  button.style.setProperty("--hotspot-x", `${layout.x}px`);
  button.style.setProperty("--hotspot-y", `${layout.y}px`);
  button.style.setProperty("--hotspot-width", `${layout.width}px`);
  button.style.setProperty("--hotspot-height", `${layout.height}px`);
  button.style.setProperty("--hotspot-clip", `polygon(${clipPath})`);
  button.style.setProperty("--hotspot-label-x", `${layout.labelX}%`);
  button.style.setProperty("--hotspot-label-y", `${layout.labelY}%`);
  return layout.focusPoint;
}

function createPlaceButton(item, index) {
  const button = document.createElement("button");
  const label = document.createElement("span");

  button.className = "scene-hotspot";
  button.type = "button";
  button.dataset.placeId = item.id;
  button.dataset.interaction = "labeled-place";
  button.setAttribute("aria-label", `打开${item.name}，${item.kicker}`);
  button.title = item.name;
  button.style.setProperty("--hotspot-accent", item.accent);
  button.style.setProperty("--hotspot-index", index);

  label.className = "scene-hotspot-label";
  label.textContent = item.name;
  button.append(label);
  return button;
}

function createPlaceListItem(item, index) {
  const row = document.createElement("button");
  const number = document.createElement("span");
  const copy = document.createElement("span");
  const name = document.createElement("strong");
  const kicker = document.createElement("small");

  row.className = "scene-place-row";
  row.type = "button";
  row.dataset.placeId = item.id;
  number.className = "scene-place-number";
  number.textContent = String(index + 1).padStart(2, "0");
  copy.className = "scene-place-copy";
  name.textContent = item.name;
  kicker.textContent = item.kicker;
  copy.append(name, kicker);
  row.append(number, copy);
  return row;
}

function createServiceButton(service, index) {
  const button = document.createElement("button");
  const number = document.createElement("span");
  const copy = document.createElement("span");
  const name = document.createElement("strong");
  const description = document.createElement("small");
  const arrow = document.createElement("span");

  button.className = "scene-service-row";
  button.type = "button";
  button.dataset.serviceId = service.id;
  button.setAttribute("aria-label", `${service.name}，${service.description}`);
  number.className = "scene-service-number";
  number.textContent = String(index + 1).padStart(2, "0");
  copy.className = "scene-service-copy";
  name.textContent = service.name;
  description.textContent = service.description;
  copy.append(name, description);
  arrow.className = "scene-service-arrow";
  arrow.textContent = "→";
  arrow.setAttribute("aria-hidden", "true");
  button.append(number, copy, arrow);
  return button;
}

function createSceneContentMasthead(content, onSelectService) {
  const masthead = document.createElement("aside");
  const back = document.createElement("button");
  const brand = document.createElement("p");
  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  const place = document.createElement("span");
  const title = document.createElement("h1");
  const lead = document.createElement("p");
  const navigation = document.createElement("nav");
  const note = document.createElement("p");

  masthead.className = "scene-content-masthead";
  masthead.setAttribute("aria-label", `${content.placeName}内容导览`);
  back.className = "exit scene-content-back";
  back.type = "button";
  back.textContent = "← 返回地图";
  back.title = `返回${content.placeName}`;
  brand.className = "scene-content-brand";
  brand.textContent = "HOLY LANTERN COMMUNITY · 圣灯社区";
  copy.className = "scene-content-copy";
  eyebrow.className = "scene-content-eyebrow";
  eyebrow.textContent = `${content.sequence} · ${content.eyebrow}`;
  place.className = "scene-content-place";
  place.textContent = content.placeName;
  title.id = `scene_content_title_${content.serviceId}`;
  title.textContent = content.serviceName;
  lead.textContent = content.lead;
  copy.append(eyebrow, place, title, lead);
  navigation.className = "scene-content-nav";
  navigation.setAttribute("aria-label", `${content.placeName}服务切换`);
  for (const item of content.navigation) {
    const button = document.createElement("button");
    const sequence = document.createElement("span");
    const name = document.createElement("strong");
    button.type = "button";
    button.dataset.sceneServiceSwitch = item.id;
    button.classList.toggle("is-active", item.active);
    button.setAttribute("aria-current", item.active ? "page" : "false");
    sequence.textContent = item.sequence;
    name.textContent = item.name;
    button.append(sequence, name);
    button.addEventListener("click", () => onSelectService(item.id));
    navigation.append(button);
  }
  note.className = "scene-content-note";
  note.textContent = content.note;
  masthead.append(back, brand, copy, navigation, note);
  return masthead;
}

function createSceneContentContext(content) {
  const context = document.createElement("header");
  const eyebrow = document.createElement("p");
  const title = document.createElement("h2");
  const description = document.createElement("p");
  context.className = "scene-content-context";
  eyebrow.textContent = "CURRENT VIEW · 当前内容";
  title.textContent = content.contentTitle;
  description.textContent = content.serviceDescription;
  context.append(eyebrow, title, description);
  return context;
}

function createSceneContentBody(routeRoot, content) {
  const body = document.createElement("div");
  body.className = "scene-content-body";
  body.dataset.sceneEmptyTitle = content.emptyTitle;
  for (const child of [...routeRoot.children]) {
    if (!child.classList.contains("page_title")) body.append(child);
  }
  routeRoot.append(body);
  return body;
}

function createGeographyLabel(anchor, index) {
  const label = document.createElement("span");
  const number = document.createElement("small");
  const copy = document.createElement("span");

  label.className = "scene-geography-label";
  const point = projectGeographicPoint(anchor.coordinate);
  label.style.setProperty("--anchor-x", `${point.x}px`);
  label.style.setProperty("--anchor-y", `${point.y}px`);
  label.style.setProperty("--anchor-index", index);
  number.textContent = String(index + 1).padStart(2, "0");
  copy.textContent = anchor.name;
  copy.title = anchor.description;
  label.append(number, copy);
  return label;
}

function setInteractive(container, enabled) {
  const focusableSelector = "a, button, input, select, textarea, [tabindex]";
  const controls = [container, ...container.querySelectorAll(focusableSelector)]
    .filter((element) => element.matches(focusableSelector));

  container.toggleAttribute("inert", !enabled);
  for (const control of controls) {
    if (!enabled) {
      if (!control.hasAttribute("data-scene-tabindex")) {
        control.dataset.sceneTabindex = control.getAttribute("tabindex") ?? "";
      }
      control.setAttribute("tabindex", "-1");
      continue;
    }

    if (!control.hasAttribute("data-scene-tabindex")) continue;
    const originalTabIndex = control.dataset.sceneTabindex;
    if (originalTabIndex) control.setAttribute("tabindex", originalTabIndex);
    else control.removeAttribute("tabindex");
    delete control.dataset.sceneTabindex;
  }
}

function initializeCommunityMap() {
  const root = document.querySelector("#community_map");
  if (!root) return;

  const viewport = root.querySelector("#scene_viewport");
  const canvas = root.querySelector("#scene_canvas");
  const overviewArt = root.querySelector("#scene_art_overview");
  const detailArt = root.querySelector("#scene_art_detail");
  const placeArtLayers = new Map(
    [...root.querySelectorAll("[data-place-art-id]")].map((element) => [
      element.dataset.placeArtId,
      element,
    ]),
  );
  const gestureHint = root.querySelector(".scene-gesture-hint");
  const worldSvg = root.querySelector("#scene_world_svg");
  const geographyLayer = root.querySelector("#scene_geography");
  const hotspotLayer = root.querySelector("#scene_hotspots");
  const sceneNavigator = root.querySelector("#scene_navigator");
  const placeList = root.querySelector("#scene_place_list");
  const placeListItems = root.querySelector("#scene_place_list_items");
  const listTrigger = root.querySelector("#scene_list_trigger");
  const evidence = root.querySelector("#scene_evidence");
  const evidenceCenter = root.querySelector("#scene_evidence_center");
  const evidenceSystem = root.querySelector("#scene_evidence_system");
  const detail = root.querySelector("#scene_detail");
  const detailKicker = root.querySelector("#scene_detail_kicker");
  const detailTitle = root.querySelector("#scene_detail_title");
  const detailSummary = root.querySelector("#scene_detail_summary");
  const detailServiceList = root.querySelector("#scene_detail_service_list");
  const intro = root.querySelector("#scene_intro");
  const status = root.querySelector("#scene_status");
  const boundaryEditor = root.querySelector("#scene_boundary_editor");
  const boundaryDrafter = root.querySelector("#scene_boundary_drafter");
  const boundaryCount = root.querySelector("#scene_boundary_count");
  const boundaryCoordinates = root.querySelector("#scene_boundary_coordinates");

  const preparedFeatures = prepareWorldFeatures(YONGCHANG_SCENE_DATA.features);
  let savedBoundary = {
    feature: SHENGDENG_FOCUS_AREA,
    points: focusAreaGeoJsonToWorldPoints(SHENGDENG_FOCUS_AREA),
  };
  let focusDistrict = createFocusDistrict(
    SHENGDENG_FOCUS_AREA,
    preparedFeatures,
  );
  const { focusLayer, focusDistrictLayer } = renderCommunityWorld(
    worldSvg,
    preparedFeatures,
    focusDistrict,
  );
  canvas.style.width = `${YONGCHANG_WORLD.width}px`;
  canvas.style.height = `${YONGCHANG_WORLD.height}px`;
  const defaultCenter = projectGeographicPoint(YONGCHANG_WORLD.center);
  let state = { centerX: defaultCenter.x, centerY: defaultCenter.y, zoom: 1 };
  let activeArtLod = "overview";
  let artRects = createSceneArtRects(YONGCHANG_WORLD, focusDistrict.center);
  let activePlaceId = null;
  let contentPlaceId = null;
  let activeTrigger = null;
  let drag = null;
  let focusTimer = null;
  let lastRouteKey = null;
  let boundaryDraft = [];
  let boundaryEditing = false;
  const placeWorldPoints = new Map();
  const reduceMotion = globalThis.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  const positionArtLayers = () => {
    artRects = createSceneArtRects(YONGCHANG_WORLD, focusDistrict.center);
    placeArtLayer(overviewArt, artRects.overview);
    placeArtLayer(detailArt, artRects.detail);
    for (const [placeId, element] of placeArtLayers) {
      placeArtLayer(element, artRects[placeId]);
    }
  };
  positionArtLayers();

  SCENE_PLACES.forEach((item, index) => {
    const button = createPlaceButton(item, index);
    placeWorldPoints.set(
      item.id,
      positionPlaceButton(button, item, artRects.detail),
    );
    hotspotLayer.appendChild(button);
    placeListItems.appendChild(createPlaceListItem(item, index));
  });
  SCENE_GEOGRAPHY.anchors.forEach((anchor, index) => {
    geographyLayer.appendChild(createGeographyLabel(anchor, index));
  });
  evidenceCenter.textContent = `${
    SCENE_GEOGRAPHY.center.latitude.toFixed(6)
  }°N · ${SCENE_GEOGRAPHY.center.longitude.toFixed(6)}°E`;
  evidenceSystem.textContent =
    `${SCENE_GEOGRAPHY.coordinateSystem} · 离线矢量快照`;
  setInteractive(viewport, false);
  setInteractive(listTrigger, false);
  setInteractive(placeList, false);
  setInteractive(evidence, false);
  setInteractive(detail, false);
  setInteractive(boundaryEditor, false);

  const announce = (message) => {
    status.textContent = "";
    requestAnimationFrame(() => {
      status.textContent = message;
    });
  };

  const applySceneState = () => {
    // Focused hotspot buttons live inside the transformed canvas. Some browsers
    // otherwise scroll the overflow container to reveal them before our camera
    // animation runs, which can expose the parent art beneath a place layer.
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    const bounds = viewport.getBoundingClientRect();
    const worldCamera = clampWorldCamera(state, {
      width: bounds.width,
      height: bounds.height,
    });
    const clamped = clampWorldCameraToRect(
      worldCamera,
      bounds,
      artRects[activeArtLod],
    );
    state = clamped;
    canvas.style.setProperty(
      "--scene-x",
      `${bounds.width / 2 - clamped.centerX * clamped.scale}px`,
    );
    canvas.style.setProperty(
      "--scene-y",
      `${bounds.height / 2 - clamped.centerY * clamped.scale}px`,
    );
    canvas.style.setProperty("--scene-scale", clamped.scale);
    canvas.style.setProperty("--scene-ui-scale", 1 / clamped.scale);
    root.dataset.zoom = clamped.zoom.toFixed(2);
    const isPlaceArt = isScenePlaceArtLod(activeArtLod);
    root.dataset.artLod = isPlaceArt ? "place" : activeArtLod;
    if (isPlaceArt) root.dataset.placeArt = activeArtLod;
    else delete root.dataset.placeArt;
    for (const [placeId, element] of placeArtLayers) {
      element.classList.toggle("is-active", placeId === activeArtLod);
    }
    for (const hotspot of hotspotLayer.children) {
      hotspot.dataset.placeArtVisible = String(
        isPlaceArt && hotspot.dataset.placeId === activeArtLod,
      );
    }
    gestureHint.textContent = activeArtLod === "overview"
      ? "拖动探索 · 放大进入圣灯片区"
      : activeArtLod === "detail"
      ? "点击建筑进入场所 · 缩小返回永昌全景"
      : `拖动查看${
        getScenePlace(activeArtLod)?.name ?? "场所"
      } · 缩小返回圣灯片区`;
    const lod = getWorldLod(clamped.zoom);
    root.dataset.lod = lod;
    updateWorldRenderVisibility(
      worldSvg,
      lod,
      getVisibleWorldChunks(clamped, bounds),
    );
  };

  const getZoomOneScale = (bounds) =>
    clampWorldCamera({
      centerX: defaultCenter.x,
      centerY: defaultCenter.y,
      zoom: 1,
    }, bounds).scale;

  const getArtZoom = (lod, bounds) =>
    getSceneArtZoom(lod, bounds, artRects, getZoomOneScale(bounds));

  const applyFocusAreaFeature = (feature) => {
    const points = focusAreaGeoJsonToWorldPoints(feature);
    savedBoundary = { feature, points };
    focusDistrict = createFocusDistrict(feature, preparedFeatures);
    renderFocusDistrict(focusDistrictLayer, focusDistrict);
    positionArtLayers();
    for (const item of SCENE_PLACES) {
      const hotspot = hotspotLayer.querySelector(
        `[data-place-id="${item.id}"]`,
      );
      if (!hotspot) continue;
      placeWorldPoints.set(
        item.id,
        positionPlaceButton(hotspot, item, artRects.detail),
      );
    }
    applySceneState();
  };

  const animateToSceneState = (nextState, nextArtLod = activeArtLod) => {
    globalThis.clearTimeout(focusTimer);
    const currentArtLod = activeArtLod;
    root.classList.add("is-focusing");
    const currentStage = isScenePlaceArtLod(currentArtLod)
      ? "place"
      : currentArtLod;
    const nextStage = isScenePlaceArtLod(nextArtLod) ? "place" : nextArtLod;
    root.dataset.artTransition = `${currentStage}-to-${nextStage}`;
    activeArtLod = nextArtLod;
    state = nextState;
    applySceneState();
    focusTimer = globalThis.setTimeout(
      () => {
        root.classList.remove("is-focusing");
        delete root.dataset.artTransition;
      },
      reduceMotion.matches ? 20 : 880,
    );
  };

  const focusSceneOnPlace = (item) => {
    const bounds = viewport.getBoundingClientRect();
    const isNarrow = globalThis.matchMedia("(max-width: 720px)").matches;
    const targetX = isNarrow ? 0.5 : 0.37;
    const targetY = isNarrow ? 0.16 : 0.48;
    const point = placeWorldPoints.get(item.id) ??
      projectGeographicPoint(item.coordinate);
    const nextArtLod = placeArtLayers.has(item.id) ? item.id : "detail";
    const placeArt = placeArtLayers.get(nextArtLod);
    if (placeArt) requestArtLayer(placeArt);
    const zoom = getArtZoom(nextArtLod, bounds);
    const measured = clampWorldCamera({
      centerX: point.x,
      centerY: point.y,
      zoom,
    }, {
      width: bounds.width,
      height: bounds.height,
    });
    animateToSceneState({
      centerX: point.x - (targetX - 0.5) * bounds.width / measured.scale,
      centerY: point.y - (targetY - 0.5) * bounds.height / measured.scale,
      zoom,
    }, nextArtLod);
  };

  const focusSceneOnDistrict = () => {
    const bounds = viewport.getBoundingClientRect();
    animateToSceneState({
      centerX: focusDistrict.center.x,
      centerY: focusDistrict.center.y,
      zoom: getArtZoom("detail", bounds),
    }, "detail");
    announce("已进入圣灯初版高精范围，七个内容场所已展开");
  };

  const enterScene = ({ focus = true } = {}) => {
    if (!root.classList.contains("is-entered")) {
      root.classList.add("is-entered");
      intro.classList.add("is-dismissed");
      intro.setAttribute("aria-hidden", "true");
      setInteractive(intro, false);
      setInteractive(viewport, true);
      setInteractive(listTrigger, true);
    }
    if (focus) viewport.focus({ preventScroll: true });
  };

  const closePlaceList = ({ restoreFocus = false } = {}) => {
    if (!placeList.classList.contains("is-open")) return;
    placeList.classList.remove("is-open");
    placeList.setAttribute("aria-hidden", "true");
    setInteractive(placeList, false);
    listTrigger.setAttribute("aria-expanded", "false");
    sceneNavigator.dataset.state = "collapsed";
    root.classList.remove("has-list-open");
    globalThis.dispatchEvent(new Event("hlc:account-panel-reset"));
    if (restoreFocus) listTrigger.focus();
  };

  const closeEvidence = ({ restoreFocus = false } = {}) => {
    if (!evidence.classList.contains("is-open")) return;
    evidence.classList.remove("is-open");
    evidence.setAttribute("aria-hidden", "true");
    setInteractive(evidence, false);
    root.classList.remove("has-evidence-open");
    if (restoreFocus) {
      viewport.focus({ preventScroll: true });
    }
  };

  const renderBoundary = () => {
    focusLayer.replaceChildren();
    const points = boundaryEditing
      ? boundaryDraft
      : savedBoundary?.points ?? [];
    boundaryCount.textContent = `${points.length} 个节点`;
    const lastPoint = points.at(-1);
    if (lastPoint) {
      const coordinate = unprojectWorldPoint(lastPoint);
      boundaryCoordinates.textContent = `${
        coordinate.latitude.toFixed(6)
      }°N · ${coordinate.longitude.toFixed(6)}°E`;
    } else {
      boundaryCoordinates.textContent = "尚未落点";
    }
    if (!boundaryEditing || points.length === 0) return;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const pathData = points.map((point, index) =>
      `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`
    ).join("");
    path.setAttribute("d", pathData + (points.length >= 3 ? "Z" : ""));
    path.setAttribute(
      "class",
      `scene-focus-area-shape${boundaryEditing ? " is-draft" : " is-saved"}`,
    );
    focusLayer.append(path);

    points.forEach((point, index) => {
      const marker = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      marker.setAttribute("cx", point.x);
      marker.setAttribute("cy", point.y);
      marker.setAttribute("r", index === 0 ? "23" : "17");
      marker.setAttribute("class", "scene-focus-area-node");
      focusLayer.append(marker);
    });
  };

  const closeBoundaryEditor = ({ restoreFocus = false } = {}) => {
    if (!boundaryEditor.classList.contains("is-open")) return;
    boundaryEditor.classList.remove("is-open");
    boundaryEditor.setAttribute("aria-hidden", "true");
    setInteractive(boundaryEditor, false);
    root.classList.remove("has-boundary-open", "is-boundary-editing");
    boundaryEditing = false;
    renderBoundary();
    if (restoreFocus) {
      viewport.focus({ preventScroll: true });
    }
  };

  const addBoundaryPoint = (event) => {
    const bounds = viewport.getBoundingClientRect();
    const point = viewportToWorldPoint(
      {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      state,
      bounds,
    );
    if (
      point.x < 0 || point.y < 0 || point.x > YONGCHANG_WORLD.width ||
      point.y > YONGCHANG_WORLD.height
    ) {
      announce("请在永昌镇建模范围内落点");
      return;
    }
    boundaryDraft.push(point);
    renderBoundary();
    announce(`已添加第 ${boundaryDraft.length} 个范围节点`);
  };

  const createBoundaryFeature = () => {
    if (boundaryDraft.length < 3) {
      announce("至少需要三个节点才能形成范围");
      return null;
    }
    return createFocusAreaGeoJson(boundaryDraft, {
      draftedBy: boundaryDrafter.value.trim() || "未署名绘制者",
      version: (savedBoundary?.feature?.properties?.version || 0) + 1,
    });
  };

  const saveBoundary = () => {
    const feature = createBoundaryFeature();
    if (!feature) return;
    applyFocusAreaFeature(feature);
    boundaryDraft = [...savedBoundary.points];
    globalThis.localStorage?.setItem(
      "hlc.shengdeng.focus-area.v1",
      JSON.stringify(feature),
    );
    renderBoundary();
    announce(`已在本机保存范围版本 ${feature.properties.version}`);
  };

  const exportBoundary = () => {
    const feature = savedBoundary?.feature ?? createBoundaryFeature();
    if (!feature) return;
    const blob = new Blob([`${JSON.stringify(feature, null, 2)}\n`], {
      type: "application/geo+json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "shengdeng-focus.geojson";
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(link.href), 0);
    announce("已导出 shengdeng-focus.geojson");
  };

  const closeDetail = ({ restoreFocus = false } = {}) => {
    if (!detail.classList.contains("is-open")) return;
    detail.classList.remove("is-open");
    detail.setAttribute("aria-hidden", "true");
    setInteractive(detail, false);
    root.classList.remove("has-detail-open");
    root.querySelectorAll("[data-place-id].is-active").forEach((element) => {
      element.classList.remove("is-active");
      element.removeAttribute("aria-current");
    });
    if (restoreFocus && activeTrigger) activeTrigger.focus();
    activePlaceId = null;
    activeTrigger = null;
  };

  const openPlace = (placeId, trigger, options = {}) => {
    const item = getScenePlace(placeId);
    if (!item) return;
    const { updateRoute = true, focus = true } = options;

    activePlaceId = item.id;
    activeTrigger = placeList.contains(trigger) ? listTrigger : trigger;
    root.querySelectorAll("[data-place-id]").forEach((element) => {
      const isActive = element.dataset.placeId === item.id;
      element.classList.toggle("is-active", isActive);
      if (isActive) element.setAttribute("aria-current", "location");
      else element.removeAttribute("aria-current");
    });
    detailKicker.textContent = item.kicker;
    detailTitle.textContent = item.name;
    detailSummary.textContent = item.summary;
    detail.style.setProperty("--detail-accent", item.accent);
    detailServiceList.replaceChildren(
      ...item.services.map((service, index) =>
        createServiceButton(service, index)
      ),
    );
    detail.classList.add("is-open");
    detail.setAttribute("aria-hidden", "false");
    setInteractive(detail, true);
    root.classList.add("has-detail-open");
    closePlaceList();
    closeEvidence();
    closeBoundaryEditor();
    if (focus) focusSceneOnPlace(item);
    if (updateRoute) updateSceneRoute({ placeId: item.id });
    announce(`已打开${item.name}`);

    if (globalThis.matchMedia("(max-width: 720px)").matches) {
      detail.querySelector(".scene-panel-close").focus();
    }
  };

  const zoomScene = (direction) => {
    if (direction > 0) {
      if (activeArtLod === "overview") {
        focusSceneOnDistrict();
        return;
      }
      if (activeArtLod === "detail" && placeArtLayers.has(activePlaceId)) {
        focusSceneOnPlace(getScenePlace(activePlaceId));
        return;
      }
      announce(
        isScenePlaceArtLod(activeArtLod)
          ? `当前已是${getScenePlace(activeArtLod)?.name ?? "场所"}高精视图`
          : "当前已是圣灯高精视图",
      );
      return;
    }
    if (isScenePlaceArtLod(activeArtLod)) {
      focusSceneOnDistrict();
      return;
    }
    if (activeArtLod === "detail") {
      resetScene();
      return;
    }
    announce("当前已是永昌镇全景");
  };

  const resetScene = () => {
    const bounds = viewport.getBoundingClientRect();
    animateToSceneState({
      centerX: defaultCenter.x,
      centerY: defaultCenter.y,
      zoom: getArtZoom("overview", bounds),
    }, "overview");
    announce("已回到永昌镇老城区全景");
  };

  const togglePlaceList = () => {
    const isOpen = placeList.classList.toggle("is-open");
    placeList.setAttribute("aria-hidden", String(!isOpen));
    setInteractive(placeList, isOpen);
    listTrigger.setAttribute("aria-expanded", String(isOpen));
    sceneNavigator.dataset.state = isOpen ? "expanded" : "collapsed";
    root.classList.toggle("has-list-open", isOpen);
    if (isOpen) {
      closeDetail();
      closeEvidence();
      closeBoundaryEditor();
      updateSceneRoute(null, { replace: true });
      placeListItems.querySelector("button")?.focus();
    }
  };

  const requestAccountPanel = () => {
    enterScene({ focus: false });
    if (!placeList.classList.contains("is-open")) togglePlaceList();
    globalThis.dispatchEvent(new Event("hlc:account-open"));
  };

  globalThis.addEventListener("hlc:account-request", requestAccountPanel);

  const routeUrl = (route) => {
    const hash = route
      ? createSceneRouteHash(route.placeId, route.serviceId)
      : "";
    return `${globalThis.location.pathname}${globalThis.location.search}${hash}`;
  };

  const updateSceneRoute = (route, { replace = false } = {}) => {
    const url = routeUrl(route);
    globalThis.history[replace ? "replaceState" : "pushState"](
      { hlcSceneRoute: route },
      "",
      url,
    );
    lastRouteKey = globalThis.location.hash;
  };

  const closeLegacyRoute = ({ animate = true } = {}) => {
    const routeRoot = document.querySelector(".scene-route-root");
    routeRoot?.querySelector(":scope > .scene-content-masthead")?.remove();
    routeRoot?.querySelector(":scope > .scene-content-context")?.remove();
    const contentBody = routeRoot?.querySelector(
      ":scope > .scene-content-body",
    );
    if (contentBody) contentBody.replaceWith(...contentBody.childNodes);
    routeRoot?.classList.add("hide");
    routeRoot?.classList.remove("scene-route-root", "scene-place-content");
    if (routeRoot) {
      routeRoot.removeAttribute("role");
      routeRoot.removeAttribute("aria-labelledby");
      delete routeRoot.dataset.scenePlaceId;
      delete routeRoot.dataset.sceneServiceId;
      delete routeRoot.dataset.sceneServiceCount;
      delete routeRoot.dataset.mediaPolicy;
      routeRoot.style.removeProperty("--scene-content-accent");
      routeRoot.style.removeProperty("--scene-content-art-image");
      routeRoot.style.removeProperty("--scene-empty-title");
    }
    document.querySelectorAll(".scene-route-parent").forEach((page) => {
      page.classList.add("hide");
      page.classList.remove("scene-route-parent", "scene-content-parent");
    });
    document.body.classList.remove("legacy-content-open");
    contentPlaceId = null;
    if (animate) {
      root.classList.add("is-returning");
      globalThis.setTimeout(() => root.classList.remove("is-returning"), 620);
    }
  };

  const openLegacyService = (
    serviceId,
    { updateRoute = true, replaceRoute = false } = {},
  ) => {
    const placeId = activePlaceId ?? contentPlaceId;
    const service = getSceneService(placeId, serviceId);
    if (!service) return;
    const content = createSceneContentViewModel(placeId, serviceId);
    const targets = service.legacyPath
      .map((targetId) => document.getElementById(targetId))
      .filter(Boolean);
    if (targets.length !== service.legacyPath.length) {
      announce(`${service.name}的内容入口暂时不可用`);
      return;
    }

    closeDetail();
    if (contentPlaceId) closeLegacyRoute({ animate: false });
    contentPlaceId = placeId;
    if (updateRoute) {
      updateSceneRoute(
        { placeId, serviceId: service.id },
        { replace: replaceRoute },
      );
    }
    document.body.classList.add("legacy-content-open");
    root.classList.add("is-content-transitioning");
    for (const entranceId of service.legacyPath.slice(0, -1)) {
      const pageSelector = LEGACY_PAGE_BY_ENTRANCE[entranceId];
      if (pageSelector) {
        const parent = document.querySelector(pageSelector);
        parent?.classList.add("scene-route-parent");
        if (content) parent?.classList.add("scene-content-parent");
      }
    }
    const routeRoot = document.querySelector(service.pageSelector);
    routeRoot?.classList.add("scene-route-root");
    if (routeRoot) {
      routeRoot.dataset.scenePlaceId = placeId;
      if (content) {
        routeRoot.classList.add("scene-place-content");
        routeRoot.dataset.sceneServiceId = service.id;
        routeRoot.dataset.sceneServiceCount = String(
          content.navigation.length,
        );
        routeRoot.dataset.mediaPolicy = content.mediaPolicy;
        routeRoot.style.setProperty("--scene-content-accent", content.accent);
        routeRoot.style.setProperty(
          "--scene-content-art-image",
          `url("/imgs/community-map-${content.artId}-v1.webp")`,
        );
        routeRoot.style.setProperty(
          "--scene-empty-title",
          JSON.stringify(content.emptyTitle),
        );
        createSceneContentBody(routeRoot, content);
        const masthead = createSceneContentMasthead(
          content,
          (nextServiceId) =>
            openLegacyService(nextServiceId, { replaceRoute: true }),
        );
        routeRoot.prepend(masthead, createSceneContentContext(content));
        routeRoot.setAttribute("role", "dialog");
        routeRoot.setAttribute(
          "aria-labelledby",
          `scene_content_title_${service.id}`,
        );
      }
    }
    targets.forEach((target, index) => {
      globalThis.setTimeout(() => target.click(), index * 40);
    });
    globalThis.setTimeout(
      () => root.classList.remove("is-content-transitioning"),
      520,
    );
  };

  const applySceneRouteFromLocation = () => {
    const routeKey = globalThis.location.hash;
    if (routeKey === lastRouteKey) return;
    lastRouteKey = routeKey;
    const route = parseSceneRouteHash(routeKey);

    closeLegacyRoute({ animate: false });
    closePlaceList();
    closeEvidence();
    closeBoundaryEditor();
    closeDetail();
    if (!route) return;

    enterScene({ focus: false });
    const trigger = hotspotLayer.querySelector(
      `[data-place-id="${route.placeId}"]`,
    );
    openPlace(route.placeId, trigger, { updateRoute: false, focus: true });
    if (route.serviceId) {
      openLegacyService(route.serviceId, { updateRoute: false });
    }
  };

  root.addEventListener("click", (event) => {
    const serviceTrigger = event.target.closest("[data-service-id]");
    if (serviceTrigger) {
      openLegacyService(serviceTrigger.dataset.serviceId);
      return;
    }

    const placeTrigger = event.target.closest("[data-place-id]");
    if (placeTrigger) {
      openPlace(placeTrigger.dataset.placeId, placeTrigger);
      return;
    }

    const command = event.target.closest("[data-scene-command]")?.dataset
      .sceneCommand;
    switch (command) {
      case "enter":
        enterScene();
        announce("已进入圣灯社区互动地图，拖动探索，按 Tab 浏览场所");
        break;
      case "list":
        togglePlaceList();
        break;
      case "close-list":
        closePlaceList({ restoreFocus: true });
        break;
      case "account":
        requestAccountPanel();
        break;
      case "close-detail":
        closeDetail({ restoreFocus: true });
        updateSceneRoute(null);
        break;
      case "close-boundary":
        closeBoundaryEditor({ restoreFocus: true });
        break;
      case "boundary-undo":
        boundaryDraft.pop();
        renderBoundary();
        announce("已撤销最后一个范围节点");
        break;
      case "boundary-clear":
        applyFocusAreaFeature(SHENGDENG_FOCUS_AREA);
        boundaryDraft = [...savedBoundary.points];
        globalThis.localStorage?.removeItem("hlc.shengdeng.focus-area.v1");
        renderBoundary();
        announce("已恢复项目内的初版圣灯范围");
        break;
      case "boundary-save":
        saveBoundary();
        break;
      case "boundary-export":
        exportBoundary();
        break;
      case "close-evidence":
        closeEvidence({ restoreFocus: true });
        break;
      case "share-place":
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(globalThis.location.href).then(
            () => announce("场所链接已复制"),
            () => announce("暂时无法复制链接，请从地址栏复制"),
          );
        } else {
          announce("暂时无法复制链接，请从地址栏复制");
        }
        break;
      case "close-overlay":
        closePlaceList();
        closeDetail({ restoreFocus: true });
        closeEvidence();
        closeBoundaryEditor();
        updateSceneRoute(null);
        break;
    }
  });

  viewport.addEventListener("pointerdown", (event) => {
    if (boundaryEditing) {
      addBoundaryPoint(event);
      event.preventDefault();
      return;
    }
    if (event.target.closest(".scene-hotspot")) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerX: state.centerX,
      centerY: state.centerY,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-dragging");
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!reduceMotion.matches) {
      const bounds = viewport.getBoundingClientRect();
      const lookX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 5;
      const lookY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 5;
      root.style.setProperty("--scene-look-x", `${lookX}px`);
      root.style.setProperty("--scene-look-y", `${lookY}px`);
      root.style.setProperty("--scene-ambient-x", `${lookX * -1.8}px`);
      root.style.setProperty("--scene-ambient-y", `${lookY * -1.8}px`);
      root.style.setProperty("--scene-marker-x", `${lookX * 0.45}px`);
      root.style.setProperty("--scene-marker-y", `${lookY * 0.45}px`);
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    state = {
      ...state,
      centerX: drag.centerX - (event.clientX - drag.startX) / state.scale,
      centerY: drag.centerY - (event.clientY - drag.startY) / state.scale,
    };
    applySceneState();
  });

  const stopDragging = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    viewport.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);
  viewport.addEventListener("pointerleave", () => {
    if (drag) return;
    root.style.setProperty("--scene-look-x", "0px");
    root.style.setProperty("--scene-look-y", "0px");
    root.style.setProperty("--scene-ambient-x", "0px");
    root.style.setProperty("--scene-ambient-y", "0px");
    root.style.setProperty("--scene-marker-x", "0px");
    root.style.setProperty("--scene-marker-y", "0px");
  });

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomScene(event.deltaY > 0 ? -1 : 1);
  }, { passive: false });

  viewport.addEventListener("keydown", (event) => {
    const panStep = event.shiftKey ? 96 : 48;
    switch (event.key) {
      case "ArrowLeft":
        state = { ...state, centerX: state.centerX - panStep / state.scale };
        break;
      case "ArrowRight":
        state = { ...state, centerX: state.centerX + panStep / state.scale };
        break;
      case "ArrowUp":
        state = { ...state, centerY: state.centerY - panStep / state.scale };
        break;
      case "ArrowDown":
        state = { ...state, centerY: state.centerY + panStep / state.scale };
        break;
      case "+":
      case "=":
        zoomScene(1);
        event.preventDefault();
        return;
      case "-":
      case "_":
        zoomScene(-1);
        event.preventDefault();
        return;
      case "0":
      case "Home":
        resetScene();
        event.preventDefault();
        return;
      case "Escape":
        closePlaceList();
        closeDetail({ restoreFocus: true });
        closeEvidence({ restoreFocus: true });
        closeBoundaryEditor({ restoreFocus: true });
        updateSceneRoute(null);
        event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    applySceneState();
  });

  const pageObserver = new MutationObserver(() => {
    const legacyPageIsOpen = [...document.querySelectorAll(".page")]
      .some((page) => !page.classList.contains("hide"));
    document.body.classList.toggle("legacy-content-open", legacyPageIsOpen);
  });
  document.querySelectorAll(".page").forEach((page) => {
    pageObserver.observe(page, {
      attributes: true,
      attributeFilter: ["class"],
    });
  });

  document.addEventListener("click", (event) => {
    const exitButton = event.target.closest?.(".exit");
    if (!exitButton) return;
    const routeRoot = exitButton.closest(".scene-route-root");
    if (!routeRoot) return;

    const placeId = routeRoot.dataset.scenePlaceId ?? contentPlaceId;
    const isSceneContent = routeRoot.classList.contains("scene-place-content");
    const canReturnThroughHistory = Boolean(
      globalThis.history.state?.hlcSceneRoute?.serviceId,
    );
    closeLegacyRoute();
    if (isSceneContent && placeId) {
      const trigger = hotspotLayer.querySelector(
        `[data-place-id="${placeId}"]`,
      );
      enterScene({ focus: false });
      openPlace(placeId, trigger, { updateRoute: false, focus: false });
      updateSceneRoute({ placeId }, { replace: true });
      return;
    }
    if (canReturnThroughHistory) {
      globalThis.history.back();
      return;
    }
    if (placeId) {
      const trigger = hotspotLayer.querySelector(
        `[data-place-id="${placeId}"]`,
      );
      enterScene({ focus: false });
      openPlace(placeId, trigger, { updateRoute: false, focus: false });
      updateSceneRoute({ placeId }, { replace: true });
    } else {
      updateSceneRoute(null, { replace: true });
    }
  });

  try {
    const storedBoundary = globalThis.localStorage?.getItem(
      "hlc.shengdeng.focus-area.v1",
    );
    if (storedBoundary) {
      const feature = JSON.parse(storedBoundary);
      applyFocusAreaFeature(feature);
      boundaryDrafter.value = feature.properties.draftedBy || "";
    }
  } catch {
    globalThis.localStorage?.removeItem("hlc.shengdeng.focus-area.v1");
  }
  renderBoundary();

  globalThis.addEventListener("popstate", applySceneRouteFromLocation);
  globalThis.addEventListener("hashchange", applySceneRouteFromLocation);

  state = {
    centerX: defaultCenter.x,
    centerY: defaultCenter.y,
    zoom: getArtZoom("overview", viewport.getBoundingClientRect()),
  };
  new ResizeObserver(() => {
    const bounds = viewport.getBoundingClientRect();
    state = {
      ...state,
      zoom: getArtZoom(activeArtLod, bounds),
    };
    applySceneState();
  }).observe(viewport);
  applySceneState();
  if (globalThis.hlcLegacyContentReady) {
    applySceneRouteFromLocation();
  } else {
    globalThis.addEventListener(
      "hlc:legacy-content-ready",
      applySceneRouteFromLocation,
      { once: true },
    );
  }
}

function initializeCommunityExperience() {
  initializeCommunityMap();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCommunityExperience, {
    once: true,
  });
} else {
  initializeCommunityExperience();
}
