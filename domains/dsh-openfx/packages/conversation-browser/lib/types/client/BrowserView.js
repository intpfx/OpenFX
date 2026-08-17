import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Sandboxed browser view with toolbar-owned navigation history. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronLeftOutline14, IconChevronRightOutline14, IconGlobeOutline14, IconRefreshOutline16, Input, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { normalizeBrowserAddress } from "./browser-address.js";
import css from './BrowserView.module.css';
const FRAME_SANDBOX = 'allow-forms allow-modals allow-popups allow-scripts';
function useComposerInputHeader() {
    const [host, setHost] = useState(null);
    useEffect(() => {
        const refresh = () => {
            setHost(document.querySelector('[data-conversation-input-header]'));
        };
        refresh();
        const observer = new MutationObserver(refresh);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => { observer.disconnect(); };
    }, []);
    return host;
}
/** Browser view registered into the session-scoped conversation view slot. */
export function BrowserView({ useStore, actions, t }) {
    const { address, history, cursor, revision } = useStore(state => state);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
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
    const toolbar = (_jsxs("form", { className: css.toolbar, role: "toolbar", "aria-label": t('toolbar.label'), onSubmit: navigate, children: [_jsx(Tooltip, { label: () => t('action.back'), side: "bottom", children: _jsx("button", { className: css.iconButton, type: "button", "aria-label": t('action.back'), disabled: !canGoBack, onClick: () => { move(actions.back); }, children: _jsx(IconChevronLeftOutline14, {}) }) }), _jsx(Tooltip, { label: () => t('action.forward'), side: "bottom", children: _jsx("button", { className: css.iconButton, type: "button", "aria-label": t('action.forward'), disabled: !canGoForward, onClick: () => { move(actions.forward); }, children: _jsx(IconChevronRightOutline14, {}) }) }), _jsx(Tooltip, { label: () => t('action.reload'), side: "bottom", children: _jsx("button", { className: css.iconButton, type: "button", "aria-label": t('action.reload'), disabled: currentUrl === null, onClick: () => { move(actions.reload); }, children: _jsx(IconRefreshOutline16, {}) }) }), _jsx(Input, { className: css.address ?? '', icon: _jsx(IconGlobeOutline14, {}), "aria-label": t('address.label'), placeholder: t('address.placeholder'), autoCapitalize: "none", autoCorrect: "off", spellCheck: false, value: address, onChange: (event) => {
                    actions.setAddress(event.currentTarget.value);
                    setError(null);
                }, onKeyDown: (event) => {
                    if (event.key !== 'Enter')
                        return;
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                } })] }));
    return (_jsxs("section", { className: `${css.root} ${composerInputHeader === null ? css.inline : ''}`, "data-conversation-composer-overlay": "", children: [composerInputHeader === null ? toolbar : createPortal(toolbar, composerInputHeader), _jsxs("div", { className: css.viewport, "data-browser-viewport": "", children: [error !== null && (_jsx("div", { className: css.notice, role: "alert", children: t(`error.${error}`) })), loading && _jsx("div", { className: css.status, role: "status", children: t('status.loading') }), currentUrl === null
                        ? (_jsxs("div", { className: css.empty, children: [_jsx("span", { className: css.emptyIcon, children: _jsx(IconGlobeOutline14, { size: 26 }) }), _jsx("h2", { children: t('empty.title') }), _jsx("p", { children: t('empty.description') }), _jsx("small", { children: t('empty.limit') })] }))
                        : (_jsx("iframe", { className: css.frame, title: t('frame.title'), src: currentUrl, sandbox: FRAME_SANDBOX, referrerPolicy: "no-referrer", loading: "eager", onLoad: () => { setLoading(false); }, onErrorCapture: () => {
                                setLoading(false);
                                setError('frame');
                            } }, `${currentUrl}\u0000${revision}`))] })] }));
}
