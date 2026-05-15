/** 要代理的网站域名 */
const HOST = "192.168.31.53:3000"; // 改我就行了
const PORT = 8464; // 本地运行时没有TLS证书 选择80端口 如果有证书可以选择443端口 或任意未被占用的端口 在访问时需在末尾加上端口号

/** 复制头部 */
const copyHeaders = (headers: Headers) => {
  const newHeader = new Headers();
  for (const i of headers.entries()) {
    newHeader.append(...i);
  }
  return newHeader;
};
/** 重写请求头部信息 */
const ReqHeadersRewrite = (req: Request, Url: URL) => {
  const newH = copyHeaders(req.headers);
  newH.delete("X-deno-transparent");
  // 重写 referer 和 origin 保证能够获取到数据
  newH.set("referer", Url.toString());
  newH.set("origin", Url.toString());
  return newH;
};
/** 重写响应头部信息 */
const ResHeadersReWrite = (res: Response, domain: string) => {
  const newHeader = copyHeaders(res.headers);
  newHeader.set("access-control-allow-origin", "*");
  const cookie = newHeader.get("set-cookie");
  cookie && newHeader.set("set-cookie", cookie.replace(/domain=(.+?);/, `domain=${domain};`));
  newHeader.delete("X-Frame-Options"); // 防止不准 iframe 嵌套
  return newHeader;
};
/** 代理整个网站，包括所有请求模式 */
const proxy = async (host: string, req: Request) => {
  const Url = new URL(req.url);
  Url.host = host;
  if (Url instanceof Response) return Url;
  const newH = ReqHeadersRewrite(req, Url);

  const res = await fetch(Url, {
    headers: newH,
    method: req.method,
    body: req.body,
    redirect: req.redirect,
  });
  const newHeader = ResHeadersReWrite(res, new URL(req.url).host);
  const config = {
    status: res.status,
    statusText: res.statusText,
    headers: newHeader,
  };
  console.log(res.status, res.url);
  if (res.status >= 300 && res.status < 400) {
    console.log("重定向至", req.url);
    return Response.redirect(req.url, res.status);
  }
  return new Response(res.body, config);
};

// 启动代理服务 开启IPv6监听以便外网直接通过公网IPV6访问
Deno.serve({ hostname: "::", port: PORT }, async (req: Request) => {
  try {
    return await proxy(HOST, req);
  } catch (e) {
    return new Response(JSON.stringify({ error: e, code: 100 }), {
      headers: {
        "access-control-allow-origin": "*",
      },
    });
  }
});