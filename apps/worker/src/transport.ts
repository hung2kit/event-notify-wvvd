import { describeMailError, extractInlineImages, type MailErrorDetail } from '@phat-tin/shared';
import nodemailer from 'nodemailer';
import type { WorkerEnv } from './env.js';

export type OutboundMail = {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
};

export interface MailTransport {
  send(message: OutboundMail): Promise<{ messageId: string }>;
  close(): Promise<void>;
}

export class MailError extends Error {
  readonly permanent: boolean;
  readonly retryAfterSeconds?: number;
  readonly detail?: MailErrorDetail;

  constructor(
    message: string,
    options: { permanent: boolean; retryAfterSeconds?: number; detail?: MailErrorDetail },
  ) {
    super(message);
    this.name = 'MailError';
    this.permanent = options.permanent;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.detail = options.detail;
  }
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'ECONNRESET',
  'EDNS',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

export function classifyTransportError(
  error: unknown,
  secrets: (string | undefined)[] = [],
): MailError {
  if (error instanceof MailError) return error;
  const detail = describeMailError(error, secrets);
  const err = error as {
    code?: string;
    responseCode?: number;
    response?: string;
    message?: string;
  };
  const retryAfterSeconds = parseRetryAfter(err.response);
  if (err.code && NETWORK_CODES.has(err.code)) {
    return new MailError('Không kết nối được máy chủ mail', {
      permanent: false,
      retryAfterSeconds,
      detail,
    });
  }
  if (err.code === 'EAUTH') {
    return new MailError('Đăng nhập máy chủ mail thất bại', {
      permanent: true,
      retryAfterSeconds,
      detail,
    });
  }
  if (err.responseCode === 401 || err.responseCode === 403) {
    return new MailError('Không có quyền gửi thư', { permanent: true, retryAfterSeconds, detail });
  }
  if (
    err.responseCode === 429 ||
    (err.responseCode !== undefined && err.responseCode >= 400 && err.responseCode < 500)
  ) {
    return new MailError('Máy chủ mail tạm từ chối', {
      permanent: false,
      retryAfterSeconds,
      detail,
    });
  }
  if (err.responseCode !== undefined && err.responseCode >= 500) {
    return new MailError('Máy chủ mail từ chối thư', {
      permanent: true,
      retryAfterSeconds,
      detail,
    });
  }
  return new MailError('Không gửi được email', { permanent: false, retryAfterSeconds, detail });
}

function parseRetryAfter(response: string | undefined): number | undefined {
  if (!response) return undefined;
  const match = /retry-after:\s*(\d+)/i.exec(response);
  const seconds = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return seconds;
}

export function createMailTransport(env: WorkerEnv): MailTransport {
  if (env.MAIL_TRANSPORT === 'graph') return new GraphTransport();
  return new SmtpTransport(env);
}

/** Microsoft Graph arrives in phase 5. Failing permanently avoids a retry loop. */
class GraphTransport implements MailTransport {
  async send(): Promise<{ messageId: string }> {
    throw new MailError('Gửi qua Microsoft Graph sẽ có ở giai đoạn sau', { permanent: true });
  }

  async close(): Promise<void> {}
}

class SmtpTransport implements MailTransport {
  private readonly fromName: string;
  private readonly fromAddress: string;
  private readonly secrets: (string | undefined)[];
  private readonly transport: nodemailer.Transporter;

  constructor(env: WorkerEnv) {
    this.fromName = env.MAIL_FROM_NAME;
    this.fromAddress = env.MAIL_FROM_ADDRESS;
    this.secrets = [env.SMTP_PASS];
    const host = env.SMTP_HOST === 'localhost' ? '127.0.0.1' : env.SMTP_HOST;
    this.transport = nodemailer.createTransport({
      pool: true,
      maxConnections: 3,
      host,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: env.SMTP_REQUIRE_TLS,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async send(message: OutboundMail): Promise<{ messageId: string }> {
    try {
      const inline = extractInlineImages(message.html);
      const info = await this.transport.sendMail({
        from: { name: this.fromName, address: this.fromAddress },
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
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
      return { messageId: info.messageId };
    } catch (error) {
      throw classifyTransportError(error, this.secrets);
    }
  }

  async close(): Promise<void> {
    this.transport.close();
  }
}
