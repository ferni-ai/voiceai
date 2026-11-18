/**
 * The data export marks records about a forgotten topic and leaves them in (#3995). Runs the
 * real export service and the real matcher through the memory index; only the stores behind
 * the export and the stored topic list are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { history, topics, inProcess } = vi.hoisted(() => ({
  history: { getHistory: vi.fn(), deleteUserHistory: vi.fn() },
  topics: vi.fn<(userId: string) => Promise<string[] | null>>(),
  inProcess: vi.fn<(userId: string) => string[]>(),
}));

vi.mock('../../stores/conversation-history.js', () => ({
  getConversationHistoryService: () => history,
}));
vi.mock('../../memory/cognitive-memory.js', () => ({ getCognitiveMemoryService: () => ({}) }));
vi.mock('../../engagement/engagement-store.js', () => ({ getEngagementStore: async () => ({}) }));
const records = vi.hoisted(() => vi.fn());
vi.mock('../user-records-export.js', async (orig) => ({
  ...(await orig<typeof import('../user-records-export.js')>()),
  exportUserRecords: records,
}));
vi.mock('../../../memory/recall/forget.js', async (orig) => ({
  ...(await orig<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: topics,
  forgottenInProcess: inProcess,
}));

import { getDataExportService } from '../data-export.js';

const UID = 'user-export-marks';

/** Fictional calls: one about the Denver offer, one not. */
function calls() {
  return [
    {
      id: 'c1',
      summary: 'A catch-up about work',
      messages: [
        { role: 'user', text: 'I got the offer from the Denver office' },
        { role: 'assistant', text: 'That is big news' },
      ],
    },
    {
      id: 'c2',
      summary: 'Planning the garden beds',
      messages: [{ role: 'user', text: 'Tomatoes' }],
    },
  ];
}

async function exportJson(): Promise<Record<string, unknown>> {
  return JSON.parse(await getDataExportService().exportData(UID, 'json', ['Conversations']));
}

function conversations(file: Record<string, unknown>) {
  return (file.categories as Record<string, ReturnType<typeof calls>>).conversations;
}

beforeEach(() => {
  history.getHistory.mockResolvedValue(calls());
  topics.mockResolvedValue(['the Denver job']);
  inProcess.mockReturnValue([]);
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('data export, FORGET_EVERY_READER on', () => {
  it('tags the message about a forgotten topic and drops nothing', async () => {
    const file = await exportJson();
    const [work, garden] = conversations(file);
    expect(work.messages[0]).toMatchObject({ heldByForget: true });
    expect(work.messages[0].text).toBe('I got the offer from the Denver office');
    expect(work.messages[1]).not.toHaveProperty('heldByForget');
    expect(garden).not.toHaveProperty('heldByForget');
    expect(conversations(file)).toHaveLength(2);
  });

  it('tags the innermost record: the call is not tagged when its message explains the match', async () => {
    const [work] = conversations(await exportJson());
    expect(work).not.toHaveProperty('heldByForget');
  });

  it('tags the call itself when only its own fields mention the topic', async () => {
    history.getHistory.mockResolvedValue([
      { id: 'c3', summary: 'Weighing the Denver move', messages: [{ text: 'hard choice' }] },
    ]);
    const [call] = conversations(await exportJson());
    expect(call).toMatchObject({ heldByForget: true });
    expect(call.messages[0]).not.toHaveProperty('heldByForget');
  });

  it('lists the forgotten topics and says why records are tagged', async () => {
    const file = await exportJson();
    expect(file.forgottenTopics).toEqual(['the Denver job']);
    expect(file.forgottenNote).toMatch(/heldByForget/);
  });

  it('counts a topic forgotten earlier in this process', async () => {
    topics.mockResolvedValue([]);
    inProcess.mockReturnValue(['the garden beds']);
    const file = await exportJson();
    expect(file.forgottenTopics).toEqual(['the garden beds']);
    expect(conversations(file)[1]).toMatchObject({ heldByForget: true });
  });

  it('with nothing forgotten, lists none and tags nothing', async () => {
    topics.mockResolvedValue([]);
    const text = await getDataExportService().exportData(UID, 'json', ['Conversations']);
    expect(JSON.parse(text).forgottenTopics).toEqual([]);
    expect(text).not.toContain('heldByForget":');
  });

  it.each([
    ['unreadable', () => topics.mockResolvedValue(null)],
    ['a failed read', () => topics.mockRejectedValue(new Error('firestore down'))],
  ])('with the list %s, the whole file goes out untagged and says so', async (_, arrange) => {
    arrange();
    const text = await getDataExportService().exportData(UID, 'json', ['Conversations']);
    const file = JSON.parse(text);
    expect(file.forgottenTopics).toBeNull();
    expect(file.forgottenNote).toMatch(/couldn't be read/);
    expect(text).not.toContain('heldByForget":');
    expect(conversations(file)).toEqual(calls());
  });

  it('CSV: lists the topics and adds the column when a later row is tagged', async () => {
    history.getHistory.mockResolvedValue([
      { id: 'c2', summary: 'Planning the garden beds' },
      { id: 'c1', summary: 'The Denver offer came in' },
    ]);
    const csv = await getDataExportService().exportData(UID, 'csv', ['Conversations']);
    const lines = csv.split('\n');
    expect(lines).toContain('# Forgotten topics: the Denver job');
    expect(lines).toContain('id,summary,heldByForget');
    expect(lines).toContain('"c1","The Denver offer came in",true');
    expect(lines).toContain('"c2","Planning the garden beds",');
  });
});

describe('data export, FORGET_EVERY_READER on, production shapes', () => {
  it('tags inside the conversation store shape ({ sessions: [...] }) by a nested field', async () => {
    history.getHistory.mockResolvedValue({
      sessions: [
        { id: 's1', meta: { topic: 'moving to Denver' } },
        { id: 's2', meta: { topic: 'garden' } },
      ],
      totalSessions: 2,
    });
    const file = await exportJson();
    const { sessions } = (file.categories as Record<string, { sessions: object[] }>).conversations;
    expect(sessions[0]).toMatchObject({ heldByForget: true });
    expect(sessions[1]).not.toHaveProperty('heldByForget');
  });

  it('tags a Records row matched only inside its data map, under its store label', async () => {
    records.mockResolvedValue({
      'bogle_users/{uid}/dynamic_entities': [
        { name: 'Kessler', attributes: { note: 'met at the Denver office' } },
        { name: 'Okafor', attributes: { note: 'book club' } },
      ],
    });
    const text = await getDataExportService().exportData(UID, 'json', ['Records']);
    const rows = Object.values(JSON.parse(text).categories.records as Record<string, object[]>)[0];
    expect(rows[0]).toMatchObject({ name: 'Kessler', heldByForget: true });
    expect(rows[1]).not.toHaveProperty('heldByForget');
  });

  it('a stored heldByForget on a child does not stand in for a match', async () => {
    history.getHistory.mockResolvedValue([
      { id: 'c', text: 'Denver', kids: [{ t: 'tea', heldByForget: true }] },
    ]);
    const [call] = conversations(await exportJson()) as unknown as Array<Record<string, unknown>>;
    expect(call).toMatchObject({ heldByForget: true });
  });

  it('CSV says when the list could not be read, and gives no count', async () => {
    topics.mockResolvedValue(null);
    const csv = await getDataExportService().exportData(UID, 'csv', ['Conversations']);
    expect(csv.split('\n')).toContain('# Forgotten topics: could not be read');
    expect(csv).not.toContain('Records tagged heldByForget');
  });

  it('CSV counts tagged records and shows each one in its row', async () => {
    history.getHistory.mockResolvedValue({
      sessions: [
        { id: 's1', summary: 'Denver offer', messages: [{ text: 'the Denver office called' }] },
        { id: 's2', summary: 'moving to Denver' },
        { id: 's3', summary: 'garden' },
      ],
    });
    const csv = await getDataExportService().exportData(UID, 'csv', ['Conversations']);
    const lines = csv.split('\n');
    expect(lines).toContain('# Records tagged heldByForget: 2.');
    expect(csv).not.toContain('JSON download');
    // The innermost record is the one tagged: s1's message (inside its JSON cell) and s2
    expect(lines).toContain('id,summary,messages,heldByForget');
    expect(lines).toContain(
      '"s1","Denver offer","[{""text"":""the Denver office called"",""heldByForget"":true}]",'
    );
    expect(lines).toContain('"s2","moving to Denver",,true');
    expect(lines).toContain('"s3","garden",,');
    const file = await exportJson();
    expect(file.heldCount).toBe(2);
  });

  it('CSV with nothing tagged says 0 and sends nobody to the JSON', async () => {
    topics.mockResolvedValue([]);
    const csv = await getDataExportService().exportData(UID, 'csv', ['Conversations']);
    expect(csv.split('\n')).toContain('# Records tagged heldByForget: 0.');
  });
});

describe.each([
  ['unset', undefined],
  ['off', 'off'],
])('data export, FORGET_EVERY_READER %s', (_, value) => {
  beforeEach(() => {
    vi.stubEnv('FORGET_EVERY_READER', value);
  });

  it('is unchanged: no topic read, no list, no tags', async () => {
    const text = await getDataExportService().exportData(UID, 'json', ['Conversations']);
    const file = JSON.parse(text);
    expect(Object.keys(file)).toEqual(['exportedAt', 'userId', 'version', 'categories']);
    expect(conversations(file)).toEqual(calls());
    expect(topics).not.toHaveBeenCalled();
  });

  it('CSV is unchanged: no topic lines, no column', async () => {
    const csv = await getDataExportService().exportData(UID, 'csv', ['Conversations']);
    expect(csv).not.toMatch(/Forgotten topics|heldByForget/);
    expect(csv.split('\n').slice(0, 6)).toEqual([
      '# Ferni Data Export',
      expect.stringMatching(/^# Exported: /),
      `# User: ${UID}`,
      '# Version: 2.0',
      '',
      '## CONVERSATIONS',
    ]);
  });
});
