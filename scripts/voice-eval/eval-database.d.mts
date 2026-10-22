export const PROD_DATABASE: '(default)';
export const DEV_DATABASE: 'ferni-dev';
export const DEV_DATABASE_DEFAULT: string;
export function evalDatabase(
  env: string | undefined,
  opts?: { override?: string; vars?: Record<string, string | undefined> }
): string;
export function documentsUrl(project: string, database: string): string;
