# OpenFX Node 文件墙设计 QA

## 对照目标

- Source visual truth：`/tmp/openfx-reference-analysis/frame-06.png`
- Media-view visual truth：`/tmp/apple-photos-enlarged-view.png`、
  `/tmp/apple-photos-video-view.png`（Apple Photos 单项查看与原生视频控件）。
- 用户本轮修正：右上角按钮没有背景；文件封面横纵无间隙。
- Implementation：`/tmp/openfx-node-flat-toolbar-gapless-final.png`
- Media-view implementation：`/tmp/openfx-node-photos-image-view-final.png`、
  `/tmp/openfx-node-photos-video-view-final.png`
- Media-view side-by-side comparison：`/tmp/openfx-photos-viewer-comparison.png`
- Before/after full-view comparison：
  `/tmp/openfx-flat-toolbar-gapless-before-after.png`（左：按钮有圆形底且封面有间隙；右：
  纯图标按钮与无缝封面）
- Dense-state comparison：`/tmp/openfx-design-qa-comparison-final.png`
- Viewport / CSS size：820×640
- Source pixels：644×520；密集状态对照前按 820×640 视口归一化。
- Implementation pixels：820×640，device scale factor 1。
- State：三个已导入文件，文件管理窗口前台，详情层关闭。
- Media state：分别单击第一张图像和第三个视频；媒体查看层占满 820×640 内容区。

参考视频只展示文件较多时的密集封面墙；少量文件状态以用户本次明确修正为视觉真值。
因此稀疏状态不与密集参考帧做伪精确的逐像素比较。

## Findings

- P1：图像和视频此前都进入小尺寸详情卡片，不能在应用内直接观看。
  - Location：`entry/desktop/src/ui/file-browser.ts`、
    `entry/desktop/perry/perry-v0.5.1220-openfx.patch`
  - Evidence：Photos 参考在同一窗口以媒体为主；旧实现只显示 380×420 详情卡片，视频
    还必须跳转外部应用。
  - Fix：按文件类型路由单击行为；图像进入全窗口比例适配查看层，视频使用 Perry 新增的
    `AVPlayerView` 本地文件控件。顶栏保留返回、默认应用打开和 Finder 定位；非媒体
    文件继续使用详情卡片。
  - Status：closed。

- P1：少量文件曾被强制铺满窗口。
  - Location：`entry/desktop/src/ui/file-wall-layout.ts`
  - Evidence：before/after 对照左侧的单文件占满 820×640；右侧三个文件均保持
    200×150，剩余区域为空。
  - Fix：1–6 个文件进入稀疏模式，每行最多三个矩形，横纵间距 12；7 个文件开始恢复
    自适应密集布局。
  - Status：closed。

- P1：稀疏行最后一个文件曾吸收 HStack 剩余宽度。
  - Location：`entry/desktop/src/ui/file-browser.ts`
  - Evidence：第一次原生复核中第三张卡片被拉宽；最终截图中三张卡片宽高一致。
  - Fix：稀疏行末尾加入原生 `Spacer` 吸收余量，文件卡片保持显式宽度。
  - Status：closed。

- P1：稀疏区域使用了不透明黑色背景。
  - Location：`entry/desktop/src/ui/file-browser.ts`
  - Evidence：before/after 对照左侧的剩余区域为纯黑；右侧由 macOS
    `underWindowBackground` 材质生成灰色半透明磨砂。
  - Fix：稀疏状态将根容器、滚动文档和每一行的覆盖层 alpha 设为 0，透出已经位于窗口
    底层的 `NSVisualEffectView`；密集状态继续保留不透明基底。
  - Status：closed。

- P1：右上角三个操作曾绘制深色圆形背景、圆角和阴影。
  - Location：`entry/desktop/src/ui/file-browser.ts`、
    `entry/desktop/perry/perry-v0.5.1220-openfx.patch`
  - Evidence：本轮 before/after 左侧三个图标位于黑色圆形底中；右侧只保留 SF Symbol。
  - Fix：浮动操作直接复用无边框 `iconButton`，删除自绘背景、圆角和阴影；Perry 的无边框
    `NSButton` 同时设置 `NSFocusRingTypeNone`，聚焦时不再出现蓝色底。
  - Status：closed。

- P1：稀疏文件封面之间曾保留 12 px 横纵间距。
  - Location：`entry/desktop/src/ui/file-wall-layout.ts`、
    `entry/desktop/src/ui/file-browser.ts`
  - Evidence：本轮 before/after 左侧三张封面之间可见磨砂缝隙；右侧封面边缘连续相接。
  - Fix：稀疏布局的行间距和列间距都设为 0，并以独立 `fillsWidth` 状态决定是否加入尾部
    `Spacer`，避免用 gap 推断布局模式后把最后一张卡片拉伸。
  - Status：closed。

- P2：旧 smoke 用 PNG 文件大小判断截图有效，空白较多时产生误报。
  - Location：`entry/desktop/tools/desktop-app-smoke.ts`
  - Evidence：稀疏状态的应用自管截图因压缩率高而低于 1 KB。
  - Fix：改为校验 PNG signature、IHDR 与合理的像素尺寸，不再以压缩后字节数判断。
  - Status：closed。

## Required Fidelity Surfaces

- 字体与排版：文件墙没有新增常驻文本；媒体查看层只在沉入标题区的工具栏显示当前文件名，
  悬停、详情和菜单栏字体保持原生系统字体。
- 间距与布局节奏：稀疏卡片为 200×150、最多三列，横纵间距为 0；行末 `Spacer` 只吸收
  剩余宽度，不改变卡片尺寸。右上角按钮仍浮在空白区，不与卡片争抢宽度。
- 色彩与视觉变量：稀疏区域使用系统 `underWindowBackground` 磨砂材质和半透明深色工具
  区域；工具按钮只有浅色 SF Symbol，没有按钮背景、圆角、阴影、聚焦底色、不透明黑底、
  额外标题栏、面板或装饰。
- 图像质量：图片和 Quick Look 缩略图继续使用 2× aspect-fill 居中裁切；稀疏布局没有
  拉伸卡片或原图。沉浸图像改用 AppKit 比例适配，完整显示且不变形；视频保持
  AVPlayer 的原始宽高比。
- 文案与内容：窗口内仍不显示节点状态、应用标题或文件数量；节点信息继续只在菜单栏。
- 无障碍：原生 AX 树仍能读取“导入文件”“刷新文件库”“打开文件库”，媒体态还能读取
  “返回文件墙”“用默认应用打开”和“在 Finder 中选择”。

## Interaction And Responsive Checks

- 1–6 个文件：固定小矩形，剩余区域透出原生磨砂材质。
- 7–24 个文件：自适应铺满窗口；24 个文件保持四行六列。
- 25 个及以上：保持四行首屏密度并纵向滚动。
- 导入、刷新和打开文件库的交互边界未改变。图像/视频单击进入应用内沉浸查看；非媒体
  单击仍显示详情，双击仍可用默认应用打开。
- 媒体态返回按钮恢复同一文件墙；关闭视频态前会主动暂停播放器。
- 连续两次进入、退出视频态后，AX 树只保留一个 `AVPlayerView` 控件组；旧播放器没有残留。
- 原生 Computer Use 截图已检查；没有发现卡片拉伸、顶部标题栏回归或工具按钮遮挡。
- 并排图右侧左上角紫色胶囊来自 ScreenCaptureKit 捕获指示，不属于应用控件；媒体态 AX
  树只列出返回、默认应用打开、Finder 定位和原生播放器操作。
- 聚焦区域不需要额外截图：本次差异集中在完整窗口的卡片尺寸、行宽与空白分配， 820×640
  全视图中均清晰可见。

## Comparison History

1. 旧实现：1–24 个文件全部填满视口。用户指出少量文件应该保持小矩形。
2. 第一轮：加入 1–6 文件稀疏模式；原生截图发现 HStack 把最后一张卡片拉宽。
3. 第二轮：行末加入 `Spacer`；原生截图显示三张 200×150 卡片等宽排列，剩余区域为空。
4. 第三轮：用户指出空白不应为黑色；三个不透明覆盖层改为稀疏状态透明，最终原生截图显示
   系统磨砂材质。
5. 第四轮：用户指出按钮不应有背景且内容间不应有 gap；删除三个按钮的自绘容器和无边框
   按钮的 focus ring，将稀疏布局横纵间距改为 0，并继续用尾部 `Spacer` 保留磨砂留白。
   本轮并排对照没有遗留 P0、P1 或 P2。
6. 第五轮：图像/视频的单击行为从通用详情卡片拆分为 Photos 式媒体查看层；原生图像比例
   适配和 `AVPlayerView` 控件通过并排视觉复核，没有把非媒体文件误改为播放器。

## Verification

- Layout regression：RED 后 GREEN。
- Native renderer contract：RED 后 GREEN。
- Native 820×640 screenshots：`/tmp/openfx-node-photos-image-view-final.png`、
  `/tmp/openfx-node-photos-video-view-final.png`。
- Photos side-by-side：`/tmp/openfx-photos-viewer-comparison.png`。
- Deno desktop tests：194 passed，0 failed。
- Deno lint：79 files checked。
- Deno desktop entry type check：passed。
- Pinned Perry runtime / compiler release build：passed。
- Pinned patch clean apply and SHA-256 provenance：passed。
- macOS app smoke：签名应用、IPv6 health 与 PNG 合约通过。

final result: passed
