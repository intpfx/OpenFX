import { animate, type JSAnimation, scrambleText } from "animejs";
import gsap from "gsap";
import {
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

import { DOMAIN_CONTENT_PUBLIC } from "../domain-access.ts";
import {
  HOMEPAGE_PROJECTS,
  type HomepageProjectCard,
  listHiddenHomepageProjects,
} from "../homepage-projects";

type UnlockRule = {
  key: string;
  label: string;
  projectIds: string[];
  expiresAt: string;
};

type ActiveUnlockSession = {
  key: string;
  label: string;
  projectIds: string[];
  expiresAt: string;
};

type ActiveDomainPanel =
  | "admin-console"
  | "ipv6-sync-suite"
  | "how-much-this"
  | "relay-proxy-gateway";

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

const hiddenProjects = listHiddenHomepageProjects();

type BrandName = "FENGXIAO" | "OpenFX";

const STORAGE_KEYS = {
  activeUnlock: "openfx_active_unlock",
  adminKey: "openfx_admin_key",
} as const;

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

function parseActiveUnlock(rawValue: string | null): ActiveUnlockSession | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ActiveUnlockSession>;
    if (
      typeof parsed.key !== "string" ||
      typeof parsed.label !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      !Array.isArray(parsed.projectIds)
    ) {
      return null;
    }

    return {
      key: parsed.key,
      label: parsed.label,
      expiresAt: parsed.expiresAt,
      projectIds: parsed.projectIds.map((projectId) => String(projectId)),
    };
  } catch {
    return null;
  }
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

function buildUnlockButtonText(session: ActiveUnlockSession | null) {
  if (!session) {
    return "UNLOCK";
  }

  return `${session.label} · ${formatRemainingTime(session.expiresAt)}`;
}

function getBrowserLocationPathname() {
  return globalThis.location?.pathname ?? "/";
}

function dispatchPopstate() {
  globalThis.dispatchEvent?.(new PopStateEvent("popstate"));
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

function BrandWord(props: { onToggle: () => void }) {
  return (
    <div className="brand-zone">
      <div className="brand-shell">
        <button
          className="brand-word"
          id="brandWord"
          type="button"
          onClick={props.onToggle}
          aria-label="Toggle brand"
        >
          <div aria-hidden="true" className="glitch-ghost" id="brandGhostR" />
          <div aria-hidden="true" className="glitch-ghost" id="brandGhostB" />
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
      <div className="pc-tech">
        {props.project.tech.map((item) => (
          <span key={`${props.project.id}-${item}`}>{item}</span>
        ))}
      </div>
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
  if (
    card.id === "how-much-this" || card.id === "ipv6-sync-suite" ||
    card.id === "relay-proxy-gateway"
  ) {
    return () => controls.openPanel(card.id);
  }

  return undefined;
}

function Homepage(props: { initialPanel?: ActiveDomainPanel } = {}) {
  const currentBrandRef = useRef<BrandName>("OpenFX");
  const brandAnimationRef = useRef<JSAnimation | null>(null);
  const primaryControlAnimationRef = useRef<JSAnimation | null>(null);
  const statusAnimationRef = useRef<JSAnimation | null>(null);
  const busyRef = useRef(false);
  const brandWordRef = useRef<HTMLButtonElement | null>(null);
  const brandTextRef = useRef<HTMLSpanElement | null>(null);
  const primaryControlRef = useRef<HTMLButtonElement | null>(null);
  const primaryControlLabelRef = useRef<HTMLSpanElement | null>(null);
  const statusHintRef = useRef<HTMLSpanElement | null>(null);
  const statusClearTimeoutRef = useRef<number | null>(null);
  const unlockInputRef = useRef<HTMLInputElement | null>(null);
  const unlockShellRef = useRef<HTMLDivElement | null>(null);
  const unlockFieldRef = useRef<HTMLDivElement | null>(null);
  const [unlockKey, setUnlockKey] = useState("");
  const [status, setStatus] = useState("");
  const [uiBrand, setUiBrand] = useState<BrandName>("OpenFX");
  const [showUnlock, setShowUnlock] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [activePanel, setActivePanel] = useState<ActiveDomainPanel | null>(
    props.initialPanel ?? null,
  );
  const [proxyInput, setProxyInput] = useState("");
  const [proxyFrameUrl, setProxyFrameUrl] = useState("");
  const [messageName, setMessageName] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [messageButtonText, setMessageButtonText] = useState("MESSAGE");
  const [unlockButtonText, setUnlockButtonText] = useState("UNLOCK");
  const [activeUnlock, setActiveUnlock] = useState<ActiveUnlockSession | null>(() => {
    const session = parseActiveUnlock(localStorage.getItem(STORAGE_KEYS.activeUnlock));
    return session && !isExpired(session.expiresAt) ? session : null;
  });
  const [unlockClock, setUnlockClock] = useState(() => Date.now());

  const visibleProjectIds = useMemo(
    () => new Set(activeUnlock?.projectIds ?? []),
    [activeUnlock],
  );
  const isPanelOpen = activePanel !== null;
  const activeUnlockSummary = activeUnlock
    ? formatRemainingTime(activeUnlock.expiresAt)
    : "";
  const currentAccessKey = activeUnlock?.key ??
    localStorage.getItem(STORAGE_KEYS.adminKey)?.trim() ?? "";

  function isAccentChar(word: string, ch: string) {
    return (word === "FENGXIAO" && ch === "O") ||
      (word === "OpenFX" && (ch === "F" || ch === "X"));
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

    cancelScramble(brandAnimationRef);
    cancelScramble(primaryControlAnimationRef);
    cancelScramble(statusAnimationRef);
    if (primaryControlRef.current) {
      gsap.killTweensOf(primaryControlRef.current);
    }
    if (unlockShellRef.current) {
      gsap.killTweensOf(unlockShellRef.current);
    }
  }

  function setWord(word: BrandName) {
    const textNode = brandTextRef.current;
    if (!textNode) {
      return;
    }

    textNode.innerHTML = "";
    for (const [index, ch] of word.split("").entries()) {
      const span = document.createElement("span");
      span.className = "glitch-char";
      span.dataset.idx = String(index);
      span.textContent = ch;
      if (isAccentChar(word, ch)) {
        span.style.color = "var(--accent)";
      }
      textNode.append(span);
    }
  }

  function setDocumentTitle(brand: BrandName) {
    document.title = brand;
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

    const text = uiBrand === "OpenFX" ? unlockButtonText : messageButtonText;
    primaryControlNode.setAttribute("aria-label", text);
    primaryControlNode.classList.toggle("primary", uiBrand === "OpenFX");

    if (!showUnlock && labelNode.textContent !== text) {
      scrambleLabel(text);
    }
  }

  function openInlineUnlock() {
    setShowUnlock(true);
    setStatus("");
  }

  function closeInlineUnlock(resetInput = false) {
    setShowUnlock(false);
    if (resetInput) {
      setUnlockKey("");
    }
  }

  function clearActiveUnlock(options?: { message?: string; closeShell?: boolean }) {
    localStorage.removeItem(STORAGE_KEYS.activeUnlock);
    setActiveUnlock(null);
    setUnlockButtonText("UNLOCK");
    if (options?.message) {
      setStatus(options.message);
    }
    if (options?.closeShell) {
      closeInlineUnlock(true);
    }
  }

  function animateUnlockEditing(nextOpen: boolean) {
    const primaryNode = primaryControlRef.current;
    const shellNode = unlockShellRef.current;
    const fieldNode = unlockFieldRef.current;
    if (!primaryNode || !shellNode || !fieldNode || uiBrand !== "OpenFX") {
      return;
    }

    gsap.killTweensOf(primaryNode);
    gsap.killTweensOf(shellNode);

    if (nextOpen) {
      const targetWidth = Math.ceil(
        Math.max(
          fieldNode.scrollWidth,
          fieldNode.clientWidth,
          fieldNode.getBoundingClientRect().width,
          320,
        ),
      );
      gsap.set(shellNode, {
        display: "flex",
        width: 0,
        autoAlpha: 0,
        x: 12,
      });
      gsap.set(primaryNode, { transformOrigin: "right center" });
      gsap.to(primaryNode, {
        duration: 0.2,
        autoAlpha: 0,
        scaleX: 0.92,
        x: 10,
        ease: "power2.inOut",
      });
      gsap.to(shellNode, {
        duration: 0.26,
        width: targetWidth,
        autoAlpha: 1,
        x: 0,
        ease: "power2.out",
        delay: 0.04,
      });
      return;
    }

    const currentWidth = Math.ceil(
      shellNode.getBoundingClientRect().width ||
        fieldNode.getBoundingClientRect().width || 320,
    );
    gsap.set(shellNode, {
      display: "flex",
      width: currentWidth,
      autoAlpha: 1,
      x: 0,
    });
    gsap.to(shellNode, {
      duration: 0.22,
      width: 0,
      autoAlpha: 0,
      x: 12,
      ease: "power2.inOut",
    });
    gsap.to(primaryNode, {
      duration: 0.24,
      autoAlpha: 1,
      scaleX: 1,
      x: 0,
      ease: "power2.out",
      delay: 0.04,
    });
  }

  function finishAnim(word: BrandName) {
    setWord(word);
    currentBrandRef.current = word;
    setUiBrand(word);
    setDocumentTitle(word);
    busyRef.current = false;
  }

  function toggleBrand() {
    const brandTextNode = brandTextRef.current;
    if (busyRef.current || !brandWordRef.current || !brandTextNode) {
      return;
    }

    busyRef.current = true;
    cancelScramble(brandAnimationRef);

    const currentWord = currentBrandRef.current;
    const target: BrandName = currentWord === "FENGXIAO" ? "OpenFX" : "FENGXIAO";
    setUiBrand(target);
    setDocumentTitle(target);

    cancelScramble(brandAnimationRef);
    brandAnimationRef.current = animate(brandTextNode, {
      duration: 720,
      ease: "linear",
      innerHTML: scrambleText({ text: target }),
      onComplete: () => {
        brandAnimationRef.current = null;
        brandTextNode.textContent = target;
        finishAnim(target);
      },
    });
  }

  async function handleUnlock() {
    if (activeUnlock) {
      clearActiveUnlock({ message: "Unlock cleared", closeShell: true });
      return;
    }

    const key = unlockKey.trim();
    if (!key) {
      setStatus("Enter a key");
      return;
    }

    try {
      const response = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const rawPayload = await response.text();
      const payload = rawPayload
        ? JSON.parse(rawPayload) as Record<string, unknown>
        : {};

      if (!response.ok) {
        const error = typeof payload.error === "string" ? payload.error : "";
        if (response.status >= 500) {
          setStatus("Unlock service unavailable");
          return;
        }

        setStatus(error === "invalid_key" ? "Invalid key" : error || "Unlock failed");
        return;
      }

      if (payload.mode === "admin") {
        localStorage.setItem(STORAGE_KEYS.adminKey, key);
        setStatus("Admin access granted");
        closeInlineUnlock();
        openProjectPanel("admin-console");
        return;
      }

      const session: ActiveUnlockSession = {
        key: typeof payload.key === "string" ? payload.key : key,
        label: typeof payload.label === "string" ? payload.label : "Unlocked projects",
        expiresAt: typeof payload.expiresAt === "string"
          ? payload.expiresAt
          : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        projectIds: Array.isArray(payload.projectIds)
          ? payload.projectIds as string[]
          : [],
      };
      localStorage.setItem(STORAGE_KEYS.activeUnlock, JSON.stringify(session));
      setActiveUnlock(session);
      setStatus(`${session.label} active`);
      setUnlockButtonText(buildUnlockButtonText(session));
      setUnlockKey("");
      setShowUnlock(false);
    } catch {
      setStatus("Unlock request failed");
    }
  }

  function handleSendMessage() {
    const content = messageContent.trim();
    if (!content) {
      return;
    }

    const name = messageName.trim() || "Anonymous";
    const messages = JSON.parse(localStorage.getItem("fx_msgs") || "[]") as Array<
      Record<string, string>
    >;
    messages.push({ name, content, time: new Date().toISOString() });
    localStorage.setItem("fx_msgs", JSON.stringify(messages));
    setShowMessage(false);
    setMessageName("");
    setMessageContent("");
    setMessageButtonText("SENT");
    globalThis.setTimeout(() => setMessageButtonText("MESSAGE"), 1800);
  }

  function isProjectRevealed(card: HomepageProjectCard) {
    return DOMAIN_CONTENT_PUBLIC || !card.hidden || visibleProjectIds.has(card.id);
  }

  function openProjectPanel(panel: ActiveDomainPanel) {
    if (document.startViewTransition) {
      document.startViewTransition(() => flushSync(() => setActivePanel(panel)));
      return;
    }

    setActivePanel(panel);
  }

  function closeProjectPanel() {
    const shouldResetAdminRoute = activePanel === "admin-console" &&
      globalThis.location?.pathname === "/admin";
    if (document.startViewTransition) {
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

    const accessKey = activeUnlock?.key ??
      localStorage.getItem(STORAGE_KEYS.adminKey)?.trim() ?? "";
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

    return () => {
      clearScheduledWork();
      document.body.classList.remove("homepage-body");
    };
  }, []);

  useEffect(() => {
    if (!activeUnlock) {
      setUnlockButtonText("UNLOCK");
      return;
    }

    if (isExpired(activeUnlock.expiresAt)) {
      clearActiveUnlock({ message: "Unlock expired" });
      return;
    }

    setUnlockButtonText(buildUnlockButtonText(activeUnlock));

    return undefined;
  }, [activeUnlock, unlockClock]);

  useEffect(() => {
    if (!activeUnlock) {
      return;
    }

    const intervalId = globalThis.setInterval(() => {
      setUnlockClock(Date.now());
    }, 30_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeUnlock]);

  useEffect(() => {
    if (props.initialPanel) {
      setActivePanel(props.initialPanel);
    }
  }, [props.initialPanel]);

  useEffect(() => {
    if (uiBrand !== "OpenFX" && showUnlock) {
      setShowUnlock(false);
    }
  }, [showUnlock, uiBrand]);

  useEffect(() => {
    if (!(showUnlock && uiBrand === "OpenFX") || activeUnlock) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      unlockInputRef.current?.focus();
      unlockInputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [activeUnlock, showUnlock, uiBrand]);

  useEffect(() => {
    animateUnlockEditing(showUnlock);
  }, [showUnlock, uiBrand]);

  useEffect(() => {
    renderPrimaryControl();
  }, [messageButtonText, showUnlock, uiBrand, unlockButtonText]);

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
      <BrandWord onToggle={toggleBrand} />

      <div
        className={`projects-zone${isPanelOpen ? " panel-active" : ""}`}
        style={{
          gridTemplateColumns: HOMEPAGE_PROJECTS.layout.gridTemplateColumns,
          position: "relative",
        }}
      >
        {/* 卡片网格 — 面板打开时透明不可交互，但保留在 DOM 中维持 grid 布局 */}
        <div
          className="project-column"
          key={HOMEPAGE_PROJECTS.columns[0].id}
          style={{
            ...(HOMEPAGE_PROJECTS.columns[0].offsetRem
              ? { paddingTop: `${HOMEPAGE_PROJECTS.columns[0].offsetRem}rem` }
              : undefined),
            opacity: isPanelOpen ? 0 : 1,
            pointerEvents: isPanelOpen ? "none" : undefined,
          }}
        >
          {HOMEPAGE_PROJECTS.columns[0].cards.map((card) => (
            <ProjectCard
              key={card.id}
              project={card}
              revealed={isProjectRevealed(card)}
              onClick={getProjectCardClick(card, { openPanel: openProjectPanel })}
            />
          ))}
        </div>
        <div
          className="project-column"
          key={HOMEPAGE_PROJECTS.columns[1].id}
          style={{
            ...(HOMEPAGE_PROJECTS.columns[1].offsetRem
              ? { paddingTop: `${HOMEPAGE_PROJECTS.columns[1].offsetRem}rem` }
              : undefined),
            opacity: isPanelOpen ? 0 : 1,
            pointerEvents: isPanelOpen ? "none" : undefined,
          }}
        >
          {HOMEPAGE_PROJECTS.columns[1].cards.map((card) => (
            <ProjectCard
              key={card.id}
              project={card}
              revealed={isProjectRevealed(card)}
              onClick={getProjectCardClick(card, { openPanel: openProjectPanel })}
            />
          ))}
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
      </div>

      <div
        className={`control-cluster${
          uiBrand === "OpenFX" && showUnlock ? " unlock-editing" : ""
        }`}
      >
        <div className="control-status">
          <span
            className="inline-unlock-hint"
            data-active={status ? "true" : "false"}
            id="unlockHint"
            ref={statusHintRef}
            aria-live="polite"
          />
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
          <button
            className={`ctrl-btn${
              uiBrand === "OpenFX" && !isPanelOpen ? " primary" : ""
            }`}
            id="homepagePrimaryControl"
            ref={primaryControlRef}
            type="button"
            style={{
              display: activePanel === "relay-proxy-gateway" ? "none" : undefined,
            }}
            onClick={() => {
              if (isPanelOpen) {
                closeProjectPanel();
                return;
              }
              if (uiBrand === "OpenFX") {
                openInlineUnlock();
                return;
              }

              setShowMessage(true);
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

          <div
            className="inline-unlock-shell"
            id="inlineUnlockShell"
            ref={unlockShellRef}
            aria-hidden={showUnlock ? "false" : "true"}
          >
            <div className="inline-unlock-field" ref={unlockFieldRef}>
              {activeUnlock
                ? (
                  <>
                    <div
                      className="inline-unlock-session"
                      role="status"
                      aria-live="polite"
                    >
                      <strong>{activeUnlock.label}</strong>
                      <span>{activeUnlockSummary}</span>
                    </div>
                    <div className="inline-unlock-actions">
                      <button
                        className="inline-unlock-action inline-unlock-confirm"
                        id="unlockConfirmButton"
                        type="button"
                        onClick={() =>
                          clearActiveUnlock({
                            message: "Unlock cleared",
                            closeShell: true,
                          })}
                      >
                        Exit
                      </button>
                      <button
                        className="inline-unlock-action inline-unlock-cancel"
                        id="unlockCancelButton"
                        type="button"
                        onClick={() => closeInlineUnlock(true)}
                        aria-label="Close unlock actions"
                      >
                        ×
                      </button>
                    </div>
                  </>
                )
                : (
                  <>
                    <input
                      autoComplete="off"
                      className="inline-unlock-input"
                      id="unlockKeyInput"
                      placeholder="Enter key"
                      ref={unlockInputRef}
                      type="password"
                      value={unlockKey}
                      onChange={(event) => setUnlockKey(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleUnlock();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          closeInlineUnlock(true);
                        }
                      }}
                    />
                    <div className="inline-unlock-actions">
                      <button
                        className="inline-unlock-action inline-unlock-confirm"
                        id="unlockConfirmButton"
                        type="button"
                        onClick={() => void handleUnlock()}
                      >
                        OK
                      </button>
                      <button
                        className="inline-unlock-action inline-unlock-cancel"
                        id="unlockCancelButton"
                        type="button"
                        onClick={() => closeInlineUnlock(true)}
                        aria-label="Cancel unlock"
                      >
                        ×
                      </button>
                    </div>
                  </>
                )}
            </div>
          </div>
        </div>
      </div>

      {showMessage
        ? (
          <div
            className={`modal-overlay${showMessage ? " active" : ""}`}
            id="messageModal"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setShowMessage(false);
              }
            }}
          >
            <div className="modal">
              <h2>MESSAGE</h2>
              <label htmlFor="messageName">Name</label>
              <input
                id="messageName"
                type="text"
                value={messageName}
                onChange={(event) => setMessageName(event.target.value)}
                placeholder="Optional"
              />
              <label htmlFor="messageContent">Message</label>
              <textarea
                id="messageContent"
                value={messageContent}
                onChange={(event) => setMessageContent(event.target.value)}
                placeholder="Collaboration, feedback, or just say hi..."
              />
              <div className="modal-actions">
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => setShowMessage(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={handleSendMessage}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )
        : null}
    </div>
  );
}

type AdminStatusTone = "neutral" | "success" | "error";

function AdminPage(props: { embedded?: boolean } = {}) {
  const [adminKey, setAdminKey] = useState(() =>
    localStorage.getItem(STORAGE_KEYS.adminKey) ?? ""
  );
  const [rules, setRules] = useState<UnlockRule[]>([]);
  const [status, setStatus] = useState("请输入管理密钥后加载数据");
  const [statusTone, setStatusTone] = useState<AdminStatusTone>("neutral");
  const [form, setForm] = useState({
    label: "",
    expiresAt: createDefaultExpiryInput(),
    projectIds: [] as string[],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
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
  const [isKvLoading, setIsKvLoading] = useState(false);
  const [isKvSaving, setIsKvSaving] = useState(false);
  const [deletingKvKey, setDeletingKvKey] = useState<string | null>(null);

  const hiddenProjectLookup = useMemo(
    () => new Map(hiddenProjects.map((project) => [project.id, project.name])),
    [],
  );
  const coveredProjectCount = useMemo(
    () => new Set(rules.flatMap((rule) => rule.projectIds)).size,
    [rules],
  );
  const selectedProjectNames = useMemo(
    () =>
      form.projectIds.map((projectId) =>
        hiddenProjectLookup.get(projectId) ?? projectId
      ),
    [form.projectIds, hiddenProjectLookup],
  );
  const activeRuleCount = useMemo(
    () => rules.filter((rule) => !isExpired(rule.expiresAt)).length,
    [rules],
  );
  const kvGroups = useMemo(() => groupKvEntriesByDomain(kvEntries), [kvEntries]);

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

  async function loadKvEntries() {
    const key = adminKey.trim();
    if (!key) {
      reportStatus("请先输入管理密钥再读取 KV", "error");
      return;
    }

    let prefix: JsonKvKeyPart[];
    try {
      prefix = parseKvPrefixInput(kvPrefixInput);
    } catch {
      reportStatus(
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
        reportStatus(payload.error ?? "KV 读取失败", "error");
        return;
      }

      const entries = Array.isArray(payload.entries)
        ? payload.entries as AdminKvEntry[]
        : [];
      localStorage.setItem(STORAGE_KEYS.adminKey, key);
      setKvEntries(entries);
      reportStatus(`已读取 ${entries.length} 条 KV 记录`, "success");
    } finally {
      setIsKvLoading(false);
    }
  }

  async function saveKvEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const key = adminKey.trim();
    if (!key) {
      reportStatus("请先输入管理密钥再写入 KV", "error");
      return;
    }

    let kvKey: JsonKvKeyPart[];
    let kvValue: unknown;
    try {
      kvKey = parseKvKeyInput(kvKeyInput);
      kvValue = JSON.parse(kvValueInput) as unknown;
    } catch {
      reportStatus("KV key/value 必须是合法 JSON；key 需要非空数组", "error");
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
        reportStatus(payload.error ?? "KV 保存失败", "error");
        return;
      }

      localStorage.setItem(STORAGE_KEYS.adminKey, key);
      await loadKvEntries();
      reportStatus(`KV ${formatJson(kvKey)} 已保存`, "success");
    } finally {
      setIsKvSaving(false);
    }
  }

  async function removeKvEntry(key: JsonKvKeyPart[]) {
    const providedKey = adminKey.trim();
    if (!providedKey) {
      reportStatus("请先输入管理密钥再删除 KV", "error");
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
        reportStatus(payload.error ?? "KV 删除失败", "error");
        return;
      }

      await loadKvEntries();
      reportStatus(`KV ${encodedKey} 已删除`, "success");
    } finally {
      setDeletingKvKey(null);
    }
  }

  function editKvEntry(entry: AdminKvEntry) {
    setKvKeyInput(formatJson(entry.key));
    setKvValueInput(formatJson(entry.value));
    reportStatus("KV 记录已回填到编辑区", "neutral");
  }

  useEffect(() => {
    if (!adminKey.trim()) {
      return;
    }

    void loadRules();
    void loadKvEntries();
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

      <section className="admin-hero-panel">
        <div className="admin-hero-copy">
          <p className="eyebrow">unlock console</p>
          <h1>后台规则控制台</h1>
          <p className="lede">
            管理密钥严格区分大小写。先验证身份，再批量维护 unlock 规则和业务暴露范围。
          </p>
          <div className="admin-hero-tags">
            <span>Case-sensitive key</span>
            <span>{hiddenProjects.length} 个隐藏项目</span>
            <span>{activeRuleCount} 条规则处于有效期</span>
          </div>
        </div>

        <div className="admin-stat-grid">
          <article className="admin-stat-card">
            <span className="admin-stat-label">Rules</span>
            <strong>{rules.length}</strong>
            <p>当前持久化的 unlock 条目</p>
          </article>
          <article className="admin-stat-card">
            <span className="admin-stat-label">Coverage</span>
            <strong>{coveredProjectCount}</strong>
            <p>已被规则覆盖的隐藏项目数</p>
          </article>
          <article className="admin-stat-card">
            <span className="admin-stat-label">Draft</span>
            <strong>{form.projectIds.length}</strong>
            <p>当前草稿已选择的项目数</p>
          </article>
        </div>
      </section>

      <section className="admin-workbench">
        <div className="admin-stack">
          <article className="admin-panel admin-auth-panel">
            <div className="admin-panel-head">
              <div>
                <p className="admin-panel-kicker">step 01</p>
                <h2>身份验证</h2>
              </div>
              <span className={`admin-status-badge tone-${statusTone}`}>{status}</span>
            </div>

            <div className="admin-auth-row">
              <input
                autoCapitalize="off"
                autoComplete="off"
                placeholder="输入管理密钥"
                spellCheck={false}
                type="password"
                value={adminKey}
                onChange={(event) =>
                  setAdminKey(event.target.value)}
              />
              <button
                disabled={isLoading}
                type="button"
                onClick={() => void loadRules()}
              >
                {isLoading ? "加载中..." : "加载规则"}
              </button>
            </div>

            <p className="admin-panel-note">
              本地开发默认密钥为严格区分大小写的 <strong>TEST</strong>。
            </p>
          </article>

          <article className="admin-panel admin-editor-panel">
            <div className="admin-panel-head">
              <div>
                <p className="admin-panel-kicker">step 02</p>
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
                      setForm((current) => ({ ...current, label: event.target.value }))}
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
          </article>
        </div>

        <article className="admin-panel admin-list-panel">
          <div className="admin-panel-head">
            <div>
              <p className="admin-panel-kicker">step 03</p>
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
                  <p>先完成身份验证，然后在左侧创建第一条 unlock 规则。</p>
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
        </article>
      </section>

      <section className="admin-kv-workbench">
        <article className="admin-panel admin-kv-editor-panel">
          <div className="admin-panel-head">
            <div>
              <p className="admin-panel-kicker">deno kv</p>
              <h2>数据库记录</h2>
            </div>
            <span className="admin-panel-meta">
              {kvEntries.length === 0 ? "等待读取" : `${kvEntries.length} 条记录`}
            </span>
          </div>

          <div className="admin-kv-toolbar">
            <label className="admin-field">
              <span>Prefix filter</span>
              <textarea
                className="admin-kv-input"
                spellCheck={false}
                value={kvPrefixInput}
                onChange={(event) => setKvPrefixInput(event.target.value)}
              />
            </label>
            <button
              className="admin-primary-action"
              disabled={isKvLoading}
              type="button"
              onClick={() => void loadKvEntries()}
            >
              {isKvLoading ? "读取中..." : "刷新 KV"}
            </button>
          </div>

          <form className="admin-form admin-kv-form" onSubmit={saveKvEntry}>
            <label className="admin-field">
              <span>Key</span>
              <textarea
                className="admin-kv-input"
                spellCheck={false}
                value={kvKeyInput}
                onChange={(event) => setKvKeyInput(event.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Value</span>
              <textarea
                className="admin-kv-input admin-kv-value-input"
                spellCheck={false}
                value={kvValueInput}
                onChange={(event) => setKvValueInput(event.target.value)}
              />
            </label>
            <div className="admin-form-footer">
              <p>
                Prefix 留空数组 <code>[]</code>{" "}
                时读取全部。Key 使用完整 Deno KV key，保存会覆盖同 key 的旧值。
              </p>
              <button disabled={isKvSaving} type="submit">
                {isKvSaving ? "保存中..." : "保存 KV"}
              </button>
            </div>
          </form>
        </article>

        <article className="admin-panel admin-kv-list-panel">
          <div className="admin-panel-head">
            <div>
              <p className="admin-panel-kicker">records</p>
              <h2>按 domain 分组</h2>
            </div>
            <span className="admin-panel-meta">
              {kvGroups.length === 0 ? "空列表" : `${kvGroups.length} 组`}
            </span>
          </div>

          <div className="admin-kv-groups">
            {kvGroups.length === 0
              ? (
                <div className="admin-empty-state">
                  <strong>暂无 KV 记录</strong>
                  <p>
                    默认读取全部 KV；如果没有出现数据，请检查 admin key 或运行时 KV
                    状态。
                  </p>
                </div>
              )
              : kvGroups.map((group) => (
                <div className="admin-kv-domain-group" key={group.id}>
                  <div className="admin-kv-domain-head">
                    <strong>{group.label}</strong>
                    <span>{group.entries.length} 条</span>
                  </div>
                  <div className="admin-kv-table-wrap">
                    <table className="admin-kv-table">
                      <thead>
                        <tr>
                          <th>Key</th>
                          <th>Value</th>
                          <th>Version</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.entries.map((entry) => {
                          const encodedKey = formatJson(entry.key);
                          return (
                            <tr key={encodedKey}>
                              <td>
                                <code>{formatJson(entry.key)}</code>
                              </td>
                              <td>
                                <pre>{formatJson(entry.value)}</pre>
                              </td>
                              <td>
                                <span className="admin-kv-version">
                                  {entry.versionstamp}
                                </span>
                              </td>
                              <td>
                                <div className="admin-kv-table-actions">
                                  <button
                                    type="button"
                                    onClick={() => editKvEntry(entry)}
                                  >
                                    编辑
                                  </button>
                                  <button
                                    disabled={deletingKvKey === encodedKey}
                                    type="button"
                                    onClick={() =>
                                      void removeKvEntry(entry.key)}
                                  >
                                    {deletingKvKey === encodedKey ? "删除中" : "删除"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        </article>
      </section>
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
