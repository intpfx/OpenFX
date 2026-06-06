type TaskHandle = ReturnType<typeof setInterval>;

const tasks = new Map<string, TaskHandle>();

export function registerIntervalTask(
  name: string,
  intervalMs: number,
  handler: () => Promise<unknown> | unknown,
): void {
  stopTask(name);
  const handle = setInterval(() => {
    void handler();
  }, intervalMs);
  tasks.set(name, handle);
}

export function stopTask(name: string): void {
  const handle = tasks.get(name);
  if (!handle) {
    return;
  }
  clearInterval(handle);
  tasks.delete(name);
}

export function stopAllTasks(): void {
  for (const name of tasks.keys()) {
    stopTask(name);
  }
}
