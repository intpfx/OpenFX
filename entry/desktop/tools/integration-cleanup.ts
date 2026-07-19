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

export interface BoundedChildOutput {
  success: boolean;
  code: number;
  signal: string | null;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

export interface CollectableChildProcess {
  output(): Promise<BoundedChildOutput>;
  kill(signal: "SIGTERM" | "SIGKILL"): void;
}

export interface CollectBoundedChildOptions {
  deadlineAt: number;
  terminationGraceMs: number;
  terminateImmediately?: boolean;
}

export interface CollectedBoundedChild {
  output: BoundedChildOutput;
  cleanExitTimedOut: boolean;
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

export const collectBoundedChild = async (
  child: CollectableChildProcess,
  options: CollectBoundedChildOptions,
): Promise<CollectedBoundedChild> => {
  const outputPromise = child.output();
  let cleanExitTimedOut = false;

  if (!options.terminateImmediately) {
    const remainingMs = Math.max(1, options.deadlineAt - Date.now());
    const completed = await settleWithin(outputPromise, remainingMs);
    if (completed) return { output: completed, cleanExitTimedOut };
    cleanExitTimedOut = true;
  }

  terminate(child, "SIGTERM");
  const terminated = await settleWithin(
    outputPromise,
    options.terminationGraceMs,
  );
  if (terminated) return { output: terminated, cleanExitTimedOut };

  terminate(child, "SIGKILL");
  const killed = await settleWithin(outputPromise, options.terminationGraceMs);
  if (!killed) {
    throw new Error("child_process_reap_timeout_after_sigkill");
  }
  return { output: killed, cleanExitTimedOut };
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
  child: Pick<BoundedChildProcess, "kill">,
  signal: "SIGTERM" | "SIGKILL",
): void => {
  try {
    child.kill(signal);
  } catch {
    // The process may have exited between the timeout and termination attempt.
  }
};
