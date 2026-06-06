import type { SystemSnapshot } from "@freemac/shared";

interface Props {
  snapshot: SystemSnapshot | null;
}

export function SystemCards({ snapshot }: Props) {
  const metrics = [
    {
      label: "CPU",
      value: snapshot ? `${snapshot.cpuUsagePercent.toFixed(1)}%` : "--",
    },
    {
      label: "Memory",
      value: snapshot ? `${snapshot.memoryUsedMb} / ${snapshot.memoryTotalMb} MB` : "--",
    },
    {
      label: "Disk",
      value: snapshot ? `${snapshot.diskUsedGb} / ${snapshot.diskTotalGb} GB` : "--",
    },
    {
      label: "Network",
      value: snapshot ? `RX ${snapshot.networkRxMb} / TX ${snapshot.networkTxMb} MB` : "--",
    },
  ];

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>System snapshot</h2>
      </div>
      <div className="metric-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="metric-card">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
