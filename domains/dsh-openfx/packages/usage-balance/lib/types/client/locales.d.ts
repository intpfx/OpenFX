/**
 * dsh-usage-balance locale dictionaries (zh/en).
 * @module dsh-usage-balance/client/locales
 */
/** Dictionary namespace this package registers. */
export declare const NS = "usageBalance";
/** Chinese copy. */
export declare const zh: {
    readonly "widget.balance": "余额 {amount}";
    readonly "widget.available": "可用";
    readonly "widget.unavailable": "不可用";
    readonly "widget.loading": "查询中…";
    readonly "widget.error": "余额查询失败：{error}";
    readonly "widget.total": "总计";
    readonly "widget.tokens": "Token";
    readonly "widget.cost": "花费";
    readonly "widget.workspace": "工作区";
    readonly "widget.ungrouped": "未分组";
    readonly "widget.empty": "暂无会话数据";
    readonly "widget.hint": "按 token 总量着色，悬停查看输入/输出/缓存明细";
    readonly "widget.sessions": "{count} 个会话";
    readonly "row.title": "本会话预估花费 {amount}";
    readonly "row.updated": "更新于 {time}";
    readonly "settings.title": "侧边栏余额与工作区统计";
    readonly "settings.description": "侧边栏会话行显示实时花费，设置入口上方显示余额与工作区 token 热力图。";
    readonly "settings.enabled": "启用插件";
    readonly "settings.enabledHint": "关闭后隐藏侧边栏组件并停止轮询。";
    readonly "settings.apiKeyEnv": "API Key 环境变量名";
    readonly "settings.apiKeyEnvHint": "存储 DeepSeek API Key 的凭据引用（默认 DEEPSEEK_API_KEY）。";
    readonly "settings.baseUrl": "API 地址";
    readonly "settings.baseUrlHint": "DeepSeek API 基础地址，一般保持默认。";
    readonly "settings.refreshInterval": "刷新间隔（秒）";
    readonly "settings.refreshIntervalHint": "两次向官方余额接口查询的最小间隔。";
    readonly "settings.model": "计价模式";
    readonly "settings.modelHint": "auto 按每个会话实际使用的模型计价，flash/pro 强制统一预设。";
    readonly "settings.inherit": "继承";
    readonly "settings.on": "开";
    readonly "settings.off": "关";
    readonly "settings.overridden": "已覆盖";
    readonly "settings.reset": "恢复默认";
    readonly "settings.readOnly": "当前部署的设置只读。";
    readonly "settings.expand": "展开设置";
    readonly "settings.collapse": "收起设置";
    readonly "settings.save": "保存";
    readonly "settings.saving": "保存中…";
    readonly "settings.discard": "放弃";
    readonly "settings.unsaved": "未保存";
    readonly "settings.saveFailed": "部署未接受这些值，已保留供你修改。";
    readonly "settings.invalidNumber": "请输入数字，留空则使用默认值。";
};
/** English copy. */
export declare const en: {
    readonly "widget.balance": "Balance {amount}";
    readonly "widget.available": "available";
    readonly "widget.unavailable": "unavailable";
    readonly "widget.loading": "Loading…";
    readonly "widget.error": "Balance query failed: {error}";
    readonly "widget.total": "Total";
    readonly "widget.tokens": "Tokens";
    readonly "widget.cost": "Cost";
    readonly "widget.workspace": "Workspace";
    readonly "widget.ungrouped": "Ungrouped";
    readonly "widget.empty": "No session data yet";
    readonly "widget.hint": "Shaded by token volume; hover for input/output/cache details";
    readonly "widget.sessions": "{count} sessions";
    readonly "row.title": "Estimated cost of this session {amount}";
    readonly "row.updated": "Updated {time}";
    readonly "settings.title": "Sidebar balance and workspace stats";
    readonly "settings.description": "Live cost per session row, balance and per-workspace token heatmap above Settings.";
    readonly "settings.enabled": "Enable plugin";
    readonly "settings.enabledHint": "Hides the sidebar components and stops polling when off.";
    readonly "settings.apiKeyEnv": "API key env name";
    readonly "settings.apiKeyEnvHint": "Credential ref storing the DeepSeek API key (default DEEPSEEK_API_KEY).";
    readonly "settings.baseUrl": "API base URL";
    readonly "settings.baseUrlHint": "DeepSeek API base URL; keep the default unless you use a gateway.";
    readonly "settings.refreshInterval": "Refresh interval (s)";
    readonly "settings.refreshIntervalHint": "Minimum seconds between official balance queries.";
    readonly "settings.model": "Pricing mode";
    readonly "settings.modelHint": "auto prices each session by its actual model; flash/pro force one preset.";
    readonly "settings.inherit": "Inherit";
    readonly "settings.on": "On";
    readonly "settings.off": "Off";
    readonly "settings.overridden": "Overridden";
    readonly "settings.reset": "Reset";
    readonly "settings.readOnly": "Settings are read-only in this deployment.";
    readonly "settings.expand": "Expand settings";
    readonly "settings.collapse": "Collapse settings";
    readonly "settings.save": "Save";
    readonly "settings.saving": "Saving…";
    readonly "settings.discard": "Discard";
    readonly "settings.unsaved": "Unsaved changes";
    readonly "settings.saveFailed": "The deployment rejected these values; kept for you to edit.";
    readonly "settings.invalidNumber": "Enter a number, or leave blank for the default.";
};
/** Dictionary keys (both locales carry the same shape). */
export type UsageBalanceKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map