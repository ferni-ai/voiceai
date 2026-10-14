import { describe, expect, it } from 'vitest';
import { rateLimitIpKey } from '../rate-limit-ip-key.js';

describe('rateLimitIpKey', () => {
  it('keeps an IPv4 address as is', () => {
    expect(rateLimitIpKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('gives two IPv6 addresses in one /64 the same key', () => {
    expect(rateLimitIpKey('2001:db8:aa:1::1')).toBe(
      rateLimitIpKey('2001:db8:aa:1:ffff:1234:5678:9abc')
    );
  });

  it('gives IPv6 addresses in different /64s different keys', () => {
    expect(rateLimitIpKey('2001:db8:aa:1::1')).not.toBe(rateLimitIpKey('2001:db8:aa:2::1'));
  });

  it('keys IPv6 by its /64 prefix', () => {
    expect(rateLimitIpKey('2001:db8:aa:1:dead:beef:0:1')).toBe('2001:db8:aa:1::/64');
  });

  it('treats compressed, padded and upper-case spellings alike', () => {
    const key = rateLimitIpKey('2001:db8::1');
    expect(rateLimitIpKey('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe(key);
    expect(key).toBe('2001:db8:0:0::/64');
  });

  it('maps IPv4-mapped IPv6 to its IPv4 address', () => {
    expect(rateLimitIpKey('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(rateLimitIpKey('::FFFF:0102:0304')).toBe('1.2.3.4');
    expect(rateLimitIpKey('0:0:0:0:0:ffff:1.2.3.4')).toBe('1.2.3.4');
  });

  it('drops an IPv6 zone id', () => {
    expect(rateLimitIpKey('fe80::1%en0')).toBe(rateLimitIpKey('fe80::2'));
  });

  it('returns a non-address unchanged', () => {
    expect(rateLimitIpKey('unknown')).toBe('unknown');
  });
});
