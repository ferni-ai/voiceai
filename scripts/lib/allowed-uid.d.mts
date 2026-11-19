type Env = Record<string, string | undefined>;
export const ALLOWLIST_ENV: 'MEMORY_EVAL_ALLOWED_UIDS';
export const REFUSED: 'uid not in allowlist';
export function allowedUids(env?: Env): ReadonlySet<string>;
export function isAllowedUid(uid: string | undefined, env?: Env): boolean;
export function assertAllowedUid(uid: string | undefined, env?: Env): string;
