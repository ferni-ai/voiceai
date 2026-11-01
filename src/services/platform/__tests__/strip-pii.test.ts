import { describe, expect, it } from 'vitest';
import { stripPII } from '../privacy-crypto.js';

describe('stripPII', () => {
  it('redacts named PII fields and any other string holding contact data, nested too', () => {
    const out = stripPII({
      phone: '(727) 555-0142',
      note: 'call back on ٧٢٧ ٥٥٥ ٠١٤٢',
      contact: { via: 'jo at example dot com', city: 'Tampa' },
      born: 'born in 1987, moved 2015',
      price: 'bought for $450,000 on 2026-10-20',
      count: 5550142,
    });
    expect(out).toEqual({
      phone: '[REDACTED]',
      note: '[REDACTED]',
      contact: { via: '[REDACTED]', city: 'Tampa' },
      born: 'born in 1987, moved 2015',
      price: 'bought for $450,000 on 2026-10-20',
      count: 5550142,
    });
  });
});
