/** security_events docs carry expireAt so a TTL policy can delete them. */
import { describe, expect, it } from 'vitest';
import { SECURITY_EVENT_RETENTION_MS, withExpiry } from '../security-event-expiry.js';

describe('withExpiry', () => {
  it('adds expireAt as a Date (a Firestore Timestamp) one retention after the event', () => {
    const timestamp = new Date('2026-10-18T12:00:00Z');
    const doc = withExpiry({ id: 'e1', action: 'login', timestamp });
    expect(doc.expireAt).toBeInstanceOf(Date);
    expect(doc.expireAt.getTime()).toBe(timestamp.getTime() + SECURITY_EVENT_RETENTION_MS);
    expect(doc).toMatchObject({ id: 'e1', action: 'login', timestamp });
  });
});
