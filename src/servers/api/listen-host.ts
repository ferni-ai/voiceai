/**
 * Where the UI server listens.
 *
 * A container must listen on every interface. A developer's laptop must not: with
 * NODE_ENV=development the server trusts the dev-mode admin key and client-claimed user
 * ids, so on 0.0.0.0 anyone on the same network could impersonate any user. Development
 * therefore defaults to loopback; UI_SERVER_HOST overrides either default.
 */
const LOOPBACK_HOST = '127.0.0.1';
const ALL_INTERFACES_HOST = '0.0.0.0';

export function uiServerListenHost(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.UI_SERVER_HOST?.trim();
  if (explicit) return explicit;
  return env.NODE_ENV === 'development' ? LOOPBACK_HOST : ALL_INTERFACES_HOST;
}
