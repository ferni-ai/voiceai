import { describe, expect, it } from 'vitest';

import { loadWebPush } from '../web-push-loader.js';

describe('loadWebPush', () => {
  it('loads the installed web-push module', async () => {
    expect(await loadWebPush()).not.toBeNull();
  });

  it('refuses to send to a stored endpoint that is not a push service', async () => {
    const wp = await loadWebPush();
    await expect(
      wp!.sendNotification(
        { endpoint: 'http://10.8.0.3/internal', keys: { p256dh: 'p', auth: 'a' } },
        'payload'
      )
    ).rejects.toThrow('non-push-service endpoint');
  });
});
