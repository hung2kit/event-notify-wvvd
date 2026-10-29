import path from 'node:path';

/** Load the repo-root `.env` when it exists. Existing process env wins. */
export function loadRootEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../../../.env'),
  ];
  for (const file of candidates) {
    try {
      process.loadEnvFile(file);
      return;
    } catch {
      // Try the next candidate. Docker injects env and has no file.
    }
  }
}
