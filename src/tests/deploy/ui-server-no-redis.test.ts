/**
 * The web server runs without Redis. Prod Memorystore ferni-ratelimit was
 * deleted on purpose on 2026-10-16, and the redis-url secret then pointed at
 * nothing: every instance dialed a refused connection and logged Redis
 * errors, and checkShared (rate-limiter.ts) failed closed, refusing every
 * journal clip. The production workflow (the only web deploy path since the
 * ferni CLI's ui deploy was removed) doesn't mount redis-url, so the web
 * server takes the no-Redis path: shared caps count in Firestore (#1777) and
 * the caches stay in memory. The secret itself is left in Secret Manager.
 */
import { describe, expect, it } from 'vitest';
import { uiServerSecrets as workflowSecrets } from './ui-deploy-env.js';

describe('web server deploys without Redis', () => {
  it('the production workflow mounts no Redis URL secret', () => {
    const mounted = workflowSecrets();
    expect(mounted).toContain('LIVEKIT_URL=livekit-url:latest'); // the right flag was read
    expect(mounted.filter((s) => /^REDIS_(?:RATE_LIMIT_)?URL=|redis-url/.test(s))).toEqual([]);
  });
});
