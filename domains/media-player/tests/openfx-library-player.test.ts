import { describe, expect, it } from 'vitest';

import {
  isOpenFxLibraryFileDetailsMessage,
  makeOpenFxLibraryFileActionMessage,
  parseOpenFxLibraryFileRequest,
} from '../src/openfx-library-player.js';

describe('OpenFX media-player bridge', () => {
  it('parses an embedded OPFS file request', () => {
    expect(
      parseOpenFxLibraryFileRequest(
        '?embedded=openfx-library&opfs=%2Fopenfx-file-library%2Fitems%2Fone%2Fsource' +
          '&name=clip.mov&type=video%2Fquicktime',
      ),
    ).toEqual({
      path: '/openfx-file-library/items/one/source',
      name: 'clip.mov',
      type: 'video/quicktime',
    });
  });

  it('rejects ordinary and incomplete requests', () => {
    expect(parseOpenFxLibraryFileRequest('?opfs=%2Ffile')).toBeNull();
    expect(parseOpenFxLibraryFileRequest('?embedded=openfx-library')).toBeNull();
  });

  it('accepts resume state and sidecar subtitle references', () => {
    const subtitles = JSON.stringify([
      { path: '/openfx-file-library/items/sub/source', name: 'clip.zh.srt', type: 'text/plain' },
    ]);
    const request = parseOpenFxLibraryFileRequest(
      `?embedded=openfx-library&opfs=%2Ffile&item=video-one&resume=42.5&subtitles=${encodeURIComponent(subtitles)}`,
    );

    expect(request).toMatchObject({
      itemId: 'video-one',
      resumePositionSec: 42.5,
      subtitles: [
        { path: '/openfx-file-library/items/sub/source', name: 'clip.zh.srt', type: 'text/plain' },
      ],
    });
  });

  it('creates an item-scoped file action message for the parent library', () => {
    expect(makeOpenFxLibraryFileActionMessage('video-one', 'edit')).toEqual({
      type: 'openfx:media-player:file-action',
      itemId: 'video-one',
      action: 'edit',
    });
  });

  it('accepts only item-scoped file detail updates from the parent library', () => {
    expect(
      isOpenFxLibraryFileDetailsMessage({
        type: 'openfx:media-player:file-details',
        itemId: 'video-one',
        name: 'renamed.mov',
      }),
    ).toBe(true);
    expect(
      isOpenFxLibraryFileDetailsMessage({
        type: 'openfx:media-player:file-details',
        itemId: 'video-one',
        name: 42,
      }),
    ).toBe(false);
  });
});
