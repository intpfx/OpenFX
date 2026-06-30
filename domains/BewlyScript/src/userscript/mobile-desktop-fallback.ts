export const MOBILE_DESKTOP_FALLBACK_SCRIPT = `
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

  if (showMobileDesktopFallback())
    return;
`
