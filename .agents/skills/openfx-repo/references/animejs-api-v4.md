# anime.js v4 API 调研 — Logo 切换动画方案评估

## 来源

- 包: `npm:animejs@4.4.1`（1.87MB）
- 文档: https://animejs.com/documentation/getting-started
- API 来源: 从 Deno 缓存中的 `.d.ts` 类型定义文件读取
- 调研日期: 2026-05-16

## 导入方式

```ts
// Deno/Vite 项目中
import { animate, createTimer, createTimeline, stagger, spring, easings, utils } from "npm:animejs@4.4.1";
```

或通过 CDN（非模块环境）：
```html
<script src="https://cdn.jsdelivr.net/npm/animejs@4.4.1/dist/modules/index.js"></script>
```

## 核心 API

### `animate(targets, params)` → `JSAnimation`

主函数。`targets` 可以是 CSS 选择器、DOM 元素、NodeList、或 JS 对象。
`params` 类型 `AnimationParams`（继承 `DefaultsParams`）：

| 参数 | 类型 | 说明 |
|------|------|------|
| `duration` | `number \| FunctionValue` | 动画时长 ms |
| `delay` | `number \| FunctionValue` | 延迟 ms |
| `ease` | `EasingParam` | 缓动（字符串名 / 函数 / Spring） |
| `loop` | `number \| boolean` | 循环次数 |
| `alternate` | `boolean` | 往返播放 |
| `autoplay` | `boolean` | 自动播放 |
| `playbackRate` | `number` | 播放速率 |
| `composition` | `"none" \| "replace" \| "blend"` | 合成模式 |
| `onBegin` / `onUpdate` / `onComplete` / `onLoop` / `onPause` / `onRender` | `Callback` | 生命周期回调 |

属性动画：`{ opacity: [0, 1], translateY: [6, 0], scale: [0.6, 1] }` 等。

### `stagger(delay, options?)` → `StaggerFunction`

```ts
// 固定延迟
anime.stagger(100)           // 每个目标延迟 100ms
// 从最后一个开始
anime.stagger(100, { from: 'last' })
// 从中心向两侧
anime.stagger(100, { from: 'center' })
// 网格 stagger
anime.stagger(100, { grid: [3, 4], from: 'center' })
```

### Spring 物理缓动

```ts
// 作为 easing 参数直接使用
animate(targets, {
  translateY: [20, 0],
  ease: 'spring(1, 80, 10)',  // mass=1, stiffness=80, damping=10
})

// 完整参数
spring({ mass: 1, stiffness: 100, damping: 10, velocity: 0, bounce: 0, duration: 0 })
```

### 内置缓动字符串

`'linear'`, `'in'`, `'out'`, `'inOut'`, `'inQuad'`-`'inOutQuad'`, `'inCubic'`-`'inOutCubic'`, `'inQuart'`-`'inOutQuart'`, `'inSine'`-`'inOutSine'`, `'inExpo'`-`'inOutExpo'`, `'inCirc'`-`'inOutCirc'`, `'inBack'`-`'inOutBack'`, `'inBounce'`-`'inOutBounce'`, `'inElastic'`-`'inOutElastic'`

可带参数：`'outBack(overshoot=1.7)'`, `'outElastic(amplitude=1, period=.3)'`

### JSAnimation 方法

`play()`, `pause()`, `restart()`, `reverse()`, `seek(time)`, `complete()`, `cancel()`, `revert()`, `reset()`, `stretch(newDuration)`, `then(callback)` → `Promise`

## 适用场景评估：FENGXIAO↔OpenFX Logo 切换

### 当前手写方案问题

- ~200 行手动 `timeline: {at, fn}[]` 构建，每字符手工编排
- 方向改变需重排数组索引
- 无弹簧缓动（只有 CSS cubic-bezier）
- `setTimeout(tick, 16)` 手动调度

### anime.js 替换方案

```ts
import { animate, stagger } from "npm:animejs@4.4.1";

// Phase 1: 退格删除非锚点字符（从右到左 stagger）
animate(el.querySelectorAll('.non-anchor'), {
  opacity: [1, 0],
  scale: [1, 0.6],
  delay: stagger(120, { from: 'last' }),
  duration: 150,
  ease: 'inQuad',
  onComplete: () => {
    // Phase 2: 键入新字符
    const newSpans = insertNewCharSpans(targetWord);
    animate(newSpans, {
      opacity: [0, 1],
      translateY: [6, 0],
      scale: [1.5, 1],
      delay: stagger(100),
      duration: 200,
      ease: 'spring(1, 80, 10)',  // 弹性弹入
    });
  }
});
```

### 优势

| 维度 | 手写 | anime.js |
|------|------|----------|
| 逐字编排 | 手动 `delOrder.forEach` + timeline push | `stagger(120, { from: 'last' })` |
| 弹性缓动 | CSS cubic-bezier（无弹簧） | `spring(mass, stiffness, damping)` |
| 噪声效果 | `setTimeout` + `Math.random()` 手动 | `onUpdate` 回调中操作 DOM |
| 代码量 | ~200 行 | ~50 行 |
| 方向切换 | 重排数组索引 | 只需改 stagger `from` 参数 |

### 注意

- anime.js v4 的 `onUpdate` 不提供 progress 参数（需要通过 `self.currentTime / self.duration` 手动计算）
- 当前 BrandToggle 的噪声字符替换、ghost 层、锚点高亮等效果仍需保留——anime.js 只替换 timeline 调度部分，视觉效果通过 `onUpdate` 回调驱动
- `npm:animejs` 需要通过 Vite 的 npm 兼容层加载，会增加 bundle 体积 ~50KB（tree-shaken 后）

### 已实施的 BrandToggle 替换方案

BrandToggle.tsx 已完全重写为 anime.js 方案（2026-05-17）。

核心代码模式：

```ts
import { animate, stagger } from "animejs";

// Phase 1: 退格删除（右→左 stagger）
const delDuration = n * 130 + 100 + 100;  // n=元素数, 130=stagger, 100=duration, 100=buffer
animate(delTargets, {
  opacity: [1, 0],
  scale: [1, 0.6],
  delay: stagger(130, { from: "last" }),
  duration: 100,
  ease: "inQuad",
});

setTimeout(() => {
  delTargets.forEach(s => s.remove());
  
  // Phase 2: 创建新字符 span + 弹入动画
  const typeDuration = m * 120 + 250 + 200 + 200;
  animate(newSpans, {
    opacity: [0, 1],
    translateY: [6, 0],
    delay: stagger(120),
    duration: 250,
    ease: "outBack(1.7)",
  });
  
  setTimeout(() => finishAnim(targetWord), typeDuration);
}, delDuration);
```

### ⚠️ 已验证的 Pitfall: `onComplete` + `stagger()` 不触发

**现象**：`animate(targets, { delay: stagger(), onComplete: () => {...} })` 中的 `onComplete` 永远不执行。`.then()` 同理。

**根因**：`delay: stagger()` 在 anime.js v4 内部为每个 target 创建子 JSAnimation（设置 `_hasChildren=true`）。父 animation 的 `onComplete` 触发条件是所有子 animation 均已完成（源码 `render.js` L345-353），但在 stagger 场景下，子 animation 可能因时序问题永不达到 completed 状态。

**已验证的 workaround**：使用 `setTimeout` 按公式计算总时长，在其中执行 phase 切换和清理。公式：

```
总时长 = 元素数 × staggerDelay + duration + springSettle(200) + buffer(200)
```

示例（5 个元素，stagger 120ms，duration 250ms）：`5 × 120 + 250 + 200 + 200 = 1250ms`

此方案已在 BrandToggle 双向切换中验证通过（FENGXIAO→OpenFX 和 OpenFX→FENGXIAO 均正确完成）。

### ⚠️ 已验证的 Pitfall: `createTimer()` + `onUpdate` 不触发

**现象**：`createTimer({ onUpdate: (t) => {...}, autoplay: true })` 的 `onUpdate` 回调从不执行。

**根因**：`createTimer()` 创建 Timer 后调用 `init()`，但 `init()` 中的 `autoplay` 逻辑调用 `resume()` 时可能未将 Timer 正确注册到 anime.js 全局动画循环（engine loop）中。对比 `animate()` 创建的 JSAnimation，后者通过 `init()` → `reset()` → `tick()` 路径注册。

**结论**：不要用 `createTimer()` 做自定义 timeline 时钟。用 `setTimeout(tick, 16)` 替代。

### ⚠️ 已验证的 Pitfall: `animate()` on 隐藏元素 `onUpdate` 不触发

**现象**：对 `display:none` 或不可见元素调用 `animate(el, { onUpdate: fn, autoplay: true })`，`onUpdate` 不执行。

**根因**：anime.js 的 render pipeline 可能跳过不可见元素（无布局/绘制），导致 `onUpdate` 不被调用。

**结论**：不要用隐藏 dummy 元素 + `animate()` 做自定义时钟。

### 建议

推荐在需要弹性动效和逐字编排的动画中用 anime.js 替换手写 timeline。噪声效果、ghost 层、锚点检测逻辑保持不变，只是用 `animate()` + `stagger()` 替换手动 `setTimeout` 链。

## 与 GSAP 的取舍

| | anime.js v4 | GSAP |
|------|------------|------|
| 大小 | 50KB (tree-shaken) | ~30KB (core) |
| 许可证 | MIT | 需商业许可（特定场景） |
| Spring 缓动 | 内置 | 需插件 |
| Stagger | 内置 | 内置（功能更丰富） |
| Timeline | 链式 | 专用 TimelineLite/Max |
| 学习曲线 | 低 | 中 |
| React 集成 | 直接使用 | gsap.context() |
