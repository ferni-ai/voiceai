/**
 * The CSV data export writes every stored list as rows (#3995). Before, a list nested inside a
 * category (Conversations' sessions, each Records store) was shrunk to "N items", so a CSV
 * download left out most of what Ferni keeps. Runs the real export service; only the stores
 * behind it are faked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const history = vi.hoisted(() => ({ getHistory: vi.fn(), deleteUserHistory: vi.fn() }));
const records = vi.hoisted(() => vi.fn());
const cards = vi.hoisted(() => vi.fn());
const weather = vi.hoisted(() => vi.fn());

vi.mock('../../stores/conversation-history.js', () => ({
  getConversationHistoryService: () => history,
}));
vi.mock('../../memory/cognitive-memory.js', () => ({ getCognitiveMemoryService: () => ({}) }));
vi.mock('../../engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ getWeatherHistory: weather }),
}));
vi.mock('../../approvals/answer-cards.js', () => ({ listAnswerCardsForUser: cards }));
vi.mock('../user-records-export.js', async (orig) => ({
  ...(await orig<typeof import('../user-records-export.js')>()),
  exportUserRecords: records,
}));

import { getDataExportService } from '../data-export.js';

const UID = 'user-export-csv';

/** A minimal RFC 4180 reader, written apart from the exporter so it can't share its mistakes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      rows.push([...row, cell]);
      row = [];
      cell = '';
    } else cell += ch;
  }
  rows.push([...row, cell]);
  return rows;
}

/** The rows under one `## ...` heading, up to the next heading, blank lines dropped. */
function section(csv: string, heading: string): string[][] {
  const rows = parseCsv(csv);
  const start = rows.findIndex((r) => r.length === 1 && r[0] === heading);
  expect(start, `no "${heading}" section in:\n${csv}`).toBeGreaterThanOrEqual(0);
  const body: string[][] = [];
  for (const r of rows.slice(start + 1)) {
    if (r.length === 1 && r[0].startsWith('## ')) break;
    if (r.length === 1 && r[0] === '') continue;
    body.push(r);
  }
  return body;
}

/** Each data row of a section as {header: cell}. */
function table(csv: string, heading: string): Array<Record<string, string>> {
  const [header, ...rows] = section(csv, heading);
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function exportCsv(categories: string[]): Promise<string> {
  return getDataExportService().exportData(UID, 'csv', categories);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('CSV data export', () => {
  it("writes Conversations' sessions as rows, as getHistory returns them", async () => {
    // The production shape: { sessions, totalSessions } (conversation-history.ts getHistory)
    history.getHistory.mockResolvedValue({
      sessions: [
        { id: 's1', date: '2026-11-01', personaName: 'Ferni', duration: 300, insights: ['tea'] },
        { id: 's2', date: '2026-11-02', personaName: 'Ferni', duration: 120, insights: [] },
      ],
      totalSessions: 2,
    });

    const csv = await exportCsv(['Conversations']);

    expect(section(csv, '## CONVERSATIONS')).toEqual([['totalSessions', '2']]);
    const sessions = table(csv, '## CONVERSATIONS / sessions');
    expect(sessions.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(sessions[0]).toMatchObject({ date: '2026-11-01', duration: '300' });
    // A list inside a row is kept as a JSON cell, not dropped
    expect(JSON.parse(sessions[0].insights)).toEqual(['tea']);
    expect(csv).not.toMatch(/\d+ items/);
  });

  it('writes each Records store as its own section of rows', async () => {
    records.mockResolvedValue({
      'Saved places': [
        { id: 'p1', name: 'Corner bakery', where: { city: 'Springfield' } },
        { id: 'p2', name: 'Pool' },
      ],
      'Voice settings': { speed: 1.1, voice: 'warm' },
    });

    const csv = await exportCsv(['Records']);

    const places = table(csv, '## RECORDS / Saved places');
    expect(places.map((p) => p.name)).toEqual(['Corner bakery', 'Pool']);
    expect(JSON.parse(places[0].where)).toEqual({ city: 'Springfield' });
    expect(places[1].where).toBe('');
    // A single-document store stays as key,value lines under the category
    expect(section(csv, '## RECORDS')).toEqual([
      ['Voice settings.speed', '1.1'],
      ['Voice settings.voice', 'warm'],
    ]);
  });

  it('gives a field seen only on a later row its own column', async () => {
    records.mockResolvedValue({
      Notes: [
        { id: 'n1', text: 'garden beds' },
        { id: 'n2', text: 'the Denver job', heldByForget: true },
      ],
    });

    const csv = await exportCsv(['Records']);

    const [header] = section(csv, '## RECORDS / Notes');
    expect(header).toEqual(['id', 'text', 'heldByForget']);
    expect(table(csv, '## RECORDS / Notes').map((n) => n.heldByForget)).toEqual(['', 'true']);
  });

  it('gives a top-level list a column for a field only a later row has', async () => {
    cards.mockResolvedValue([
      { id: 'a1', question: 'Book the dentist?', userId: UID, deleteAt: 1 },
      { id: 'a2', question: 'Call about the Denver job?', heldByForget: true },
    ]);

    const csv = await exportCsv(['Answer Cards']);

    expect(section(csv, '## ANSWER_CARDS')[0]).toEqual(['id', 'question', 'heldByForget']);
    expect(table(csv, '## ANSWER_CARDS').map((c) => c.heldByForget)).toEqual(['', 'true']);
  });

  it('keeps a list inside a top-level row as a JSON cell', async () => {
    weather.mockResolvedValue([{ date: '2026-11-03', weather: 'sunny', insights: ['slept well'] }]);

    const csv = await exportCsv(['Mood History']);

    const [day] = table(csv, '## MOOD_HISTORY');
    expect(day.weather).toBe('sunny');
    expect(JSON.parse(day.insights)).toEqual(['slept well']);
  });

  it('keeps a quote, a comma and a newline inside one cell', async () => {
    const tricky = 'She said "hi, there"\nthen left';
    records.mockResolvedValue({ Notes: [{ id: 'n1', text: tricky }] });

    const csv = await exportCsv(['Records']);

    expect(table(csv, '## RECORDS / Notes')).toEqual([{ id: 'n1', text: tricky }]);
  });

  it('stops text from running as a spreadsheet formula', async () => {
    cards.mockResolvedValue([{ id: 'a1', '=key': 'x', question: '=HYPERLINK("http://x","y")' }]);

    const csv = await exportCsv(['Answer Cards']);

    expect(section(csv, '## ANSWER_CARDS')[0]).toEqual(['id', "'=key", 'question']);
    expect(table(csv, '## ANSWER_CARDS')[0].question).toBe(`'=HYPERLINK("http://x","y")`);
  });

  it.each(['=', '+', '-', '@', '\t', '\r'])('neutralises text starting with %j', async (lead) => {
    cards.mockResolvedValue([{ id: 'a1', question: `${lead}cmd`, [`${lead}k`]: 1, temp: -4 }]);

    const csv = await exportCsv(['Answer Cards']);

    expect(section(csv, '## ANSWER_CARDS')[0]).toEqual(['id', 'question', `'${lead}k`, 'temp']);
    // A negative number is a number, not a formula: it stays bare
    expect(table(csv, '## ANSWER_CARDS')[0]).toMatchObject({ question: `'${lead}cmd`, temp: '-4' });
  });

  it('names the overflow column so it never clashes with a real field', async () => {
    const wide = Object.fromEntries(Array.from({ length: 101 }, (_, k) => [`k${k}`, k]));
    records.mockResolvedValue({ Wide: [{ _otherFields: 'real', ...wide }] });

    const csv = await exportCsv(['Records']);

    const [header, row] = section(csv, '## RECORDS / Wide');
    expect(header[0]).toBe('_otherFields');
    expect(header[100]).toBe('__otherFields');
    expect(new Set(header).size).toBe(header.length);
    expect(row[0]).toBe('real');
    expect(JSON.parse(row[100])).toEqual({ k99: 99, k100: 100 });
  });

  it('caps a table at 100 columns and keeps the rest of each row in one JSON cell', async () => {
    // Every row with its own keys: a column per key would grow as rows times keys
    const rows = Array.from({ length: 30 }, (_, r) =>
      Object.fromEntries(Array.from({ length: 5 }, (_, k) => [`r${r}k${k}`, r * 10 + k]))
    );
    records.mockResolvedValue({ Wide: rows });

    const csv = await exportCsv(['Records']);

    const [header, ...body] = section(csv, '## RECORDS / Wide');
    expect(header).toHaveLength(101);
    expect(header[100]).toBe('_otherFields');
    expect(body.every((r) => r.length === 101)).toBe(true);
    // Nothing is lost: the last row's fields are all in the overflow cell
    expect(JSON.parse(body[29][100])).toEqual(rows[29]);
    expect(body[0][100]).toBe('');
  });

  it('writes a Date as its ISO string, at the top level and in a row', async () => {
    const when = new Date('2026-11-03T09:30:00.000Z');
    records.mockResolvedValue({ Settings: { updatedAt: when }, Notes: [{ id: 'n1', at: when }] });

    const csv = await exportCsv(['Records']);

    expect(section(csv, '## RECORDS')).toEqual([['Settings.updatedAt', when.toISOString()]]);
    expect(table(csv, '## RECORDS / Notes')).toEqual([{ id: 'n1', at: when.toISOString() }]);
  });

  it('keeps a table heading on one line when its stored key has a newline', async () => {
    records.mockResolvedValue({ 'Notes\n=cmd': [{ id: 'n1' }] });

    const csv = await exportCsv(['Records']);

    expect(csv.split('\n')).toContain('## RECORDS / Notes =cmd');
    // No line of the file starts with a formula
    expect(csv.split('\n').filter((line) => /^[=+\-@]/.test(line))).toEqual([]);
    expect(table(csv, '## RECORDS / Notes =cmd')).toEqual([{ id: 'n1' }]);
  });

  it('keeps the file header and a top-level scalar category as before', async () => {
    records.mockResolvedValue({ plan: 'free', joined: '2026-01-02' });

    const csv = await exportCsv(['Records']);

    expect(csv.startsWith('# Ferni Data Export\n# Exported: ')).toBe(true);
    expect(csv).toContain(`# User: ${UID}\n# Version: 2.0\n`);
    expect(csv).toContain('## RECORDS\n\nplan,"free"\njoined,"2026-01-02"\n');
  });
});
