import { type FormEvent, useEffect, useMemo, useState } from "react";

import { listHiddenHomepageProjects } from "../../homepage-projects.ts";

type UnlockRule = {
  key: string;
  label: string;
  projectIds: string[];
  expiresAt: string;
};

const defaultExpiry = () => {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
};

export function AccessRulesPanel() {
  const projects = useMemo(() => listHiddenHomepageProjects(), []);
  const names = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const [rules, setRules] = useState<UnlockRule[]>([]);
  const [status, setStatus] = useState("读取中");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    label: "",
    expiresAt: defaultExpiry(),
    projectIds: [] as string[],
  });

  async function load() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/unlocks", {
        credentials: "same-origin",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "规则读取失败");
      setRules(Array.isArray(payload.rules) ? payload.rules : []);
      setStatus(`共 ${payload.rules?.length ?? 0} 条规则`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "规则读取失败");
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/admin/unlocks", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "规则保存失败");
      setForm({ label: "", expiresAt: defaultExpiry(), projectIds: [] });
      setStatus(`已生成访问码 ${payload.rule?.key ?? ""}`);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "规则保存失败");
      setBusy(false);
    }
  }

  async function remove(key: string) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/unlocks?key=${encodeURIComponent(key)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "删除失败");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "删除失败");
      setBusy(false);
    }
  }

  useEffect(() => void load(), []);

  return (
    <div className="console-stack">
      <form className="console-form" onSubmit={create}>
        <div className="console-section-heading">
          <div>
            <span>新规则</span>
            <h3>创建访问规则</h3>
          </div>
          <button disabled={busy} type="submit">生成访问码</button>
        </div>
        <div className="console-form-grid">
          <label>
            <span>名称</span>
            <input
              required
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
              placeholder="临时演示"
            />
          </label>
          <label>
            <span>失效时间</span>
            <input
              required
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
            />
          </label>
        </div>
        <fieldset className="console-check-list">
          <legend>开放项目</legend>
          {projects.map((project) => (
            <label key={project.id}>
              <input
                type="checkbox"
                checked={form.projectIds.includes(project.id)}
                onChange={(event) =>
                  setForm({
                    ...form,
                    projectIds: event.target.checked
                      ? [...form.projectIds, project.id]
                      : form.projectIds.filter((id) => id !== project.id),
                  })}
              />
              <span>{project.name}</span>
            </label>
          ))}
        </fieldset>
      </form>

      <section>
        <div className="console-section-heading">
          <div>
            <span>已生效</span>
            <h3>访问规则</h3>
          </div>
          <button disabled={busy} type="button" onClick={() => void load()}>
            刷新
          </button>
        </div>
        <p className="console-inline-status" role="status">{status}</p>
        <div className="console-rule-list">
          {rules.map((rule) => (
            <article key={rule.key}>
              <div>
                <strong>{rule.label}</strong>
                <code>{rule.key}</code>
              </div>
              <p>
                {rule.projectIds.map((id) => names.get(id) ?? id).join("、") ||
                  "未选择项目"}
              </p>
              <time dateTime={rule.expiresAt}>
                {new Date(rule.expiresAt).toLocaleString("zh-CN")}
              </time>
              <button type="button" onClick={() => void remove(rule.key)}>删除</button>
            </article>
          ))}
          {!busy && rules.length === 0
            ? <p className="console-empty">暂无访问规则</p>
            : null}
        </div>
      </section>
    </div>
  );
}
