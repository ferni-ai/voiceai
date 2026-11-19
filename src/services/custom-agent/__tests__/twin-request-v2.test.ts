/**
 * TWIN_CONVERSATION_V2 in withOwnTwin: the server-built profile (the Chronicle's past self)
 * carries the twin's life events and people, and talk-to-twin's journal entries are picked
 * here by the one stopword rule instead of the client's whitespace match. Off, both are as
 * before.
 *
 * Drives the real withOwnTwin; the caller's agents and journal are stubbed. No model is
 * called on this path. Fictional person only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  listCustomAgents: vi.fn<(uid: string) => Promise<unknown[]>>(),
  getCustomAgent: vi.fn<(uid: string, id: string) => Promise<unknown>>(),
  getAllEntries: vi.fn<(uid: string, options?: unknown) => Promise<unknown[]>>(),
}));
vi.mock('../custom-agent-persistence-service.js', () => ({
  listCustomAgents: m.listCustomAgents,
  getCustomAgent: m.getCustomAgent,
}));
vi.mock('../../journal/index.js', () => ({
  getJournalService: () => ({ getAllEntries: m.getAllEntries }),
}));

const { withOwnTwin } = await import('../twin-request.js');

const ON = { TWIN_CONVERSATION_V2: 'on' };
const OFF = {};

const twin = {
  id: 'twin-1',
  type: 'twin',
  name: 'Rosa',
  displayName: 'Rosa',
  personality: { values: ['patience'], worldview: 'water the roots' },
  behaviors: { catchphrases: ['mira,'] },
  memories: {
    lifeEvents: [
      {
        title: 'Retired from the library',
        date: '2019',
        description: 'Planted the mesquite by the gate.',
      },
    ],
    relationships: [{ personName: 'Ines', relationship: 'sister' }],
  },
};

const entry = (content: string) => ({ content, createdAt: new Date('2026-04-01'), themes: [] });
const journal = [
  entry('My back is sore and I am tired but the beans came up.'),
  entry('Composted the garden beds and walked to the wash.'),
  entry('Ines called about the calabacitas recipe for March.'),
];

/** What talk-to-twin sends: its own profile and its own (whitespace) pick of entries. */
const clientBody = {
  userMessage: 'When does Ines come for the recipe?',
  profile: {
    name: 'Rosa',
    mannerisms: [],
    values: [],
    communicationStyle: '',
    philosophy: '',
    passions: [],
  },
  relevantJournals: [
    { content: 'My back is sore and I am tired but the beans came up.', date: '2026-04-01' },
  ],
  keyThemes: ['garden'],
};

beforeEach(() => {
  m.listCustomAgents.mockResolvedValue([twin]);
  m.getCustomAgent.mockResolvedValue(twin);
  m.getAllEntries.mockResolvedValue(journal);
});

describe('the Chronicle profile', () => {
  it('carries life events and people when on', async () => {
    const body = await withOwnTwin('uid-rosa', { userMessage: 'Do you remember retiring?' }, ON);
    const profile = body.profile as { lifeChapters?: unknown; relationships?: unknown };
    expect(profile.lifeChapters).toEqual([
      {
        title: 'Retired from the library',
        years: '2019',
        description: 'Planted the mesquite by the gate.',
      },
    ]);
    expect(profile.relationships).toEqual([{ name: 'Ines', relationship: 'sister' }]);
  });

  it('leaves them out when off', async () => {
    const body = await withOwnTwin('uid-rosa', { userMessage: 'Do you remember retiring?' }, OFF);
    const profile = body.profile as Record<string, unknown>;
    expect(profile.lifeChapters).toBeUndefined();
    expect(profile.relationships).toBeUndefined();
  });
});

describe("talk-to-twin's journal entries", () => {
  it("are picked on the server when on: the entry about Ines, not the client's stopword match", async () => {
    const body = await withOwnTwin('uid-rosa', clientBody, ON);
    expect(m.getAllEntries).toHaveBeenCalledWith('uid-rosa', expect.anything());
    expect(body.relevantJournals?.map((j) => j.content)).toEqual([
      'Ines called about the calabacitas recipe for March.',
    ]);
    expect(body.profile).toBe(clientBody.profile); // its own profile is kept
    expect(body.keyThemes).toEqual(['garden']);
  });

  it("are the client's own when off, and the journal is not read", async () => {
    m.getAllEntries.mockClear();
    const body = await withOwnTwin('uid-rosa', clientBody, OFF);
    expect(body).toBe(clientBody);
    expect(m.getAllEntries).not.toHaveBeenCalled();
  });
});
