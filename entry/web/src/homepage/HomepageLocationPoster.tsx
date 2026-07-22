/** @jsxRuntime classic */
/** @jsx h */

import {
  createElement as h,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createHomepageLocationPosterController,
  type HomepagePosterPlace,
} from "./location-poster-controller.ts";
import {
  type HomepageLocationFailure,
  type HomepageLocationPermission,
  type HomepageLocationPosterState,
  shouldFocusLocationPoster,
} from "./location-poster.ts";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elementName: string]: Record<string, unknown>;
    }
  }
}

type HomepageLocationPosterViewProps = {
  state: HomepageLocationPosterState;
  failure: HomepageLocationFailure | null;
  posterUrl: string | null;
  place: HomepagePosterPlace | null;
  suspended: boolean;
  onAllow: () => void;
  onDismiss: () => void;
  onRetry: () => void;
};

function getFailureTitle(failure: HomepageLocationFailure | null) {
  if (failure === "denied") return "定位权限未开启";
  if (failure === "timeout") return "定位请求超时";
  if (failure === "low-accuracy") return "定位精度不足";
  if (failure === "render-failed") return "城市背景生成失败";
  return "定位暂不可用";
}

export function HomepageLocationPosterView(
  props: HomepageLocationPosterViewProps,
) {
  const isPermissionGate = shouldFocusLocationPoster(props.state);
  const shouldShowPoster = Boolean(props.posterUrl) &&
    props.state !== "denied" &&
    props.state !== "unavailable" &&
    props.state !== "error";
  const cityLabel = props.place?.city
    ? `背景 · ${props.place.city}`
    : "背景 · 已按当前位置生成";
  const attribution = shouldShowPoster
    ? (
      <a
        className={`homepage-poster-attribution${
          isPermissionGate ? " homepage-location-gate-attribution" : ""
        }`}
        href="https://www.openstreetmap.org/copyright"
        rel="noreferrer"
        target="_blank"
      >
        © OpenStreetMap contributors
      </a>
    )
    : null;

  return (
    <div className="homepage-location-poster">
      <div
        aria-hidden="true"
        className="homepage-poster-background"
        data-ready={shouldShowPoster ? "true" : "false"}
      >
        {shouldShowPoster
          ? <img alt="" decoding="async" src={props.posterUrl ?? undefined} />
          : null}
      </div>

      {!isPermissionGate ? attribution : null}

      {props.suspended ? null : isPermissionGate
        ? (
          <section
            aria-labelledby="homepageLocationTitle"
            aria-modal="true"
            className="homepage-location-capsule homepage-location-gate"
            role="dialog"
          >
            <div className="homepage-location-copy">
              <small>Map Poster</small>
              <strong id="homepageLocationTitle">
                {props.state === "requesting"
                  ? "在浏览器提示中允许位置访问"
                  : "用你所在的城市生成首页背景"}
              </strong>
              <span>
                {props.state === "requesting"
                  ? "关闭或拒绝不会阻塞首页。"
                  : "设备定位仅用于生成城市海报，不保存原始位置。"}
              </span>
            </div>
            {attribution}
            <button
              className="homepage-location-dismiss"
              type="button"
              onClick={props.onDismiss}
            >
              暂不使用
            </button>
            <button
              className="homepage-location-primary"
              data-location-primary="true"
              disabled={props.state === "requesting"}
              type="button"
              onClick={props.onAllow}
            >
              {props.state === "requesting" ? "等待授权" : "允许定位并生成"}
            </button>
          </section>
        )
        : props.state === "ready"
        ? (
          <section
            aria-label="城市背景状态"
            className="homepage-location-capsule homepage-location-status"
          >
            <strong>{cityLabel}</strong>
            <span>Map Poster</span>
            <button type="button" onClick={props.onRetry}>重新定位</button>
          </section>
        )
        : props.state === "rendering"
        ? (
          <p className="homepage-location-capsule homepage-location-progress">
            正在生成城市背景
          </p>
        )
        : props.state === "denied"
        ? (
          <section
            aria-label="城市背景定位权限未开启"
            className="homepage-location-capsule homepage-location-status is-error"
          >
            <strong>{getFailureTitle(props.failure)}</strong>
            <span>请在浏览器的网站设置中重新开启定位权限。</span>
            <button type="button" onClick={props.onDismiss}>关闭</button>
          </section>
        )
        : props.state === "unavailable" || props.state === "error"
        ? (
          <section
            aria-label="城市背景不可用"
            className="homepage-location-capsule homepage-location-status is-error"
          >
            <strong>{getFailureTitle(props.failure)}</strong>
            <button type="button" onClick={props.onRetry}>重试</button>
            <button type="button" onClick={props.onDismiss}>关闭</button>
          </section>
        )
        : null}

      <span aria-live="polite" className="sr-only" role="status">
        {props.state === "requesting"
          ? "等待浏览器定位授权"
          : props.state === "rendering"
          ? "正在生成城市背景"
          : props.state === "ready"
          ? cityLabel
          : props.state === "error" || props.state === "denied" ||
              props.state === "unavailable"
          ? getFailureTitle(props.failure)
          : ""}
      </span>
    </div>
  );
}

async function readLocationPermission(): Promise<HomepageLocationPermission> {
  if (!navigator.permissions?.query) return "unsupported";

  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unsupported";
  }
}

function requestDevicePosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 300_000,
    });
  });
}

function isRestorableFocusTarget(element: HTMLElement | null) {
  if (!element || element === document.body || !element.isConnected) return false;
  if (
    element.closest("[inert], [aria-hidden='true'], [hidden]") ||
    element.matches(":disabled, [aria-hidden='true'], [hidden]")
  ) {
    return false;
  }

  return element.matches(
    "a[href], area[href], button:not(:disabled), input:not(:disabled), " +
      "select:not(:disabled), textarea:not(:disabled), [contenteditable='true'], " +
      "[tabindex]:not([tabindex='-1'])",
  );
}

function focusOrFallback(
  candidate: HTMLElement | null,
  fallback: HTMLButtonElement | null,
) {
  if (candidate && isRestorableFocusTarget(candidate)) {
    candidate.focus();
    if (document.activeElement === candidate) return;
  }
  fallback?.focus();
}

export function HomepageLocationPoster(props: {
  fallbackFocusRef: RefObject<HTMLButtonElement | null>;
  suspended: boolean;
  onFocusModeChange: (active: boolean) => void;
}) {
  const [state, setState] = useState<HomepageLocationPosterState>("checking");
  const [failure, setFailure] = useState<HomepageLocationFailure | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [place, setPlace] = useState<HomepagePosterPlace | null>(null);
  const controllerRef = useRef<
    ReturnType<
      typeof createHomepageLocationPosterController
    > | null
  >(null);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasFocusedRef = useRef(false);

  if (!controllerRef.current) {
    controllerRef.current = createHomepageLocationPosterController({
      isSecureContext: () => globalThis.isSecureContext,
      hasGeolocation: () => Boolean(navigator.geolocation),
      readPermission: readLocationPermission,
      requestPosition: requestDevicePosition,
      fetchPoster: async (request, signal) => {
        return await fetch("/api/map-poster/render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal,
          body: JSON.stringify(request),
        });
      },
      createObjectUrl: (svg) =>
        URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })),
      revokeObjectUrl: URL.revokeObjectURL,
      onState: setState,
      onFailure: setFailure,
      onPosterUrl: setPosterUrl,
      onPlace: setPlace,
    });
  }
  const controller = controllerRef.current;

  useEffect(() => {
    void controller.initialize();
    return () => controller.dispose();
  }, [controller]);

  const focusMode = !props.suspended && shouldFocusLocationPoster(state);

  useEffect(() => {
    props.onFocusModeChange(focusMode);
    let frameId = 0;

    if (focusMode && !wasFocusedRef.current) {
      const activeElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      previousFocusRef.current = isRestorableFocusTarget(activeElement)
        ? activeElement
        : null;
      frameId = requestAnimationFrame(() => primaryButtonRef.current?.focus());
    } else if (!focusMode && wasFocusedRef.current) {
      frameId = requestAnimationFrame(() => {
        const previous = previousFocusRef.current;
        focusOrFallback(previous, props.fallbackFocusRef.current);
        previousFocusRef.current = null;
      });
    }

    wasFocusedRef.current = focusMode;
    return () => cancelAnimationFrame(frameId);
  }, [focusMode, props.fallbackFocusRef, props.onFocusModeChange]);

  useEffect(() => {
    return () => props.onFocusModeChange(false);
  }, [props.onFocusModeChange]);

  function dismiss() {
    controller.dismiss();
  }

  return (
    <div
      className="homepage-location-controller"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape" && focusMode) {
          event.preventDefault();
          dismiss();
        }
      }}
      ref={(node: HTMLDivElement | null) => {
        primaryButtonRef.current = node?.querySelector<HTMLButtonElement>(
          "[data-location-primary='true']",
        ) ?? null;
      }}
    >
      <HomepageLocationPosterView
        failure={failure}
        place={place}
        posterUrl={posterUrl}
        state={state}
        suspended={props.suspended}
        onAllow={() => void controller.start()}
        onDismiss={dismiss}
        onRetry={() => void controller.start()}
      />
    </div>
  );
}
