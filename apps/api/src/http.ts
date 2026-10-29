import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly fields?: Record<string, string>,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

export function parseInput<Schema extends z.ZodTypeAny>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fields[key]) fields[key] = issue.message;
    }
    throw new HttpError(400, 'Dữ liệu không hợp lệ', fields);
  }
  return result.data;
}
