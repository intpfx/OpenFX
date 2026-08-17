export function createPrivateMeshCatalogRefreshQueue(
  refresh: (nodeId: string) => Promise<void>,
) {
  const pending = new Set<string>();
  const running = new Map<string, Promise<void>>();

  function start(nodeId: string): void {
    if (running.has(nodeId)) return;
    const task = (async () => {
      while (pending.delete(nodeId)) await refresh(nodeId);
    })();
    running.set(nodeId, task);
    void task.finally(() => {
      running.delete(nodeId);
      if (pending.has(nodeId)) start(nodeId);
    }).catch(() => undefined);
  }

  function schedule(nodeId: string): void {
    pending.add(nodeId);
    start(nodeId);
  }

  function cancel(nodeId: string): void {
    pending.delete(nodeId);
  }

  async function whenIdle(): Promise<void> {
    while (running.size > 0) {
      await Promise.allSettled(running.values());
    }
  }

  return {
    schedule,
    cancel,
    clear: () => pending.clear(),
    whenIdle,
  };
}
