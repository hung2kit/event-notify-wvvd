export type InlineImageAttachment = {
  cid: string;
  filename: string;
  contentType: string;
  content: Buffer;
};

const DATA_IMG =
  /(<img\b[^>]*?\bsrc=["'])(data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+))(["'][^>]*>)/gi;

/**
 * Turns base64 `<img src="data:...">` into `cid:` references plus nodemailer attachments.
 * Outlook and many clients strip raw data URLs; CID inline attachments render reliably.
 */
export function extractInlineImages(html: string): {
  html: string;
  attachments: InlineImageAttachment[];
} {
  const attachments: InlineImageAttachment[] = [];
  let index = 0;
  const next = html.replace(DATA_IMG, (_match, before, _src, mime, base64, after) => {
    const cleaned = String(base64).replace(/\s+/g, '');
    if (!cleaned) return `${before}${_src}${after}`;
    index += 1;
    const cid = `img${index}@phat-tin.local`;
    attachments.push({
      cid,
      filename: `image-${index}.${extensionFor(mime)}`,
      contentType: mime,
      content: Buffer.from(cleaned, 'base64'),
    });
    return `${before}cid:${cid}${after}`;
  });
  return { html: next, attachments };
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'jpg';
}
