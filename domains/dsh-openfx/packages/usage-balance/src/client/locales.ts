/**
 * dsh-usage-balance locale dictionaries (zh/en).
 * @module dsh-usage-balance/client/locales
 */

/** Dictionary namespace this package registers. */
export const NS = "usageBalance";

/** Chinese copy. */
export const zh = {
  "widget.balance": "余额 {amount}",
  "widget.available": "可用",
  "widget.unavailable": "不可用",
  "widget.loading": "查询中…",
  "widget.error": "余额查询失败：{error}",
  "widget.total": "总计",
  "widget.tokens": "Token",
  "widget.cost": "花费",
  "widget.workspace": "工作区",
  "widget.ungrouped": "未分组",
  "widget.empty": "暂无会话数据",
  "widget.hint": "按 token 总量着色，悬停查看输入/输出/缓存明细",
  "widget.sessions": "{count} 个会话",
  "row.title": "本会话预估花费 {amount}",
  "row.updated": "更新于 {time}",
  "settings.title": "侧边栏余额与工作区统计",
  "settings.description":
    "侧边栏会话行显示实时花费，设置入口上方显示余额与工作区 token 热力图。",
  "settings.enabled": "启用插件",
  "settings.enabledHint": "关闭后隐藏侧边栏组件并停止轮询。",
  "settings.apiKeyEnv": "API Key 环境变量名",
  "settings.apiKeyEnvHint":
    "存储 DeepSeek API Key 的凭据引用（默认 DEEPSEEK_API_KEY）。",
  "settings.baseUrl": "API 地址",
  "settings.baseUrlHint": "DeepSeek API 基础地址，一般保持默认。",
  "settings.refreshInterval": "刷新间隔（秒）",
  "settings.refreshIntervalHint": "两次向官方余额接口查询的最小间隔。",
  "settings.model": "计价模式",
  "settings.modelHint": "auto 按每个会话实际使用的模型计价，flash/pro 强制统一预设。",
  "settings.inherit": "继承",
  "settings.on": "开",
  "settings.off": "关",
  "settings.overridden": "已覆盖",
  "settings.reset": "恢复默认",
  "settings.readOnly": "当前部署的设置只读。",
  "settings.expand": "展开设置",
  "settings.collapse": "收起设置",
  "settings.save": "保存",
  "settings.saving": "保存中…",
  "settings.discard": "放弃",
  "settings.unsaved": "未保存",
  "settings.saveFailed": "部署未接受这些值，已保留供你修改。",
  "settings.invalidNumber": "请输入数字，留空则使用默认值。",
} as const;

/** English copy. */
export const en = {
  "widget.balance": "Balance {amount}",
  "widget.available": "available",
  "widget.unavailable": "unavailable",
  "widget.loading": "Loading…",
  "widget.error": "Balance query failed: {error}",
  "widget.total": "Total",
  "widget.tokens": "Tokens",
  "widget.cost": "Cost",
  "widget.workspace": "Workspace",
  "widget.ungrouped": "Ungrouped",
  "widget.empty": "No session data yet",
  "widget.hint": "Shaded by token volume; hover for input/output/cache details",
  "widget.sessions": "{count} sessions",
  "row.title": "Estimated cost of this session {amount}",
  "row.updated": "Updated {time}",
  "settings.title": "Sidebar balance and workspace stats",
  "settings.description":
    "Live cost per session row, balance and per-workspace token heatmap above Settings.",
  "settings.enabled": "Enable plugin",
  "settings.enabledHint": "Hides the sidebar components and stops polling when off.",
  "settings.apiKeyEnv": "API key env name",
  "settings.apiKeyEnvHint":
    "Credential ref storing the DeepSeek API key (default DEEPSEEK_API_KEY).",
  "settings.baseUrl": "API base URL",
  "settings.baseUrlHint":
    "DeepSeek API base URL; keep the default unless you use a gateway.",
  "settings.refreshInterval": "Refresh interval (s)",
  "settings.refreshIntervalHint": "Minimum seconds between official balance queries.",
  "settings.model": "Pricing mode",
  "settings.modelHint":
    "auto prices each session by its actual model; flash/pro force one preset.",
  "settings.inherit": "Inherit",
  "settings.on": "On",
  "settings.off": "Off",
  "settings.overridden": "Overridden",
  "settings.reset": "Reset",
  "settings.readOnly": "Settings are read-only in this deployment.",
  "settings.expand": "Expand settings",
  "settings.collapse": "Collapse settings",
  "settings.save": "Save",
  "settings.saving": "Saving…",
  "settings.discard": "Discard",
  "settings.unsaved": "Unsaved changes",
  "settings.saveFailed": "The deployment rejected these values; kept for you to edit.",
  "settings.invalidNumber": "Enter a number, or leave blank for the default.",
} as const;

/** Dictionary keys (both locales carry the same shape). */
export type UsageBalanceKey = keyof typeof zh;
