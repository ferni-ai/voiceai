/**
 * The pondered opener stays quiet after a crisis-level signal in
 * bogle_users/{uid}/crisis_signals (the store logCrisisSignal writes), by the
 * shared rule in human-transfer/crisis-signals.ts; a minor signal doesn't.
 */
import { describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../../services/outreach/proactive-channels/__tests__/path-firestore.js';

vi.mock('../pondering-reader.js', () => ({
  readPonderingForGreeting: vi.fn(async () => ({
    followUp: { text: 'How did the bluegrass demo go?', basis: 's1' },
  })),
}));
const { ponderingForOpener, hadRecentCrisis, CRISIS_QUIET_DAYS } =
  await import('../pondering-opener.js');

const U = 'bogle_users/u1';
const NOW = new Date('2026-10-18T15:00:00Z');
const ON = { now: NOW, env: { PONDERING: 'on' } };

function dbWith(signals: Array<[number, Record<string, unknown>]>) {
  const docs = new Map<string, Record<string, unknown>>();
  signals.forEach(([daysAgo, s], i) =>
    docs.set(`${U}/crisis_signals/c${i}`, {
      timestamp: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
      signals: s,
    })
  );
  return pathFirestore(docs) as never;
}

describe('pondered opener and crisis signals', () => {
  it('opens on the pondered question with no crisis signal', async () => {
    expect((await ponderingForOpener(dbWith([]), 'u1', ON))?.text).toBe(
      'How did the bluegrass demo go?'
    );
  });

  it('holds it back within the quiet window after a crisis-level signal', async () => {
    const db = dbWith([[CRISIS_QUIET_DAYS - 1, { suicidalIdeation: true, severity: 8 }]]);
    expect(await ponderingForOpener(db, 'u1', ON)).toBeUndefined();
  });

  it('a minor signal does not hold it back', async () => {
    const db = dbWith([[1, { anxietyDisorder: true, severity: 3 }]]);
    expect((await ponderingForOpener(db, 'u1', ON))?.text).toBe('How did the bluegrass demo go?');
  });

  it('a crisis before the window does not hold it back', async () => {
    const db = dbWith([[CRISIS_QUIET_DAYS + 1, { suicidalIdeation: true, severity: 8 }]]);
    expect(await ponderingForOpener(db, 'u1', ON)).toBeDefined();
  });

  it('counts unreadable signals as a crisis (fails closed)', async () => {
    const broken = {
      collection: () => {
        throw new Error('firestore down');
      },
    } as never;
    expect(await hadRecentCrisis(broken, 'u1', NOW)).toBe(true);
  });
});
