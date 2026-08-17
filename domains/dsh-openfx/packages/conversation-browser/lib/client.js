window.__ModuleLoader__.load({
	id: "dsh-conversation-browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region src/client/browser-address.ts
		const SCHEME = /^[a-z][a-z\d+.-]*:/i;
		const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i;
		const HOST_WITH_PORT = /^(?:[^/?#:\s]+|\[[^\]]+\]):\d+(?:[/?#]|$)/;
		/**
		* Normalize an address for the sandboxed browser frame.
		* @param value - user-entered address.
		* @returns an absolute HTTP(S) URL or a precise rejection reason.
		*/
		function normalizeBrowserAddress(value) {
			const input = value.trim();
			if (input === "") return {
				ok: false,
				reason: "empty"
			};
			const candidate = input.startsWith("//") ? `https:${input}` : LOOPBACK.test(input) ? `http://${input}` : HOST_WITH_PORT.test(input) ? `https://${input}` : SCHEME.test(input) ? input : `https://${input}`;
			let url;
			try {
				url = new URL(candidate);
			} catch {
				return {
					ok: false,
					reason: "invalid"
				};
			}
			if (url.protocol !== "http:" && url.protocol !== "https:") return {
				ok: false,
				reason: "unsupported"
			};
			if (url.username !== "" || url.password !== "") return {
				ok: false,
				reason: "credentials"
			};
			return {
				ok: true,
				url: url.href
			};
		}
		//#endregion
		//#region \0dsh-css:/Users/siaovon/Documents/OpenFX/domains/dsh-openfx/packages/conversation-browser/src/client/BrowserView.module.css.mjs
		const css = ".-WXG7q_root{box-sizing:border-box;width:100%;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);grid-template-rows:minmax(0,1fr);display:grid;position:relative;overflow:hidden}.-WXG7q_inline{grid-template-rows:auto minmax(0,1fr)}.-WXG7q_toolbar{z-index:2;box-sizing:border-box;min-height:40px;box-shadow:inset 0 -1px 0 var(--dsw-alias-border-l2);background:0 0;align-items:center;gap:0;padding:0 8px;display:flex;position:relative}.-WXG7q_iconButton{width:40px;height:40px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:8px;flex:0 0 40px;justify-content:center;align-items:center;text-decoration:none;transition:color .14s cubic-bezier(.23,1,.32,1),background-color .14s cubic-bezier(.23,1,.32,1),transform .1s cubic-bezier(.23,1,.32,1);display:inline-flex}.-WXG7q_iconButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.-WXG7q_iconButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.-WXG7q_iconButton:active:not(:disabled){transform:scale(.97)}.-WXG7q_iconButton:disabled{color:var(--dsw-alias-label-dimmed);cursor:not-allowed}.-WXG7q_address{background:0 0;border:0;border-radius:0;flex:1;gap:8px;min-width:120px;height:34px;padding:0 8px}.-WXG7q_address:focus-within{box-shadow:inset 0 -2px 0 var(--dsw-alias-state-business-primary);border-color:#0000}.-WXG7q_viewport{background:var(--dsw-alias-bg-layer-1);flex-direction:column;min-width:0;min-height:0;display:flex;overflow:hidden}.-WXG7q_notice,.-WXG7q_status{border-bottom:1px solid var(--dsw-alias-border-l2);font:var(--dsw-font-xxs-12);padding:7px 14px}.-WXG7q_notice{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, var(--dsw-alias-bg-layer-1))}.-WXG7q_status{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}.-WXG7q_empty{text-align:center;flex-direction:column;flex:1;justify-content:center;align-self:center;align-items:center;max-width:440px;padding:32px 24px;display:flex}.-WXG7q_emptyIcon{border:1px solid var(--dsw-alias-border-l2);width:56px;height:56px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:16px;justify-content:center;align-items:center;margin-bottom:16px;display:inline-flex}.-WXG7q_empty h2{color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-strong-14);margin:0}.-WXG7q_empty p{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);margin:8px 0 0}.-WXG7q_empty small{color:var(--dsw-alias-label-caption);font:var(--dsw-font-xxs-12);margin-top:14px}.-WXG7q_frame{background:var(--dsw-alias-bg-layer-1);border:0;flex:1 1 0;width:100%;height:auto;min-height:0;display:block}@media (width<=520px){.-WXG7q_toolbar{padding-inline:6px}.-WXG7q_address{min-width:0}}@media (prefers-reduced-motion:reduce){.-WXG7q_iconButton{transition:color .14s,background-color .14s}}";
		const tagId = "dsh-conversation-browser/BrowserView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-conversation-browser";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var BrowserView_module_css_default = {
			"address": "-WXG7q_address",
			"empty": "-WXG7q_empty",
			"emptyIcon": "-WXG7q_emptyIcon",
			"frame": "-WXG7q_frame",
			"iconButton": "-WXG7q_iconButton",
			"inline": "-WXG7q_inline",
			"notice": "-WXG7q_notice",
			"root": "-WXG7q_root",
			"status": "-WXG7q_status",
			"toolbar": "-WXG7q_toolbar",
			"viewport": "-WXG7q_viewport"
		};
		//#endregion
		//#region src/client/BrowserView.tsx
		/** Sandboxed browser view with toolbar-owned navigation history. */
		const FRAME_SANDBOX = "allow-forms allow-modals allow-popups allow-scripts";
		function useComposerInputHeader() {
			const [host, setHost] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				const refresh = () => {
					setHost(document.querySelector("[data-conversation-input-header]"));
				};
				refresh();
				const observer = new MutationObserver(refresh);
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				return () => {
					observer.disconnect();
				};
			}, []);
			return host;
		}
		/** Browser view registered into the session-scoped conversation view slot. */
		function BrowserView({ useStore, actions, t }) {
			const { address, history, cursor, revision } = useStore((state) => state);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const currentUrl = history[cursor] ?? null;
			const canGoBack = cursor > 0;
			const canGoForward = cursor >= 0 && cursor < history.length - 1;
			const composerInputHeader = useComposerInputHeader();
			const navigate = (event) => {
				event.preventDefault();
				const result = normalizeBrowserAddress(address);
				if (!result.ok) {
					setLoading(false);
					setError(result.reason);
					return;
				}
				setError(null);
				setLoading(true);
				actions.navigate(result.url);
			};
			const move = (action) => {
				setError(null);
				setLoading(true);
				action();
			};
			const toolbar = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				className: BrowserView_module_css_default.toolbar,
				role: "toolbar",
				"aria-label": t("toolbar.label"),
				onSubmit: navigate,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: () => t("action.back"),
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: BrowserView_module_css_default.iconButton,
							type: "button",
							"aria-label": t("action.back"),
							disabled: !canGoBack,
							onClick: () => {
								move(actions.back);
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {})
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: () => t("action.forward"),
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: BrowserView_module_css_default.iconButton,
							type: "button",
							"aria-label": t("action.forward"),
							disabled: !canGoForward,
							onClick: () => {
								move(actions.forward);
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, {})
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: () => t("action.reload"),
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: BrowserView_module_css_default.iconButton,
							type: "button",
							"aria-label": t("action.reload"),
							disabled: currentUrl === null,
							onClick: () => {
								move(actions.reload);
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, {})
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
						className: BrowserView_module_css_default.address ?? "",
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutline14, {}),
						"aria-label": t("address.label"),
						placeholder: t("address.placeholder"),
						autoCapitalize: "none",
						autoCorrect: "off",
						spellCheck: false,
						value: address,
						onChange: (event) => {
							actions.setAddress(event.currentTarget.value);
							setError(null);
						},
						onKeyDown: (event) => {
							if (event.key !== "Enter") return;
							event.preventDefault();
							event.currentTarget.form?.requestSubmit();
						}
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: `${BrowserView_module_css_default.root} ${composerInputHeader === null ? BrowserView_module_css_default.inline : ""}`,
				"data-conversation-composer-overlay": "",
				children: [composerInputHeader === null ? toolbar : (0, react_dom.createPortal)(toolbar, composerInputHeader), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: BrowserView_module_css_default.viewport,
					"data-browser-viewport": "",
					children: [
						error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: BrowserView_module_css_default.notice,
							role: "alert",
							children: t(`error.${error}`)
						}),
						loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: BrowserView_module_css_default.status,
							role: "status",
							children: t("status.loading")
						}),
						currentUrl === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: BrowserView_module_css_default.empty,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: BrowserView_module_css_default.emptyIcon,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutline14, { size: 26 })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("empty.title") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("empty.description") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("empty.limit") })
							]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
							className: BrowserView_module_css_default.frame,
							title: t("frame.title"),
							src: currentUrl,
							sandbox: FRAME_SANDBOX,
							referrerPolicy: "no-referrer",
							loading: "eager",
							onLoad: () => {
								setLoading(false);
							},
							onErrorCapture: () => {
								setLoading(false);
								setError("frame");
							}
						}, `${currentUrl}\u0000${revision}`)
					]
				})]
			});
		}
		//#endregion
		//#region src/client/browser-store.ts
		/** Per-session address and toolbar-owned navigation history. */
		/**
		* Declare an exclusive browser store for one session view entry.
		* @returns the store handle consumed by the slot renderer.
		*/
		function createBrowserViewStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
				init: () => ({
					address: "",
					history: [],
					cursor: -1,
					revision: 0
				}),
				actions: {
					setAddress: (draft, address) => {
						draft.address = address;
					},
					navigate: (draft, url) => {
						const current = draft.history[draft.cursor];
						draft.address = url;
						if (current !== url) {
							draft.history.splice(draft.cursor + 1);
							draft.history.push(url);
							draft.cursor = draft.history.length - 1;
						}
						draft.revision += 1;
					},
					back: (draft) => {
						if (draft.cursor <= 0) return;
						const target = draft.history[draft.cursor - 1];
						if (target === void 0) return;
						draft.cursor -= 1;
						draft.address = target;
						draft.revision += 1;
					},
					forward: (draft) => {
						if (draft.cursor >= draft.history.length - 1) return;
						const target = draft.history[draft.cursor + 1];
						if (target === void 0) return;
						draft.cursor += 1;
						draft.address = target;
						draft.revision += 1;
					},
					reload: (draft) => {
						const current = draft.history[draft.cursor];
						if (current === void 0) return;
						draft.address = current;
						draft.revision += 1;
					}
				}
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Browser view dictionaries. */
		/** Locale namespace owned by this package. */
		const NS = "browser";
		/** Simplified Chinese browser copy. */
		const zh = {
			"view.browser": "浏览器",
			"toolbar.label": "浏览器工具栏",
			"address.label": "地址",
			"address.placeholder": "输入网址或 localhost 地址",
			"action.back": "后退",
			"action.forward": "前进",
			"action.reload": "刷新",
			"empty.title": "打开网页",
			"empty.description": "输入 HTTP(S) 地址，在当前任务中检查网页。",
			"empty.limit": "部分网站不允许嵌入，可能无法在此处显示。",
			"frame.title": "浏览器内容",
			"status.loading": "正在加载页面…",
			"error.empty": "请输入要打开的地址。",
			"error.invalid": "无法识别这个地址。",
			"error.credentials": "地址中不能包含用户名或密码。",
			"error.unsupported": "只能打开 HTTP 和 HTTPS 地址。",
			"error.frame": "无法在此处加载这个网页。"
		};
		/** English browser copy. */
		const en = {
			"view.browser": "Browser",
			"toolbar.label": "Browser toolbar",
			"address.label": "Address",
			"address.placeholder": "Enter a website or localhost address",
			"action.back": "Back",
			"action.forward": "Forward",
			"action.reload": "Reload",
			"empty.title": "Open a page",
			"empty.description": "Enter an HTTP(S) address to inspect a page in this task.",
			"empty.limit": "Some sites block embedding and may not render here.",
			"frame.title": "Browser content",
			"status.loading": "Loading page…",
			"error.empty": "Enter an address to open.",
			"error.invalid": "This address could not be recognized.",
			"error.credentials": "Addresses cannot include a username or password.",
			"error.unsupported": "Only HTTP and HTTPS addresses can be opened.",
			"error.frame": "This page could not be loaded here."
		};
		//#endregion
		//#region src/client/index.ts
		/** Services required by the browser view registration. */
		const inject = ["slots", "locale"];
		/**
		* Register the browser dictionaries and session-scoped conversation tab.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "conversation-browser: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "browser",
				order: 20,
				locale: NS,
				label: () => t("view.browser"),
				store: createBrowserViewStore
			}, BrowserView));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map