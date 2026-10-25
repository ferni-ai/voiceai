export const PROD_DATABASE: '(default)';
export const DEV_DATABASE: 'ferni-dev';
export const DEV_DATABASE_DEFAULT: 'ferni-dev';
export function evalDatabase(
  env: string | undefined,
  opts?: { override?: string; vars?: Record<string, string | undefined> }
): string;
export function databaseFromArgs(
  argv: readonly string[],
  opts?: { fallback?: string; vars?: Record<string, string | undefined> }
): string;
export function documentsUrl(project: string, database: string): string;
