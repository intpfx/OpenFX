import type { SystemSnapshot } from "@freemac/shared";

interface Props {
  snapshot: SystemSnapshot | null;
}

export function TopProcesses({ snapshot }: Props) {
  const processes = snapshot?.topProcesses.slice(0, 6) || [];

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Top processes</h2>
      </div>
      {processes.length ? (
        <div className="process-list">
          {processes.map((proc) => (
            <article key={proc.pid} className="process-row">
              <div>
                <strong>{proc.command}</strong>
                <small>PID {proc.pid}</small>
              </div>
              <div className="process-meta">
                <span>{proc.cpu.toFixed(1)}% CPU</span>
                <span>{proc.memory.toFixed(1)}% MEM</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="helper-text">No process data yet.</p>
      )}
    </section>
  );
}
