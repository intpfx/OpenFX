/** Browser view dictionaries. */
/** Locale namespace owned by this package. */
export declare const NS = "browser";
/** Simplified Chinese browser copy. */
export declare const zh: {
    readonly 'view.browser': "浏览器";
    readonly 'toolbar.label': "浏览器工具栏";
    readonly 'address.label': "地址";
    readonly 'address.placeholder': "输入网址或 localhost 地址";
    readonly 'action.back': "后退";
    readonly 'action.forward': "前进";
    readonly 'action.reload': "刷新";
    readonly 'empty.title': "打开网页";
    readonly 'empty.description': "输入 HTTP(S) 地址，在当前任务中检查网页。";
    readonly 'empty.limit': "部分网站不允许嵌入，可能无法在此处显示。";
    readonly 'frame.title': "浏览器内容";
    readonly 'status.loading': "正在加载页面…";
    readonly 'error.empty': "请输入要打开的地址。";
    readonly 'error.invalid': "无法识别这个地址。";
    readonly 'error.credentials': "地址中不能包含用户名或密码。";
    readonly 'error.unsupported': "只能打开 HTTP 和 HTTPS 地址。";
    readonly 'error.frame': "无法在此处加载这个网页。";
};
/** English browser copy. */
export declare const en: Record<keyof typeof zh, string>;
/** Translation keys accepted by the browser view. */
export type BrowserKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Browser view tab, toolbar, status, and failure strings. */
        browser: BrowserKey;
    }
}
//# sourceMappingURL=locales.d.ts.map