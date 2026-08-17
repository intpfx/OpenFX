import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Sandboxed browser view with toolbar-owned navigation history. */
import { useEffect } from 'react';
import { IconGlobeOutline14 } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './BrowserView.module.css';
const FRAME_SANDBOX = 'allow-forms allow-modals allow-popups allow-scripts';
/** Browser view registered into the session-scoped conversation view slot. */
export function BrowserView({ useStore, actions, t }) {
    const { history, cursor, revision, loading, error } = useStore(state => state);
    const currentUrl = history[cursor] ?? null;
    useEffect(() => {
        actions.setActive(true);
        return () => { actions.setActive(false); };
    }, [actions]);
    return (_jsx("section", { className: css.root, "data-conversation-composer-overlay": "", children: _jsxs("div", { className: css.viewport, "data-browser-viewport": "", children: [error !== null && (_jsx("div", { className: css.notice, role: "alert", children: t(`error.${error}`) })), loading && _jsx("div", { className: css.status, role: "status", children: t('status.loading') }), currentUrl === null
                    ? (_jsxs("div", { className: css.empty, children: [_jsx("span", { className: css.emptyIcon, children: _jsx(IconGlobeOutline14, { size: 26 }) }), _jsx("h2", { children: t('empty.title') }), _jsx("p", { children: t('empty.description') }), _jsx("small", { children: t('empty.limit') })] }))
                    : (_jsx("iframe", { className: css.frame, title: t('frame.title'), src: currentUrl, sandbox: FRAME_SANDBOX, referrerPolicy: "no-referrer", loading: "eager", onLoad: actions.loaded, onErrorCapture: () => {
                            actions.fail('frame');
                        } }, `${currentUrl}\u0000${revision}`))] }) }));
}
