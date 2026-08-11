import { type ReactNode, useEffect, useRef, useState } from "react";

import { type LibraryAppPanelId } from "../library-app-panels.ts";
import { MapPosterPanelContent } from "./MapPosterPanel.tsx";
import { FileLibraryHomepage } from "./file-library/FileLibraryHomepage.tsx";

function EmbeddedLibraryApp(props: {
  appId: LibraryAppPanelId;
  src: string;
  title: string;
  sandbox?: string;
}) {
  return (
    <div
      className="domain-panel embedded-library-app"
      data-panel-id={props.appId}
    >
      <iframe
        src={props.src}
        title={props.title}
        sandbox={props.sandbox}
      />
    </div>
  );
}

function ChinagasPanel() {
  return (
    <PanelShell
      panelId="chinagas-wms-qrcode"
      eyebrow="用户脚本"
      title="中燃WMS二维码生成器"
      lede="Tampermonkey 脚本，在 WMS 物料详情页自动提取信息并生成可拖拽悬浮二维码，供仓储人员手机扫描。"
    >
      <article className="domain-panel-section">
        <h2>安装入口</h2>
        <div className="chinagas-install-actions">
          <a
            className="chinagas-install-link"
            href="https://greasyfork.org/zh-CN/scripts/550879"
            target="_blank"
            rel="noopener noreferrer"
          >
            前往 Greasy Fork 安装
          </a>
          <p className="chinagas-install-note">
            脚本已停止更新，功能完整，永久可用。
          </p>
        </div>
      </article>
    </PanelShell>
  );
}

function BewlyScriptPanel() {
  return (
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
            </a>。
          </li>
          <li>OpenFX 版改为 Safari Userscripts / Tampermonkey 可安装的单文件脚本。</li>
          <li>关键改造包括 GM/browser shim、同进程 API dispatcher 与移动站提示。</li>
        </ul>
      </article>
      <article className="domain-panel-section">
        <h2>运行边界</h2>
        <ul>
          <li>
            完整美化体验以 <code>www.bilibili.com</code> 桌面原站为功能基准。
          </li>
          <li>
            <code>m.bilibili.com</code> 只提示用户开启“请求桌面网站”。
          </li>
          <li>通过浏览器 shim 兼容 Userscripts 与 Tampermonkey API。</li>
        </ul>
      </article>
    </PanelShell>
  );
}

function LibraryAppPanel(props: { appId: LibraryAppPanelId }) {
  switch (props.appId) {
    case "e-agent-framework":
      return <EAgentFrameworkPanel />;
    case "how-much-this":
      return <HowMuchPanel />;
    case "hlc":
      return <HlcPanel />;
    case "wanone-memorial":
      return (
        <EmbeddedLibraryApp
          appId={props.appId}
          src="/wanone/index.html"
          title="Wanone"
        />
      );
    case "costing-assistant":
      return (
        <EmbeddedLibraryApp
          appId={props.appId}
          src="/costing-assistant/index.html"
          title="工程计价助手"
        />
      );
    case "gasmap":
      return (
        <EmbeddedLibraryApp
          appId={props.appId}
          src="/gasmap/index.html"
          title="GasMap"
        />
      );
    case "finlyzer":
      return (
        <EmbeddedLibraryApp
          appId={props.appId}
          src="/finlyzer/index.html"
          title="Finlyzer"
        />
      );
    case "map-poster":
      return <MapPosterPanel />;
    case "smartisax":
      return <SmartisaxPanel />;
    case "live-system":
      return <LiveSystemPanel />;
    case "wandering-plan":
      return <WanderingPlanPanel />;
    case "chinagas-wms-qrcode":
      return <ChinagasPanel />;
    case "bewlyscript":
      return <BewlyScriptPanel />;
  }
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
  panelId: LibraryAppPanelId;
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

function HlcPanel() {
  return (
    <div
      className="domain-panel"
      data-panel-id="hlc"
      style={{ flex: 1, display: "flex", overflow: "hidden" }}
    >
      <iframe
        src="/hlc/"
        title="HLC · 圣灯社区只读展示"
        sandbox="allow-scripts allow-same-origin"
        style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
      />
    </div>
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

function EAgentFrameworkPanel() {
  return (
    <PanelShell
      panelId="e-agent-framework"
      eyebrow="agent framework domain"
      title="e · Agent 执行框架"
      lede="运行时无关的 TypeScript Agent 内核，把模型决策、工具调用、审批、会话、记忆、协作与前台进度组织成可测试、可回放的工作流。"
    >
      <article className="domain-panel-section">
        <h2>核心能力</h2>
        <ul>
          <li>结构化 AgentDecision、消息队列、会话与 replay 事实链。</li>
          <li>工具权限、工作区边界、高风险动作审批与单次消费保护。</li>
          <li>任务图、Artifact、子任务协作、MCP 与 Git adapter 契约。</li>
        </ul>
      </article>
      <article className="domain-panel-section">
        <h2>分层</h2>
        <ul>
          <li>
            <code>src/core</code>：纯内核、策略、状态机与事实模型。
          </li>
          <li>
            <code>src/app</code>：reference runtime 与可注入平台适配器。
          </li>
          <li>
            <code>src/foreground</code>：进度流、打断、暂停和审批控制协议。
          </li>
        </ul>
      </article>
      <article className="domain-panel-section">
        <h2>运行边界</h2>
        <p>
          <code>e</code>{" "}
          不绑定 Deno、Node、Bun、浏览器或桌面外壳；文件系统、模型、KV、 MCP 与 Git
          等副作用全部通过接口注入。
        </p>
        <RepositoryPanelLink href="https://github.com/intpfx/OpenFX/tree/main/domains/e">
          查看 domains/e 源码
        </RepositoryPanelLink>
      </article>
      <article className="domain-panel-section">
        <h2>验证入口</h2>
        <pre className="code-block">
          {"deno task --config domains/e/deno.json test"}
        </pre>
        <p>
          当前 Web 卡片用于介绍框架边界；它不会把服务端 Agent 权限直接暴露给浏览器。
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
  return (
    <FileLibraryHomepage
      renderApp={(appId) => <LibraryAppPanel appId={appId} />}
    />
  );
}
