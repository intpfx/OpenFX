window.__ModuleLoader__.load({
	id: "dsh-usage-balance",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/aggregate.ts
		/** Zeroed token buckets. */
		const ZERO_TOKENS = {
			uncachedInputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0
		};
		/** Sum two token buckets into a fresh object. */
		function sumTokens(a, b) {
			return {
				uncachedInputTokens: a.uncachedInputTokens + b.uncachedInputTokens,
				outputTokens: a.outputTokens + b.outputTokens,
				cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
				cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens
			};
		}
		/** Total of the four buckets (the heatmap magnitude). */
		function totalOf(tokens) {
			return tokens.uncachedInputTokens + tokens.outputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens;
		}
		/** Session ids that belong to no workspace (and are not archived). */
		function ungroupedSessionIds(allSessionIds, workspaces, archivedSessionIds) {
			const archived = new Set(archivedSessionIds);
			const assigned = /* @__PURE__ */ new Set();
			for (const workspace of workspaces) for (const id of workspace.sessionIds) assigned.add(id);
			return allSessionIds.filter((id) => !assigned.has(id) && !archived.has(id));
		}
		/** Fold one aggregate row from a workspace's session ids. */
		function foldSessionIds(sessionIds, opts) {
			let tokens = ZERO_TOKENS;
			let cost = 0;
			let pricedSessions = 0;
			for (const id of sessionIds) {
				const usage = opts.usageOf(id);
				if (usage !== void 0) tokens = sumTokens(tokens, usage);
				const sessionCost = opts.costOf(id);
				if (typeof sessionCost === "number" && Number.isFinite(sessionCost)) {
					cost += sessionCost;
					pricedSessions += 1;
				}
			}
			return {
				tokens,
				cost,
				pricedSessions
			};
		}
		/**
		* Aggregate per-workspace token usage and cost, in input order, followed by
		* one ungrouped bucket when such sessions exist.
		* @param workspaces - workspace rows with their session membership.
		* @param ungroupedIds - sessions belonging to no workspace (see
		*   {@link ungroupedSessionIds}).
		* @param opts - per-session reads.
		*/
		function aggregateWorkspaces(workspaces, ungroupedIds, opts) {
			const rows = workspaces.map((workspace) => {
				const { tokens, cost, pricedSessions } = foldSessionIds(workspace.sessionIds, opts);
				return {
					workspaceId: workspace.id,
					title: workspace.title,
					sessionIds: [...workspace.sessionIds],
					tokens,
					totalTokens: totalOf(tokens),
					cost,
					pricedSessions
				};
			});
			if (ungroupedIds.length > 0) {
				const { tokens, cost, pricedSessions } = foldSessionIds(ungroupedIds, opts);
				rows.push({
					workspaceId: void 0,
					title: "",
					sessionIds: [...ungroupedIds],
					tokens,
					totalTokens: totalOf(tokens),
					cost,
					pricedSessions
				});
			}
			return rows;
		}
		//#endregion
		//#region src/cost.ts
		/** deepseek-v4-flash official prices (CNY per 1M tokens). */
		const FLASH_COST_CONFIG = {
			inputPerMillion: 1,
			cacheReadPerMillion: .02,
			cacheWritePerMillion: 0,
			outputPerMillion: 2,
			currency: "CNY"
		};
		/** Cost of a token count at a per-million price. */
		function costOfTokens(count, perMillion) {
			if (count <= 0 || !Number.isFinite(count)) return 0;
			return count / 1e6 * perMillion;
		}
		/** Total cost of one provider usage record. */
		function costOfUsage(usage, config) {
			return costOfTokens(usage.inputTokens, config.inputPerMillion) + costOfTokens(usage.cacheReadTokens ?? 0, config.cacheReadPerMillion) + costOfTokens(usage.cacheWriteTokens ?? 0, config.cacheWritePerMillion) + costOfTokens(usage.outputTokens, config.outputPerMillion);
		}
		//#endregion
		//#region src/client/format.ts
		/**
		* dsh-usage-balance browser formatting helpers — pure display functions
		* shared by the footer widget and the session-row chips.
		* @module dsh-usage-balance/client/format
		*/
		/**
		* Compact token count: `517`, `12.2K`, `517K`, `1.2M`, `1.2B`
		* (one decimal under three digits, mirroring the stats strip).
		*/
		function formatTokens(n) {
			if (!Number.isFinite(n) || n <= 0) return "0";
			for (const [div, suffix] of [
				[1e9, "B"],
				[1e6, "M"],
				[1e3, "K"]
			]) if (n >= div) {
				const v = n / div;
				return `${v >= 100 ? String(Math.round(v)) : v.toFixed(1)}${suffix}`;
			}
			return String(Math.round(n));
		}
		/**
		* Compact money in CNY: `¥1,235` (≥100, no decimals), `¥12.34` (≥1),
		* `¥0.012` (below 1, three decimals). Non-finite values render `—`.
		*/
		function formatMoney(value) {
			if (!Number.isFinite(value)) return "—";
			const abs = Math.abs(value);
			const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 3;
			return `¥${value.toLocaleString("zh-CN", {
				minimumFractionDigits: digits,
				maximumFractionDigits: digits
			})}`;
		}
		/** Balance with two fixed decimals: `¥4.16`. */
		function formatBalance(value) {
			if (value === void 0 || !Number.isFinite(value)) return "—";
			return `¥${value.toLocaleString("zh-CN", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			})}`;
		}
		//#endregion
		//#region src/client/session-row.ts
		/**
		* dsh-usage-balance session-row cost chips — DOM-level augmentation of the
		* sidebar session list. The sidebar workspace browser renders its session
		* rows internally and exposes no per-row slot, so this injector:
		*
		* 1. observes the document for `[role="treeitem"]` rows (stable ARIA
		*    contract of the workspace browser);
		* 2. resolves each row's session id from its React fiber props (the row
		*    element carries the fiber; the tree node — `{ id, blank, updatedAt, … }`
		*    for sessions, `{ sessions: [] }` for workspace groups — sits a few
		*    frames up the return chain);
		* 3. renders a small cost chip before the row's time label.
		*
		* The chip markup is plain DOM (no React), keyed by `data-usage-balance`,
		* so re-syncs are idempotent and unload removes every chip.
		* @module dsh-usage-balance/client/session-row
		*/
		/** Selector for sidebar tree rows (session and workspace rows alike). */
		const ROW_SELECTOR = "[role=\"treeitem\"]";
		/** Marker on chip elements we own. */
		const CHIP_ATTR = "data-usage-balance-chip";
		/** How many fiber frames to walk up before giving up on a row. */
		const MAX_FIBER_DEPTH = 12;
		/**
		* Resolve the session id of a tree row by walking its React fiber chain.
		* Session tree nodes carry `id` + `updatedAt`; workspace group nodes carry a
		* `sessions` array instead and return undefined.
		*/
		function sessionIdOfRow(row) {
			const fiberKey = Object.keys(row).find((key) => key.startsWith("__reactFiber$"));
			if (fiberKey === void 0) return void 0;
			let fiber = row[fiberKey];
			for (let depth = 0; fiber !== void 0 && depth < MAX_FIBER_DEPTH; depth++) {
				const node = fiber.memoizedProps?.node;
				if (node !== void 0 && typeof node.id === "string" && "updatedAt" in node) return node.id;
				fiber = fiber.return;
			}
		}
		/** Find the time label span of a session row (the chip anchors before it). */
		function timeSpanOf(row) {
			const children = row.children;
			if (children.length < 2) return null;
			const candidate = children[children.length - 2];
			return candidate instanceof HTMLSpanElement ? candidate : null;
		}
		/**
		* DOM injector for per-session cost chips. Call {@link start} once (widget
		* mount), {@link setCosts} whenever the cost map changes, and {@link stop}
		* on unload.
		*/
		var SessionRowCostInjector = class {
			entries = /* @__PURE__ */ new Map();
			costs = /* @__PURE__ */ new Map();
			observer;
			syncScheduled = false;
			/** Update the cost map and re-sync chips (cheap, batched per tick). */
			setCosts(costs) {
				this.costs = new Map(costs);
				this.scheduleSync();
			}
			/** Start observing and run an initial scan. */
			start() {
				if (this.observer !== void 0) return;
				this.observer = new MutationObserver(() => this.scheduleSync());
				this.observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				this.scheduleSync();
			}
			/** Stop observing and remove every chip. */
			stop() {
				this.observer?.disconnect();
				this.observer = void 0;
				for (const entry of this.entries.values()) entry.chip?.remove();
				this.entries.clear();
				this.costs.clear();
				this.syncScheduled = false;
			}
			scheduleSync() {
				if (this.syncScheduled) return;
				this.syncScheduled = true;
				queueMicrotask(() => {
					this.syncScheduled = false;
					this.scan();
				});
			}
			/** Reconcile chips with the current DOM rows and cost map. */
			scan() {
				const seen = /* @__PURE__ */ new Set();
				for (const element of document.querySelectorAll(ROW_SELECTOR)) {
					if (!(element instanceof HTMLElement)) continue;
					seen.add(element);
					let entry = this.entries.get(element);
					if (entry === void 0) {
						const sessionId = sessionIdOfRow(element);
						if (sessionId === void 0) continue;
						entry = {
							row: element,
							sessionId,
							chip: null
						};
						this.entries.set(element, entry);
					}
					this.render(entry);
				}
				for (const [row, entry] of this.entries) if (!seen.has(row) || !row.isConnected) {
					entry.chip?.remove();
					this.entries.delete(row);
				}
			}
			/** Render (or clear) the chip of one row. */
			render(entry) {
				const cost = this.costs.get(entry.sessionId);
				if (cost === void 0 || cost <= 0 || !Number.isFinite(cost)) {
					entry.chip?.remove();
					entry.chip = null;
					return;
				}
				if (entry.chip === null) {
					const chip = document.createElement("span");
					chip.setAttribute(CHIP_ATTR, "");
					chip.style.margin = "0 6px";
					chip.style.fontSize = "11px";
					chip.style.lineHeight = "14px";
					chip.style.color = "var(--dsw-alias-label-caption, #999)";
					chip.style.fontVariantNumeric = "tabular-nums";
					chip.style.whiteSpace = "nowrap";
					const anchor = timeSpanOf(entry.row);
					if (anchor !== null) entry.row.insertBefore(chip, anchor);
					else entry.row.appendChild(chip);
					entry.chip = chip;
				}
				const text = formatMoney(cost);
				if (entry.chip.textContent !== text) entry.chip.textContent = text;
			}
		};
		/** Module-level singleton shared by the widget (one injector per page). */
		const sessionRowCostInjector = new SessionRowCostInjector();
		//#endregion
		//#region \0dsh-css:/Users/siaovon/Documents/OpenFX/domains/dsh-openfx/packages/usage-balance/src/client/widget.module.css.mjs
		const css = "._4w0lXG_root{box-sizing:border-box;border-top:1px solid var(--dsw-alias-border-subtle,#8080802e);width:100%;min-width:0;color:var(--dsw-alias-label-secondary,#666);user-select:none;flex-direction:column;gap:4px;padding:6px 8px;font-size:12px;line-height:16px;display:flex}._4w0lXG_balanceRow{align-items:center;gap:6px;display:flex}._4w0lXG_balanceValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#222);font-weight:600}._4w0lXG_balanceState{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-caption,#999);flex:1;overflow:hidden}._4w0lXG_error{color:var(--dsw-alias-state-error-primary,#d33);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._4w0lXG_empty{color:var(--dsw-alias-label-caption,#999);padding:2px 0}._4w0lXG_heatmap{flex-direction:column;gap:2px;width:100%;min-width:0;max-height:176px;margin:0;padding:0;list-style:none;display:flex;overflow-y:auto}._4w0lXG_row{box-sizing:border-box;border-radius:4px;align-items:center;gap:6px;width:100%;min-width:0;min-height:20px;padding:1px 4px;display:flex}._4w0lXG_row:hover{background:var(--dsw-alias-interactive-bg-hover,#8080801f)}._4w0lXG_swatch{border-radius:2px;flex:none;width:10px;height:10px}._4w0lXG_name{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#222);flex:1;overflow:hidden}._4w0lXG_tokens{font-variant-numeric:tabular-nums}._4w0lXG_cost{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#222);text-align:right;min-width:52px}._4w0lXG_totalRow{border-top:1px solid var(--dsw-alias-border-subtle,#8080802e);font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#222);justify-content:space-between;align-items:center;gap:6px;padding-top:4px;display:flex}._4w0lXG_rail{text-align:center;font-variant-numeric:tabular-nums;width:100%;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;font-size:10px;display:inline-block}";
		const tagId = "dsh-usage-balance/widget.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-usage-balance";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var widget_module_css_default = {
			"balanceRow": "_4w0lXG_balanceRow",
			"balanceState": "_4w0lXG_balanceState",
			"balanceValue": "_4w0lXG_balanceValue",
			"cost": "_4w0lXG_cost",
			"empty": "_4w0lXG_empty",
			"error": "_4w0lXG_error",
			"heatmap": "_4w0lXG_heatmap",
			"name": "_4w0lXG_name",
			"rail": "_4w0lXG_rail",
			"root": "_4w0lXG_root",
			"row": "_4w0lXG_row",
			"swatch": "_4w0lXG_swatch",
			"tokens": "_4w0lXG_tokens",
			"totalRow": "_4w0lXG_totalRow"
		};
		//#endregion
		//#region src/client/UsageBalanceWidget.tsx
		/**
		* dsh-usage-balance footer widget — the block rendered in the
		* `sidebar.footer.action` seat (directly above the Settings entry). It shows
		* the live DeepSeek account balance and a per-workspace token heatmap with
		* estimated costs, and drives the per-session cost chips in the session rows.
		*
		* Data flow:
		* - balance + host-priced per-session costs: polled from the host
		*   `/api/usage-balance/summary` endpoint (~30 s, manual refresh available);
		* - per-session token usage: read live from the session list projection
		*   values (`useSessions`), so the heatmap updates as turns stream;
		* - sessions the host does not price (not live on the host) fall back to the
		*   flash preset applied to their projection tokens.
		* @module dsh-usage-balance/client/UsageBalanceWidget
		*/
		/** Poll interval for the host summary. */
		const POLL_MS = 3e4;
		/** Same-origin JSON fetch helper. */
		async function summaryFetch() {
			const response = await fetch("/api/usage-balance/summary");
			if (!response.ok) throw new Error(`usage-balance summary failed: ${response.status}`);
			return await response.json();
		}
		/**
		* Build the per-session cost map: host-priced costs win; sessions the host
		* does not price fall back to the flash preset over their live projection
		* tokens. Blank (new) sessions contribute nothing.
		*/
		function buildCostMap(sessions, summary) {
			const map = /* @__PURE__ */ new Map();
			const hostCosts = summary?.costs?.sessions ?? {};
			for (const session of sessions) {
				if (session.blank) continue;
				const host = hostCosts[session.id];
				if (host !== void 0 && Number.isFinite(host.cost)) {
					map.set(session.id, host.cost);
					continue;
				}
				const usage = session.projectionValues?.tokenUsage;
				if (usage !== void 0) map.set(session.id, costOfUsage({
					inputTokens: usage.uncachedInputTokens,
					outputTokens: usage.outputTokens,
					cacheReadTokens: usage.cacheReadTokens,
					cacheWriteTokens: usage.cacheWriteTokens
				}, FLASH_COST_CONFIG));
			}
			return map;
		}
		/** Heatmap fill color for one row, by its share of the largest row. */
		function heatColor(share) {
			return `hsla(210, 70%, 50%, ${(.12 + .88 * Math.max(0, Math.min(1, share))).toFixed(3)})`;
		}
		/** Aggregate rows with the ungrouped bucket merged in (stable input order). */
		function aggregateRows(sessions, workspaces, costMap) {
			const byId = sessions.byId;
			const usageOf = (sessionId) => byId[sessionId]?.projectionValues?.tokenUsage;
			const costOf = (sessionId) => costMap.get(sessionId);
			const ungrouped = ungroupedSessionIds(sessions.ids, workspaces.items, workspaces.archivedSessionIds);
			return aggregateWorkspaces(workspaces.items.map((workspace) => ({
				id: workspace.workspaceId,
				title: workspace.title,
				sessionIds: workspace.sessionIds
			})), ungrouped, {
				usageOf,
				costOf
			});
		}
		/** The footer widget component. */
		function UsageBalanceWidget(props) {
			const { wide, useSessions, useWorkspaces, t } = props;
			const sessions = useSessions((state) => state);
			const workspaces = useWorkspaces((state) => state);
			const [summary, setSummary] = (0, react.useState)(void 0);
			const [error, setError] = (0, react.useState)(void 0);
			const refresh = (0, react.useCallback)(async () => {
				try {
					setError(void 0);
					setSummary(await summaryFetch());
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			}, []);
			const sessionList = sessions.byId;
			(0, react.useEffect)(() => {
				let alive = true;
				let timer;
				const tick = async () => {
					if (!alive) return;
					try {
						setError(void 0);
						const next = await summaryFetch();
						if (alive) setSummary(next);
					} catch (cause) {
						if (alive) setError(cause instanceof Error ? cause.message : String(cause));
					}
				};
				tick();
				timer = setInterval(() => {
					tick();
				}, POLL_MS);
				return () => {
					alive = false;
					if (timer !== void 0) clearInterval(timer);
				};
			}, []);
			const lastActivityRefreshRef = (0, react.useRef)(0);
			const firstActivityRef = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				if (firstActivityRef.current) {
					firstActivityRef.current = false;
					return;
				}
				const now = Date.now();
				if (now - lastActivityRefreshRef.current < 1e4) return;
				lastActivityRefreshRef.current = now;
				refresh();
			}, [sessionList, refresh]);
			const costMap = (0, react.useMemo)(() => buildCostMap(Object.values(sessionList), summary), [sessionList, summary]);
			(0, react.useEffect)(() => {
				sessionRowCostInjector.start();
				return () => {
					sessionRowCostInjector.stop();
				};
			}, []);
			(0, react.useEffect)(() => {
				sessionRowCostInjector.setCosts(costMap);
			}, [costMap]);
			const rows = (0, react.useMemo)(() => aggregateRows(sessions, workspaces, costMap), [
				sessions,
				workspaces,
				costMap
			]);
			const maxTokens = Math.max(1, ...rows.map((row) => row.totalTokens));
			const totals = (0, react.useMemo)(() => rows.reduce((acc, row) => ({
				tokens: acc.tokens + row.totalTokens,
				cost: acc.cost + row.cost,
				sessions: acc.sessions + row.sessionIds.length
			}), {
				tokens: 0,
				cost: 0,
				sessions: 0
			}), [rows]);
			const balance = summary?.balance;
			if (!wide) {
				const label = balance?.error === void 0 ? balance?.total === void 0 ? t("widget.loading") : formatBalance(balance.total) : "—";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: widget_module_css_default.rail,
					"data-usage-balance-value": true,
					title: balance?.error ?? t("widget.balance", { amount: formatBalance(balance?.total) }),
					children: label
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: widget_module_css_default.root,
				"data-usage-balance-root": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: widget_module_css_default.balanceRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: widget_module_css_default.balanceValue,
							"data-usage-balance-value": true,
							title: balance?.error,
							children: t("widget.balance", { amount: formatBalance(balance?.total) })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: widget_module_css_default.balanceState,
							children: balance?.error !== void 0 ? t("widget.unavailable") : balance === void 0 ? t("widget.loading") : t("widget.available")
						})]
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: widget_module_css_default.error,
						title: error,
						children: t("widget.error", { error })
					}),
					rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: widget_module_css_default.empty,
						children: t("widget.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: widget_module_css_default.heatmap,
						children: rows.map((row) => {
							const detail = [
								t("widget.tokens"),
								`${formatTokens(row.tokens.uncachedInputTokens)} / ${formatTokens(row.tokens.outputTokens)} / ${formatTokens(row.tokens.cacheReadTokens)}`,
								t("widget.cost"),
								formatMoney(row.cost),
								t("widget.sessions", { count: String(row.sessionIds.length) })
							].join(" · ");
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
								className: widget_module_css_default.row,
								"data-usage-balance-workspace-row": true,
								title: detail,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: widget_module_css_default.swatch,
										style: { background: heatColor(row.totalTokens / maxTokens) }
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: widget_module_css_default.name,
										"data-usage-balance-workspace-name": true,
										children: row.workspaceId === void 0 ? t("widget.ungrouped") : row.title
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: widget_module_css_default.tokens,
										children: formatTokens(row.totalTokens)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: widget_module_css_default.cost,
										"data-usage-balance-workspace-cost": true,
										children: formatMoney(row.cost)
									})
								]
							}, row.workspaceId ?? "__ungrouped__");
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: widget_module_css_default.totalRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("widget.total") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								formatTokens(totals.tokens),
								" ·",
								" ",
								t("widget.sessions", { count: String(totals.sessions) })
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatMoney(totals.cost) })
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Chinese copy. */
		const zh = {
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
			"settings.description": "侧边栏会话行显示实时花费，设置入口上方显示余额与工作区 token 热力图。",
			"settings.enabled": "启用插件",
			"settings.enabledHint": "关闭后隐藏侧边栏组件并停止轮询。",
			"settings.apiKeyEnv": "API Key 环境变量名",
			"settings.apiKeyEnvHint": "存储 DeepSeek API Key 的凭据引用（默认 DEEPSEEK_API_KEY）。",
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
			"settings.invalidNumber": "请输入数字，留空则使用默认值。"
		};
		/** English copy. */
		const en = {
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
			"settings.description": "Live cost per session row, balance and per-workspace token heatmap above Settings.",
			"settings.enabled": "Enable plugin",
			"settings.enabledHint": "Hides the sidebar components and stops polling when off.",
			"settings.apiKeyEnv": "API key env name",
			"settings.apiKeyEnvHint": "Credential ref storing the DeepSeek API key (default DEEPSEEK_API_KEY).",
			"settings.baseUrl": "API base URL",
			"settings.baseUrlHint": "DeepSeek API base URL; keep the default unless you use a gateway.",
			"settings.refreshInterval": "Refresh interval (s)",
			"settings.refreshIntervalHint": "Minimum seconds between official balance queries.",
			"settings.model": "Pricing mode",
			"settings.modelHint": "auto prices each session by its actual model; flash/pro force one preset.",
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
			"settings.invalidNumber": "Enter a number, or leave blank for the default."
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "usageBalance";
		/** Required services: slots for the footer widget, locale for the copy. */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/**
		* Register the footer widget into the sidebar foot, above the Settings seat.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-usage-balance: dictionaries");
			ctx.inject(["slots"], (scope) => {
				scope.effect(() => scope.slots.register({
					name: "sidebar.footer.action",
					id: "usage-balance",
					locale: NS,
					inject: () => ({})
				}, UsageBalanceWidget), "dsh-usage-balance: footer widget registration");
			});
		}
		//#endregion
		exports.POLL_MS = POLL_MS;
		exports.SessionRowCostInjector = SessionRowCostInjector;
		exports.UsageBalanceWidget = UsageBalanceWidget;
		exports.aggregateRows = aggregateRows;
		exports.apply = apply;
		exports.buildCostMap = buildCostMap;
		exports.formatBalance = formatBalance;
		exports.formatMoney = formatMoney;
		exports.formatTokens = formatTokens;
		exports.heatColor = heatColor;
		exports.inject = inject;
		exports.sessionIdOfRow = sessionIdOfRow;
		exports.sessionRowCostInjector = sessionRowCostInjector;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map