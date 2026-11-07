/**
 * safety-talk reads the lines from CRISIS_RESOURCES itself, never from a copy:
 * a line added to the kernel list is read with no other edit. The entry below
 * is fictional and exists only in this mock.
 */
import { describe, expect, it, vi } from 'vitest';

const FICTIONAL = {
  name: 'Lanternfold National Helpline',
  description: 'A fictional line for this test',
  text: 'Text WRENLIGHT to 424242',
  available: '24/7',
};

vi.mock('../crisis-response.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../crisis-response.js')>();
  return {
    ...actual,
    CRISIS_RESOURCES: {
      ...actual.CRISIS_RESOURCES,
      severe_distress: [...actual.CRISIS_RESOURCES.severe_distress, FICTIONAL],
    },
  };
});

const { reachesHelp } = await import('../safety-talk.js');

describe('a new CRISIS_RESOURCES entry is read', () => {
  it('by name, short name, text number and texted word', async () => {
    const actual =
      await vi.importActual<typeof import('../crisis-response.js')>('../crisis-response.js');
    const real = Object.values(actual.CRISIS_RESOURCES).flat();
    expect(real.some((r) => r.name === FICTIONAL.name)).toBe(false);

    for (const t of [
      'The Lanternfold National Helpline is open late.',
      'Have you tried Lanternfold?',
      'The number is 424242.',
      'You can text WRENLIGHT any time.',
    ])
      expect(reachesHelp(t), t).toBe(true);
    expect(reachesHelp('The lantern folded in the wind.')).toBe(false);
  });
});
