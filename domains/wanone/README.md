# Wanone / 万一

> **你编程生涯的第一个项目**
> 纯静态 HTML+CSS 企业官网骨架 · 2020.10.26 · 杭州

## 起源

Wanone（中文名「万一」）是你刚接触编程时搭建的第一个项目。
它诞生于 2020 年 10 月 26 日的杭州 —— 那时你还不会写 JavaScript，
刚学会 HTML 和 CSS，就想做一个看起来很酷的企业官网。

## 项目特色

全屏视频背景 · 自定义字体加载 · CSS 渐变色流动动画
Logo 呼吸淡入淡出 · 暗色主题 · 4 页面导航骨架

页面之间通过 iframe 和相对路径串联，形成一种「伪 SPA」的浏览体验。

### 内部子项目：Hina

`web3/hina.html` 是项目里唯一带交互功能的页面 —— 一个只有搜索框的极简搜索引擎雏形，
可能是你对「产品」这个概念最早的表达。

## 并入 OpenFX

作为你编程起点的纪念，Wanone 以纯静态 domain 的形式并入 OpenFX 仓库，
不做任何现代化改造（不重构、不转 JS、不改路径），保持最初的模样。
通过 Nitro 的 publicAssets 在 `/wanone/` 路径下原样服务。

```text
domains/wanone/public/wanone/
├── index.html          # 主入口 — 全屏视频 + iframe 内容区 + 右侧导航
├── web.config          # 当年 IIS 部署留下的配置（留作纪念）
├── debug.log           # Chromium 路径错误日志（留作纪念）
├── css/
│   ├── index.css       # 主样式 — 142 行纯 CSS，含自定义动画
│   └── hina.css        # Hina 搜索页面样式
├── font/
│   ├── logo.otf        # Logo 专用字体
│   ├── index.TTF       # 正文字体（1.3MB）
│   └── font.woff2      # Web 字体
├── pi/
│   └── icon.png        # 网站图标
├── vi/
│   └── bak.mp4         # 全屏背景视频（18MB）
├── web/                # 主内容页面（iframe 加载）
│   ├── welcome.html    # 首页
│   ├── about.html      # 公司介绍（占位）
│   ├── business.html   # 业务介绍（占位）
│   ├── news.html       # 新闻动态（仅日期+地点）
│   └── join.html       # 加入我们
├── web2/
│   └── product.html    # 产品页 — 唯一有链接的产品：Hina
└── web3/
    └── hina.html       # Hina 搜索页 — 项目的功能雏形
```

## 访问

启动 Web 应用后访问：

```
http://localhost:3000/wanone/index.html
```

> 不修改 index.html 里的相对路径（`vi/bak.mp4`、`web/welcome.html` 等），
> 因为所有文件都保持在 `/wanone/` 路径下，相对引用原样可用。

## 纪念意义

这个项目没有 JavaScript、没有框架、没有构建工具 —— 只有最朴素的 HTML 和 CSS。
当时的你只是觉得「有一个全屏视频背景的暗色网站很酷」，就动手做了出来。
里面那些空白的占位页面、那个只有一个搜索框的 Hina、
还有那份 IIS 配置文件 —— 都是你编程这条路最开始的样子。
