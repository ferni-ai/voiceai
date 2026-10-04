/**
 * A failed Terra sync must not store a fabricated snapshot: the mock
 * reports stressLevel 'moderate', which reached the voice agent's context
 * as if it were a real reading.
 */
import { describe, expect, it } from 'vitest';

import { handleTerraWebhook, syncBiometrics } from '../index.js';

describe('Terra sync failure', () => {
  it('returns null instead of a mock snapshot when Terra is unavailable', async () => {
    const auth = await handleTerraWebhook({
      type: 'auth',
      user: { reference_id: 'terra-fail-user', user_id: 'terra-remote-1' },
    });
    expect(auth.success).toBe(true);

    await expect(syncBiometrics('terra-fail-user')).resolves.toBeNull();
  });
});
