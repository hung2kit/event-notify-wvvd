import { describeMailError, extractInlineImages } from '@event-notify/shared';
import nodemailer from 'nodemailer';
import type { ApiEnv } from './env.js';
import { HttpError } from './http.js';

export async function sendToUser(
  env: ApiEnv,
  message: { to: string; subject: string; html: string; text: string },
): Promise<string> {
  if (env.MAIL_TRANSPORT !== 'smtp') {
    throw new HttpError(501, 'Gửi thử qua Microsoft Graph sẽ có ở giai đoạn sau');
  }
  // Some machines resolve "localhost" to a LAN address. Mailpit listens on 127.0.0.1.
  const host = env.SMTP_HOST === 'localhost' ? '127.0.0.1' : env.SMTP_HOST;
  const transport = nodemailer.createTransport({
    host,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: env.SMTP_REQUIRE_TLS,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const inline = extractInlineImages(message.html);
  try {
    const info = await transport.sendMail({
      from: { name: env.MAIL_FROM_NAME, address: env.MAIL_FROM_ADDRESS },
      to: message.to,
      subject: message.subject,
      html: inline.html,
      text: message.text,
      attachments: inline.attachments.map((item) => ({
        filename: item.filename,
        content: item.content,
        contentType: item.contentType,
        cid: item.cid,
        contentDisposition: 'inline' as const,
      })),
    });
    return info.messageId;
  } catch (error) {
    throw new HttpError(
      502,
      'Không gửi được email thử',
      undefined,
      describeMailError(error, [env.SMTP_PASS]),
    );
  } finally {
    transport.close();
  }
}
