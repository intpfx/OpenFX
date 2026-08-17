import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconChevronLeftOutline14, IconChevronRightOutline14, IconGlobeOutline14, IconRefreshOutline16, Input, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { normalizeBrowserAddress } from "./browser-address.js";
import css from './BrowserView.module.css';
/** Browser address controls shown inside the composer card while the Browser view is mounted. */
export function BrowserAddressOverlay({ useStore, actions, t }) {
    const { active, address, history, cursor } = useStore(state => state);
    const currentUrl = history[cursor] ?? null;
    const canGoBack = cursor > 0;
    const canGoForward = cursor >= 0 && cursor < history.length - 1;
    if (!active)
        return null;
    const navigate = (event) => {
        event.preventDefault();
        const result = normalizeBrowserAddress(address);
        if (!result.ok) {
            actions.fail(result.reason);
            return;
        }
        actions.navigate(result.url);
    };
    return (_jsx("div", { className: css.addressOverlay, "data-browser-address-overlay": "", children: _jsxs("form", { className: css.toolbar, role: "toolbar", "aria-label": t('toolbar.label'), onSubmit: navigate, children: [_jsx(Tooltip, { label: () => t('action.back'), side: "bottom", children: _jsx("button", { className: css.iconButton, type: "button", "aria-label": t('action.back'), disabled: !canGoBack, onClick: actions.back, children: _jsx(IconChevronLeftOutline14, {}) }) }), _jsx(Tooltip, { label: () => t('action.forward'), side: "bottom", children: _jsx("button", { className: css.iconButton, type: "button", "aria-label": t('action.forward'), disabled: !canGoForward, onClick: actions.forward, children: _jsx(IconChevronRightOutline14, {}) }) }), _jsx(Tooltip, { label: () => t('action.reload'), side: "bottom", children: _jsx("button", { className: css.iconButton, type: "button", "aria-label": t('action.reload'), disabled: currentUrl === null, onClick: actions.reload, children: _jsx(IconRefreshOutline16, {}) }) }), _jsx(Input, { className: css.address ?? '', icon: _jsx(IconGlobeOutline14, {}), "aria-label": t('address.label'), placeholder: t('address.placeholder'), autoCapitalize: "none", autoCorrect: "off", spellCheck: false, value: address, onChange: (event) => { actions.setAddress(event.currentTarget.value); }, onKeyDown: (event) => {
                        if (event.key !== 'Enter')
                            return;
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                    } })] }) }));
}
