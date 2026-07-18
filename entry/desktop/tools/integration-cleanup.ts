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
