import { describe, expect, it } from 'vitest';
import { extractImageUrls } from '../imageAttachments';

describe('image attachment payloads', () => {
  it('extracts data-image URLs for the dispatcher imageUrl field', () => {
    const image = 'data:image/jpeg;base64,abc123';
    expect(extractImageUrls([
      { role: 'user', content: 'explain this', attachments: [{ content: image }] },
      { role: 'assistant', content: 'ok' },
    ])).toEqual([image]);
  });

  it('does not treat videos or ordinary files as images', () => {
    expect(extractImageUrls([{ role: 'user', content: '', attachments: [
      { content: 'data:video/mp4;base64,abc' },
      { content: 'file contents' },
    ] }])).toEqual([]);
  });
});
