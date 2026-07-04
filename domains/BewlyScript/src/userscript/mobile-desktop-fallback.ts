export const MOBILE_DESKTOP_FALLBACK_SCRIPT = `
  function isBewlyTopLevelPage() {
    try {
      return window.self === window.top;
    }
    catch (error) {
      return false;
    }
  }

  function isBewlyOwnVideoDrawerFrame() {
    if (isBewlyTopLevelPage())
      return false;

    try {
      if (new URL(location.href).searchParams.get("bewlyVideoDrawerFrame") === "1")
        return true;
    }
    catch (error) {
      if (location.search.indexOf("bewlyVideoDrawerFrame=1") !== -1)
        return true;
    }

    try {
      return document.referrer.indexOf("bewlyVideoDrawer=") !== -1;
    }
    catch (error) {
      return false;
    }
  }

  function canRedirectBewlyVideoPageContext() {
    return isBewlyTopLevelPage() && !isBewlyOwnVideoDrawerFrame();
  }

  function hasBewlyPortraitViewport() {
    var viewport = window.visualViewport;
    var viewportWidth = viewport && viewport.width ? viewport.width : window.innerWidth;
    var viewportHeight = viewport && viewport.height ? viewport.height : window.innerHeight;

    if (viewportWidth > 0 && viewportHeight > 0 && Math.abs(viewportHeight - viewportWidth) >= 24) {
      if (viewportHeight >= viewportWidth)
        return true;

      if (viewportWidth <= 980 && viewportWidth < viewportHeight * 1.45)
        return true;

      return false;
    }

    try {
      if (window.matchMedia && window.matchMedia("(orientation: portrait)").matches)
        return true;
      if (window.matchMedia && window.matchMedia("(orientation: landscape)").matches)
        return false;
    }
    catch (error) {
      // Fall through to orientation APIs.
    }

    var screenOrientation = typeof screen !== "undefined" && screen.orientation && screen.orientation.type;
    if (typeof screenOrientation === "string")
      return screenOrientation.indexOf("portrait") === 0;

    var legacyOrientation = typeof window.orientation === "number" ? window.orientation : undefined;
    if (legacyOrientation !== undefined)
      return Math.abs(legacyOrientation) % 180 === 0;

    return viewportWidth > 0 && viewportHeight > 0 && viewportHeight >= viewportWidth;
  }

  function shouldOpenBewlyVideoAsDrawerFromPrelude() {
    if (!canRedirectBewlyVideoPageContext())
      return false;
    if (location.protocol !== "https:" || (location.hostname !== "www.bilibili.com" && location.hostname !== "bilibili.com"))
      return false;
    if (!hasBewlyPortraitViewport())
      return false;

    var videoPath = location.pathname.replace(/\\/+$/, "");
    return videoPath.indexOf("/video/") === 0 || videoPath.indexOf("/bangumi/play/") === 0;
  }

  function openBewlyVideoAsDrawerFromPrelude() {
    if (!shouldOpenBewlyVideoAsDrawerFromPrelude())
      return false;

    var drawerUrl = location.href;
    var homeUrl = new URL("https://www.bilibili.com/");
    homeUrl.searchParams.set("page", "Home");
    homeUrl.searchParams.set("bewlyVideoDrawer", drawerUrl);
    homeUrl.hash = "bewlyVideoDrawer=" + encodeURIComponent(drawerUrl);
    persistBewlyVideoDrawerHostIntentFromPrelude(drawerUrl);
    location.replace(homeUrl.toString());
    return true;
  }

  function scheduleBewlyVideoDrawerPreludeRetry() {
    if (!canRedirectBewlyVideoPageContext())
      return;
    if (location.protocol !== "https:" || (location.hostname !== "www.bilibili.com" && location.hostname !== "bilibili.com"))
      return;

    var videoPath = location.pathname.replace(/\\/+$/, "");
    if (videoPath.indexOf("/video/") !== 0 && videoPath.indexOf("/bangumi/play/") !== 0)
      return;

    [60, 240, 720].forEach(function (delay) {
      setTimeout(function () {
        openBewlyVideoAsDrawerFromPrelude();
      }, delay);
    });
  }

  var bewlyVideoDrawerHostFallbackAttr = "data-bewly-mobile-video-drawer-host-fallback";
  var bewlyVideoDrawerHostFallbackStorageKey = "bewlyVideoDrawerHostFallbackIntent";
  var bewlyVideoDrawerHostFallbackDelay = 900;
  var bewlyVideoDrawerHostFallbackRetryDelays = [120, 360, 720, 1200, 1800];
  var bewlyVideoDrawerHostFallbackCloseThreshold = 86;
  var bewlyVideoDrawerHostFallbackFastVelocity = 0.42;
  var enableBewlyVideoDrawerHostFallback = true;
  var bewlyVideoDrawerHostFallbackInitialIntent = "";

  function persistBewlyVideoDrawerHostIntentFromPrelude(videoUrl) {
    try {
      sessionStorage.setItem(bewlyVideoDrawerHostFallbackStorageKey, videoUrl);
    }
    catch (error) {
      // URL parameter fallback remains available when storage is blocked.
    }
  }

  function getStoredBewlyVideoDrawerHostIntentFromPrelude() {
    try {
      return sessionStorage.getItem(bewlyVideoDrawerHostFallbackStorageKey) || "";
    }
    catch (error) {
      return "";
    }
  }

  function clearStoredBewlyVideoDrawerHostIntentFromPrelude() {
    try {
      sessionStorage.removeItem(bewlyVideoDrawerHostFallbackStorageKey);
    }
    catch (error) {
      // Ignore transient storage failures; the URL has already been consumed.
    }
  }

  function getHashedBewlyVideoDrawerHostIntentFromPrelude() {
    try {
      var hash = location.hash.replace(/^#/, "");
      return new URLSearchParams(hash).get("bewlyVideoDrawer") || "";
    }
    catch (error) {
      return "";
    }
  }

  function getBewlyVideoDrawerHostIntentFromPrelude() {
    try {
      return new URL(location.href).searchParams.get("bewlyVideoDrawer")
        || getHashedBewlyVideoDrawerHostIntentFromPrelude()
        || getStoredBewlyVideoDrawerHostIntentFromPrelude();
    }
    catch (error) {
      return getHashedBewlyVideoDrawerHostIntentFromPrelude() || getStoredBewlyVideoDrawerHostIntentFromPrelude();
    }
  }

  function rememberBewlyVideoDrawerHostIntentFromPrelude() {
    var currentIntent = getBewlyVideoDrawerHostIntentFromPrelude();
    if (currentIntent)
      bewlyVideoDrawerHostFallbackInitialIntent = currentIntent;
    return bewlyVideoDrawerHostFallbackInitialIntent;
  }

  function getRememberedBewlyVideoDrawerHostIntentFromPrelude() {
    return rememberBewlyVideoDrawerHostIntentFromPrelude() || bewlyVideoDrawerHostFallbackInitialIntent;
  }

  function shouldInstallBewlyVideoDrawerHostFallbackFromPrelude() {
    return isBewlyTopLevelPage()
      && location.protocol === "https:"
      && (location.hostname === "www.bilibili.com" || location.hostname === "bilibili.com")
      && !!getRememberedBewlyVideoDrawerHostIntentFromPrelude()
      && !document.querySelector("[" + bewlyVideoDrawerHostFallbackAttr + "='true']");
  }

  function markBewlyVideoDrawerFrameUrlFromPrelude(videoUrl) {
    try {
      var markedUrl = new URL(videoUrl, location.href);
      markedUrl.searchParams.set("bewlyVideoDrawerFrame", "1");
      return markedUrl.toString();
    }
    catch (error) {
      return videoUrl;
    }
  }

  function getBewlyVideoDrawerFrameLoadingHtmlFromPrelude() {
    return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'><style>html,body{width:100%;height:100%;margin:0;background:#101114;color:#c9d1dd;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}body{display:grid;place-items:center;}</style></head><body>正在打开视频详情...</body></html>";
  }

  function consumeBewlyVideoDrawerHostIntentFromPrelude() {
    clearStoredBewlyVideoDrawerHostIntentFromPrelude();

    try {
      var current = new URL(location.href);
      var hasSearchIntent = current.searchParams.has("bewlyVideoDrawer");
      var hasHashIntent = current.hash.indexOf("bewlyVideoDrawer=") !== -1;
      if (!hasSearchIntent && !hasHashIntent)
        return;

      if (hasSearchIntent)
        current.searchParams.delete("bewlyVideoDrawer");
      if (hasHashIntent)
        current.hash = "";
      if (!current.searchParams.get("page"))
        current.searchParams.set("page", "Home");
      history.replaceState(history.state, "", current.pathname + current.search + current.hash);
    }
    catch (error) {
      // Keep the current URL if Safari refuses history updates in a transient state.
    }
  }

  function applyBewlyVideoDrawerHostFallbackStyle(element, styles) {
    Object.keys(styles).forEach(function (property) {
      element.style.setProperty(property, styles[property], "important");
    });
  }

  function resetBewlyVideoDrawerHostDocumentFromPrelude() {
    try {
      document.documentElement.setAttribute("data-bewly-mobile-video-drawer-host-fallback-page", "true");
      document.documentElement.style.setProperty("background", "#101114", "important");
      document.documentElement.style.setProperty("overflow", "hidden", "important");
      document.documentElement.style.setProperty("width", "100%", "important");
      document.documentElement.style.setProperty("height", "100%", "important");
      if (document.body) {
        document.body.setAttribute("data-bewly-mobile-video-drawer-host-shell", "true");
        document.body.style.setProperty("background", "#101114", "important");
        document.body.style.setProperty("margin", "0", "important");
        document.body.style.setProperty("overflow", "hidden", "important");
        document.body.style.setProperty("width", "100%", "important");
        document.body.style.setProperty("min-height", "100%", "important");
      }
    }
    catch (error) {
      // Keep installing the drawer even if Safari refuses style mutations during startup.
    }
    return document.body || document.documentElement;
  }

  function closeBewlyVideoDrawerHostFallbackFromPrelude(root) {
    root.setAttribute("data-bewly-mobile-video-drawer-host-fallback-closing", "true");
    root.style.setProperty("transition", "transform 220ms cubic-bezier(0.32, 0, 0.67, 0)", "important");
    root.style.setProperty("transform", "translate3d(0, 100%, 0)", "important");
    window.setTimeout(function () {
      root.remove();
    }, 230);
  }

  function bindBewlyVideoDrawerHostFallbackDragFromPrelude(root, handle) {
    var pointerId;
    var startY = 0;
    var lastY = 0;
    var lastTime = 0;

    function clearPointer() {
      pointerId = undefined;
      root.removeAttribute("data-bewly-mobile-video-drawer-host-fallback-dragging");
    }

    function setTranslateY(value, transition) {
      var offset = Math.max(0, value);
      root.style.setProperty("transition", transition || "none", "important");
      root.style.setProperty("transform", "translate3d(0, " + offset + "px, 0)", "important");
    }

    handle.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0)
        return;

      pointerId = event.pointerId;
      startY = event.clientY;
      lastY = event.clientY;
      lastTime = performance.now();
      root.setAttribute("data-bewly-mobile-video-drawer-host-fallback-dragging", "true");
      handle.setPointerCapture(event.pointerId);
      setTranslateY(0);
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    handle.addEventListener("pointermove", function (event) {
      if (pointerId !== event.pointerId)
        return;

      lastY = event.clientY;
      lastTime = performance.now();
      setTranslateY(event.clientY - startY);
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    function finishDrag(event) {
      if (pointerId !== event.pointerId)
        return;

      var offset = Math.max(0, event.clientY - startY);
      var elapsed = Math.max(1, performance.now() - lastTime);
      var velocity = Math.max(0, event.clientY - lastY) / elapsed;
      if (handle.hasPointerCapture(event.pointerId))
        handle.releasePointerCapture(event.pointerId);
      clearPointer();

      if (offset >= bewlyVideoDrawerHostFallbackCloseThreshold || velocity >= bewlyVideoDrawerHostFallbackFastVelocity) {
        closeBewlyVideoDrawerHostFallbackFromPrelude(root);
      }
      else {
        setTranslateY(0, "transform 180ms cubic-bezier(0.2, 0, 0, 1)");
        window.setTimeout(function () {
          root.style.removeProperty("transition");
          root.style.removeProperty("transform");
        }, 190);
      }

      event.preventDefault();
      event.stopPropagation();
    }

    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);
  }

  function installBewlyVideoDrawerHostFallbackFromPrelude(drawerUrl) {
    consumeBewlyVideoDrawerHostIntentFromPrelude();
    var mountTarget = resetBewlyVideoDrawerHostDocumentFromPrelude();
    if (!mountTarget || document.querySelector("[" + bewlyVideoDrawerHostFallbackAttr + "='true']"))
      return false;

    var root = document.createElement("section");
    root.setAttribute(bewlyVideoDrawerHostFallbackAttr, "true");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "视频详情");
    applyBewlyVideoDrawerHostFallbackStyle(root, {
      "background": "#101114",
      "color": "#f2f3f5",
      "display": "grid",
      "grid-template-rows": "clamp(18px, 3.5dvh, 24px) minmax(0, 1fr)",
      "height": "100dvh",
      "inset": "0",
      "overflow": "hidden",
      "pointer-events": "auto",
      "position": "fixed",
      "touch-action": "none",
      "width": "100vw",
      "z-index": "2147483200"
    });

    var handle = document.createElement("button");
    handle.type = "button";
    handle.setAttribute("aria-label", "下滑关闭视频详情");
    applyBewlyVideoDrawerHostFallbackStyle(handle, {
      "appearance": "none",
      "-webkit-appearance": "none",
      "background": "transparent",
      "border": "0",
      "display": "grid",
      "height": "100%",
      "margin": "0",
      "padding": "0",
      "place-items": "center",
      "touch-action": "none",
      "width": "100%"
    });

    var handleBar = document.createElement("span");
    applyBewlyVideoDrawerHostFallbackStyle(handleBar, {
      "background": "rgba(255, 255, 255, 0.36)",
      "border-radius": "999px",
      "display": "block",
      "height": "clamp(4px, 0.8dvh, 5px)",
      "width": "clamp(40px, 12vw, 54px)"
    });
    handle.appendChild(handleBar);

    var iframe = document.createElement("iframe");
    iframe.title = "视频详情";
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.srcdoc = getBewlyVideoDrawerFrameLoadingHtmlFromPrelude();
    applyBewlyVideoDrawerHostFallbackStyle(iframe, {
      "background": "#101114",
      "border": "0",
      "display": "block",
      "height": "100%",
      "width": "100%"
    });

    root.appendChild(handle);
    root.appendChild(iframe);
    mountTarget.appendChild(root);
    bindBewlyVideoDrawerHostFallbackDragFromPrelude(root, handle);
    window.setTimeout(function () {
      iframe.removeAttribute("srcdoc");
      iframe.src = markBewlyVideoDrawerFrameUrlFromPrelude(drawerUrl);
    }, 120);
    return true;
  }

  function scheduleBewlyVideoDrawerHostFallbackFromPrelude() {
    var initialDrawerUrl = rememberBewlyVideoDrawerHostIntentFromPrelude();
    if (!shouldInstallBewlyVideoDrawerHostFallbackFromPrelude())
      return false;

    function tryInstall(retryIndex) {
      var drawerUrl = getRememberedBewlyVideoDrawerHostIntentFromPrelude() || initialDrawerUrl;
      if (!drawerUrl || !shouldInstallBewlyVideoDrawerHostFallbackFromPrelude())
        return false;

      if (document.body) {
        return installBewlyVideoDrawerHostFallbackFromPrelude(drawerUrl);
      }

      var retryDelay = bewlyVideoDrawerHostFallbackRetryDelays[retryIndex || 0];
      if (retryDelay === undefined)
        return false;

      window.setTimeout(function () {
        tryInstall((retryIndex || 0) + 1);
      }, retryDelay);

      return true;
    }

    if (tryInstall(0))
      return true;

    window.setTimeout(function () {
      tryInstall(0);
    }, bewlyVideoDrawerHostFallbackDelay);

    return true;
  }

  function shouldTakeOverBilibiliPassportLogin() {
    var passportPath = location.pathname.replace(/\\/+$/, "") || "/";
    var isLoginPath = passportPath === "/login" || passportPath.indexOf("/login/") === 0 || passportPath.indexOf("/passport/login") !== -1;

    if (location.protocol !== "https:" || location.hostname !== "passport.bilibili.com" || !isLoginPath)
      return false;

    var userAgent = navigator.userAgent || "";
    var isMobileUserAgent = /Mobile|iPhone|iPad|iPod|Android/i.test(userAgent);
    var isTouchDevice = Number(navigator.maxTouchPoints || 0) > 0;
    var isPortraitViewport = false;

    try {
      isPortraitViewport = window.matchMedia && window.matchMedia("(orientation: portrait)").matches;
    }
    catch (error) {
      isPortraitViewport = false;
    }

    return isMobileUserAgent || (isTouchDevice && isPortraitViewport);
  }

  function takeOverBilibiliPassportLogin() {
    if (!shouldTakeOverBilibiliPassportLogin())
      return false;

    var target = new URL("https://www.bilibili.com/");
    target.searchParams.set("bewlyLogin", "1");
    location.replace(target.toString());
    return true;
  }

  function showMobileDesktopFallback() {
    if (location.protocol !== "https:" || location.hostname !== "m.bilibili.com")
      return false;

    var fallbackId = "bewlyscript-mobile-desktop-fallback";
    var styleId = "bewlyscript-mobile-desktop-fallback-style";
    var desktopUrl = "";

    try {
      var target = new URL(location.href);
      target.protocol = "https:";
      target.hostname = "www.bilibili.com";
      desktopUrl = target.toString();
    }
    catch (error) {
      desktopUrl = "https://www.bilibili.com/";
    }

    document.documentElement.setAttribute("data-bewly-mobile-desktop-fallback", "true");
    document.title = "请访问 B 站桌面版 - BewlyScript";

    if (!document.getElementById(styleId)) {
      var style = document.createElement("style");
      style.id = styleId;
      style.textContent = [
        "html[data-bewly-mobile-desktop-fallback='true']{background:#101114;color:#f4f7fb;color-scheme:dark;}",
        "html[data-bewly-mobile-desktop-fallback='true'] body{margin:0;min-height:100vh;background:#101114;color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
        "html[data-bewly-mobile-desktop-fallback='true'] body>:not(#" + fallbackId + "){display:none!important;}",
        "#" + fallbackId + "{box-sizing:border-box;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:28px 20px;}",
        "#" + fallbackId + " *{box-sizing:border-box;}",
        "#" + fallbackId + " .bewly-mobile-fallback-panel{width:min(100%,420px);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:24px;background:#171a20;box-shadow:0 18px 50px rgba(0,0,0,.28);}",
        "#" + fallbackId + " h1{margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:750;letter-spacing:0;}",
        "#" + fallbackId + " p{margin:0 0 14px;font-size:15px;line-height:1.65;color:#c6ccd8;}",
        "#" + fallbackId + " .bewly-mobile-fallback-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;}",
        "#" + fallbackId + " a{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:650;}",
        "#" + fallbackId + " .bewly-mobile-fallback-primary{background:#00a1d6;color:white;}",
        "#" + fallbackId + " .bewly-mobile-fallback-secondary{background:rgba(255,255,255,.08);color:#edf4ff;}",
        "#" + fallbackId + " .bewly-mobile-fallback-note{margin-top:18px;font-size:13px;color:#8e96a6;}"
      ].join("");
      (document.documentElement || document.head || document.body).appendChild(style);
    }

    function mountFallback() {
      if (!document.body || document.getElementById(fallbackId))
        return;

      var root = document.createElement("main");
      root.id = fallbackId;

      var panel = document.createElement("section");
      panel.className = "bewly-mobile-fallback-panel";

      var title = document.createElement("h1");
      title.textContent = "请访问 B 站桌面版";

      var body = document.createElement("p");
      body.textContent = "BewlyScript 现在只美化 B 站桌面原站，包括横版和竖版布局。当前页面是 m.bilibili.com 移动版，因此不会加载完整美化体验。";

      var guide = document.createElement("p");
      guide.textContent = "请先在浏览器菜单开启“请求桌面网站”，再打开桌面版页面。";

      var actions = document.createElement("div");
      actions.className = "bewly-mobile-fallback-actions";

      var primary = document.createElement("a");
      primary.className = "bewly-mobile-fallback-primary";
      primary.href = desktopUrl;
      primary.textContent = "打开桌面版";

      var secondary = document.createElement("a");
      secondary.className = "bewly-mobile-fallback-secondary";
      secondary.href = "https://www.bilibili.com/";
      secondary.textContent = "前往首页";

      var note = document.createElement("p");
      note.className = "bewly-mobile-fallback-note";
      note.textContent = "如果点击后仍回到移动版，说明 B 站仍按移动 UA 跳转；开启“请求桌面网站”后再试。";

      actions.appendChild(primary);
      actions.appendChild(secondary);
      panel.appendChild(title);
      panel.appendChild(body);
      panel.appendChild(guide);
      panel.appendChild(actions);
      panel.appendChild(note);
      root.appendChild(panel);
      document.body.prepend(root);
    }

    if (document.body)
      mountFallback();
    else
      document.addEventListener("DOMContentLoaded", mountFallback, { once: true });

    return true;
  }

  if (takeOverBilibiliPassportLogin())
    return;

  if (openBewlyVideoAsDrawerFromPrelude())
    return;

  scheduleBewlyVideoDrawerPreludeRetry();

  if (enableBewlyVideoDrawerHostFallback && scheduleBewlyVideoDrawerHostFallbackFromPrelude())
    return;

  if (showMobileDesktopFallback())
    return;
`
