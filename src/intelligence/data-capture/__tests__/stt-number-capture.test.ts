/**
 * Passive data capture (process-turn.ts → processDataCapture) reads a number the way
 * speech-to-text writes it. Prod 2026-10-26 18:47: the owner's words reached capture as
 * "his number is 801, 661, 6112" (groups split by commas), which no phone pattern matched,
 * so nothing was saved. A number that says nobody's ("his number is …") is not saved either:
 * it would be a contact named "Contact" that no one can ask for (callOnBehalf saves those
 * under the person asked for, contact-on-mention.ts).
 *
 * Both behind CONTACT_SAVE_ON_MENTION; off, capture is main's. Runs the real capture; only the stores (entity store, user_contacts, contact_relationships)
 * are faked. All numbers are fake (555-01xx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const written = vi.hoisted(() => [] as string[]);
vi.mock('../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => true,
  capturePersonEntity: async () => void written.push('entity_store'),
}));
vi.mock('../../../services/contacts.js', () => ({
  findContact: async () => null,
  updateContact: () => undefined,
  createContact: async () => {
    written.push('user_contacts');
    return { id: 'c1' };
  },
}));
vi.mock('../../../services/contacts/contact-relationship-service.js', () => ({
  upsertContact: async () => void written.push('contact_relationships'),
}));

import { processDataCapture } from '../index.js';

const capture = (transcript: string) =>
  processDataCapture({ transcript, userId: 'uid_owner', sessionId: 'session-1' });

beforeEach(async () => {
  await new Promise((r) => {
    setTimeout(r, 20); // the previous test's background saves land first
  });
  written.length = 0;
  vi.stubEnv('CONTACT_SAVE_ON_MENTION', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('numbers as speech-to-text writes them', () => {
  it('"My dad\'s number is 801, 555, 0142." is saved for Dad', async () => {
    const { captured } = await capture("My dad's number is 801, 555, 0142.");
    expect(captured[0].entity).toMatchObject({ relationship: 'father', phone: '801, 555, 0142' });
    expect(captured[0].storage.action).toBe('create');
    await vi.waitFor(() =>
      expect(written).toEqual(['entity_store', 'user_contacts', 'contact_relationships'])
    );
  });

  it('dashes and spaces still read as before', async () => {
    for (const said of ["My dad's number is 801-555-0142.", "My dad's number is 801 555 0142."]) {
      // eslint-disable-next-line no-await-in-loop -- one at a time
      const { captured } = await capture(said);
      expect(captured[0].storage.action).toBe('create');
    }
    await vi.waitFor(() => expect(written.filter((w) => w === 'user_contacts')).toHaveLength(2));
  });

  it('"his number is 801, 555, 0142" names nobody: read, not saved as a "Contact"', async () => {
    const result = await capture('No, his number is 801, 555, 0142.');
    expect(result.captured[0].entity).toMatchObject({ phone: '801, 555, 0142' });
    expect(result.captured[0].storage.action).toBe('skip');
    expect(result.suggestedAcknowledgment).toBeUndefined();
    await new Promise((r) => {
      setTimeout(r, 20);
    });
    expect(written).toEqual([]);
  });
});

describe('CONTACT_SAVE_ON_MENTION=off: capture as on main', () => {
  it('comma-split groups are not read as a number, and a number naming nobody is saved', async () => {
    vi.stubEnv('CONTACT_SAVE_ON_MENTION', 'off');
    const comma = await capture("My dad's number is 801, 555, 0142.");
    expect(comma.captured[0].entity).toMatchObject({ relationship: 'father', phone: undefined });
    const nameless = await capture('No, his number is 801-555-0142.');
    expect(nameless.captured[0].storage.action).toBe('create');
    await vi.waitFor(() => expect(written).toContain('user_contacts'));
  });
});
