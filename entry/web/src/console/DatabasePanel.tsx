import { type FormEvent, useEffect, useMemo, useState } from "react";

type KeyPart = string | number | boolean;
type KvEntry = { key: KeyPart[]; value: unknown; versionstamp: string };

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

export function DatabasePanel() {
  const [entries, setEntries] = useState<KvEntry[]>([]);
  const [prefix, setPrefix] = useState("[]");
  const [query, setQuery] = useState("");
  const [keyText, setKeyText] = useState('["openfx-console", "example"]');
  const [valueText, setValueText] = useState("{}");
  const [status, setStatus] = useState("准备读取数据库");
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? entries.filter((entry) => pretty(entry.key).toLowerCase().includes(needle))
      : entries;
  }, [entries, query]);

  async function load() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(prefix);
      if (!Array.isArray(parsed)) throw new Error();
    } catch {
      setStatus("Prefix 必须是 JSON 数组");
      return;
    }
    setBusy(true);
    try {
      const params = new URLSearchParams({ prefix: pretty(parsed), limit: "1000" });
      const response = await fetch(`/api/admin/kv?${params}`, {
        credentials: "same-origin",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.hint ?? payload.error ?? "读取失败");
      setEntries(Array.isArray(payload.entries) ? payload.entries : []);
      setStatus(`已读取 ${payload.entries?.length ?? 0} 条记录`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "读取失败");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    let key: unknown;
    let value: unknown;
    try {
      key = JSON.parse(keyText);
      value = JSON.parse(valueText);
      if (!Array.isArray(key) || key.length === 0) throw new Error();
    } catch {
      setStatus("Key 与 Value 必须是合法 JSON，Key 需要非空数组");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/kv", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "保存失败");
      setStatus("记录已保存");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
      setBusy(false);
    }
  }

  async function remove(key: KeyPart[]) {
    setBusy(true);
    try {
      const params = new URLSearchParams({ key: pretty(key) });
      const response = await fetch(`/api/admin/kv?${params}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "删除失败");
      setStatus("记录已删除");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "删除失败");
      setBusy(false);
    }
  }

  useEffect(() => void load(), []);

  return (
    <div className="console-database">
      <div className="console-db-browser">
        <div className="console-section-heading">
          <div>
            <span>Deno KV</span>
            <h3>记录</h3>
          </div>
          <button disabled={busy} onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
        <label className="console-search">
          <span>Prefix</span>
          <input value={prefix} onChange={(event) => setPrefix(event.target.value)} />
        </label>
        <label className="console-search">
          <span>筛选</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p className="console-inline-status" role="status">{status}</p>
        <div className="console-db-list">
          {filtered.map((entry) => (
            <button
              type="button"
              key={pretty(entry.key)}
              onClick={() => {
                setKeyText(pretty(entry.key));
                setValueText(pretty(entry.value));
              }}
            >
              <code>{entry.key.map(String).join(" / ")}</code>
              <span>{entry.versionstamp?.slice(-8) || "new"}</span>
            </button>
          ))}
        </div>
      </div>
      <form className="console-db-editor" onSubmit={save}>
        <div className="console-section-heading">
          <div>
            <span>JSON</span>
            <h3>编辑记录</h3>
          </div>
        </div>
        <label>
          <span>完整 Key</span>
          <textarea
            value={keyText}
            onChange={(event) => setKeyText(event.target.value)}
          />
        </label>
        <label>
          <span>Value</span>
          <textarea
            className="console-db-value"
            value={valueText}
            onChange={(event) => setValueText(event.target.value)}
          />
        </label>
        <div className="console-form-actions">
          <button
            type="button"
            onClick={() => {
              try {
                setValueText(pretty(JSON.parse(valueText)));
              } catch {
                setStatus("Value 不是合法 JSON");
              }
            }}
          >
            格式化
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                void remove(JSON.parse(keyText));
              } catch {
                setStatus("Key 不是合法 JSON");
              }
            }}
          >
            删除
          </button>
          <button className="primary" disabled={busy} type="submit">保存</button>
        </div>
      </form>
    </div>
  );
}
