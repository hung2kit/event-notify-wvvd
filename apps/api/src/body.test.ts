import { describe, expect, it } from 'vitest';
import { prepareBody } from './body.js';

describe('prepareBody', () => {
  it('keeps alignment and font size from the editor', () => {
    const { bodyHtml } = prepareBody(
      '<p style="text-align: center"><span style="font-size: 18px">Chào</span> <u>bạn</u></p>',
    );
    expect(bodyHtml).toContain('text-align:center');
    expect(bodyHtml).toContain('font-size:18px');
    expect(bodyHtml).toContain('<u>bạn</u>');
  });

  it('drops styles the editor does not produce', () => {
    const { bodyHtml } = prepareBody(
      '<p style="position: fixed; text-align: center">Chào</p><span style="color: red">x</span>',
    );
    expect(bodyHtml).not.toContain('position');
    expect(bodyHtml).not.toContain('color');
    expect(bodyHtml).toContain('text-align:center');
  });

  it('removes scripts and event handlers', () => {
    const { bodyHtml } = prepareBody('<p onclick="x()">Hi</p><script>alert(1)</script>');
    expect(bodyHtml).toBe('<p>Hi</p>');
  });
});
