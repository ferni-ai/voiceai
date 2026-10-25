/**
 * The UI server signs the calls it places (proactive check-ins, on-behalf,
 * family check-ins) with DISPATCH_SIGNING_SECRET, and the voice agent verifies
 * with the same secret (#1706). On LiveKit Cloud the agent's LiveKit key is
 * injected and no signer outside the agent holds it, so without this mount the
 * agent refuses a proactive check-in's context and Ferni doesn't know why she
 * called.
 * 2026-10-17: #1721 mounted it while the secret had no version, and every prod
 * web deploy failed ("dispatch-signing-secret/versions/latest was not found"),
 * so #1809 took it out. The secret has an enabled version since 2026-10-18.
 * An agent verifies with DISPATCH_SIGNING_SECRET and LIVEKIT_API_SECRET
 * (dispatchVerifySecrets): one without the new key refuses calls signed with it.
 */
import { describe, expect, it } from 'vitest';
import { uiServerEnv, uiServerSecrets } from './ui-deploy-env.js';

const MOUNT = 'DISPATCH_SIGNING_SECRET=dispatch-signing-secret:latest';

describe('dispatch signing secret mount', () => {
  it('the production web deploy mounts it from Secret Manager', () => {
    expect(uiServerSecrets()).toContain(MOUNT);
  });

  it('never as a plain env var', () => {
    expect(uiServerEnv().join('\n')).not.toMatch(/DISPATCH_SIGNING_SECRET=/);
  });
});
