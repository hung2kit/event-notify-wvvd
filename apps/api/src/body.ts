import { convert } from 'html-to-text';
import sanitizeHtml from 'sanitize-html';
import { HttpError } from './http.js';

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'ul', 'ol', 'li', 'a', 'img'],
  allowedAttributes: {
    a: ['href'],
    img: ['src', 'alt', 'width', 'height'],
    p: ['style'],
    span: ['style'],
  },
  allowedStyles: {
    p: { 'text-align': [/^(left|center|right|justify)$/] },
    span: { 'font-size': [/^\d{1,2}px$/] },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'data'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
};

export function prepareBody(html: string): { bodyHtml: string; bodyText: string } {
  const bodyHtml = sanitizeHtml(html, SANITIZE).trim();
  const bodyText = convert(bodyHtml, { wordwrap: false }).trim();
  const hasImage = /<img\b/i.test(bodyHtml);
  if (!bodyText && !hasImage) {
    throw new HttpError(400, 'Nhập nội dung email', { bodyHtml: 'Nhập nội dung email' });
  }
  return {
    bodyHtml,
    bodyText: bodyText || (hasImage ? '[Hình ảnh]' : ''),
  };
}
