# Animation Cleanup Race: `setInterval` Ghost Noise vs `finishAnim`

## 现象

动画结束后，ghost 层仍残留噪声字符（如 `@6$%[&`），`textContent` 中包含多余字符。

## 根因

```ts
// 问题代码
const ghostNoiseTimer = setInterval(() => {
  ghostR.textContent = randomNoise();  // 每 80ms 写噪声
}, 80);

// timeline 收尾函数中
clearInterval(ghostNoiseTimer);       // 阻止新回调排队
finishAnim(target);                    // 清空 ghost.textContent = ""
// ↑ 但已排队的 interval 回调仍会执行！
// → ghost.textContent 又被写回噪声字符
```

`clearInterval()` 只是阻止**新**回调加入事件队列，但不影响**已经排入队列**的回调。如果 `clearInterval` 之前刚有回调被排入（JavaScript 是单线程，但 `setInterval` 的回调在下一个事件循环 tick 执行），该回调会在 `finishAnim` 清空 textContent 之后执行，把噪声字符写回去。

## 修复模式

用一个 ref flag（`cleaning`）在 interval 回调和 cleanup 之间同步：

```ts
// 1. 声明 ref flag
const cleaning = useRef(false);

// 2. toggle 开始时重置
function toggle() {
  cleaning.current = false;
  // ...
}

// 3. interval 回调先检查 flag
const ghostNoiseTimer = setInterval(() => {
  if (cleaning.current) return;  // ← 关键：跳过
  ghostR.textContent = randomNoise();
  ghostB.textContent = randomNoise();
}, 80);

// 4. timeline 收尾：先设 flag，再清 interval，最后 finishAnim
timeline.push({
  at: finishAt,
  fn: () => {
    cleaning.current = true;       // ① 阻止后续回调写入
    clearInterval(ghostNoiseTimer); // ② 停止新回调排队
    finishAnim(target);             // ③ 清空 ghost + 重置
  },
});

// 5. finishAnim 中重置 flag
function finishAnim(w) {
  ghostR.textContent = "";
  ghostB.textContent = "";
  // ...
  busy.value = false;
  cleaning.current = false;
}
```

## 已验证

此模式在 OpenFX BrandToggle 的双向切换动画中经过浏览器实测验证，无残留噪声字符。
