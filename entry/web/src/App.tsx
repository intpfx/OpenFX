import { animate, type JSAnimation, scrambleText } from "animejs";
import gsap from "gsap";
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { DownipPage } from "../../../domains/downip/frontend/DownipPage.tsx";

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
function Homepage() {
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
  const [showHowMuch, setShowHowMuch] = useState(false);
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
  const activeUnlockSummary = activeUnlock
    ? formatRemainingTime(activeUnlock.expiresAt)
    : "";

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
        navigate(typeof payload.redirect === "string" ? payload.redirect : "/admin");
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
        className={`projects-zone${showHowMuch ? " panel-active" : ""}`}
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
            opacity: showHowMuch ? 0 : 1,
            pointerEvents: showHowMuch ? "none" : undefined,
          }}
        >
          {HOMEPAGE_PROJECTS.columns[0].cards.map((card) => (
            <ProjectCard
              key={card.id}
              project={card}
              revealed={!card.hidden || visibleProjectIds.has(card.id)}
              onClick={
                card.id === "how-much-this"
                  ? () => {
                      if (document.startViewTransition) {
                        document.startViewTransition(() => flushSync(() => setShowHowMuch(true)));
                      } else {
                        setShowHowMuch(true);
                      }
                    }
                  : undefined
              }
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
            opacity: showHowMuch ? 0 : 1,
            pointerEvents: showHowMuch ? "none" : undefined,
          }}
        >
          {HOMEPAGE_PROJECTS.columns[1].cards.map((card) => (
            <ProjectCard
              key={card.id}
              project={card}
              revealed={!card.hidden || visibleProjectIds.has(card.id)}
              onClick={card.id === "how-much-this"
                ? () => {
                    if (document.startViewTransition) {
                      document.startViewTransition(() => flushSync(() => setShowHowMuch(true)));
                    } else {
                      setShowHowMuch(true);
                    }
                  }
                : undefined}
            />
          ))}
        </div>

        {/* 面板叠加层 */}
        {showHowMuch && (
          <HowMuchPanel onClose={() => {
            if (document.startViewTransition) {
              document.startViewTransition(() => flushSync(() => setShowHowMuch(false)));
            } else {
              setShowHowMuch(false);
            }
          }} />
        )}
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
          <button
            className={`ctrl-btn${uiBrand === "OpenFX" && !showHowMuch ? " primary" : ""}`}
            id="homepagePrimaryControl"
            ref={primaryControlRef}
            type="button"
            onClick={() => {
              if (showHowMuch) {
                if (document.startViewTransition) {
                  document.startViewTransition(() => flushSync(() => setShowHowMuch(false)));
                } else {
                  setShowHowMuch(false);
                }
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
              style={{ display: showHowMuch ? "none" : undefined }}
            />
            {showHowMuch && <span className="ctrl-btn-back-text">← 返回</span>}
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

function AdminPage() {
  const [adminKey, setAdminKey] = useState(() =>
    localStorage.getItem(STORAGE_KEYS.adminKey) ?? ""
  );
  const [rules, setRules] = useState<UnlockRule[]>([]);
  const [status, setStatus] = useState("请输入管理密钥后加载规则");
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

  async function saveRule(event: React.FormEvent<HTMLFormElement>) {
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

  return (
    <div className="content-shell admin-shell">
      <button
        className="back-link admin-back-link"
        onClick={() => navigate("/")}
        type="button"
      >
        返回首页
      </button>

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
                onChange={(event) => setAdminKey(event.target.value)}
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

function HowMuchPanel({ onClose }: { onClose: () => void }) {
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

  if (pathname !== "/downip" && pathname !== "/admin") {
    return <Homepage />;
  }

  return (
    <div className="app-frame">
      <main>
        {pathname === "/downip" ? <DownipPage /> : null}
        {pathname === "/admin" ? <AdminPage /> : null}
      </main>
    </div>
  );
}
