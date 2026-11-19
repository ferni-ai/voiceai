/**
 * Forget reaches the address book (FORGET_EVERY_READER=on). On dev, deleting
 * off as on prod, Ferni saved a caller's brother's new number as a contact,
 * the caller asked him to forget it, and the next call he read it back from
 * the contact. Through the real contacts tools and the real forget match;
 * only the contact store and the stored topics are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const book = vi.hoisted(() => {
  const theo = {
    id: 'c-theo',
    displayName: 'Theo',
    nicknames: [],
    relationship: 'brother',
    phones: [{ number: '+14355550142', type: 'mobile', primary: true }],
    emails: [{ address: 'theo.example@example.com', type: 'personal' }],
    groups: [],
    isFavorite: false,
  };
  const mom = {
    id: 'c-mom',
    displayName: 'Mom',
    nicknames: ['mom'],
    relationship: 'mother',
    phones: [{ number: '+18015550111', type: 'mobile', primary: true }],
    emails: [],
    groups: [],
    isFavorite: true,
  };
  return { theo, mom, topics: [] as string[] };
});

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => ({ description: config.description, execute: config.execute })) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../services/contacts.js', async (orig) => ({
  ...(await orig<object>()),
  searchContacts: vi.fn(async (_u: string, q: string) =>
    [book.theo, book.mom]
      .filter((c) => c.displayName.toLowerCase().includes(q.toLowerCase()))
      .map((contact) => ({ contact, score: 1 }))
  ),
  findContact: vi.fn(
    async (_u: string, q: string) =>
      [book.theo, book.mom].find((c) => c.displayName.toLowerCase() === q.toLowerCase()) ?? null
  ),
  getUserContacts: vi.fn(async () => [book.theo, book.mom]),
  formatContactForSpeech: (c: { displayName: string }) => c.displayName,
}));
vi.mock('../../../memory/recall/forget-topics-source.js', async (orig) => ({
  ...(await orig<object>()),
  topicsWithin: vi.fn(async () => book.topics),
}));

import { createContactsTools } from '../contacts-tools.js';

interface Exec {
  execute: (args: object, opts: unknown) => Promise<unknown>;
}
const USER = 'member-forget-contacts';

async function run(
  tool: 'findMyContact' | 'callMyContact' | 'listContacts',
  args: object
): Promise<string> {
  const t = createContactsTools()[tool] as unknown as Exec;
  return String(await t.execute(args, { toolCallId: 't', ctx: { userData: { userId: USER } } }));
}

beforeEach(() => vi.stubEnv('FORGET_EVERY_READER', 'on'));
afterEach(() => {
  vi.unstubAllEnvs();
  book.topics = [];
});

describe('the contacts tools leave out what the caller asked to forget', () => {
  it('"forget Theo\'s number": find gives Theo without the number', async () => {
    book.topics = ["Theo's phone number"];
    const reply = await run('findMyContact', { query: 'Theo' });
    expect(reply).toContain('Theo');
    expect(reply).not.toMatch(/0142/);
    expect(reply).toContain('theo.example@example.com');
  });

  it('a topic that is the number itself hides it too', async () => {
    book.topics = ['4355550142'];
    expect(await run('findMyContact', { query: 'Theo' })).not.toMatch(/0142/);
  });

  it('"forget Theo": find and list leave the contact out, Mom stays', async () => {
    book.topics = ['Theo'];
    expect(await run('findMyContact', { query: 'Theo' })).toContain(`I don't have "Theo"`);
    const list = await run('listContacts', { filter: 'all', limit: 10 });
    expect(list).not.toContain('Theo');
    expect(list).toContain('Mom');
  });

  it('call has no number to offer once the number is forgotten', async () => {
    book.topics = ["Theo's cell number"];
    expect(await run('callMyContact', { who: 'Theo' })).toBe(
      'I have Theo saved, but no phone number. Want to add one?'
    );
  });

  it('a topic about something else hides nothing', async () => {
    book.topics = ['the Denver job offer'];
    expect(await run('findMyContact', { query: 'Theo' })).toMatch(/0142/);
    expect(await run('listContacts', { filter: 'all', limit: 10 })).toContain('Theo');
  });

  it('flag off: the address book reads as before', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    book.topics = ['Theo'];
    expect(await run('findMyContact', { query: 'Theo' })).toMatch(/0142/);
  });
});
