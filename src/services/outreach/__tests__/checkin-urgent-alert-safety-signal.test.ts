/**
 * The check-in alert says crisisCallerLine whenever the caller-text screen
 * raises its own safety signal, even if it kept every word. Today the screen only
 * raises it when it also withholds or cuts words, so this pins the alert against a
 * screen change: the safety signal alone must be enough. Fictional people only.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../caller-text.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../caller-text.js')>();
  return { ...real, screenCallerParts: vi.fn(real.screenCallerParts) };
});

import { callerText, crisisCallerLine, crisisRead, screenCallerParts } from '../caller-text.js';
import { generateUrgentNotification } from '../checkin-urgent-alert.js';

const NAME = 'Marcus';
const WORDS = 'said he has been feeling low since the move';

describe('check-in alert: the screen safety signal', () => {
  it('says crisisCallerLine when the screen flags safety but keeps the words', () => {
    expect(crisisRead(WORDS)).toBe(false); // the guard alone would add nothing
    vi.mocked(screenCallerParts).mockImplementationOnce((text) => ({
      said: callerText(text, 10_000),
      risky: false,
      safety: true,
    }));

    const alert = generateUrgentNotification({
      familyMemberName: NAME,
      concernsIdentified: [{ urgency: 'urgent', description: WORDS }],
    });
    expect(alert).toBe(
      `Important: During my call with ${NAME}, ${WORDS}. ${crisisCallerLine(NAME)} You may want to check in with them.`
    );
  });
});
