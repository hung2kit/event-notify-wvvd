import { describe, expect, it } from 'vitest';
import { extractInlineImages } from './inline-images.js';

describe('extractInlineImages', () => {
  it('leaves plain html alone', () => {
    const result = extractInlineImages('<p>Xin chào</p>');
    expect(result.html).toBe('<p>Xin chào</p>');
    expect(result.attachments).toEqual([]);
  });

  it('replaces data urls with cid attachments', () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const html = `<p>Ảnh</p><img src="data:image/png;base64,${png}" width="120" alt="">`;
    const result = extractInlineImages(html);
    expect(result.html).toContain('cid:img1@event-notify.local');
    expect(result.html).not.toContain('data:image');
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.contentType).toBe('image/png');
    expect(result.attachments[0]?.content.length).toBeGreaterThan(0);
  });
});
