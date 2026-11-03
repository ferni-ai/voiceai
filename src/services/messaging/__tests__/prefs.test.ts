/**
 * prefs.ts: one record, bogle_users/{uid}.messagingPrefs. Missing or invalid
 * fields read as the defaults (21:00 to 08:00, every channel on), invalid input
 * is refused whole, and a save reads back the same values.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeUserDocs } from './fake-user-docs.js';

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => h.db }));

const { DEFAULT_PREFS, PrefsError, prefsFromDoc, readPrefs, savedQuietSpan, validatePatch } =
  await import('../prefs.js');
const { writePrefs } = await import('../prefs.js');

let store: ReturnType<typeof fakeUserDocs>;
beforeEach(() => {
  store = fakeUserDocs();
  h.db = store.db;
});

describe('reading', () => {
  it('a person with no record gets 21:00-08:00 and every channel on', async () => {
    expect(await readPrefs('nobody')).toEqual({
      quietStart: '21:00',
      quietEnd: '08:00',
      channels: { sms: true, email: true, push: true },
    });
  });

  it('throws when the record cannot be read, rather than passing defaults off as theirs', async () => {
    store.docs.set('u1', { messagingPrefs: { quietStart: '23:00', quietEnd: '06:00' } });
    const down = () => Promise.reject(new Error('UNAVAILABLE'));
    h.db = { collection: () => ({ doc: () => ({ get: down }) }) };
    await expect(readPrefs('u1')).rejects.toThrow('UNAVAILABLE');
    h.db = null;
    await expect(readPrefs('u1')).rejects.toThrow(/Firestore/);
  });

  it('a bad stored field reads as its default, the good ones as saved', () => {
    const p = prefsFromDoc({
      messagingPrefs: {
        quietStart: '25:00',
        quietEnd: '07:00',
        zone: 'Mars/Olympus',
        channels: { sms: false, email: 'no' },
        maxPerDay: 9,
        updatedBy: 'hacker',
      },
    });
    expect(p).toEqual({ ...DEFAULT_PREFS, channels: { sms: false, email: true, push: true } });
  });

  it('until a record is saved, quiet hours come from the older outreachPreferences', () => {
    const doc = {
      outreachPreferences: { quietHours: { enabled: true, start: '20:00', end: '9:00' } },
    };
    expect(prefsFromDoc(doc)).toMatchObject({ quietStart: '20:00', quietEnd: '09:00' });
    const off = {
      outreachPreferences: { quietHours: { enabled: false, start: '20:00', end: '9:00' } },
    };
    expect(prefsFromDoc(off)).toMatchObject({ quietStart: '21:00', quietEnd: '08:00' });
  });

  it("the zone is the saved one, else the profile's", () => {
    const profile = { contactInfo: { timezone: 'America/Chicago' } };
    expect(prefsFromDoc(profile).zone).toBe('America/Chicago');
    const saved = { ...profile, messagingPrefs: { zone: 'America/New_York' } };
    expect(prefsFromDoc(saved).zone).toBe('America/New_York');
  });
});

describe('validating', () => {
  it.each([
    [{ quietStart: '7pm' }, /quietStart/],
    [{ quietEnd: '24:00' }, /quietEnd/],
    [{ zone: 'Not/AZone' }, /zone/],
    [{ channels: { fax: true } }, /channels/],
    [{ channels: { sms: 'off' } }, /channels/],
    [{ maxPerDay: 4 }, /maxPerDay/],
    [{ maxPerDay: 1.5 }, /maxPerDay/],
    [{ checkinWindow: { start: '09:00', end: '09:00' } }, /checkinWindow/],
  ])('refuses %j', (raw, error) => {
    const r = validatePatch(raw);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error).toMatch(error);
  });

  it('accepts and normalises a good patch', () => {
    expect(validatePatch({ quietStart: '9:30', maxPerDay: 0, channels: { sms: false } })).toEqual({
      ok: true,
      patch: { quietStart: '09:30', maxPerDay: 0, channels: { sms: false } },
    });
  });
});

describe('writing', () => {
  it('saves and reads back the same values, stamped with who changed them', async () => {
    const raw = { quietStart: '22:30', quietEnd: '07:00', zone: 'America/New_York' };
    await writePrefs('u1', raw, 'panel');
    await writePrefs('u1', { channels: { sms: false }, maxPerDay: 2 }, 'voice');
    const back = await readPrefs('u1');
    expect(back).toMatchObject({
      quietStart: '22:30',
      quietEnd: '07:00',
      zone: 'America/New_York',
      channels: { sms: false, email: true, push: true },
      maxPerDay: 2,
      updatedBy: 'voice',
    });
    expect(Date.parse(back.updatedAt ?? '')).not.toBeNaN();
  });

  it('refuses invalid input and saves nothing', async () => {
    await expect(writePrefs('u1', { quietStart: 'late' }, 'text')).rejects.toBeInstanceOf(
      PrefsError
    );
    await expect(
      writePrefs('u1', { quietStart: '08:00', quietEnd: '08:00' }, 'panel')
    ).rejects.toThrow(/different start and end/);
    expect(store.docs.has('u1')).toBe(false);
  });

  it("never copies the profile's zone into the record (the profile's can change)", async () => {
    store.docs.set('u1', { contactInfo: { timezone: 'America/Chicago' } });
    await writePrefs('u1', { quietStart: '22:00' }, 'panel');
    expect((store.docs.get('u1')?.messagingPrefs as Record<string, unknown>).zone).toBeUndefined();
  });

  it('saves only the fields it is given: a save without quiet hours keeps the stored window', async () => {
    store.docs.set('u1', { messagingPrefs: { quietStart: '21:00', quietEnd: '08:00' } });
    // A voice change lands after this save read the record and before it wrote.
    const doc = store.db.collection('bogle_users').doc('u1');
    const racing = {
      ...store.db,
      collection: () => ({
        doc: () => ({
          ...doc,
          get: async () => {
            const read = (await doc.get()).data(); // what this save saw
            store.docs.set('u1', { messagingPrefs: { quietStart: '23:00', quietEnd: '06:00' } });
            return { exists: true, data: () => read };
          },
        }),
      }),
    };
    h.db = racing;
    await writePrefs('u1', { channels: { sms: false }, maxPerDay: 1 }, 'panel');
    expect(store.docs.get('u1')?.messagingPrefs).toMatchObject({
      quietStart: '23:00',
      quietEnd: '06:00',
      channels: { sms: false },
      maxPerDay: 1,
      updatedBy: 'panel',
    });
  });

  it('never saves the default window for someone who set none', async () => {
    await writePrefs('u1', { channels: { email: false } }, 'panel');
    expect(savedQuietSpan(store.docs.get('u1'))).toBeUndefined();
  });

  it('half a window is saved with the other half as it reads, so the pair stays whole', async () => {
    store.docs.set('u1', { outreachPreferences: { quietHours: { start: '20:00', end: '07:30' } } });
    await writePrefs('u1', { quietStart: '22:00' }, 'panel');
    expect(savedQuietSpan(store.docs.get('u1'))).toEqual({ start: '22:00', end: '07:30' });
  });

  it('throws when it cannot save, so the panel can say so', async () => {
    h.db = null;
    await expect(writePrefs('u1', { quietStart: '22:00' }, 'panel')).rejects.toThrow(/Firestore/);
  });
});
