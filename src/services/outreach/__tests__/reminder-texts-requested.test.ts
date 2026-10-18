/**
 * Only a reminder the user's own "remind me" tool made (requestedByUser) is a
 * text they asked for; engagement, persona, agent and family reminders are not.
 */
import { describe, expect, it, vi } from 'vitest';
import type { TextDeps } from '../guarded-text.js';
import { guardReminderText, type ReminderTextDeps } from '../reminder-texts.js';
import { reminderFromDoc } from '../../scheduling/reminder-scheduler.js';

const PHONE = '+18015550100';
const NOON_NY = new Date('2026-10-15T16:00:00.000Z');

function deps(): ReminderTextDeps & { sendOwn: ReturnType<typeof vi.fn> } {
  const text = {
    env: {},
    now: () => NOON_NY,
    authPhone: async () => PHONE,
    store: { userDoc: async () => undefined, sponsoredPhone: async () => undefined },
  } as unknown as TextDeps;
  return { text, sendOwn: vi.fn(async () => ({ sent: true })), sendOther: vi.fn() } as never;
}

const reminder = (over: Record<string, unknown> = {}) =>
  ({
    id: 'r1',
    userId: 'u1',
    message: 'call the pharmacy',
    deliveryAddress: PHONE,
    timezone: 'America/New_York',
    ...over,
  }) as never;

describe('guardReminderText', () => {
  it('marks only a reminder carrying requestedByUser as requested', async () => {
    const cases = [
      [{ requestedByUser: true }, true],
      [{}, false], // an engagement or agent reminder: no marker, not requested
      [{ sourceIdentityName: 'Sam' }, false],
    ] as const;
    for (const [over, requested] of cases) {
      const d = deps();
      expect(await guardReminderText(reminder(over), d)).toBe('sent');
      expect(d.sendOwn).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'reminder', requested }),
        d.text
      );
    }
  });

  it('the marker survives a round trip through Firestore, and nothing else sets it', () => {
    const doc = { userId: 'u1', message: 'm', scheduledFor: '2026-10-15T16:00:00.000Z' };
    expect(reminderFromDoc('r1', { ...doc, requestedByUser: true }).requestedByUser).toBe(true);
    expect(
      reminderFromDoc('r1', { ...doc, requestedByUser: 'yes' }).requestedByUser
    ).toBeUndefined();
    expect(reminderFromDoc('r1', doc).requestedByUser).toBeUndefined();
  });
});
