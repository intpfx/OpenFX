export interface OpenFxLibraryFileReference {
  path: string;
  name: string;
  type: string;
}

export interface OpenFxLibraryFileRequest extends OpenFxLibraryFileReference {
  itemId?: string;
  resumePositionSec?: number;
  subtitles?: OpenFxLibraryFileReference[];
}

function parseSubtitleReferences(value: string | null): OpenFxLibraryFileReference[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const references = parsed.filter((entry): entry is OpenFxLibraryFileReference => {
      if (!entry || typeof entry !== 'object') return false;
      const reference = entry as Partial<OpenFxLibraryFileReference>;
      return (
        typeof reference.path === 'string' &&
        typeof reference.name === 'string' &&
        typeof reference.type === 'string'
      );
    });
    return references.length > 0 ? references : undefined;
  } catch {
    return undefined;
  }
}

export function parseOpenFxLibraryFileRequest(search: string): OpenFxLibraryFileRequest | null {
  const params = new URLSearchParams(search);
  const path = params.get('opfs');
  if (params.get('embedded') !== 'openfx-library' || !path) return null;

  const resume = Number(params.get('resume'));
  const itemId = params.get('item') || undefined;
  const subtitles = parseSubtitleReferences(params.get('subtitles'));
  return {
    path,
    name: params.get('name') || path.split('/').filter(Boolean).at(-1) || 'video',
    type: params.get('type') || '',
    ...(itemId ? { itemId } : {}),
    ...(Number.isFinite(resume) && resume > 0 ? { resumePositionSec: resume } : {}),
    ...(subtitles ? { subtitles } : {}),
  };
}

export async function readOpenFxLibraryFile(
  request: OpenFxLibraryFileReference,
  getRoot: () => Promise<FileSystemDirectoryHandle> = () => navigator.storage.getDirectory(),
): Promise<File> {
  const segments = request.path.split('/').filter(Boolean);
  const filename = segments.pop();
  if (!filename) throw new Error('Invalid OPFS path');

  let directory = await getRoot();
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment);
  }
  const stored = await (await directory.getFileHandle(filename)).getFile();
  return new File([stored], request.name, {
    type: request.type || stored.type,
    lastModified: stored.lastModified,
  });
}
