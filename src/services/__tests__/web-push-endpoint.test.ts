import { describe, expect, it } from 'vitest';

import { isAllowedWebPushEndpoint } from '../web-push-endpoint.js';

describe('isAllowedWebPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
    'https://web.push.apple.com/QGuQyavXutnMH',
    'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
    'https://fcm.googleapis.com:443/fcm/send/abc',
  ])('allows the browser push service %s', (endpoint) => {
    expect(isAllowedWebPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['the metadata server', 'https://169.254.169.254/computeMetadata/v1/'],
    ['a private VPC address', 'https://10.8.0.3/'],
    ['localhost', 'https://localhost:3002/api/admin'],
    ['a lookalike suffix', 'https://evilfcm.googleapis.com.attacker.dev/x'],
    ['a host that only ends with the name', 'https://notpush.apple.com.evil.io/'],
    ['a parent-name prefix without a dot', 'https://attackerpush.apple.com/'],
    ['a non-default port', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
    ['embedded credentials', 'https://user:pw@fcm.googleapis.com/fcm/send/abc'],
    ['not a URL', 'fcm-token-abc123'],
  ])('refuses %s', (_label, endpoint) => {
    expect(isAllowedWebPushEndpoint(endpoint)).toBe(false);
  });
});
