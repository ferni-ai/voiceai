/**
 * Inbound-SMS and call-status matching find the contact in user_contacts, where
 * contacts are saved, with one indexed query on phoneKeys. It used to read
 * bogle_users/{uid}/contacts (3 docs in prod) for only the first 100 users.
 */
import { describe, expect, it, vi } from 'vitest';
import { findContactByPhone, phoneKey, phoneKeysOf } from '../contact-phone-keys.js';

type Doc = { id: string; data: Record<string, unknown> };

/** user_contacts in memory, answering only the indexed array-contains query. */
function fakeDb(docs: Doc[], fail = false) {
  const queries: Array<{ collection: string; field: string; op: string; value: unknown }> = [];
  const db = {
    collection: (collection: string) => ({
      where: (field: string, op: string, value: unknown) => ({
        limit: (n: number) => ({
          get: async () => {
            if (fail) throw new Error('unavailable');
            queries.push({ collection, field, op, value });
            const hits = docs
              .filter((d) => collection === 'user_contacts' && op === 'array-contains')
              .filter((d) => (d.data[field] as unknown[] | undefined)?.includes(value))
              .slice(0, n);
            return { docs: hits.map((d) => ({ id: d.id, get: (f: string) => d.data[f] })) };
          },
        }),
      }),
    }),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, queries };
}

const mom: Doc = {
  id: 'c-mom',
  data: {
    userId: 'u-1',
    displayName: 'Mom',
    phones: [{ number: '+15125550100' }],
    phoneKeys: ['+15125550100', '+15125550199'],
  },
};

describe('phoneKey / phoneKeysOf', () => {
  it('reads every way a US number is written as one E.164 key', () => {
    for (const raw of ['(512) 555-0100', '512.555.0100', '1 512 555 0100', '+1 512-555-0100']) {
      expect(phoneKey(raw)).toBe('+15125550100');
    }
    expect(phoneKey('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('keeps each usable number once, and drops what is not a number', () => {
    expect(
      phoneKeysOf([{ number: '512-555-0100' }, { number: '+15125550100' }, { number: '' }, {}])
    ).toEqual(['+15125550100']);
    expect(phoneKeysOf(undefined)).toEqual([]);
  });
});

describe('findContactByPhone', () => {
  it("finds the user's saved contact by any of its numbers, however the sender's is written", async () => {
    const { db, queries } = fakeDb([mom]);

    await expect(findContactByPhone('512 555 0199', db)).resolves.toEqual({
      userId: 'u-1',
      contactId: 'c-mom',
      contactName: 'Mom',
    });
    expect(queries).toEqual([
      {
        collection: 'user_contacts',
        field: 'phoneKeys',
        op: 'array-contains',
        value: '+15125550199',
      },
    ]);
  });

  it('is null for a number nobody saved', async () => {
    await expect(findContactByPhone('+15125559999', fakeDb([mom]).db)).resolves.toBeNull();
  });

  it("doesn't guess when more than one user saved the number", async () => {
    const theirs: Doc = { id: 'c-2', data: { ...mom.data, userId: 'u-2' } };
    await expect(findContactByPhone('+15125550100', fakeDb([mom, theirs]).db)).resolves.toBeNull();
  });

  it('is null (and does not throw into the webhook) when the store fails or the number is junk', async () => {
    await expect(findContactByPhone('+15125550100', fakeDb([mom], true).db)).resolves.toBeNull();
    const { db, queries } = fakeDb([mom]);
    await expect(findContactByPhone('12', db)).resolves.toBeNull();
    expect(queries).toHaveLength(0);
  });
});

describe('saving a contact', () => {
  it('writes its phoneKeys, so the lookup can find it', async () => {
    const saved = new Map<string, Record<string, unknown>>();
    vi.doMock('@google-cloud/firestore', () => ({
      Firestore: class {
        collection() {
          return {
            doc: (id: string) => ({
              set: async (data: Record<string, unknown>) => void saved.set(id, data),
            }),
            where: () => ({ get: async () => ({ docs: [], size: 0 }) }),
          };
        }
      },
    }));
    const { createContact } = await import('../contacts-management.js');

    const contact = createContact('u-1', { displayName: 'Mom', phone: '(512) 555-0100' });

    await vi.waitFor(() => expect(saved.get(contact.id)).toBeDefined());
    expect(saved.get(contact.id)!.phoneKeys).toEqual(['+15125550100']);
    vi.doUnmock('@google-cloud/firestore');
  });
});
