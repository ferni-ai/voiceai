/**
 * validateWebhookUrl (used by POST /api/webhooks and now PUT) accepts only public https
 * destinations: bracketed IPv6 loopback, 0.0.0.0, IPv4-mapped IPv6, carrier-grade NAT and
 * "Home Assistant looking" paths on private hosts are all refused.
 */
import { describe, expect, it } from 'vitest';
import { validateWebhookInput, validateWebhookUrl } from '../webhook-validator.js';

describe('validateWebhookUrl', () => {
  it.each([
    'https://[::1]/hook',
    'https://0.0.0.0/hook',
    'https://[::ffff:127.0.0.1]/hook',
    'https://[::ffff:a9fe:a9fe]/hook',
    'https://100.64.0.1/hook',
    'https://metadata.google.internal/hook',
    'http://192.168.1.5:8123/api/webhook/abc', // private host with a Home Assistant path
    'https://10.0.0.5/api/states/light.kitchen',
    'http://hooks.example.com/x', // plain http
    'https://hooks.example.com:8443/x', // non-default port
  ])('refuses %s', (url) => {
    const result = validateWebhookUrl(url);
    expect(result.valid).toBe(false);
  });

  it('accepts a public https URL and detects its platform', () => {
    expect(validateWebhookUrl('https://maker.ifttt.com/trigger/x/with/key/y')).toMatchObject({
      valid: true,
      platform: 'ifttt',
    });
    expect(validateWebhookUrl('https://ha.example.com/api/webhook/abc')).toMatchObject({
      valid: true,
      platform: 'home_assistant',
    });
  });

  it('validateWebhookInput reports the URL error', () => {
    const result = validateWebhookInput({
      name: 'Lights',
      url: 'https://[::1]/x',
      voiceTriggers: ['lights on'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/not allowed/);
  });
});
