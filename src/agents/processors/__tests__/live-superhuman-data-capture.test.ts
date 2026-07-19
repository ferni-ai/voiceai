import { describe, it, expect } from 'vitest';
import { detectDataCapture } from '../live-superhuman-injections.js';

describe('detectDataCapture', () => {
  it('detects email for acknowledgment injection', () => {
    const result = detectDataCapture('my email is alex@example.com');
    expect(result.detected).toBe(true);
    expect(result.type).toMatch(/email/i);
    expect(result.details).toContain('alex@example.com');
  });
});
