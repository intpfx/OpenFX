import {
  type DrawingDocument,
  parseDrawingDocument,
  serializeDrawingDocument,
} from "./drawing-document.ts";

const CATALOG_PATHS = ["catalog-a.json", "catalog-b.json"] as const;

export type TextStore = Readonly<{
  readText(path: string): Promise<string | null>;
  writeText(path: string, contents: string): Promise<void>;
}>;

export type DrawingLibraryItem = Readonly<{
  document: DrawingDocument;
  revision: number;
}>;

export type DrawingLibrarySnapshot = Readonly<{
  version: 1;
  generation: number;
  activeDocumentId: string;
  items: readonly DrawingLibraryItem[];
}>;

type DrawingCatalog = Readonly<{
  version: 1;
  generation: number;
  activeDocumentId: string;
  items: readonly Readonly<{ id: string; revision: number }>[];
}>;

type BootstrapOptions = Readonly<{
  legacyDocument: DrawingDocument | null;
  createFresh: () => DrawingDocument;
}>;

function documentPath(id: string, revision: number): string {
  return `documents/${encodeURIComponent(id)}/revision-${revision}.json`;
}

function parseCatalog(source: string): DrawingCatalog {
  const value: unknown = JSON.parse(source);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("OpenInk 画稿目录无法解析");
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 || !Number.isSafeInteger(record.generation) ||
    (record.generation as number) < 1 ||
    typeof record.activeDocumentId !== "string" || !Array.isArray(record.items)
  ) {
    throw new Error("OpenInk 画稿目录内容损坏");
  }
  const items = record.items.map((item) => {
    if (
      typeof item !== "object" || item === null || Array.isArray(item) ||
      typeof (item as Record<string, unknown>).id !== "string" ||
      !Number.isSafeInteger((item as Record<string, unknown>).revision) ||
      ((item as Record<string, unknown>).revision as number) < 1
    ) {
      throw new Error("OpenInk 画稿目录内容损坏");
    }
    return {
      id: (item as Record<string, unknown>).id as string,
      revision: (item as Record<string, unknown>).revision as number,
    };
  });
  const ids = items.map((item) => item.id);
  if (
    items.length === 0 || new Set(ids).size !== ids.length ||
    !ids.includes(record.activeDocumentId)
  ) {
    throw new Error("OpenInk 画稿目录内容损坏");
  }
  return {
    version: 1,
    generation: record.generation as number,
    activeDocumentId: record.activeDocumentId,
    items,
  };
}

async function hydrateCatalog(
  store: TextStore,
  catalog: DrawingCatalog,
): Promise<DrawingLibrarySnapshot> {
  const items = await Promise.all(
    catalog.items.map(async (entry) => {
      const source = await store.readText(documentPath(entry.id, entry.revision));
      if (source === null) throw new Error("OpenInk 画稿正文缺失");
      const document = parseDrawingDocument(source);
      if (document.id !== entry.id) throw new Error("OpenInk 画稿标识不匹配");
      return { document, revision: entry.revision };
    }),
  );
  return { ...catalog, items };
}

export async function loadDrawingLibrary(
  store: TextStore,
): Promise<DrawingLibrarySnapshot | null> {
  const sources = await Promise.all(
    CATALOG_PATHS.map((path) => store.readText(path)),
  );
  const candidates = sources.flatMap((source) => {
    if (source === null) return [];
    try {
      return [parseCatalog(source)];
    } catch {
      return [];
    }
  }).sort((left, right) => right.generation - left.generation);

  for (const candidate of candidates) {
    try {
      return await hydrateCatalog(store, candidate);
    } catch {
      // A newer incomplete generation must not hide an older durable generation.
    }
  }
  if (sources.some((source) => source !== null)) {
    throw new Error("OpenInk 画稿存储损坏，未覆盖原始数据");
  }
  return null;
}

export async function persistDrawingDocument(
  store: TextStore,
  snapshot: DrawingLibrarySnapshot | null,
  document: DrawingDocument,
  options: Readonly<{ activate?: boolean }> = {},
): Promise<DrawingLibrarySnapshot> {
  const current = snapshot?.items.find((item) => item.document.id === document.id);
  const nextItem = { document, revision: (current?.revision ?? 0) + 1 };
  const items = snapshot
    ? current
      ? snapshot.items.map((item) => item.document.id === document.id ? nextItem : item)
      : [...snapshot.items, nextItem]
    : [nextItem];
  const generation = (snapshot?.generation ?? 0) + 1;
  const next: DrawingLibrarySnapshot = {
    version: 1,
    generation,
    activeDocumentId: options.activate === false && snapshot
      ? snapshot.activeDocumentId
      : document.id,
    items,
  };

  await store.writeText(
    documentPath(document.id, nextItem.revision),
    serializeDrawingDocument(document),
  );
  await persistCatalog(store, next);
  return next;
}

async function persistCatalog(
  store: TextStore,
  snapshot: DrawingLibrarySnapshot,
): Promise<void> {
  const catalog: DrawingCatalog = {
    version: 1,
    generation: snapshot.generation,
    activeDocumentId: snapshot.activeDocumentId,
    items: snapshot.items.map((item) => ({
      id: item.document.id,
      revision: item.revision,
    })),
  };
  const slot = CATALOG_PATHS[(snapshot.generation - 1) % CATALOG_PATHS.length];
  await store.writeText(slot, JSON.stringify(catalog));
}

export async function activateDrawingDocument(
  store: TextStore,
  snapshot: DrawingLibrarySnapshot,
  documentId: string,
): Promise<DrawingLibrarySnapshot> {
  if (!snapshot.items.some((item) => item.document.id === documentId)) {
    throw new Error("OpenInk 画稿不存在");
  }
  if (snapshot.activeDocumentId === documentId) return snapshot;
  const next = {
    ...snapshot,
    generation: snapshot.generation + 1,
    activeDocumentId: documentId,
  };
  await persistCatalog(store, next);
  return next;
}

export async function bootstrapDrawingLibrary(
  store: TextStore,
  options: BootstrapOptions,
): Promise<
  Readonly<{
    snapshot: DrawingLibrarySnapshot;
    migratedLegacy: boolean;
  }>
> {
  const existing = await loadDrawingLibrary(store);
  if (existing) {
    if (!options.legacyDocument) {
      return { snapshot: existing, migratedLegacy: false };
    }
    const storedLegacy = existing.items.find((item) =>
      item.document.id === options.legacyDocument?.id
    );
    if (
      storedLegacy &&
      serializeDrawingDocument(storedLegacy.document) ===
        serializeDrawingDocument(options.legacyDocument)
    ) {
      return { snapshot: existing, migratedLegacy: true };
    }
    if (
      storedLegacy &&
      storedLegacy.document.updatedAt > options.legacyDocument.updatedAt
    ) {
      return { snapshot: existing, migratedLegacy: true };
    }
    return {
      snapshot: await persistDrawingDocument(
        store,
        existing,
        options.legacyDocument,
      ),
      migratedLegacy: true,
    };
  }

  const initial = options.legacyDocument ?? options.createFresh();
  return {
    snapshot: await persistDrawingDocument(store, null, initial),
    migratedLegacy: options.legacyDocument !== null,
  };
}
