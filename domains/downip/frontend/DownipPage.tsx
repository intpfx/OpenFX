export function DownipPage() {
  return (
    <div className="content-shell">
      <button
        className="back-link"
        onClick={() => {
          globalThis.history.pushState({}, "", "/");
          globalThis.dispatchEvent(new PopStateEvent("popstate"));
        }}
        type="button"
      >
        返回首页
      </button>

      <section className="hero-card">
        <p className="eyebrow">核心能力</p>
        <h1>DownIP</h1>
        <p className="lede">
          IPv6 动态映射服务。客户端向 /update 上报，服务端按 key 执行重定向。
        </p>
      </section>

      <section className="info-grid">
        <article className="info-card">
          <h2>接口</h2>
          <ul>
            <li>POST /update：写入 key {"->"} IPv6 映射</li>
            <li>GET /update：读取当前映射</li>
            <li>GET /:key/*：按 key 重定向到目标 IPv6 服务</li>
          </ul>
        </article>

        <article className="info-card">
          <h2>上报示例</h2>
          <pre className="code-block">{JSON.stringify({ home: { ipv6: "2001:db8::1", port: 3000 } }, null, 2)}</pre>
        </article>

        <article className="info-card">
          <h2>可选代理</h2>
          <p>部署环境设置 OPENFX_PROXY_UPSTREAM 后，可通过 /api/proxy/* 转发请求。</p>
        </article>
      </section>
    </div>
  );
}
