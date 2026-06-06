// Initialize KV store depending on environment.
// If running on Deno Deploy (DENO_DEPLOY=1) prefer the platform API `Deno.openKv()`;
// otherwise dynamically import `openKv` from `@deno/kv`.
let kv;
const envDenoDeploy = (typeof Deno !== 'undefined' && typeof Deno.env?.get === 'function' && Deno.env.get('DENO_DEPLOY') === '1')
  || (typeof process !== 'undefined' && process?.env && process.env.DENO_DEPLOY === '1');
if (envDenoDeploy && typeof Deno !== 'undefined' && typeof Deno.openKv === 'function') {
  // Use the Deno platform KV (available on Deno Deploy/runtime)
  kv = await Deno.openKv();
} else {
  // Fallback: dynamically import the @deno/kv package (works in environments that provide it)
  try {
    const mod = await import('@deno/kv');
    const openKv = mod.openKv || mod.default?.openKv;
    if (typeof openKv !== 'function') throw new Error('openKv not found in @deno/kv');
    kv = await openKv();
  } catch (err) {
    // If dynamic import failed, surface a clearer error for runtime debugging
    throw err;
  }
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    switch (url.pathname) {
      case "/activate": {
        const payload = await req.json();
        const code = payload.activationCode;
        if (code === "EDITMODE") {
          const items = [];
          for await (const entry of kv.list({ prefix: [] })) {
            items.push({ key: entry.key, value: entry.value });
          }
          return new Response(JSON.stringify({ editMode: true, items }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // 规范化激活码映射：将中文版本名称转换为英文标识
        const normalizeKind = (kind) => {
          const map = {
            '完整版': 'full',
            '专业版': 'pro',
            '企业版': 'enterprise'
          };
          return map[kind] || kind;
        };

        const {value} = await kv.get([code]);
        if (value) {
          const { kind, expiration, codeExp } = value;
          // 检查激活码是否已过期
          const now = Date.now();
          if (codeExp && codeExp < now) {
            return new Response(JSON.stringify({ success: false, message: '激活码已过期' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
          }
          await kv.delete([code]);
          const body = {
            success: true,
            kind: normalizeKind(kind),
            expiration
          }
          return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } else {
          const body = {
            success: false,
            message: '激活码无效或已被使用'
          }
          return new Response(JSON.stringify(body), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
      }
      case "/kv/set": {
        try {
          const body = await req.json();
          const key = body.key;
          const keyPath = body.keyPath; // optional full path array
          const value = body.value;
          if (!key && !Array.isArray(keyPath)) return new Response(JSON.stringify({ success: false, message: 'missing key' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
          const path = Array.isArray(keyPath) ? keyPath : [key];
          await kv.set(path, value);
          const result = await kv.get(path);
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
      }
      case "/kv/list": {
        try {
          const items = [];
          const now = Date.now();
          // Helper to process entries: skip expired ones and delete them from KV
          const processEntry = async (entry) => {
            const v = entry.value;
            // if entry contains a codeExp field, treat it as an activation-code record
            const codeExp = v && (v.codeExp ?? v.codeexp ?? v.expiration ?? v.expireAt);
            // only consider numeric expiration values
            if (typeof codeExp === 'number' && codeExp < now) {
              try {
                await kv.delete(entry.key);
              } catch (delErr) {
                console.log(`[server] /kv/list failed to delete expired key=${JSON.stringify(entry.key)}: ${String(delErr)}`);
              }
              return; // don't include expired item in returned list
            }
            items.push({ key: entry.key, value: entry.value });
          };

          for await (const entry of kv.list({ prefix: [] })) {
            await processEntry(entry);
          }
          return new Response(JSON.stringify({ items }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
      }
      case "/kv/delete": {
        try {
          const body = await req.json();
          const key = body.key;
          const keyPath = body.keyPath; // optional full path array
          if (!key && !Array.isArray(keyPath)) return new Response(JSON.stringify({ success: false, message: 'missing key' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
          const path = Array.isArray(keyPath) ? keyPath : [key];
          await kv.delete(path);
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
      }
    }
}};