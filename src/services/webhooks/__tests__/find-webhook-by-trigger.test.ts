/**
 * findWebhookByTrigger picks the automation a spoken phrase names. It matches
 * the trigger exactly or as whole words, never a fragment of a word, and an
 * empty or very short phrase picks nothing (issue #3992: "" matched the first
 * enabled webhook, since "garage door".includes("") is true).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => [
  { id: 'wh-garage', name: 'Garage', enabled: true, voiceTriggers: ['garage door'] },
  { id: 'wh-bed', name: 'Bedtime', enabled: true, voiceTriggers: ['bedtime routine'] },
  { id: 'wh-lights', name: 'Lights', enabled: true, voiceTriggers: ['lights on'] },
  { id: 'wh-tv', name: 'TV', enabled: true, voiceTriggers: ['tv'] },
  { id: 'wh-lamp', name: 'Lamp', enabled: true, voiceTriggers: ['开灯'] },
  { id: 'wh-door', name: 'Door', enabled: true, voiceTriggers: ['दरवाज़ा खोलो'] },
  { id: 'wh-khmer', name: 'Light', enabled: true, voiceTriggers: ['បើកភ្លើង'] },
  // All punctuation: no words at all, so no phrase (not even an empty one) may pick it.
  { id: 'wh-bang', name: 'Bang', enabled: true, voiceTriggers: ['!!'] },
]);

vi.mock('@google-cloud/firestore', () => {
  const docs = stored.map((w) => ({ id: w.id, data: () => w }));
  const user = { collection: () => ({ get: async () => ({ size: docs.length, docs }) }) };
  return {
    FieldValue: {},
    Firestore: class {
      collection = () => ({ doc: () => user });
    },
  };
});
vi.mock('../webhook-sealing.js', () => ({
  openWebhookDoc: (doc: { data: () => unknown }) => doc.data(),
  sealedRecord: vi.fn(),
  WEBHOOK_SEALING_REFUSED: 'refused',
}));

import { clearAllCaches, findWebhookByTrigger } from '../webhook-config-store.js';

const match = async (phrase: string) => (await findWebhookByTrigger('user-1', phrase))?.id ?? null;

describe('findWebhookByTrigger', () => {
  afterEach(() => clearAllCaches());

  it('the exact trigger matches, in any case and with stray punctuation', async () => {
    expect(await match('garage door')).toBe('wh-garage');
    expect(await match('Garage Door!')).toBe('wh-garage');
  });

  it('a phrase that holds the trigger as whole words matches', async () => {
    expect(await match('run my bedtime routine')).toBe('wh-bed');
  });

  it('an empty, blank or one-letter phrase matches nothing', async () => {
    expect(await match('')).toBeNull();
    expect(await match('   ')).toBeNull();
    expect(await match('a')).toBeNull();
  });

  it('a fragment of a word matches nothing', async () => {
    expect(await match('gar')).toBeNull(); // inside "garage"
    expect(await match('door routine')).toBeNull();
    expect(await match('run my bedtime routines')).toBeNull(); // "routine" inside "routines"
  });

  it('a two-letter trigger the validator allows still fires when said whole', async () => {
    expect(await match('tv')).toBe('wh-tv');
    expect(await match('turn on the tv')).toBe('wh-tv');
  });

  it('a phrase under three letters never picks a trigger it is only part of', async () => {
    expect(await match('on')).toBeNull(); // a word of "lights on"
  });

  it('scripts without spaces match the whole trigger inside a sentence', async () => {
    expect(await match('开灯')).toBe('wh-lamp');
    expect(await match('请开灯')).toBe('wh-lamp');
    expect(await match('សូមបើកភ្លើង')).toBe('wh-khmer');
  });

  it('Devanagari words stay whole: a different word does not match by its consonants', async () => {
    expect(await match('खेलो')).toBeNull(); // "play" vs "खोलो" ("open")
    expect(await match('दरवाज़ा खोलो')).toBe('wh-door');
  });
});
