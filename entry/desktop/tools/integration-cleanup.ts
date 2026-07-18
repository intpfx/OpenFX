export interface IntegrationIdentity {
  origin: string;
  cookie: string;
  keychainService: string;
  nodeId: string;
}

export interface IntegrationIdentityCleanup {
  revokeNode(origin: string, cookie: string): Promise<void>;
  deleteKeychainAccount(service: string, account: string): Promise<void>;
  deleteKeychainService(service: string): Promise<void>;
}

export interface BoundedChildProcess {
  readonly status: Promise<{ success: boolean }>;
  kill(signal: "SIGTERM" | "SIGKILL"): void;
}

export interface BoundedCommandOptions {
  timeoutMs: number;
  terminationGraceMs: number;
}

export const runBoundedCommand = async (
  spawn: () => BoundedChildProcess,
  options: BoundedCommandOptions,
): Promise<boolean> => {
  let child: BoundedChildProcess;
  try {
    child = spawn();
  } catch {
    return false;
  }
  const completed = await settleWithin(child.status, options.timeoutMs);
  if (completed) return completed.success;

  terminate(child, "SIGTERM");
  if (await settleWithin(child.status, options.terminationGraceMs)) return false;

  terminate(child, "SIGKILL");
  await settleWithin(child.status, options.terminationGraceMs);
  return false;
};

export const cleanupIntegrationIdentity = async (
  identity: IntegrationIdentity,
  cleanup: IntegrationIdentityCleanup,
): Promise<void> => {
  if (identity.origin && identity.cookie) {
    await ignoreCleanupFailure(() =>
      cleanup.revokeNode(identity.origin, identity.cookie)
    );
  }
  if (identity.keychainService && identity.nodeId) {
    await ignoreCleanupFailure(() =>
      cleanup.deleteKeychainAccount(identity.keychainService, identity.nodeId)
    );
  }
  if (identity.keychainService) {
    await ignoreCleanupFailure(() =>
      cleanup.deleteKeychainService(identity.keychainService)
    );
  }
};

const ignoreCleanupFailure = async (
  operation: () => Promise<void>,
): Promise<void> => {
  try {
    await operation();
  } catch {
    // Cleanup must continue so one unavailable resource cannot leak another one.
  }
};

const settleWithin = <T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), Math.max(1, timeoutMs));
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });

const terminate = (
  child: BoundedChildProcess,
  signal: "SIGTERM" | "SIGKILL",
): void => {
  try {
    child.kill(signal);
  } catch {
    // The process may have exited between the timeout and termination attempt.
  }
};
