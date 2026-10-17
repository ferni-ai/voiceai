/**
 * CALL_JOURNAL_ASK: once, as a meaningful call winds down, the reply's
 * reminder has Ferni offer to keep a note of today, with the one line he'd
 * keep; the reply after saves it on a yes. Never on short or task-only calls,
 * never twice, never after something was already saved on the call. The
 * end-to-end cases run through the real request builder (withTurnReminder).
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/journal/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getJournalService: () => ({ createEntry: async () => ({}) }),
}));

const {
  ASK_NOTE,
  SAVE_NOTE,
  journalAskFits,
  journalAskNote,
  meaningfulCall,
  MIN_SHARES,
} = await import('../journal-ask.js');
const { saveCallJournalEntry } = await import('../../../tools/domains/productivity/call-journal.js');
const { withTurnReminder } = await import('../turn-request.js');
type JournalAskInput = Parameters<typeof journalAskFits>[0];

const ASK = /keep a note of today in their journal/;
const SAVE = /save the line you read back with the journal tool/;

/** Six caller turns about their own day, winding down on the last. */
const REAL_CALL = [
  'Hey, it has been kind of a big day honestly.',
  'I finally told my brother I was proud of him, after years of not saying it.',
  'He went quiet for a second and then he said he needed to hear that.',
  'We ended up talking for an hour about our dad and the old house.',
  'Mm, yeah.',
  'Anyway, thanks for listening, that felt good to say out loud.',
];

/** Six turns of errands: lookups and requests, nothing about their life. */
const TASK_CALL = [
  "What's the weather tomorrow?",
  'Set a timer for ten minutes.',
  'Play some jazz.',
  'Add milk to my shopping list.',
  'What time is it in Tokyo?',
  'Anyway, thanks.',
];

let n = 0;
let sessionId = '';
const userData = (over: Record<string, unknown> = {}) => ({
  userId: `caller-${n}`,
  services: { sessionId },
  ...over,
});
const session = () => ({ userData: userData() });

function ctx(said: readonly string[]): llm.ChatContext {
  const c = llm.ChatContext.empty();
  said.forEach((s, i) => {
    c.addMessage({ role: 'user', content: s });
    if (i < said.length - 1) c.addMessage({ role: 'assistant', content: 'Huh, okay.' });
  });
  return c;
}
const last = (c: llm.ChatContext): string =>
  (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';
const reminder = (said: readonly string[], s: object): string =>
  last(withTurnReminder(ctx(said), s));

const input = (
  callerTurns: readonly string[],
  over: Partial<JournalAskInput> = {}
): JournalAskInput => ({
  said: callerTurns[callerTurns.length - 1],
  callerTurns,
  careful: false,
  userData: userData(),
  phoneOnly: false,
  outbound: false,
  closing: false,
  inviting: false,
  ...over,
});

beforeEach(() => {
  n++;
  sessionId = `session-${n}`;
  vi.stubEnv('CALL_JOURNAL_ASK', 'on');
  vi.stubEnv('CALL_JOURNAL', 'on');
  vi.stubEnv('JOURNAL_ONE_STORE', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('which calls get the ask', () => {
  it('a call about their own life, winding down, fits', () => {
    expect(journalAskFits(input(REAL_CALL))).toBe(true);
  });

  it('never a task-only call, however long', () => {
    expect(meaningfulCall(TASK_CALL)).toBe(false);
    expect(journalAskFits(input(TASK_CALL))).toBe('not-meaningful');
  });

  it(`never a short call: needs ${MIN_SHARES} real shares and enough turns`, () => {
    expect(journalAskFits(input(REAL_CALL.slice(2)))).toBe('not-meaningful');
    const thin = ['Hey.', 'Yeah.', 'Mm.', 'Ha.', 'Sure.', 'Anyway, thanks for listening.'];
    expect(journalAskFits(input(thin))).toBe('not-meaningful');
  });

  it('not until they wind down, and never on the goodbye itself', () => {
    const mid = [...REAL_CALL.slice(0, 5), 'He wants to visit next month.'];
    expect(journalAskFits(input(mid))).toBe('not-winding');
    const bye = [...REAL_CALL.slice(0, 5), 'Okay, I gotta go. Bye!'];
    expect(journalAskFits(input(bye))).toBe('goodbye');
    expect(journalAskFits(input(REAL_CALL, { wantsToEnd: true }))).toBe('goodbye');
  });

  it('not on a careful turn, or while the commitment invite is on this reply', () => {
    expect(journalAskFits(input(REAL_CALL, { careful: true }))).toBe('careful');
    expect(journalAskFits(input(REAL_CALL, { inviting: true }))).toBe('inviting');
  });

  it('only for a caller whose journal the tools can write', () => {
    const anonymous = userData({ userId: 'anonymous' });
    expect(journalAskFits(input(REAL_CALL, { userData: anonymous }))).toBe('no-journal');
    expect(journalAskFits(input(REAL_CALL, { phoneOnly: true }))).toBe('no-journal');
    expect(journalAskFits(input(REAL_CALL, { outbound: true }))).toBe('no-journal');
    expect(journalAskFits(input(REAL_CALL, { closing: true }))).toBe('closing');
  });

  it('never once they already saved something to the journal on this call', async () => {
    await saveCallJournalEntry({ ctx: { userData: userData() } }, 'Told my brother.', 'journal');
    expect(journalAskFits(input(REAL_CALL))).toBe('saved');
  });
});

describe('once a call, through the request builder', () => {
  it('asks on the winding-down turn, then saves on the next reply, then never again', () => {
    const s = session();
    expect(reminder(REAL_CALL.slice(0, 5), s)).not.toMatch(ASK);
    expect(reminder(REAL_CALL, s)).toMatch(ASK);
    // The preemptive and final requests for one turn carry the same note.
    expect(reminder(REAL_CALL, s)).toMatch(ASK);

    const yes = [...REAL_CALL, 'Yes please, keep that.'];
    expect(reminder(yes, s)).toMatch(SAVE);
    const later = [...yes, 'Anyway, thanks for listening, really.'];
    const after = reminder(later, s);
    expect(after).not.toMatch(ASK);
    expect(after).not.toMatch(SAVE);
  });

  it('no save note when the yes was already saved', async () => {
    const s = session();
    expect(journalAskNote(s, input(REAL_CALL))).toBe(ASK_NOTE);
    await saveCallJournalEntry({ ctx: { userData: userData() } }, 'Told my brother.', 'journal');

    expect(journalAskNote(s, input([...REAL_CALL, 'Yes, keep it.']))).toBe('');
  });

  it('a reply with crisis guidance closes the call to the ask', () => {
    const s = session();
    expect(journalAskNote(s, input(REAL_CALL.slice(0, 5)), { crisis: true })).toBe('');
    expect(journalAskNote(s, input(REAL_CALL))).toBe('');
  });

  it('off unless CALL_JOURNAL_ASK and the journal tools are both on', () => {
    vi.stubEnv('CALL_JOURNAL_ASK', 'off');
    expect(reminder(REAL_CALL, session())).not.toMatch(ASK);
    vi.stubEnv('CALL_JOURNAL_ASK', 'on');
    vi.stubEnv('CALL_JOURNAL', 'off');
    expect(reminder(REAL_CALL, session())).not.toMatch(ASK);
  });
});

it('the notes follow the speech rules: no em dashes, no ellipses', () => {
  for (const note of [ASK_NOTE, SAVE_NOTE]) expect(note).not.toMatch(/—|…|\.\.\./);
});
