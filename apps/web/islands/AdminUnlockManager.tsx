import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

type HiddenProject = {
  id: string;
  name: string;
  description: string;
};

type UnlockRule = {
  key: string;
  label: string;
  projectIds: string[];
  hint?: string;
};

export default function AdminUnlockManager(props: { hiddenProjects: HiddenProject[] }) {
  const adminKey = useSignal("");
  const rules = useSignal<UnlockRule[]>([]);
  const status = useSignal("请输入管理密钥以加载 unlock 配置");
  const key = useSignal("");
  const label = useSignal("");
  const hint = useSignal("");
  const selectedIds = useSignal<string[]>([]);

  async function loadRules() {
    if (!adminKey.value.trim()) {
      status.value = "请输入管理密钥";
      return;
    }

    const res = await fetch("/api/admin/unlocks", {
      headers: { "x-openfx-admin-key": adminKey.value.trim() },
    });
    const json = await res.json();
    if (!res.ok) {
      status.value = json.error ?? "加载失败";
      return;
    }

    rules.value = json.rules;
    status.value = `已加载 ${json.rules.length} 条 unlock 配置`;
    localStorage.setItem("openfx_admin_key", adminKey.value.trim());
  }

  async function saveRule() {
    const res = await fetch("/api/admin/unlocks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-openfx-admin-key": adminKey.value.trim(),
      },
      body: JSON.stringify({
        key: key.value,
        label: label.value,
        hint: hint.value,
        projectIds: selectedIds.value,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      status.value = json.error ?? "保存失败";
      return;
    }

    key.value = "";
    label.value = "";
    hint.value = "";
    selectedIds.value = [];
    await loadRules();
  }

  async function removeRule(targetKey: string) {
    const res = await fetch(`/api/admin/unlocks?key=${encodeURIComponent(targetKey)}`, {
      method: "DELETE",
      headers: { "x-openfx-admin-key": adminKey.value.trim() },
    });
    const json = await res.json();
    if (!res.ok) {
      status.value = json.error ?? "删除失败";
      return;
    }
    await loadRules();
  }

  useEffect(() => {
    const stored = localStorage.getItem("openfx_admin_key") ?? "";
    if (stored) {
      adminKey.value = stored;
      void loadRules();
    }
  }, []);

  return (
    <section class="admin-panel">
      <div class="admin-auth">
        <input
          type="password"
          placeholder="Admin key"
          value={adminKey.value}
          onInput={(e) => adminKey.value = (e.target as HTMLInputElement).value}
        />
        <button type="button" onClick={() => void loadRules()}>Load</button>
      </div>

      <p class="admin-status">{status.value}</p>

      <div class="admin-form">
        <input
          type="text"
          placeholder="unlock key"
          value={key.value}
          onInput={(e) => key.value = (e.target as HTMLInputElement).value}
        />
        <input
          type="text"
          placeholder="label"
          value={label.value}
          onInput={(e) => label.value = (e.target as HTMLInputElement).value}
        />
        <input
          type="text"
          placeholder="hint (optional)"
          value={hint.value}
          onInput={(e) => hint.value = (e.target as HTMLInputElement).value}
        />
        <div class="admin-projects">
          {props.hiddenProjects.map((project) => (
            <label>
              <input
                type="checkbox"
                checked={selectedIds.value.includes(project.id)}
                onChange={(e) => {
                  const checked = (e.target as HTMLInputElement).checked;
                  selectedIds.value = checked
                    ? [...selectedIds.value, project.id]
                    : selectedIds.value.filter((id) => id !== project.id);
                }}
              />
              <span>{project.name}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => void saveRule()}>Save Rule</button>
      </div>

      <div class="admin-rules">
        {rules.value.map((rule) => (
          <article class="admin-rule">
            <strong>{rule.label}</strong>
            <span>{rule.key}</span>
            <span>{rule.projectIds.join(", ")}</span>
            <button type="button" onClick={() => void removeRule(rule.key)}>Delete</button>
          </article>
        ))}
      </div>
    </section>
  );
}
