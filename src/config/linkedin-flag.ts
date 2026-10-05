/**
 * LinkedIn on/off switch (server side).
 *
 * LinkedIn is offered only when LINKEDIN_ENABLED=true AND the LinkedIn app
 * credentials (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET) are set. Without
 * the credentials every LinkedIn path fails, so we don't offer it at all:
 * /api/linkedin/* answers "unavailable", POST /auth/oauth/start refuses the
 * provider, and the voice agent isn't given LinkedIn tools.
 *
 * Off by default. Read on every call, so a test (or a restart with new env)
 * sees the current value. The web has its own switch:
 * apps/web/src/config/linkedin.ts.
 *
 * @module config/linkedin-flag
 */

/** Env var that turns LinkedIn on (must be exactly 'true'). */
export const LINKEDIN_ENABLED_ENV = 'LINKEDIN_ENABLED';

/** The provider id used by POST /auth/oauth/start. */
export const LINKEDIN_OAUTH_PROVIDER = 'linkedin';

/** True only when LinkedIn is switched on and its app credentials are present. */
export function isLinkedInEnabled(): boolean {
  return (
    process.env[LINKEDIN_ENABLED_ENV] === 'true' &&
    !!process.env.LINKEDIN_CLIENT_ID &&
    !!process.env.LINKEDIN_CLIENT_SECRET
  );
}
