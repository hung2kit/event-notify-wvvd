import { describe, expect, it } from 'vitest';
import { classifyTransportError, MailError } from './transport.js';

describe('classifyTransportError', () => {
  it('retries network failures', () => {
    const error = classifyTransportError(
      Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
    );
    expect(error.permanent).toBe(false);
  });

  it('retries SMTP 4xx and keeps Retry-After', () => {
    const error = classifyTransportError({
      responseCode: 451,
      response: '451 busy\nRetry-After: 30',
    });
    expect(error.permanent).toBe(false);
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('fails immediately on SMTP 5xx and on auth errors', () => {
    expect(classifyTransportError({ responseCode: 550, response: '550 unknown' }).permanent).toBe(
      true,
    );
    expect(classifyTransportError({ responseCode: 401 }).permanent).toBe(true);
  });

  it('reports a failed SMTP login as a login error without the password', () => {
    const error = classifyTransportError(
      {
        code: 'EAUTH',
        responseCode: 535,
        response: '535 5.7.3 Authentication unsuccessful',
        command: 'AUTH LOGIN dXNlcg==',
        message: 'Invalid login: hunter2-secret',
      },
      ['hunter2-secret'],
    );
    expect(error.permanent).toBe(true);
    expect(error.message).toBe('Đăng nhập máy chủ mail thất bại');
    expect(error.detail?.command).toBe('AUTH LOGIN');
    expect(JSON.stringify(error.detail)).not.toContain('hunter2-secret');
  });

  it('returns a MailError unchanged', () => {
    const original = new MailError('Giữ nguyên', { permanent: true });
    expect(classifyTransportError(original)).toBe(original);
  });
});
