import { measureNaturalWidth, prepareWithSegments } from "@chenglou/pretext";
import { animate, type JSAnimation, scrambleText } from "animejs";
import gsap from "gsap";
import {
  type CSSProperties,
  type FormEvent,
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { DownipPage } from "../../../domains/downip/frontend/DownipPage.tsx";

import {
  HOMEPAGE_PROJECTS,
  type HomepageProjectCard,
  listHiddenHomepageProjects,
} from "../homepage-projects";
import { type ActiveDomainPanel, isProjectDetailPanelId } from "../homepage-panels";
import { MapPosterPanelContent } from "./MapPosterPanel.tsx";

type UnlockRule = {
  key: string;
  label: string;
  projectIds: string[];
  expiresAt: string;
};

type DownipRouteValue = {
  ipv6: string;
  port: number;
};

type DownipMapping = Record<string, DownipRouteValue>;

type JsonKvKeyPart = string | number | boolean;

type AdminKvEntry = {
  key: JsonKvKeyPart[];
  value: unknown;
  versionstamp: string;
};

type AdminKvGroup = {
  id: string;
  label: string;
  entries: AdminKvEntry[];
};

type HomepageMessage = {
  id: string;
  content: string;
  createdAt: string;
};

type BuildVersionInfo = {
  label: string;
  dateTime?: string;
};

const hiddenProjects = listHiddenHomepageProjects();
const BUILD_VERSION = createBuildVersion({
  hash: import.meta.env.VITE_OPENFX_BUILD_HASH,
  time: import.meta.env.VITE_OPENFX_BUILD_TIME,
});

const BRAND_LOCK_PADDING_PX = 4;

const STORAGE_KEYS = {
  adminKey: "openfx_admin_key",
} as const;

function getEnvValue(value: string | undefined) {
  return value?.trim() ?? "";
}

function formatUtcBuildTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return { label: value };
  }

  const pad = (part: number) => part.toString().padStart(2, "0");
  const label = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join("-") + ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;

  return {
    dateTime: date.toISOString(),
    label,
  };
}

function createBuildVersion(env: { hash?: string; time?: string }): BuildVersionInfo {
  const buildTime = getEnvValue(env.time);
  const buildHash = getEnvValue(env.hash);

  if (!buildTime || !buildHash) {
    return { label: "local build" };
  }

  const formattedTime = formatUtcBuildTime(buildTime);

  return {
    dateTime: formattedTime.dateTime,
    label: `${formattedTime.label} + ${buildHash}`,
  };
}

function BuildVersion() {
  const versionText = (
    <>
      <span>版本</span> {BUILD_VERSION.dateTime
        ? <time dateTime={BUILD_VERSION.dateTime}>{BUILD_VERSION.label}</time>
        : <span>{BUILD_VERSION.label}</span>}
    </>
  );

  return (
    <p className="build-version" title="Web 构建版本">
      {versionText}
    </p>
  );
}

function getDefaultAdminKey() {
  return localStorage.getItem(STORAGE_KEYS.adminKey) ??
    (globalThis.location?.hostname === "localhost" ? "TEST" : "");
}

function getProjectSearchText(project: HomepageProjectCard) {
  return [
    project.name,
    project.description,
    project.sourcePath,
    ...project.tech,
  ].join(" ").toLowerCase();
}

function createDefaultExpiryInput() {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const timezoneOffset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseKvKeyInput(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (
    !Array.isArray(parsed) || parsed.length === 0 ||
    !parsed.every((part) =>
      typeof part === "string" || typeof part === "number" ||
      typeof part === "boolean"
    )
  ) {
    throw new Error("invalid_key");
  }

  return parsed as JsonKvKeyPart[];
}

function parseKvPrefixInput(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (
    !Array.isArray(parsed) ||
    !parsed.every((part) =>
      typeof part === "string" || typeof part === "number" ||
      typeof part === "boolean"
    )
  ) {
    throw new Error("invalid_prefix");
  }

  return parsed as JsonKvKeyPart[];
}

function getKvDomainLabel(entry: AdminKvEntry) {
  if (entry.key[0] === "domains" && typeof entry.key[1] === "string") {
    return entry.key[1];
  }

  if (entry.key[0] === "homepage-unlocks") {
    return "unlock";
  }

  return "system";
}

function groupKvEntriesByDomain(entries: AdminKvEntry[]): AdminKvGroup[] {
  const groups = new Map<string, AdminKvEntry[]>();

  for (const entry of entries) {
    const label = getKvDomainLabel(entry);
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, groupEntries]) => ({
      id: label,
      label,
      entries: groupEntries.sort((left, right) =>
        formatJson(left.key).localeCompare(formatJson(right.key))
      ),
    }));
}

function getRemainingMs(expiresAt: string) {
  return Math.max(Date.parse(expiresAt) - Date.now(), 0);
}

function isExpired(expiresAt: string) {
  return getRemainingMs(expiresAt) === 0;
}

function formatRemainingTime(expiresAt: string) {
  const remainingMs = getRemainingMs(expiresAt);
  if (remainingMs <= 0) {
    return "expired";
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h left` : `${days}d left`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`;
  }

  return `${Math.max(minutes, 1)}m left`;
}

function getBrowserLocationPathname() {
  return globalThis.location?.pathname ?? "/";
}

function dispatchPopstate() {
  globalThis.dispatchEvent?.(new PopStateEvent("popstate"));
}

function parseCssPixels(value: string) {
  if (!value || value === "normal") {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCanvasFont(style: CSSStyleDeclaration) {
  const stylePart = style.fontStyle === "normal" ? "" : `${style.fontStyle} `;
  const variantPart = style.fontVariant === "normal" ? "" : `${style.fontVariant} `;
  return `${stylePart}${variantPart}${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function measureBrandWordWidth(wordNode: HTMLElement, word: string) {
  const previousBrand = wordNode.dataset.brand;

  try {
    wordNode.dataset.brand = word;
    const style = getComputedStyle(wordNode);
    const prepared = prepareWithSegments(word, buildCanvasFont(style), {
      letterSpacing: parseCssPixels(style.letterSpacing),
      wordBreak: "keep-all",
    });

    return measureNaturalWidth(prepared);
  } finally {
    if (previousBrand === undefined) {
      delete wordNode.dataset.brand;
    } else {
      wordNode.dataset.brand = previousBrand;
    }
  }
}

function usePathname() {
  const [pathname, setPathname] = useState(getBrowserLocationPathname);

  useEffect(() => {
    const update = () => setPathname(getBrowserLocationPathname());
    globalThis.addEventListener?.("popstate", update);
    return () => globalThis.removeEventListener?.("popstate", update);
  }, []);

  return pathname;
}

export function navigate(pathname: string) {
  if (getBrowserLocationPathname() === pathname) {
    return;
  }

  globalThis.history?.pushState({}, "", pathname);
  dispatchPopstate();
}

function BrandWord(props: {
  lockWidthPx: number | null;
  onOpenData: () => void;
}) {
  const style = props.lockWidthPx === null ? undefined : ({
    "--brand-lock-width": `${props.lockWidthPx}px`,
  } as CSSProperties);

  return (
    <div className="brand-zone">
      <div className="brand-shell">
        <button
          className="brand-word"
          data-brand="OpenFX"
          id="brandWord"
          style={style}
          type="button"
          onClick={props.onOpenData}
          aria-label="打开数据面板"
        >
          <span className="brand-text" id="brandText" />
        </button>
      </div>
    </div>
  );
}

function ProjectCard(props: {
  project: HomepageProjectCard;
  revealed: boolean;
  onClick?: () => void;
}) {
  const classes = [
    "project-card",
    props.project.variant,
    props.project.hidden ? "hidden-card" : "",
    props.revealed ? "revealed" : "",
    props.onClick ? "clickable" : "",
  ].filter(Boolean).join(" ");

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onClick?.();
    }
  }

  function stopCardClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.stopPropagation();
  }

  function handleLinkKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>) {
    event.stopPropagation();
  }

  return (
    <div
      className={classes}
      data-card-id={props.project.id}
      onClick={props.onClick}
      role={props.onClick ? "button" : undefined}
      tabIndex={props.onClick ? 0 : undefined}
      onKeyDown={props.onClick ? handleKeyDown : undefined}
    >
      <div className="pc-name">{props.project.name}</div>
      <div className="pc-desc">{props.project.description}</div>
      {props.project.provenance
        ? (
          <div className="pc-provenance" aria-label={`${props.project.name} 来源说明`}>
            <p>
              <span>来源</span>
              <a
                href={props.project.provenance.origin.href}
                onClick={stopCardClick}
                onKeyDown={handleLinkKeyDown}
                rel="noreferrer"
                target="_blank"
              >
                {props.project.provenance.origin.label}
              </a>
            </p>
            <p>
              <span>改动</span>
              {props.project.provenance.changes}
            </p>
            <p>
              <span>区别</span>
              {props.project.provenance.differences}
            </p>
          </div>
        )
        : null}
      <div className="pc-tech">
        {props.project.tech.map((item) => (
          <span key={`${props.project.id}-${item}`}>{item}</span>
        ))}
      </div>
      {props.project.links?.length
        ? (
          <div className="pc-links">
            {props.project.links.map((link) => (
              <a
                key={`${props.project.id}-${link.href}`}
                href={link.href}
                download={link.download}
                onClick={stopCardClick}
                onKeyDown={handleLinkKeyDown}
                rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                target={link.href.startsWith("http") ? "_blank" : undefined}
              >
                {link.label}
              </a>
            ))}
          </div>
        )
        : null}
      <div className="pc-source">source · {props.project.sourcePath}</div>
    </div>
  );
}

function getProjectCardClick(
  card: HomepageProjectCard,
  controls: {
    openPanel: (panel: ActiveDomainPanel) => void;
  },
): (() => void) | undefined {
  if (isProjectDetailPanelId(card.id)) {
    return () => controls.openPanel(card.id);
  }

  return undefined;
}

function Homepage(props: { initialPanel?: ActiveDomainPanel } = {}) {
  const primaryControlAnimationRef = useRef<JSAnimation | null>(null);
  const statusAnimationRef = useRef<JSAnimation | null>(null);
  const brandWordRef = useRef<HTMLButtonElement | null>(null);
  const brandTextRef = useRef<HTMLSpanElement | null>(null);
  const primaryControlRef = useRef<HTMLButtonElement | null>(null);
  const primaryControlLabelRef = useRef<HTMLSpanElement | null>(null);
  const statusHintRef = useRef<HTMLSpanElement | null>(null);
  const statusClearTimeoutRef = useRef<number | null>(null);
  const projectScrollerRef = useRef<HTMLDivElement | null>(null);
  const messageContentInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("");
  const [brandLockWidth, setBrandLockWidth] = useState<number | null>(null);
  const [showMessageComposer, setShowMessageComposer] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [activePanel, setActivePanel] = useState<ActiveDomainPanel | null>(
    props.initialPanel ?? null,
  );
  const [proxyInput, setProxyInput] = useState("");
  const [proxyFrameUrl, setProxyFrameUrl] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [messageButtonText, setMessageButtonText] = useState("MESSAGE");

  const isPanelOpen = activePanel !== null;
  const currentAccessKey = localStorage.getItem(STORAGE_KEYS.adminKey)?.trim() ?? "";
  const browsableProjectColumns = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();

    return HOMEPAGE_PROJECTS.columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => {
        if (!query) return true;

        return getProjectSearchText(card).includes(query);
      }),
    }));
  }, [projectQuery]);
  const totalBrowsableProjectCount = useMemo(() => {
    return HOMEPAGE_PROJECTS.columns.reduce((count, column) => {
      return count + column.cards.length;
    }, 0);
  }, []);
  const filteredProjectCount = useMemo(() => {
    return browsableProjectColumns.reduce(
      (count, column) => count + column.cards.length,
      0,
    );
  }, [browsableProjectColumns]);
  const projectCountLabel = `${String(filteredProjectCount).padStart(2, "0")} / ${
    String(totalBrowsableProjectCount).padStart(2, "0")
  }`;

  function isAccentChar(word: string, ch: string) {
    return word === "OpenFX" && (ch === "F" || ch === "X");
  }

  function cancelScramble(ref: MutableRefObject<JSAnimation | null>) {
    ref.current?.cancel();
    ref.current = null;
  }

  function clearScheduledWork() {
    if (statusClearTimeoutRef.current !== null) {
      clearTimeout(statusClearTimeoutRef.current);
      statusClearTimeoutRef.current = null;
    }

    clearBrandTransitionProps();
    cancelScramble(primaryControlAnimationRef);
    cancelScramble(statusAnimationRef);
    if (primaryControlRef.current) {
      gsap.killTweensOf(primaryControlRef.current);
    }
  }

  function appendBrandChar(
    textNode: HTMLSpanElement,
    word: string,
    ch: string,
    index: number,
  ) {
    const span = document.createElement("span");
    span.className = "glitch-char";
    span.dataset.idx = String(index);
    span.textContent = ch;
    if (isAccentChar(word, ch)) {
      span.style.color = "var(--accent)";
    }
    textNode.append(span);
  }

  function setWord(word: string, visibleLength = word.length) {
    const textNode = brandTextRef.current;
    if (!textNode) {
      return;
    }

    textNode.innerHTML = "";
    const chars = word.split("").slice(0, visibleLength);
    for (const [index, ch] of chars.entries()) {
      appendBrandChar(textNode, word, ch, index);
    }
  }

  function setDocumentTitle(brand: string) {
    document.title = brand;
  }

  function updateBrandLockWidth() {
    const wordNode = brandWordRef.current;
    if (!wordNode) {
      return;
    }

    try {
      const nextWidth = Math.ceil(
        measureBrandWordWidth(wordNode, "OpenFX") + BRAND_LOCK_PADDING_PX,
      );
      setBrandLockWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth
      );
    } catch {
      setBrandLockWidth(null);
    }
  }

  function playScramble(
    ref: MutableRefObject<JSAnimation | null>,
    targetNode: HTMLElement,
    text: string,
    options?: {
      duration?: number;
      chars?: string;
      cursor?: boolean | number | string;
      from?: "left" | "center" | "right" | "random" | "auto" | number;
      perturbation?: number;
      onUpdate?: () => void;
      onComplete?: () => void;
    },
  ) {
    cancelScramble(ref);
    ref.current = animate(targetNode, {
      duration: options?.duration ?? 680,
      ease: "linear",
      innerHTML: scrambleText({
        text,
        chars: options?.chars ?? "braille",
        ease: "outQuad",
        from: options?.from ?? "auto",
        cursor: options?.cursor ?? false,
        perturbation: options?.perturbation ?? 0.15,
      }),
      onUpdate: () => {
        options?.onUpdate?.();
      },
      onComplete: () => {
        ref.current = null;
        targetNode.textContent = text;
        options?.onComplete?.();
      },
    });
  }

  function scrambleLabel(text: string) {
    const labelNode = primaryControlLabelRef.current;
    if (!labelNode) {
      return;
    }

    playScramble(primaryControlAnimationRef, labelNode, text, { duration: 520 });
  }

  function animateStatusText(text: string) {
    const hintNode = statusHintRef.current;
    if (!hintNode) {
      return;
    }

    hintNode.dataset.active = text ? "true" : "false";
    playScramble(statusAnimationRef, hintNode, text, { duration: 560, from: "left" });
  }

  function renderPrimaryControl() {
    const primaryControlNode = primaryControlRef.current;
    const labelNode = primaryControlLabelRef.current;
    if (!primaryControlNode || !labelNode) {
      return;
    }

    const text = isPanelOpen ? "返回" : messageButtonText;
    primaryControlNode.setAttribute("aria-label", text);
    primaryControlNode.classList.toggle("primary", !isPanelOpen);

    if (!isPanelOpen && labelNode.textContent !== text) {
      scrambleLabel(text);
    }
  }

  function clearBrandTransitionProps() {
    const brandTextNode = brandTextRef.current;
    const brandWordNode = brandWordRef.current;
    gsap.set([brandTextNode, brandWordNode].filter(Boolean), {
      clearProps: "transform,opacity,visibility,filter",
    });
    brandTextNode?.style.removeProperty("max-width");
    brandTextNode?.style.removeProperty("overflow");
    brandTextNode?.style.removeProperty("transition");
    brandTextNode?.style.removeProperty("width");
    gsap.set(brandTextNode?.querySelectorAll(".glitch-char") ?? [], {
      clearProps: "transform,opacity,visibility,filter",
    });
  }

  function openMessageComposer() {
    setShowMessageComposer(true);
    setMessageButtonText("SEND");
    setStatus("");
  }

  function closeMessageComposer() {
    setShowMessageComposer(false);
    setMessageButtonText("MESSAGE");
    setMessageContent("");
  }

  async function handleSendMessage() {
    const content = messageContent.trim();
    if (!content) {
      setMessageButtonText("SEND");
      setStatus("请输入留言");
      messageContentInputRef.current?.focus();
      return;
    }

    setMessageButtonText("SENDING");

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) {
        const hint = typeof payload.hint === "string" ? payload.hint : "";
        throw new Error(hint || "留言发送失败");
      }

      setShowMessageComposer(false);
      setMessageContent("");
      setStatus("留言已保存");
      setMessageButtonText("SENT");
      globalThis.setTimeout(() => setMessageButtonText("MESSAGE"), 1800);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "留言发送失败");
      setMessageButtonText("SEND");
    }
  }

  function isProjectRevealed(_card: HomepageProjectCard) {
    return true;
  }

  function updateProjectFocus(scroller: HTMLDivElement) {
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches ?? false;
    const cards = [...scroller.querySelectorAll<HTMLElement>(".project-card")]
      .filter((card) => card.offsetParent !== null);
    if (!cards.length) return;

    if (reduceMotion) {
      gsap.set(cards, { clearProps: "transform,opacity,visibility" });
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const stageCenter = scrollerRect.top + scrollerRect.height / 2;
    const falloff = Math.max(scrollerRect.height * 0.7, 1);

    for (const card of cards) {
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.top + cardRect.height / 2;
      const distance = Math.min(Math.abs(cardCenter - stageCenter) / falloff, 1);
      const focus = 1 - distance;

      gsap.to(card, {
        autoAlpha: 0.68 + focus * 0.32,
        duration: 0.22,
        ease: "power2.out",
        overwrite: "auto",
        scale: 0.986 + focus * 0.014,
        y: (1 - focus) * 5,
      });
    }
  }

  function openProjectPanel(panel: ActiveDomainPanel) {
    const activatePanel = () => {
      closeMessageComposer();
      setActivePanel(panel);
    };

    if (document.startViewTransition && document.visibilityState === "visible") {
      document.startViewTransition(() => flushSync(activatePanel));
      return;
    }

    activatePanel();
  }

  function closeProjectPanel() {
    const shouldResetAdminRoute = activePanel === "admin-console" &&
      globalThis.location?.pathname === "/admin";
    if (document.startViewTransition && document.visibilityState === "visible") {
      document.startViewTransition(() =>
        flushSync(() => {
          setActivePanel(null);
          if (shouldResetAdminRoute) {
            navigate("/");
          }
        })
      );
      return;
    }

    setActivePanel(null);
    if (shouldResetAdminRoute) {
      navigate("/");
    }
  }

  function buildProxyFrameUrl(input: string) {
    const value = input.trim();
    if (!value) return "";

    const params = new URLSearchParams();
    try {
      const parsed = new URL(value);
      params.set("url", parsed.toString());
    } catch {
      const path = value.startsWith("/") ? value : `/${value}`;
      params.set("url", path);
    }

    const accessKey = localStorage.getItem(STORAGE_KEYS.adminKey)?.trim() ?? "";
    if (accessKey) {
      params.set("unlock_key", accessKey);
    }

    return `/api/proxy?${params.toString()}`;
  }

  function submitProxyUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextUrl = buildProxyFrameUrl(proxyInput);
    if (!nextUrl) {
      setStatus("Enter a proxy path or URL");
      return;
    }

    setProxyFrameUrl(nextUrl);
    setStatus("Proxy view opened");
  }

  useEffect(() => {
    const textNode = document.getElementById("brandText");
    const wordNode = document.getElementById("brandWord");

    if (textNode instanceof HTMLSpanElement) {
      brandTextRef.current = textNode;
    }
    if (wordNode instanceof HTMLButtonElement) {
      brandWordRef.current = wordNode;
    }

    document.body.classList.add("homepage-body");
    setWord("OpenFX");
    setDocumentTitle("OpenFX");
    updateBrandLockWidth();

    return () => {
      clearScheduledWork();
      document.body.classList.remove("homepage-body");
    };
  }, []);

  useEffect(() => {
    let active = true;
    let frameId: number | null = requestAnimationFrame(() => {
      frameId = null;
      if (active) {
        updateBrandLockWidth();
      }
    });

    const queueUpdate = () => {
      if (frameId !== null) {
        return;
      }
      frameId = requestAnimationFrame(() => {
        frameId = null;
        if (active) {
          updateBrandLockWidth();
        }
      });
    };

    void document.fonts?.ready.then(queueUpdate).catch(() => {});
    globalThis.addEventListener("resize", queueUpdate);

    return () => {
      active = false;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      globalThis.removeEventListener("resize", queueUpdate);
    };
  }, []);

  useEffect(() => {
    if (props.initialPanel) {
      setActivePanel(props.initialPanel);
    }
  }, [props.initialPanel]);

  useEffect(() => {
    renderPrimaryControl();
  }, [isPanelOpen, messageButtonText]);

  useEffect(() => {
    if (!showMessageComposer || isPanelOpen) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      messageContentInputRef.current?.focus();
    });

    return () => cancelAnimationFrame(frameId);
  }, [isPanelOpen, showMessageComposer]);

  useEffect(() => {
    if (isPanelOpen) return;

    const scroller = projectScrollerRef.current;
    if (!scroller) return;

    scroller.scrollTo({ top: 0, behavior: "auto" });
  }, [isPanelOpen, projectQuery]);

  useEffect(() => {
    if (isPanelOpen) return;

    const scroller = projectScrollerRef.current;
    if (!scroller) return;

    const cards = [...scroller.querySelectorAll<HTMLElement>(".project-card")]
      .filter((card) => card.offsetParent !== null);
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches ?? false;
    let frameId: number | null = null;

    const queueUpdate = () => {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        updateProjectFocus(scroller);
      });
    };

    if (!reduceMotion && cards.length > 0) {
      gsap.fromTo(
        cards,
        { autoAlpha: 0, scale: 0.985, y: 18 },
        {
          autoAlpha: 1,
          duration: 0.42,
          ease: "power2.out",
          overwrite: "auto",
          scale: 1,
          stagger: { amount: 0.18, from: "start" },
          y: 0,
          onComplete: queueUpdate,
        },
      );
    } else {
      updateProjectFocus(scroller);
    }

    scroller.addEventListener("scroll", queueUpdate, { passive: true });
    globalThis.addEventListener("resize", queueUpdate);
    queueUpdate();

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      scroller.removeEventListener("scroll", queueUpdate);
      globalThis.removeEventListener("resize", queueUpdate);
      gsap.killTweensOf(cards);
      gsap.set(cards, { clearProps: "transform,opacity,visibility" });
    };
  }, [filteredProjectCount, isPanelOpen, projectQuery]);

  useEffect(() => {
    animateStatusText(status);

    if (!status) {
      return;
    }

    statusClearTimeoutRef.current = globalThis.setTimeout(() => {
      statusClearTimeoutRef.current = null;
      setStatus("");
    }, 4200);

    return () => {
      if (statusClearTimeoutRef.current !== null) {
        clearTimeout(statusClearTimeoutRef.current);
        statusClearTimeoutRef.current = null;
      }
    };
  }, [status]);

  return (
    <div className="page homepage-page">
      <BrandWord
        lockWidthPx={brandLockWidth}
        onOpenData={() => openProjectPanel("openfx-data")}
      />

      <div
        className={`projects-zone${isPanelOpen ? " panel-active" : ""}`}
      >
        {/* 卡片网格 — 面板打开时透明不可交互，但保留在 DOM 中维持 grid 布局 */}
        <div
          className="project-browser-shell"
          style={{
            opacity: isPanelOpen ? 0 : 1,
            pointerEvents: isPanelOpen ? "none" : undefined,
          }}
        >
          <div className="project-stage" aria-live="polite">
            <div
              className="project-stage-scroll"
              ref={projectScrollerRef}
              style={{
                gridTemplateColumns: HOMEPAGE_PROJECTS.layout.gridTemplateColumns,
              }}
            >
              {filteredProjectCount > 0
                ? browsableProjectColumns.map((column) => (
                  <div
                    className="project-column"
                    key={column.id}
                    style={column.offsetRem
                      ? { paddingTop: `${column.offsetRem}rem` }
                      : undefined}
                  >
                    {column.cards.map((card) => (
                      <ProjectCard
                        key={card.id}
                        project={card}
                        revealed={isProjectRevealed(card)}
                        onClick={getProjectCardClick(card, {
                          openPanel: openProjectPanel,
                        })}
                      />
                    ))}
                  </div>
                ))
                : (
                  <div className="project-empty-state">
                    <strong>没有匹配项目</strong>
                    <span>换个搜索词。</span>
                  </div>
                )}
            </div>
            <div className="project-stage-fade project-stage-fade-top" />
            <div className="project-stage-fade project-stage-fade-bottom" />
          </div>
        </div>

        {/* 面板叠加层 */}
        {activePanel === "admin-console"
          ? (
            <div
              className="domain-panel admin-domain-panel"
              data-panel-id="admin-console"
            >
              <AdminPage embedded />
            </div>
          )
          : null}
        {activePanel === "how-much-this" ? <HowMuchPanel /> : null}
        {activePanel === "ipv6-sync-suite"
          ? <DownipPanel accessKey={currentAccessKey} />
          : null}
        {activePanel === "relay-proxy-gateway"
          ? <ProxyPanel frameUrl={proxyFrameUrl} />
          : null}
        {activePanel === "openfx-data" ? <DataPanel /> : null}
        {activePanel === "wanone-memorial"
          ? (
            <div
              className="domain-panel"
              data-panel-id="wanone-memorial"
              style={{ flex: 1, display: "flex", overflow: "hidden" }}
            >
              <iframe
                src="/wanone/index.html"
                title="Wanone"
                tabIndex={-1}
                aria-hidden="true"
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  flex: 1,
                  pointerEvents: "none",
                }}
              />
            </div>
          )
          : null}
        {activePanel === "costing-assistant"
          ? (
            <div
              className="domain-panel"
              data-panel-id="costing-assistant"
              style={{ flex: 1, display: "flex", overflow: "hidden" }}
            >
              <iframe
                src="/costing-assistant/index.html"
                title="工程计价助手"
                style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
              />
            </div>
          )
          : null}
        {activePanel === "gasmap"
          ? (
            <div
              className="domain-panel"
              data-panel-id="gasmap"
              style={{ flex: 1, display: "flex", overflow: "hidden" }}
            >
              <iframe
                src="/gasmap/index.html"
                title="GasMap"
                style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
              />
            </div>
          )
          : null}
        {activePanel === "finlyzer"
          ? (
            <div
              className="domain-panel"
              data-panel-id="finlyzer"
              style={{ flex: 1, display: "flex", overflow: "hidden" }}
            >
              <iframe
                src="/finlyzer/index.html"
                title="Finlyzer"
                style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
              />
            </div>
          )
          : null}
        {activePanel === "map-poster" ? <MapPosterPanel /> : null}
        {activePanel === "smartisax" ? <SmartisaxPanel /> : null}
        {activePanel === "live-system" ? <LiveSystemPanel /> : null}
        {activePanel === "wandering-plan" ? <WanderingPlanPanel /> : null}
        {activePanel === "chinagas-wms-qrcode"
          ? (
            <PanelShell
              panelId="chinagas-wms-qrcode"
              eyebrow="用户脚本"
              title="中燃WMS二维码生成器"
              lede="Tampermonkey 脚本，在 WMS 物料详情页自动提取信息并生成可拖拽悬浮二维码，供仓储人员手机扫描。"
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  alignItems: "flex-start",
                }}
              >
                <a
                  href="https://greasyfork.org/zh-CN/scripts/550879"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "0.75rem 1.5rem",
                    background: "var(--accent)",
                    color: "#fff",
                    borderRadius: "var(--radius)",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  前往 Greasy Fork 安装
                </a>
                <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
                  脚本已停止更新，功能完整，永久可用。
                </p>
              </div>
            </PanelShell>
          )
          : null}
        {activePanel === "bewlyscript"
          ? (
            <PanelShell
              panelId="bewlyscript"
              eyebrow="userscript domain"
              title="BewlyScript"
              lede="基于 BewlyCat 的 OpenFX userscript 版，完整体验聚焦 B 站桌面原站，并在 m.bilibili.com 提示用户访问桌面版。"
            >
              <article className="domain-panel-section">
                <h2>入口</h2>
                <p>
                  代码保留在 <code>domains/BewlyScript/</code>，构建产物是可安装的
                  <code>dist/BewlyScript.user.js</code>。
                </p>
                <a
                  className="panel-download-link"
                  href="/bewlyscript/BewlyScript.user.js"
                  download="BewlyScript.user.js"
                >
                  下载 BewlyScript.user.js
                </a>
              </article>
              <article className="domain-panel-section">
                <h2>来源与 OpenFX 改造</h2>
                <ul>
                  <li>
                    来源基线是{" "}
                    <a
                      href="https://github.com/keleus/BewlyCat"
                      rel="noreferrer"
                      target="_blank"
                    >
                      keleus/BewlyCat
                    </a>，而 BewlyCat 本身基于{" "}
                    <a
                      href="https://github.com/BewlyBewly/BewlyBewly"
                      rel="noreferrer"
                      target="_blank"
                    >
                      BewlyBewly/BewlyBewly
                    </a>。
                  </li>
                  <li>
                    OpenFX 版移除了 WebExtension 打包与发布链路，改为 Safari Userscripts
                    / Tampermonkey 可安装的单文件 userscript。
                  </li>
                  <li>
                    关键改造包括 GM/browser shim、同进程 API
                    dispatcher、公共安装产物同步，以及 m 站 document-start 桌面版提示。
                  </li>
                </ul>
              </article>
              <article className="domain-panel-section">
                <h2>运行边界</h2>
                <ul>
                  <li>
                    完整美化体验只以 <code>www.bilibili.com</code> 桌面原站为功能基准。
                  </li>
                  <li>
                    竖屏/窄屏体验也走桌面原站的响应式美化，保留原生 B
                    站播放器和页面结构。
                  </li>
                  <li>
                    <code>m.bilibili.com</code>{" "}
                    只保留 metadata 覆盖，用于提示用户开启“请求桌面网站”。
                  </li>
                  <li>通过浏览器 shim 兼容 Userscripts 与 Tampermonkey API。</li>
                </ul>
              </article>
              <article className="domain-panel-section">
                <h2>交付形态</h2>
                <p>
                  这是独立 userscript domain，不嵌入 OpenFX
                  首页运行，只在这里展示项目说明和源码入口。
                </p>
              </article>
            </PanelShell>
          )
          : null}
      </div>

      <div className="control-cluster">
        <div className="control-status">
          <span
            className="control-hint"
            data-active={status ? "true" : "false"}
            id="controlHint"
            ref={statusHintRef}
            aria-live="polite"
          />
          <BuildVersion />
        </div>

        <div className="control-actions">
          {activePanel === "relay-proxy-gateway"
            ? (
              <form className="proxy-footer-form" onSubmit={submitProxyUrl}>
                <button
                  aria-label="返回项目卡片"
                  className="proxy-footer-back"
                  type="button"
                  onClick={closeProjectPanel}
                >
                  ←
                </button>
                <input
                  aria-label="Proxy URL"
                  className="proxy-footer-input"
                  placeholder="https://example.com/path"
                  type="text"
                  value={proxyInput}
                  onChange={(event) => {
                    const value = event.target.value;
                    setProxyInput(value);
                    if (!value.trim()) {
                      setProxyFrameUrl("");
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeProjectPanel();
                    }
                  }}
                />
                <button className="proxy-footer-submit" type="submit">OPEN</button>
              </form>
            )
            : null}
          <div
            className={`project-command-bar${
              showMessageComposer && !isPanelOpen ? " message-compose-active" : ""
            }`}
            style={{
              display: activePanel === "relay-proxy-gateway" ? "none" : undefined,
            }}
          >
            {!isPanelOpen
              ? (
                <>
                  {showMessageComposer
                    ? (
                      <>
                        <button
                          aria-label="返回搜索"
                          className="message-compose-back"
                          type="button"
                          onClick={closeMessageComposer}
                        >
                          ←
                        </button>
                        <span className="project-count message-count">MSG</span>
                        <form
                          className="message-inline-form"
                          id="messageInlineForm"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleSendMessage();
                          }}
                        >
                          <input
                            aria-label="留言内容"
                            className="message-inline-content"
                            placeholder="Message"
                            ref={messageContentInputRef}
                            type="text"
                            value={messageContent}
                            onChange={(event) => setMessageContent(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                closeMessageComposer();
                              }
                            }}
                          />
                        </form>
                      </>
                    )
                    : (
                      <>
                        <span className="project-count">{projectCountLabel}</span>
                        <input
                          aria-label="搜索项目"
                          className="project-search-input project-command-search"
                          placeholder="Search"
                          type="search"
                          value={projectQuery}
                          onChange={(event) => setProjectQuery(event.target.value)}
                        />
                      </>
                    )}
                </>
              )
              : null}
            <button
              className={`ctrl-btn${!isPanelOpen ? " primary" : ""}`}
              id="homepagePrimaryControl"
              ref={primaryControlRef}
              type="button"
              onClick={() => {
                if (isPanelOpen) {
                  closeProjectPanel();
                  return;
                }
                if (showMessageComposer) {
                  void handleSendMessage();
                  return;
                }
                openMessageComposer();
              }}
            >
              <span
                className="ctrl-btn-label"
                id="homepagePrimaryControlLabel"
                ref={primaryControlLabelRef}
                style={{ display: isPanelOpen ? "none" : undefined }}
              />
              {isPanelOpen && <span className="ctrl-btn-back-text">← 返回</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type AdminStatusTone = "neutral" | "success" | "error";

function AdminPage(props: { embedded?: boolean } = {}) {
  const [adminKey, setAdminKey] = useState(getDefaultAdminKey);
  const [rules, setRules] = useState<UnlockRule[]>([]);
  const [status, setStatus] = useState("管理数据准备就绪");
  const [statusTone, setStatusTone] = useState<AdminStatusTone>("neutral");
  const [form, setForm] = useState({
    label: "",
    expiresAt: createDefaultExpiryInput(),
    projectIds: [] as string[],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const hiddenProjectLookup = useMemo(
    () => new Map(hiddenProjects.map((project) => [project.id, project.name])),
    [],
  );
  const selectedProjectNames = useMemo(
    () =>
      form.projectIds.map((projectId) =>
        hiddenProjectLookup.get(projectId) ?? projectId
      ),
    [form.projectIds, hiddenProjectLookup],
  );

  function reportStatus(message: string, tone: AdminStatusTone) {
    setStatus(message);
    setStatusTone(tone);
  }

  async function loadRules() {
    const key = adminKey.trim();
    if (!key) {
      reportStatus("请输入管理密钥", "error");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/unlocks", {
        headers: { "x-openfx-admin-key": key },
      });
      const payload = await response.json();
      if (!response.ok) {
        reportStatus(payload.error ?? "加载失败", "error");
        return;
      }

      const nextRules = Array.isArray(payload.rules)
        ? [...payload.rules as UnlockRule[]].sort((left, right) =>
          Date.parse(left.expiresAt) - Date.parse(right.expiresAt)
        )
        : [];

      localStorage.setItem(STORAGE_KEYS.adminKey, key);
      setRules(nextRules);
      reportStatus(`已加载 ${nextRules.length} 条规则`, "success");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const key = adminKey.trim();
    if (!key) {
      reportStatus("请先输入管理密钥再保存规则", "error");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/unlocks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openfx-admin-key": key,
        },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        reportStatus(payload.error ?? "保存失败", "error");
        return;
      }

      setForm({ label: "", expiresAt: createDefaultExpiryInput(), projectIds: [] });
      await loadRules();
      reportStatus(
        `规则 ${payload.rule?.label ?? "已保存"}，密钥 ${payload.rule?.key ?? ""}`,
        "success",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeRule(key: string) {
    const providedKey = adminKey.trim();
    if (!providedKey) {
      reportStatus("请先输入管理密钥再删除规则", "error");
      return;
    }

    setDeletingKey(key);

    try {
      const response = await fetch(
        `/api/admin/unlocks?key=${encodeURIComponent(key)}`,
        {
          method: "DELETE",
          headers: { "x-openfx-admin-key": providedKey },
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        reportStatus(payload.error ?? "删除失败", "error");
        return;
      }

      await loadRules();
      reportStatus(`规则 ${key} 已删除`, "success");
    } finally {
      setDeletingKey(null);
    }
  }

  useEffect(() => {
    if (!adminKey.trim()) {
      return;
    }

    void loadRules();
  }, []);

  return (
    <div className={`content-shell admin-shell${props.embedded ? " embedded" : ""}`}>
      {props.embedded ? null : (
        <button
          className="back-link admin-back-link"
          onClick={() => navigate("/")}
          type="button"
        >
          返回首页
        </button>
      )}

      <section className="admin-panel admin-auth-stack">
        <div className="admin-panel-head">
          <div>
            <p className="admin-panel-kicker">admin key</p>
            <h2>管理密钥</h2>
          </div>
          <span className={`admin-status-badge tone-${statusTone}`}>{status}</span>
        </div>
        <div className="admin-auth-row">
          <input
            aria-label="管理密钥"
            autoComplete="off"
            placeholder="OPENFX_ADMIN_KEY"
            type="password"
            value={adminKey}
            onChange={(event) =>
              setAdminKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadRules();
              }
            }}
          />
          <button disabled={isLoading} type="button" onClick={() => void loadRules()}>
            {isLoading ? "连接中" : "连接"}
          </button>
        </div>
      </section>

      <details className="admin-panel admin-rules-panel">
        <summary className="admin-rules-summary">
          <div>
            <p className="admin-panel-kicker">unlock rules</p>
            <h2>规则管理</h2>
          </div>
          <div className="admin-panel-actions">
            <span className="admin-panel-meta">
              {rules.length} 条规则 / 选中 {form.projectIds.length} 项
            </span>
            <span className={`admin-status-badge tone-${statusTone}`}>
              {status}
            </span>
            <button
              disabled={isLoading}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void loadRules();
              }}
            >
              {isLoading ? "刷新中" : "刷新"}
            </button>
          </div>
        </summary>

        <div className="admin-rule-composer">
          <div className="admin-rule-create-pane">
            <div className="admin-panel-head">
              <div>
                <p className="admin-panel-kicker">create</p>
                <h2>创建规则</h2>
              </div>
              <span className="admin-panel-meta">
                选中 {form.projectIds.length} / {hiddenProjects.length}
              </span>
            </div>

            <form className="admin-form admin-rule-form" onSubmit={saveRule}>
              <div className="admin-field-grid">
                <label className="admin-field">
                  <span>Label</span>
                  <input
                    placeholder="给团队看的规则名"
                    value={form.label}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        label: event.target.value,
                      }))}
                  />
                </label>
                <label className="admin-field">
                  <span>Expires at</span>
                  <input
                    min={new Date().toISOString().slice(0, 16)}
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        expiresAt: event.target.value,
                      }))}
                  />
                </label>
                <div className="admin-field admin-field-wide admin-inline-note">
                  <span>Unlock key</span>
                  <p>系统会自动生成 5 位字母数字密钥，并在保存后直接展示。</p>
                </div>
              </div>

              <div className="admin-project-picker">
                <div className="admin-project-picker-head">
                  <div>
                    <h3>暴露范围</h3>
                    <p>只选择这条规则真正需要解锁的隐藏项目。</p>
                  </div>
                  <span className="admin-selection-count">
                    已选 {form.projectIds.length} 项
                  </span>
                </div>

                <div className="admin-selected-strip" aria-live="polite">
                  {selectedProjectNames.length > 0
                    ? selectedProjectNames.map((name) => (
                      <span className="admin-project-chip" key={name}>{name}</span>
                    ))
                    : <span className="admin-empty-inline">尚未选择项目</span>}
                </div>

                <div className="admin-project-grid">
                  {hiddenProjects.map((project) => {
                    const checked = form.projectIds.includes(project.id);
                    return (
                      <label
                        className={`admin-project-option${checked ? " selected" : ""}`}
                        key={project.id}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setForm((current) => ({
                              ...current,
                              projectIds: event.target.checked
                                ? [...current.projectIds, project.id]
                                : current.projectIds.filter((item) =>
                                  item !== project.id
                                ),
                            }));
                          }}
                        />
                        <span className="admin-project-name">{project.name}</span>
                        <span className="admin-project-id">{project.id}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="admin-form-footer">
                <p>保存后会立即生成唯一密钥。首页激活后会按过期时间自动失效。</p>
                <button disabled={isSaving} type="submit">
                  {isSaving ? "保存中..." : "生成并保存规则"}
                </button>
              </div>
            </form>
          </div>

          <div className="admin-rule-list-pane">
            <div className="admin-panel-head">
              <div>
                <p className="admin-panel-kicker">active</p>
                <h2>已生效规则</h2>
              </div>
              <span className="admin-panel-meta">
                {rules.length === 0 ? "空列表" : `${rules.length} 条记录`}
              </span>
            </div>

            <div className="rule-list admin-rule-list">
              {rules.length === 0
                ? (
                  <div className="admin-empty-state">
                    <strong>暂无规则</strong>
                    <p>展开规则管理后，可以创建第一条 unlock 规则。</p>
                  </div>
                )
                : rules.map((rule) => (
                  <div className="rule-item admin-rule-card" key={rule.key}>
                    <div className="admin-rule-card-head">
                      <div>
                        <strong>{rule.label}</strong>
                        <p className="admin-rule-key">{rule.key}</p>
                      </div>
                      <button
                        disabled={deletingKey === rule.key}
                        type="button"
                        onClick={() =>
                          void removeRule(rule.key)}
                      >
                        {deletingKey === rule.key ? "删除中..." : "删除"}
                      </button>
                    </div>

                    <div className="admin-rule-meta-row">
                      <span
                        className={`admin-status-pill ${
                          isExpired(rule.expiresAt) ? "error" : "success"
                        }`}
                      >
                        {isExpired(rule.expiresAt)
                          ? "已过期"
                          : formatRemainingTime(rule.expiresAt)}
                      </span>
                      <span className="admin-rule-expiry">
                        截止 {new Date(rule.expiresAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="admin-rule-projects">
                      {rule.projectIds.map((projectId) => (
                        <span key={`${rule.key}-${projectId}`}>
                          {hiddenProjectLookup.get(projectId) ?? projectId}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </details>

      <KvConsole
        adminKey={adminKey}
        onAdminKeyChange={setAdminKey}
        showAuth={false}
      />
    </div>
  );
}

function KvConsole(props: {
  adminKey: string;
  onAdminKeyChange: (value: string) => void;
  showAuth?: boolean;
}) {
  const [status, setStatus] = useState("KV 控制台准备就绪");
  const [statusTone, setStatusTone] = useState<AdminStatusTone>("neutral");
  const [kvPrefixInput, setKvPrefixInput] = useState(formatJson([]));
  const [kvKeyInput, setKvKeyInput] = useState(formatJson([
    "domains",
    "downip",
    "home",
  ]));
  const [kvValueInput, setKvValueInput] = useState(formatJson({
    ipv6: "2001:db8::1",
    port: 3000,
  }));
  const [kvEntries, setKvEntries] = useState<AdminKvEntry[]>([]);
  const [kvSearch, setKvSearch] = useState("");
  const [selectedKvKey, setSelectedKvKey] = useState("");
  const [isKvLoading, setIsKvLoading] = useState(false);
  const [isKvSaving, setIsKvSaving] = useState(false);
  const [deletingKvKey, setDeletingKvKey] = useState<string | null>(null);

  const filteredKvEntries = useMemo(() => {
    const query = kvSearch.trim().toLowerCase();
    if (!query) return kvEntries;

    return kvEntries.filter((entry) =>
      formatJson(entry.key).toLowerCase().includes(query) ||
      getKvDomainLabel(entry).toLowerCase().includes(query)
    );
  }, [kvEntries, kvSearch]);
  const kvGroups = useMemo(
    () => groupKvEntriesByDomain(filteredKvEntries),
    [filteredKvEntries],
  );
  const selectedKvEntry = useMemo(() => {
    return kvEntries.find((entry) => formatJson(entry.key) === selectedKvKey) ??
      kvEntries[0] ?? null;
  }, [kvEntries, selectedKvKey]);
  const selectedKvKeyParts = useMemo(() => {
    if (selectedKvEntry) return selectedKvEntry.key;

    try {
      return parseKvKeyInput(kvKeyInput);
    } catch {
      return [] as JsonKvKeyPart[];
    }
  }, [kvKeyInput, selectedKvEntry]);

  function reportKvStatus(message: string, tone: AdminStatusTone) {
    setStatus(message);
    setStatusTone(tone);
  }

  function rememberAdminKey(key: string) {
    localStorage.setItem(STORAGE_KEYS.adminKey, key);
    props.onAdminKeyChange(key);
  }

  async function loadKvEntries() {
    const key = props.adminKey.trim();
    if (!key) {
      reportKvStatus("请先输入管理密钥再读取 KV", "error");
      return;
    }

    let prefix: JsonKvKeyPart[];
    try {
      prefix = parseKvPrefixInput(kvPrefixInput);
    } catch {
      reportKvStatus(
        "KV prefix 必须是 JSON 数组，元素仅支持 string/number/boolean",
        "error",
      );
      return;
    }

    setIsKvLoading(true);

    try {
      const params = new URLSearchParams({
        prefix: formatJson(prefix),
        limit: "1000",
      });
      const response = await fetch(`/api/admin/kv?${params.toString()}`, {
        headers: { "x-openfx-admin-key": key },
      });
      const payload = await response.json();
      if (!response.ok) {
        reportKvStatus(payload.error ?? "KV 读取失败", "error");
        return;
      }

      const entries = Array.isArray(payload.entries)
        ? payload.entries as AdminKvEntry[]
        : [];
      const nextSelectedEntry = entries.find((entry) =>
        formatJson(entry.key) === selectedKvKey
      ) ??
        entries[0] ?? null;
      rememberAdminKey(key);
      setKvEntries(entries);
      setSelectedKvKey(nextSelectedEntry ? formatJson(nextSelectedEntry.key) : "");
      if (nextSelectedEntry) {
        setKvKeyInput(formatJson(nextSelectedEntry.key));
        setKvValueInput(formatJson(nextSelectedEntry.value));
      }
      reportKvStatus(`已读取 ${entries.length} 条 KV 记录`, "success");
    } finally {
      setIsKvLoading(false);
    }
  }

  async function saveKvEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const key = props.adminKey.trim();
    if (!key) {
      reportKvStatus("请先输入管理密钥再写入 KV", "error");
      return;
    }

    let kvKey: JsonKvKeyPart[];
    let kvValue: unknown;
    try {
      kvKey = parseKvKeyInput(kvKeyInput);
      kvValue = JSON.parse(kvValueInput) as unknown;
    } catch {
      reportKvStatus("KV key/value 必须是合法 JSON；key 需要非空数组", "error");
      return;
    }

    setIsKvSaving(true);

    try {
      const response = await fetch("/api/admin/kv", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openfx-admin-key": key,
        },
        body: JSON.stringify({ key: kvKey, value: kvValue }),
      });
      const payload = await response.json();
      if (!response.ok) {
        reportKvStatus(payload.error ?? "KV 保存失败", "error");
        return;
      }

      rememberAdminKey(key);
      await loadKvEntries();
      reportKvStatus(`KV ${formatJson(kvKey)} 已保存`, "success");
    } finally {
      setIsKvSaving(false);
    }
  }

  async function removeKvEntry(key: JsonKvKeyPart[]) {
    const providedKey = props.adminKey.trim();
    if (!providedKey) {
      reportKvStatus("请先输入管理密钥再删除 KV", "error");
      return;
    }

    const encodedKey = formatJson(key);
    setDeletingKvKey(encodedKey);

    try {
      const params = new URLSearchParams({ key: encodedKey });
      const response = await fetch(`/api/admin/kv?${params.toString()}`, {
        method: "DELETE",
        headers: { "x-openfx-admin-key": providedKey },
      });
      const payload = await response.json();
      if (!response.ok) {
        reportKvStatus(payload.error ?? "KV 删除失败", "error");
        return;
      }

      await loadKvEntries();
      reportKvStatus(`KV ${encodedKey} 已删除`, "success");
    } finally {
      setDeletingKvKey(null);
    }
  }

  function editKvEntry(entry: AdminKvEntry) {
    setSelectedKvKey(formatJson(entry.key));
    setKvKeyInput(formatJson(entry.key));
    setKvValueInput(formatJson(entry.value));
    reportKvStatus("KV 记录已回填到编辑区", "neutral");
  }

  useEffect(() => {
    if (!props.adminKey.trim()) {
      return;
    }

    void loadKvEntries();
  }, []);

  return (
    <section className="admin-panel admin-kv-console-panel">
      <div className="admin-kv-console-head">
        <div>
          <p className="admin-panel-kicker">deno kv</p>
          <h2>数据库</h2>
        </div>
        <div className="admin-panel-actions">
          <span>
            {kvEntries.length === 0 ? "空列表" : `${kvEntries.length} 条记录`}
          </span>
          <span className={`admin-status-badge tone-${statusTone}`}>
            {status}
          </span>
        </div>
      </div>

      {props.showAuth === false
        ? null
        : (
          <div className="admin-auth-row data-admin-auth-row">
            <input
              aria-label="Deno KV 管理密钥"
              autoComplete="off"
              placeholder="OPENFX_ADMIN_KEY"
              type="password"
              value={props.adminKey}
              onChange={(event) => props.onAdminKeyChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void loadKvEntries();
                }
              }}
            />
            <button
              disabled={isKvLoading}
              type="button"
              onClick={() => void loadKvEntries()}
            >
              {isKvLoading ? "连接中" : "连接"}
            </button>
          </div>
        )}

      <div className="admin-kv-workbench">
        <div className="admin-kv-browser-panel">
          <div className="admin-kv-browser-head">
            <div>
              <p className="admin-panel-kicker">browser</p>
              <h2>Key</h2>
            </div>
            <span>{filteredKvEntries.length} / {kvEntries.length}</span>
          </div>

          <div className="admin-kv-filter-row">
            <input
              aria-label="搜索 KV key"
              placeholder="搜索 key 或 domain"
              type="search"
              value={kvSearch}
              onChange={(event) => setKvSearch(event.target.value)}
            />
            <button
              disabled={isKvLoading}
              type="button"
              onClick={() => void loadKvEntries()}
            >
              {isKvLoading ? "刷新中" : "刷新"}
            </button>
          </div>

          <details className="admin-kv-prefix-filter">
            <summary>Prefix filter</summary>
            <textarea
              className="admin-kv-input"
              spellCheck={false}
              value={kvPrefixInput}
              onChange={(event) => setKvPrefixInput(event.target.value)}
            />
          </details>

          <div className="admin-kv-key-list" role="listbox" aria-label="KV keys">
            {kvGroups.length === 0
              ? (
                <div className="admin-empty-state">
                  <strong>暂无 KV 记录</strong>
                  <p>输入 admin key 后刷新，或调整 prefix filter。</p>
                </div>
              )
              : kvGroups.map((group) => (
                <div className="admin-kv-key-group" key={group.id}>
                  <div className="admin-kv-key-group-head">
                    <span>{group.label}</span>
                    <em>{group.entries.length}</em>
                  </div>
                  {group.entries.map((entry) => {
                    const encodedKey = formatJson(entry.key);
                    const active = encodedKey === formatJson(selectedKvEntry?.key);
                    return (
                      <button
                        className={`admin-kv-key-row${active ? " active" : ""}`}
                        key={encodedKey}
                        role="option"
                        aria-selected={active}
                        type="button"
                        onClick={() => editKvEntry(entry)}
                      >
                        <code>{entry.key.join(" / ")}</code>
                        <span>{typeof entry.value}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        </div>

        <div className="admin-kv-detail-panel">
          <form className="admin-kv-detail-form" onSubmit={saveKvEntry}>
            <div className="admin-kv-detail-head">
              <div>
                <p className="admin-panel-kicker">value</p>
                <h2>
                  {selectedKvEntry ? getKvDomainLabel(selectedKvEntry) : "新记录"}
                </h2>
              </div>
              <div className="admin-kv-detail-actions">
                <button type="button" onClick={() => void loadKvEntries()}>
                  刷新
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      setKvValueInput(formatJson(JSON.parse(kvValueInput)));
                    } catch {
                      reportKvStatus("Value 不是合法 JSON，无法格式化", "error");
                    }
                  }}
                >
                  格式化
                </button>
                <button
                  disabled={!selectedKvEntry || deletingKvKey === selectedKvKey}
                  type="button"
                  onClick={() =>
                    selectedKvEntry && void removeKvEntry(selectedKvEntry.key)}
                >
                  {deletingKvKey === selectedKvKey ? "删除中" : "删除"}
                </button>
                <button disabled={isKvSaving} type="submit">
                  {isKvSaving ? "保存中" : "保存"}
                </button>
              </div>
            </div>

            <div className="admin-kv-breadcrumbs" aria-label="当前 KV key">
              {selectedKvKeyParts.length > 0
                ? selectedKvKeyParts.map((part, index) => (
                  <span key={`${String(part)}-${index}`}>{String(part)}</span>
                ))
                : <span>未选择 key</span>}
            </div>

            <label className="admin-field admin-kv-key-editor">
              <span>Full key</span>
              <textarea
                className="admin-kv-input"
                spellCheck={false}
                value={kvKeyInput}
                onChange={(event) => setKvKeyInput(event.target.value)}
              />
            </label>

            <div className="admin-kv-meta-row">
              <span>Versionstamp</span>
              <code>{selectedKvEntry?.versionstamp ?? "new"}</code>
            </div>

            <label className="admin-field admin-kv-json-editor">
              <span>Formatted JSON value</span>
              <textarea
                className="admin-kv-json-textarea"
                spellCheck={false}
                value={kvValueInput}
                onChange={(event) => setKvValueInput(event.target.value)}
              />
            </label>
          </form>
        </div>
      </div>
    </section>
  );
}

function formatMessageDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString();
}

function MessageBoard(props: { adminKey: string }) {
  const [messages, setMessages] = useState<HomepageMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadMessages() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/messages?limit=8", {
        headers: { "x-openfx-admin-key": props.adminKey },
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) {
        const hint = typeof payload.hint === "string" ? payload.hint : "";
        throw new Error(hint || "留言读取失败");
      }

      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (error) {
      setError(error instanceof Error ? error.message : "留言读取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, [props.adminKey]);

  return (
    <section className="data-message-panel">
      <div className="data-message-head">
        <div>
          <p className="admin-panel-kicker">message</p>
          <h2>留言</h2>
        </div>
        <div className="admin-panel-actions">
          <span>{isLoading ? "读取中" : `${messages.length} 条`}</span>
          <button
            disabled={isLoading}
            type="button"
            onClick={() => void loadMessages()}
          >
            {isLoading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>

      {error
        ? <p className="data-message-empty">{error}</p>
        : messages.length === 0
        ? <p className="data-message-empty">暂无 MESSAGE 留言。</p>
        : (
          <div className="data-message-list">
            {messages.map((message) => (
              <article className="data-message-card" key={message.id}>
                <div className="data-message-meta">
                  <strong>MESSAGE</strong>
                  <time dateTime={message.createdAt}>
                    {formatMessageDate(message.createdAt)}
                  </time>
                </div>
                <p>{message.content}</p>
                <pre>{formatJson(message)}</pre>
              </article>
            ))}
          </div>
        )}
    </section>
  );
}

function DataPanel() {
  const [adminKey, setAdminKey] = useState("");
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const [accessStatus, setAccessStatus] = useState("");

  async function submitAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const key = adminKeyInput.trim();
    if (!key) {
      setAccessStatus("请输入服务端管理密码");
      return;
    }

    setIsCheckingAccess(true);
    setAccessStatus("");

    try {
      const response = await fetch("/api/admin/access", {
        headers: { "x-openfx-admin-key": key },
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) {
        throw new Error("密码无效");
      }

      localStorage.setItem(STORAGE_KEYS.adminKey, key);
      setAdminKey(key);
      setIsAuthorized(true);
      setAccessStatus("");
    } catch (error) {
      setAdminKey("");
      setIsAuthorized(false);
      setAccessStatus(error instanceof Error ? error.message : "密码无效");
    } finally {
      setIsCheckingAccess(false);
    }
  }

  if (!isAuthorized) {
    return (
      <div className="domain-panel data-auth-panel" data-panel-id="openfx-data">
        <form className="data-access-form" onSubmit={submitAccess}>
          <input
            aria-label="数据面板管理密码"
            autoComplete="off"
            placeholder="OPENFX_ADMIN_KEY"
            type="password"
            value={adminKeyInput}
            onChange={(event) => setAdminKeyInput(event.target.value)}
          />
          <button disabled={isCheckingAccess} type="submit">
            {isCheckingAccess ? "验证中" : "进入"}
          </button>
          {accessStatus
            ? (
              <p className="data-access-status" role="status">
                {accessStatus}
              </p>
            )
            : null}
        </form>
      </div>
    );
  }

  return (
    <div className="domain-panel data-domain-panel" data-panel-id="openfx-data">
      <section className="domain-panel-hero">
        <p className="eyebrow">deno deploy</p>
        <h1>数据</h1>
        <p>Deno KV 的可视化操作面板，并展示首页 MESSAGE 提交的留言。</p>
      </section>
      <MessageBoard adminKey={adminKey} />
      <KvConsole
        adminKey={adminKey}
        onAdminKeyChange={setAdminKey}
        showAuth={false}
      />
    </div>
  );
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function PanelShell(props: {
  panelId: ActiveDomainPanel;
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <div className="domain-panel" data-panel-id={props.panelId}>
      <section className="domain-panel-hero">
        <p className="eyebrow">{props.eyebrow}</p>
        <h1>{props.title}</h1>
        <p>{props.lede}</p>
      </section>
      <div className="domain-panel-grid">
        {props.children}
      </div>
    </div>
  );
}

function MapPosterPanel() {
  return (
    <PanelShell
      panelId="map-poster"
      eyebrow="poster domain"
      title="Map Poster"
      lede="在地图上选择中心点，再调整主题、画幅和地图范围，直接生成可预览、可下载的 OpenStreetMap 城市海报。"
    >
      <MapPosterPanelContent />
    </PanelShell>
  );
}

function RepositoryPanelLink(props: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      className="panel-download-link"
      href={props.href}
      rel="noreferrer"
      target="_blank"
    >
      {props.children}
    </a>
  );
}

function SmartisaxPanel() {
  return (
    <PanelShell
      panelId="smartisax"
      eyebrow="public GitHub repo"
      title="Smartisax"
      lede="面向 Smartisan R2 的 Smartisan OS hard-ROM 改造工作区，围绕镜像重建、实机刷入验证和 Portal 远程控制持续迭代。"
    >
      <article className="domain-panel-section">
        <h2>仓库入口</h2>
        <p>
          来源于{" "}
          <code>intpfx/Smartisax</code>，GitHub 当前为公开仓库，README
          标注源码、脚本和文档使用 Apache License 2.0。
        </p>
        <RepositoryPanelLink href="https://github.com/intpfx/Smartisax">
          打开 Smartisax
        </RepositoryPanelLink>
      </article>
      <article className="domain-panel-section">
        <h2>覆盖内容</h2>
        <ul>
          <li>Smartisan R2 / Smartisan OS 8.5.3 的 hard-ROM 修改工作区。</li>
          <li>分区镜像编辑、super 重建、刷入槽位验证和可回滚镜像账本。</li>
          <li>Portal 远程镜像/控制、WebRTC 链路、TextBoom / OCR 等实机能力。</li>
        </ul>
      </article>
      <article className="domain-panel-section">
        <h2>技术侧重</h2>
        <ul>
          <li>主语言统计以 Shell 为主，辅以 Python、Java、C++、Kotlin 和 Smali。</li>
          <li>
            仓库按 <code>docs/</code>、<code>tools/</code>、<code>apps/</code>、<code>
              hard-rom/
            </code>{" "}
            与逆向资料组织。
          </li>
          <li>OpenFX 这里只做项目索引，不承载 ROM 产物或实机操作入口。</li>
        </ul>
      </article>
    </PanelShell>
  );
}

function LiveSystemPanel() {
  return (
    <PanelShell
      panelId="live-system"
      eyebrow="private GitHub repo"
      title="LiveSystem"
      lede="私有的工程实时管理系统，覆盖材料计划、库存流转、施工进度、财务核算、LiveDock 工作区和内嵌 Agent 助手。"
    >
      <article className="domain-panel-section">
        <h2>仓库入口</h2>
        <p>
          来源于{" "}
          <code>intpfx/LiveSystem</code>，GitHub
          当前为私有仓库；只有拥有权限的账号可以打开。
        </p>
        <RepositoryPanelLink href="https://github.com/intpfx/LiveSystem">
          打开 LiveSystem
        </RepositoryPanelLink>
      </article>
      <article className="domain-panel-section">
        <h2>业务范围</h2>
        <ul>
          <li>材料需求计划、领料计划、出入库、实时库存和进度确认。</li>
          <li>项目监控、地图标点、复式记账、工资薪酬、资产管理和备份中心。</li>
          <li>LiveDock 统一工作区、WebSocket 协作和内嵌 Agent Runtime。</li>
        </ul>
      </article>
      <article className="domain-panel-section">
        <h2>技术栈</h2>
        <ul>
          <li>Bun + Elysia + SQLite / Drizzle 构建后端。</li>
          <li>React 19 + Vite+ + Tailwind CSS 4 + shadcn/ui 构建前端。</li>
          <li>OpenFX 这里只展示项目索引，不嵌入私有系统运行页面。</li>
        </ul>
      </article>
    </PanelShell>
  );
}

function WanderingPlanPanel() {
  return (
    <PanelShell
      panelId="wandering-plan"
      eyebrow="public GitHub repo"
      title="WanderingPlan"
      lede="基于 HaaS600 / AliOS Things 的智能柜体物联网毕设项目，仓库同时保留固件代码、业务代码、结构模型和项目资料。"
    >
      <article className="domain-panel-section">
        <h2>仓库入口</h2>
        <p>
          来源于{" "}
          <code>intpfx/WanderingPlan</code>，GitHub 当前为公开仓库，README 标注项目采用
          MIT License。
        </p>
        <RepositoryPanelLink href="https://github.com/intpfx/WanderingPlan">
          打开 WanderingPlan
        </RepositoryPanelLink>
      </article>
      <article className="domain-panel-section">
        <h2>项目内容</h2>
        <ul>
          <li>面向智能书柜/货柜场景的 IoT 毕设项目。</li>
          <li>
            包含 <code>Code/</code> 固件与业务源码、<code>Docs/</code>{" "}
            文档和渲染图、<code>Model/</code> 结构模型。
          </li>
          <li>已完成温度、人体检测、GPS、磁力锁和阿里云模块等第一阶段能力。</li>
        </ul>
      </article>
      <article className="domain-panel-section">
        <h2>技术侧重</h2>
        <ul>
          <li>主语言统计以 C 为主，并包含 C++、Assembly、CMake 和脚本工具。</li>
          <li>基于 HaaS600 / AliOS Things，配套 Node.js 版接口说明。</li>
          <li>OpenFX 这里只作为外部开源作品入口，不复制硬件资料或模型文件。</li>
        </ul>
      </article>
    </PanelShell>
  );
}

function DownipPanel(props: { accessKey: string }) {
  const [mapping, setMapping] = useState<DownipMapping>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const mappingEntries = Object.entries(mapping).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  useEffect(() => {
    let disposed = false;

    async function loadMapping() {
      setIsLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        if (props.accessKey) {
          params.set("unlock_key", props.accessKey);
        }
        const query = params.toString();
        const response = await fetch(`/update${query ? `?${query}` : ""}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "mapping_load_failed");
        }

        if (!disposed) {
          setMapping((payload.mapping ?? {}) as DownipMapping);
        }
      } catch {
        if (!disposed) {
          setError("当前映射读取失败");
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    }

    void loadMapping();

    return () => {
      disposed = true;
    };
  }, [props.accessKey]);

  return (
    <PanelShell
      panelId="ipv6-sync-suite"
      eyebrow="network domain"
      title="IPv6 Sync Suite"
      lede="把桌面端定时 IPv6 上报、服务端映射写入和按 key 重定向串成一条可部署链路。"
    >
      <article className="domain-panel-section">
        <h2>接口</h2>
        <ul>
          <li>
            <code>POST /update</code> 写入 key 到 IPv6 的映射。
          </li>
          <li>
            <code>GET /update</code> 读取当前映射。
          </li>
          <li>
            <code>GET /:key/*</code> 按 key 重定向到目标 IPv6 服务。
          </li>
        </ul>
      </article>
      <article className="domain-panel-section">
        <h2>上报示例</h2>
        <pre className="code-block">
          {JSON.stringify({ home: { ipv6: "2001:db8::1", port: 3000 } }, null, 2)}
        </pre>
      </article>
      <article className="domain-panel-section downip-live-section">
        <div className="downip-live-head">
          <h2>当前接收值</h2>
          <span>{isLoading ? "读取中" : `${mappingEntries.length} 项`}</span>
        </div>
        {error
          ? <p className="downip-live-error">{error}</p>
          : isLoading
          ? <p className="downip-live-muted">正在读取服务端当前映射...</p>
          : mappingEntries.length === 0
          ? <p className="downip-live-muted">还没有收到任何 IPv6 上报。</p>
          : (
            <div className="downip-live-table">
              {mappingEntries.map(([key, value]) => (
                <div className="downip-live-row" key={key}>
                  <strong>{key}</strong>
                  <code>{value.ipv6}</code>
                  <span>{value.port}</span>
                </div>
              ))}
            </div>
          )}
      </article>
      <article className="domain-panel-section">
        <h2>访问边界</h2>
        <p>
          页面说明公开展示；<code>/update</code> 的读写接口需要 admin key 或包含
          <code>ipv6-sync-suite</code> 的 unlock key。
        </p>
      </article>
    </PanelShell>
  );
}

function ProxyPanel(props: { frameUrl: string }) {
  if (props.frameUrl) {
    return (
      <div
        className="domain-panel proxy-browser-panel"
        data-panel-id="relay-proxy-gateway"
      >
        <iframe
          className="proxy-browser-frame"
          src={props.frameUrl}
          title="Relay Gateway preview"
        />
      </div>
    );
  }

  return (
    <PanelShell
      panelId="relay-proxy-gateway"
      eyebrow="relay domain"
      title="Relay Gateway"
      lede="按需启用的 HTTP 中继业务，把上游站点挂到 Nitro 路由下，并统一处理请求头、响应头和 CORS。"
    >
      <article className="domain-panel-section">
        <h2>启用方式</h2>
        <p>
          部署环境设置 <code>OPENFX_PROXY_UPSTREAM</code> 后，
          <code>/api/proxy/*</code> 会转发到对应上游。
        </p>
      </article>
      <article className="domain-panel-section">
        <h2>行为</h2>
        <ul>
          <li>
            未配置上游时返回 <code>proxy_not_configured</code>。
          </li>
          <li>
            自动重写 <code>origin</code> 与 <code>referer</code>。
          </li>
          <li>
            响应会添加 CORS 头，并移除 <code>x-frame-options</code>。
          </li>
        </ul>
      </article>
      <article className="domain-panel-section">
        <h2>访问边界</h2>
        <p>
          <code>OPTIONS</code> 预检公开；其他代理请求需要 admin key 或包含
          <code>relay-proxy-gateway</code> 的 unlock key。
        </p>
      </article>
    </PanelShell>
  );
}

function HowMuchPanel() {
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    async function loadComponents() {
      await Promise.all([
        loadScript("/how-much/vector-map.js"),
        loadScript("/how-much/dynamic-capsule.js"),
      ]);
      if (!disposed) setLoaded(true);
    }
    loadComponents();
    return () => {
      disposed = true;
    };
  }, []);

  if (!loaded) {
    return <div className="how-much-loading">加载中...</div>;
  }

  return (
    <div className="how-much-panel" ref={panelRef}>
      <vector-map data-url="/how-much/map.topo.json"></vector-map>
      <dynamic-capsule></dynamic-capsule>
    </div>
  );
}

export function App() {
  const pathname = usePathname();

  if (pathname === "/admin") {
    return <Homepage initialPanel="admin-console" />;
  }

  if (pathname !== "/downip") {
    return <Homepage />;
  }

  return (
    <div className="app-frame">
      <main>
        {pathname === "/downip" ? <DownipPage /> : null}
      </main>
    </div>
  );
}
