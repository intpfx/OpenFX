# Agent Guidance Architecture Restructure

Session: 2026-05-18  
Context: OpenFX repo knowledge-refresh workflow cleanup + document de-duplication

## Before (problem state)

```
README.md (183 行)              AGENTS.md (60 行)
├── 开发原则 (4 rules)           ├── Repository Principles (4 rules)  ← 与 README 重复
├── 仓库结构 (含 knowledge/)     ├── Preferred Workflow
├── 路线图                       ├── Stack Boundaries
├── ADR 0001                     ├── Documentation Rules
├── Agent 指南 (含 knowledge)     ├── Knowledge Freshness (cron 策略)  ← 无用
└── 开源协议                     └── (无外部文档链接)

.agents/skills/openfx-repo/SKILL.md (51 行)
├── Core rules (4 items)         ← 与 AGENTS.md/README 重复
├── Tooling choices
├── External knowledge policy    ← 无用的 cron 策略
└── When writing code

knowledge/                       ← 全家桶
├── sources.json (5 URLs)
└── index.generated.md (空白快照)

scripts/
└── refresh-knowledge.ts         ← fetch <title> 脚本

.github/workflows/
└── knowledge-refresh.yml        ← cron: "0 2 * * 1"
```

**问题：**
1. 4 条开发原则在三份文档中重复
2. knowledge-refresh workflow 实际无价值——只抓 `<title>`，不做摘要/diff/下游触发
3. AGENTS.md 缺少外部文档 URL（agent 无法按需查文档）
4. `deno-version: vx.x` 占位符导致 CI 直接崩溃

## After (clean state)

```
README.md (177 行)              AGENTS.md (50 行)
├── 开发原则 (canonical source)   ├── Principles → 引用 README.md §开发原则
├── 仓库结构 (无 knowledge/)      ├── Preferred Workflow
├── 路线图                       ├── Stack Boundaries
├── ADR 0001                     ├── External References (5 URLs)  ← NEW
├── Agent 指南 (无 knowledge)     └── Documentation Rules
└── 开源协议

.agents/skills/openfx-repo/SKILL.md (38 行)
├── Principles → 引用 README + AGENTS
├── Tooling
├── Reference Documentation → 指向 AGENTS §External References  ← NEW
└── When writing code

(无 knowledge/、scripts/、workflow)
```

**关键改动：**

| 改动 | 效果 |
|------|------|
| 删除 knowledge-refresh 全家桶 (6 项) | 零 CI 浪费，零维护负担 |
| AGENTS.md 新增 External References | agent 可实时 web_fetch 官方文档 |
| 三文档去重，各留 canonical source | 原则只在 README，规则只在 AGENTS/SKILL |
| SKILL.md 51→38 行 (-25%) | 更精简，token 友好 |
| principles 从复述改为引用 | 单一真相来源，修改一处即可 |

## Design rationale

**为什么不合并 README + AGENTS：**
- README 是给人看的公共门面（叙事、路线图、ADR）
- AGENTS 是给 AI 的操作手册（指令、边界、硬约束）
- 合在一起 → agent context 被路线图和 ADR 撑满 → 关键规则被稀释
- 人类的阅读体验也被 agent 噪音破坏

**为什么不在 SKILL.md 里放 URL：**
- URL 可能变（Fresh 改文档站、Perry 迁移域名），只需要改 AGENTS.md 一处
- SKILL.md 引用 AGENTS.md，形成单链，避免多处不同步

**为什么 knowledge cron job 是反模式：**
- 只抓 `<title>`，不读正文 → 无法判断文档是否真的变了
- 变了就开 PR → 噪音，`<title>` 改个空格也开 PR
- agent 本身有 web_fetch 能力 → 需要时实时查比每周一次的快照更准
