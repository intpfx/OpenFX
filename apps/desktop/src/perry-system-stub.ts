const preferenceStore = new Map<string, string>();

export const preferencesGet = (key: string): string | null => {
  return preferenceStore.get(key) ?? null;
};

export const preferencesSet = (key: string, value: string): void => {
  preferenceStore.set(key, value);
};
