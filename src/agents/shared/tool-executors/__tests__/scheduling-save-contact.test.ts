/**
 * saveContact / saveContactInfo / addContact / contact_add on the executor path save the
 * named person to the user's contacts. They never write the owner's own contact info: a
 * named person's number there made the owner's own texts and check-ins go to that person.
 * Fixtures are fictional (555-01xx, example.com).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WHERE_TO_ADD_NUMBER } from '../../../../tools/shared/where-to-add-number.js';

interface Stored {
  name: string;
  contactId: string;
  phone?: string;
  email?: string;
  relationship?: string;
}

const h = vi.hoisted(() => ({
  owner: new Map<string, Record<string, unknown>>(),
  contacts: [] as Stored[],
  logLines: [] as unknown[][],
  storeFails: false,
}));

vi.mock('../../../../utils/safe-logger.js', () => {
  const record =
    (level: string) =>
    (...a: unknown[]) =>
      h.logLines.push([level, ...a]);
  const logger = {
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    trace: record('trace'),
    fatal: record('fatal'),
    child: () => logger,
  };
  return { createLogger: () => logger, getLogger: () => logger };
});

vi.mock('../../../../tools/domains/proactive/outreach/index.js', () => ({
  setUserContactInfo: vi.fn(async (userId: string, info: Record<string, unknown>) => {
    h.owner.set(userId, { ...h.owner.get(userId), ...info });
  }),
  getUserContactInfo: vi.fn(async (userId: string) => h.owner.get(userId)),
}));

vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  getContacts: vi.fn(async () => {
    if (h.storeFails) throw new Error('store down');
    return h.contacts;
  }),
  upsertContact: vi.fn(async (_userId: string, c: Stored) => {
    const i = h.contacts.findIndex((x) => x.contactId === c.contactId);
    const saved = i >= 0 ? { ...h.contacts[i], ...c } : { relationship: 'other', ...c };
    if (i >= 0) h.contacts[i] = saved;
    else h.contacts.push(saved);
    return saved;
  }),
}));

const outreach = await import('../../../../tools/domains/proactive/outreach/index.js');
const { schedulingExecutor } = await import('../scheduling-executor.js');

const USER = 'user-owner-1';
const OWNER_INFO = { phone: '555-0199', email: 'owner@example.com', timezone: 'America/Denver' };
const ctx = { userId: USER, sessionId: 's-1', personaId: 'ferni' };
const run = (fn: string, args: Record<string, unknown>) =>
  schedulingExecutor.execute(fn, args, ctx) as Promise<string>;

beforeEach(() => {
  vi.clearAllMocks();
  h.owner.clear();
  h.owner.set(USER, { ...OWNER_INFO });
  h.contacts.length = 0;
  h.logLines.length = 0;
  h.storeFails = false;
});

describe('saveContact on the executor path', () => {
  it("saves Mom to the contacts store and leaves the owner's contact info alone", async () => {
    expect(await outreach.getUserContactInfo(USER)).toEqual(OWNER_INFO);
    expect(h.contacts).toHaveLength(0);

    const reply = await run('saveContact', { name: 'Mom', phone: '555-0100' });

    expect(outreach.setUserContactInfo).not.toHaveBeenCalled();
    expect(await outreach.getUserContactInfo(USER)).toEqual(OWNER_INFO);
    expect(h.contacts).toEqual([expect.objectContaining({ name: 'Mom', phone: '555-0100' })]);
    expect(reply).toContain('Mom');
    expect(reply).toContain('contacts');
  });

  it.each(['saveContactInfo', 'addContact', 'contact_add'])(
    '%s with only a relationship saves that person, not the owner',
    async (fn) => {
      await run(fn, { relationship: 'sister', email: 'sis@example.com' });

      expect(outreach.setUserContactInfo).not.toHaveBeenCalled();
      expect(h.owner.get(USER)).toEqual(OWNER_INFO);
      expect(h.contacts).toEqual([
        expect.objectContaining({
          name: 'sister',
          email: 'sis@example.com',
          relationship: 'family',
        }),
      ]);
    }
  );

  it('updates an existing contact of the same name instead of adding a second one', async () => {
    h.contacts.push({ name: 'Mom', contactId: 'mom_1', phone: '555-0102' });

    await run('addContact', { name: 'mom', phone: '555-0100' });

    expect(h.contacts).toEqual([
      expect.objectContaining({ name: 'Mom', contactId: 'mom_1', phone: '555-0100' }),
    ]);
    expect(outreach.setUserContactInfo).not.toHaveBeenCalled();
  });

  it.each([{ phone: '555-0101' }, { name: 'me', phone: '555-0101' }, { email: 'new@example.com' }])(
    "never changes the owner's own details from a model argument: %o",
    async (args) => {
      const reply = await run('saveContact', args);

      expect(outreach.setUserContactInfo).not.toHaveBeenCalled();
      expect(h.owner.get(USER)).toEqual(OWNER_INFO);
      expect(h.contacts).toHaveLength(0);
      expect(reply).toContain(WHERE_TO_ADD_NUMBER);
    }
  );

  it('says so honestly when the contacts store fails, and writes nothing to the owner', async () => {
    h.storeFails = true;

    const reply = await run('saveContact', { name: 'Mom', phone: '555-0100' });

    expect(reply).toMatch(/couldn't save that contact/);
    expect(outreach.setUserContactInfo).not.toHaveBeenCalled();
    expect(h.owner.get(USER)).toEqual(OWNER_INFO);
  });

  it("logs ids and counts, never the contact's name, number or email", async () => {
    await run('saveContact', {
      name: 'Rosalind Example',
      phone: '555-0103',
      email: 'rosalind@example.com',
    });

    const saving = h.logLines.find((l) => l.includes('👤 Saving contact'));
    expect(saving?.[1]).toEqual({ hasName: true, hasPhone: true, hasEmail: true, userId: USER });
    const all = JSON.stringify(h.logLines);
    expect(all).not.toMatch(/Rosalind|555-0103|rosalind@example\.com/);
  });
});
