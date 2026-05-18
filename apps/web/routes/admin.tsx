import AdminUnlockManager from "../islands/AdminUnlockManager.tsx";
import { listHiddenHomepageProjects } from "../homepage-projects.ts";

const hiddenProjects = listHiddenHomepageProjects().map((project) => ({
  id: project.id,
  name: project.name,
  description: project.description,
}));

export default function AdminPage() {
  return (
    <html lang="zh">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>OpenFX Admin</title>
        <style>{`
          body { margin: 0; font-family: 'Space Grotesk', system-ui, sans-serif; background: #f7f8fb; color: #172033; }
          main { max-width: 960px; margin: 0 auto; padding: 3rem 1.5rem; }
          h1 { margin-bottom: 0.75rem; }
          .admin-panel { display: grid; gap: 1rem; }
          .admin-auth, .admin-form { display: grid; gap: 0.75rem; }
          .admin-auth { grid-template-columns: 1fr auto; }
          input, button { padding: 0.7rem 0.9rem; border: 1px solid #ccd2df; border-radius: 4px; font: inherit; }
          button { cursor: pointer; background: #2457ff; color: white; border-color: #2457ff; }
          .admin-projects { display: grid; gap: 0.5rem; }
          .admin-projects label, .admin-rule { display: flex; gap: 0.65rem; align-items: center; }
          .admin-rule { justify-content: space-between; padding: 0.8rem 1rem; background: white; border: 1px solid #dbe1ed; border-radius: 4px; }
          .admin-status { color: #4c5a75; }
        `}</style>
      </head>
      <body>
        <main>
          <h1>Unlock Key Admin</h1>
          <p>默认只有环境变量中的管理密钥可以进入这里，其他 unlock key 都在此处配置可见业务。</p>
          <AdminUnlockManager hiddenProjects={hiddenProjects} />
        </main>
      </body>
    </html>
  );
}
