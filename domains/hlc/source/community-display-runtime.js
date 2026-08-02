export const DISPLAY_RUNTIME_MODE = "display-only";

const PAGE_BY_ENTRANCE = Object.freeze({
  article_entrance: "article-page",
  intro_entrance: "intro-page",
  trend_entrance: "list-page",
  example_entrance: "example-page",
  chat_entrance: "chat-page",
  more_entrance: "feature-page",
  original_entrance: "original-page",
  study_entrance: "study-page",
  public_entrance: "public-page",
  participation_entrance: "participation-page",
  support_entrance: "support-page",
  confidence_entrance: "confidence-page",
  live_entrance: "live-page",
  meeting_entrance: "meeting-page",
  toolhouse_entrance: "toolhouse-page",
  autogulation_entrance: "autogulation-page",
  jimi_entrance: "jimi-page",
});

const DISABLED_CONTROL_IDS = new Set([
  "community_account_trigger",
  "scene_account_back",
  "chat_send",
  "toolhouse_submit",
  "signup_submit",
  "zyh_link",
]);

const COPY_BY_ENTRANCE = Object.freeze({
  intro_entrance: Object.freeze({
    target: "intro_content",
    title: "圣灯社区简介",
    body:
      "这里呈现圣灯社区地图、场所与内容结构的只读展示，不连接居民资料、社区数据库或账户系统。",
  }),
  example_entrance: Object.freeze({
    target: "example_reader",
    title: "社区治理实践",
    body:
      "通过场所、议题和行动之间的关系，展示基层治理内容如何被组织成居民容易理解的社区叙事。",
  }),
  study_entrance: Object.freeze({
    target: "study_reader",
    title: "社区学习空间",
    body:
      "学习资料、居民课堂和经验分享以文字和抽象艺术方式呈现，不载入现实人物照片或真实报名数据。",
  }),
  participation_entrance: Object.freeze({
    target: "participation_reader",
    title: "居民共同参与",
    body:
      "展示居民议事、公共空间维护和社区行动的内容结构；提交、留言和个人服务记录在展示模式中停用。",
  }),
  support_entrance: Object.freeze({
    target: "support_reader",
    title: "红茶小院",
    body:
      "用抽象化的院落与茶叙场景承载邻里关怀、陪伴和社区故事，当前页面只用于体验内容表达。",
  }),
  confidence_entrance: Object.freeze({
    target: "confidence_reader",
    title: "技能工坊",
    body:
      "展示社区技能课程与互助服务的页面形态，报名、联系方式和账户认证不会在 OpenFX 展示版中保存。",
  }),
  live_entrance: Object.freeze({
    target: "live_qrcode",
    title: "社区对话窗口",
    body:
      "用抽象化内容展示社区公开交流的页面形态；真实直播二维码、外部账号与个人信息不会进入 OpenFX 展示版。",
  }),
});

export function getHlcDisplayPageSelector(entranceId) {
  return PAGE_BY_ENTRANCE[entranceId] ?? null;
}

export function isHlcDisplayDisabledControl(controlId) {
  return DISABLED_CONTROL_IDS.has(controlId);
}

export function getHlcDisplayCopy(entranceId) {
  return COPY_BY_ENTRANCE[entranceId] ?? null;
}

function createDisplayCopy(document, copy) {
  const article = document.createElement("article");
  const eyebrow = document.createElement("span");
  const title = document.createElement("h3");
  const body = document.createElement("p");

  article.className = "hlc-display-copy";
  eyebrow.textContent = "OPENFX · READ-ONLY SHOWCASE";
  title.textContent = copy.title;
  body.textContent = copy.body;
  article.append(eyebrow, title, body);
  return article;
}

function prepareStaticContent(document) {
  for (const copy of Object.values(COPY_BY_ENTRANCE)) {
    const target = document.getElementById(copy.target);
    if (!target || target.querySelector(".hlc-display-copy")) continue;
    target.append(createDisplayCopy(document, copy));
  }
}

function disableDataControls(document) {
  for (const id of DISABLED_CONTROL_IDS) {
    const control = document.getElementById(id);
    if (!control) continue;
    control.setAttribute("aria-disabled", "true");
    control.setAttribute("tabindex", "-1");
    control.toggleAttribute("disabled", true);
  }

  for (
    const selector of [
      ".scene-account-access",
      "#scene_account_panel",
      "#scene_boundary_editor",
      "#chat_box",
      "#toolhouse_request > form",
      "#signup_request > form",
    ]
  ) {
    const element = document.querySelector(selector);
    if (!element) continue;
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    element.toggleAttribute("inert", true);
  }
}

function ensureDisplayBadge(document) {
  if (document.querySelector(".hlc-display-badge")) return;
  const badge = document.createElement("p");
  badge.className = "hlc-display-badge";
  badge.textContent = "只读展示 · 登录、注册与数据提交已停用";
  document.querySelector("#community_map")?.append(badge);
}

export function installHlcDisplayRuntime(document = globalThis.document) {
  if (!document?.documentElement) return () => {};
  document.documentElement.dataset.hlcRuntime = DISPLAY_RUNTIME_MODE;
  prepareStaticContent(document);
  disableDataControls(document);
  ensureDisplayBadge(document);

  const handleClick = (event) => {
    const target = event.target?.closest?.("[id]");
    if (!target) return;
    if (isHlcDisplayDisabledControl(target.id)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const selector = getHlcDisplayPageSelector(target.id);
    if (!selector) return;
    document.querySelector(selector)?.classList.remove("hide");
  };
  const blockSubmit = (event) => event.preventDefault();
  document.addEventListener("click", handleClick, true);
  document.addEventListener("submit", blockSubmit, true);

  return () => {
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("submit", blockSubmit, true);
  };
}
