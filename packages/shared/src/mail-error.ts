/** What the SMTP server said, kept so a failed send can be debugged from the history screen. */
export type MailErrorDetail = {
  code?: string;
  responseCode?: number;
  response?: string;
  command?: string;
  message?: string;
  rejected?: string[];
};

export type DeliveryAttemptError = MailErrorDetail & {
  at: string;
  attempt: number;
  permanent: boolean;
  summary: string;
};

export type DeliveryErrorDetail = { attempts: DeliveryAttemptError[] };

const MAX_TEXT = 1000;
export const MAX_ATTEMPT_ERRORS = 10;

/**
 * Reads the fields nodemailer puts on a failed send.
 * AUTH arguments are dropped and `secrets` are masked so credentials never reach the database.
 */
export function describeMailError(
  error: unknown,
  secrets: (string | undefined)[] = [],
): MailErrorDetail {
  if (!error || typeof error !== 'object') return { message: clean(String(error), secrets) };
  const source = error as {
    code?: unknown;
    responseCode?: unknown;
    response?: unknown;
    command?: unknown;
    message?: unknown;
    rejected?: unknown;
  };
  const detail: MailErrorDetail = {};
  if (typeof source.code === 'string') detail.code = clean(source.code, secrets);
  if (typeof source.responseCode === 'number') detail.responseCode = source.responseCode;
  if (typeof source.response === 'string') detail.response = clean(source.response, secrets);
  if (typeof source.command === 'string') {
    const command = /^AUTH\b/i.test(source.command)
      ? source.command.split(/\s+/).slice(0, 2).join(' ')
      : source.command;
    detail.command = clean(command, secrets);
  }
  if (typeof source.message === 'string') detail.message = clean(source.message, secrets);
  if (Array.isArray(source.rejected)) {
    detail.rejected = source.rejected
      .filter((item): item is string => typeof item === 'string')
      .slice(0, 50)
      .map((item) => clean(item, secrets));
  }
  return detail;
}

export function appendAttemptError(
  previous: DeliveryErrorDetail | null | undefined,
  entry: DeliveryAttemptError,
): DeliveryErrorDetail {
  const attempts = [...(previous?.attempts ?? []), entry];
  return { attempts: attempts.slice(-MAX_ATTEMPT_ERRORS) };
}

function clean(text: string, secrets: (string | undefined)[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) result = result.split(secret).join('***');
  }
  return result.length > MAX_TEXT ? `${result.slice(0, MAX_TEXT)}…` : result;
}
