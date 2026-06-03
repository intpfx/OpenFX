# packages/e Agent Guide

本目录是 OpenFX 的 Agent 执行框架包。修改这里时，默认目标是保持框架内核清晰、可测、
运行时无关，并让产品外壳调用已有装配层，而不是重新拼内核模块。

## 工作边界

- `src/core/` 放纯逻辑内核、状态机、类型和供应商无关接口。
- `src/app/` 放框架内 reference runtime，例如 `EAgentRuntime`。
- `src/foreground/` 放前台交互与后台执行分离协议，不放具体 UI、麦克风、WebRTC
  或语音模型绑定。
- `src/interfaces/` 放可替换接口和内存实现。
- `tests/` 必须覆盖任何行为变化。

## 关键规则

1. 不要让产品层重新装配 `AgentLoop`、`ToolRunner`、`SessionManager` 等底层模块；优先扩展
   `EAgentRuntime` 或新增同级 reference runtime。
2. 前台通道只处理 `ProgressEvent` 和控制信号；真实执行必须留在后台 runtime。
3. 新增副作用能力时，必须经过 `SafetyActionGate`，并能写入 `TurnRecord` 或 replay
   export。
4. 新增模型供应商时，实现 `ModelProvider`，不要把供应商逻辑写进 `AgentLoop`。
5. 新增存储能力时，优先扩展 `KvStore` key 约定；不要引入 JSONL 作为主存储。
6. 保持运行时无关；不要在核心类型、状态机或 reference runtime 中引入 Deno-only、
   Node-only、Bun-only 或浏览器-only 假设。仓库验证可以使用
   Deno，但框架能力必须通过接口注入。
7. 人类可读文档更新写入 `README.md`，不要恢复已经删除的内核蓝图文件。

## 验证

修改后至少运行：

```bash
deno task --config packages/e/deno.json test
```

提交前运行仓库级校验：

```bash
deno task check
```

## 文档

- `README.md` 是本包的人类入口。
- `BLUEPRINT_EXTENSIONS.md` 只保留非内核愿景和实验设想。
- 如果代码行为改变，必须同步更新 `README.md`。
