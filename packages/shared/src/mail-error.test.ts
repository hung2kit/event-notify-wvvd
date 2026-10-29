import { describe, expect, it } from 'vitest';
import { appendAttemptError, describeMailError } from './mail-error.js';

describe('describeMailError', () => {
  it('keeps the SMTP fields nodemailer reports', () => {
    const detail = describeMailError(
      Object.assign(new Error('Message failed: 554 5.2.0 STOREDRV.Submission.Exception'), {
        code: 'EMESSAGE',
        responseCode: 554,
        response: '554 5.2.0 STOREDRV.Submission.Exception:SendAsDeniedException',
        command: 'DATA',
        rejected: ['a@wvi.org'],
      }),
    );
    expect(detail).toEqual({
      code: 'EMESSAGE',
      responseCode: 554,
      response: '554 5.2.0 STOREDRV.Submission.Exception:SendAsDeniedException',
      command: 'DATA',
      message: 'Message failed: 554 5.2.0 STOREDRV.Submission.Exception',
      rejected: ['a@wvi.org'],
    });
  });

  it('drops AUTH arguments and masks secrets', () => {
    const detail = describeMailError(
      {
        command: 'AUTH PLAIN AHVzZXIAc2VjcmV0',
        message: 'Invalid login with s3cr3t-pass',
        response: '535 5.7.3 Authentication unsuccessful',
        responseCode: 535,
      },
      ['s3cr3t-pass'],
    );
    expect(detail.command).toBe('AUTH PLAIN');
    expect(detail.message).toBe('Invalid login with ***');
  });

  it('keeps only the latest attempts', () => {
    let detail = appendAttemptError(null, {
      at: '2026-10-28T00:00:00.000Z',
      attempt: 1,
      permanent: false,
      summary: 'x',
    });
    for (let attempt = 2; attempt <= 12; attempt += 1) {
      detail = appendAttemptError(detail, {
        at: '2026-10-28T00:00:00.000Z',
        attempt,
        permanent: false,
        summary: 'x',
      });
    }
    expect(detail.attempts).toHaveLength(10);
    expect(detail.attempts[0]?.attempt).toBe(3);
  });
});
