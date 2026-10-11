/**
 * CONTEXT_PACKET on the live request path (turn-request.ts withTurnReminder,
 * which gatedReply calls from FerniAgent.llmNode). Off: the request is
 * byte-identical to before the packet existed (inline snapshots taken on main).
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

import { createMemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import { MEMORY_RULE, SECTION_BUDGETS } from '../context-packet/context-packet.js';
import {
  rememberForPacket,
  SOURCE_NOTE,
  turnPacket,
  type RecallPick,
} from '../context-packet/turn-packet.js';
import { startCallGame } from '../../../services/games/call-game-state.js';
import { setDeliberator, type Deliberator } from '../deliberation.js';
import { setDirector, type Director } from '../director-notes.js';
import { withTurnReminder } from '../turn-request.js';
import { withTurnStyleReminder } from '../turn-style.js';

const lastText = (ctx: llm.ChatContext): string =>
  (ctx.items.at(-1) as llm.ChatMessage).textContent ?? '';

function call(): { chat: llm.ChatContext; session: { userData: unknown } } {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'I was up so late last night.' });
  chat.addMessage({ role: 'assistant', content: 'Again? That deck.' });
  chat.addMessage({ role: 'user', content: 'Wait, how do you know I was up late?' });
  const session = { userData: { userName: 'Sam', personaId: 'ferni' } };
  const director = {
    current: () => ['Stop explaining your math; just react.', 'They sound wiped out.'],
    told: () => "You've told a story about yourself already. Keep this reply on them.",
  };
  setDirector(session, director as unknown as Director);
  startCallGame(session, { type: 'trivia' });
  return { chat, session };
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.42);
  vi.stubEnv('GAME_STATE', 'on');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('CONTEXT_PACKET off', () => {
  it('sends the same request as before (plain reminder)', () => {
    const { chat, session } = call();
    expect(lastText(withTurnReminder(chat, session, { shape: false }))).toMatchInlineSnapshot(`
      "Wait, how do you know I was up late?


      (You've told a story about yourself already. Keep this reply on them. None of your teammates are available to this caller yet; don't bring them up. [Director: Stop explaining your math; just react. / They sound wiped out.] Game on: trivia, round 1, caller's turn. Score: caller 0, Ferni 0. Record each move with gameState. Keep it short, like a friend on a call: often one sentence, sometimes just a few words ("Again? That cat."), never more than three sentences unless they asked you to explain, plan or tell a story. No paragraph breaks. Start with the substance, not a stock reaction word like Oh, Ugh, Yeah or Hmm. Usually end on a thought, a reaction or an offer rather than a question, and never ask more than one. Talk like a close friend, not a therapist, coach or host: never ask how something feels or what it's like for them, no stock validation ("that sounds exhausting", "I hear you"), no generic cheerleading or exclamation marks. React like a person: your own take, a joke, surprise when it's surprising, real delight about good news that matters to them. Sound spoken, not written: the small hesitations, restarts and half-finished thoughts people really use, different each time and never the same filler twice in a row.)"
    `);
  });

  it('sends the same request as before (team by need, plain reminder)', () => {
    vi.stubEnv('TEAM_BY_NEED', 'on');
    const { chat, session } = call();
    chat.addMessage({ role: 'user', content: 'I need a hard talk with my boss.' });
    expect(lastText(withTurnReminder(chat, session, { shape: false }))).toMatchInlineSnapshot(`
      "I need a hard talk with my boss.


      (You've told a story about yourself already. Keep this reply on them. [Director: Stop explaining your math; just react. / They sound wiped out.] Game on: trivia, round 1, caller's turn. Score: caller 0, Ferni 0. Record each move with gameState. Teammates you can bring in: Maya for habits and routines that stick; Peter for patterns in their life, time and spending; Alex for hard conversations, email, texts and calendar; Jordan for trips, moves and big life plans; Nayan for meaning, purpose and the long view. Offer one only when what the caller needs clearly matches, at most once a call each; ask before transferring, and never push. What they just said fits Alex: if it helps, ask whether they'd like Alex to join. Keep it short, like a friend on a call: often one sentence, sometimes just a few words ("Again? That cat."), never more than three sentences unless they asked you to explain, plan or tell a story. No paragraph breaks. Start with the substance, not a stock reaction word like Oh, Ugh, Yeah or Hmm. Usually end on a thought, a reaction or an offer rather than a question, and never ask more than one. Talk like a close friend, not a therapist, coach or host: never ask how something feels or what it's like for them, no stock validation ("that sounds exhausting", "I hear you"), no generic cheerleading or exclamation marks. React like a person: your own take, a joke, surprise when it's surprising, real delight about good news that matters to them. Sound spoken, not written: the small hesitations, restarts and half-finished thoughts people really use, different each time and never the same filler twice in a row.)"
    `);
  });

  it('sends the same request as before (per-turn shape)', () => {
    const { chat, session } = call();
    expect(lastText(withTurnReminder(chat, session))).toMatchInlineSnapshot(`
      "Wait, how do you know I was up late?


      (You've told a story about yourself already. Keep this reply on them. None of your teammates are available to this caller yet; don't bring them up. [Director: Stop explaining your math; just react. / They sound wiped out.] Game on: trivia, round 1, caller's turn. Score: caller 0, Ferni 0. Record each move with gameState. Start with the substance, not a stock reaction word like Oh, Ugh, Yeah or Hmm. Talk like a close friend, not a therapist, coach or host: never ask how something feels or what it's like for them, no stock validation ("that sounds exhausting", "I hear you"), no generic cheerleading or exclamation marks. When they share good news that really matters to them, be genuinely delighted about that specific thing, in your own words, the way a close friend would. Sound spoken, not written, and never the same filler twice in a row. No paragraph breaks. Build only on what they actually told you: never fill in details of their day, plans or people they did not mention, and never talk as if you already know someone or something they just brought up. You are their friend, not an assistant: never offer to set up, remind or do things for them unless they ask. If you'd see it differently, say so; if you don't know, say "I don't know" or "hm, no idea" instead of covering. How long and what kind of reply is yours to judge from what they just did, the way a good friend on the phone would. A passing remark or a quick yes gets a quick, natural reaction. Anything that matters to them, good or bad (news, something they are proud of, worried about or hurt by), gets a real response to that specific thing, with the feeling it deserves, not a remark that would fit anything. When they ask you something or ask for help, actually answer it; when they ask about you, talk about yourself, something specific. Most replies are a sentence or two, some only a few words; go longer only when they asked for it. You may ask one question if you really want to know something; otherwise end on a thought.)"
    `);
  });
});

describe('CONTEXT_PACKET on', () => {
  const block = (text: string, heading: string): string[] =>
    text
      .split('\n\n')
      .find((b) => b.startsWith(heading))
      ?.split('\n')
      .slice(1) ?? [];

  async function recalled(session: object): Promise<void> {
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store: {
        facts: async () => [
          {
            entityName: 'Sam',
            key: 'up_late',
            value: 'finishing the investor deck',
            confidence: 0.9,
            extractedAt: '2026-10-10T23:40:00Z',
          },
        ],
        summaries: async () => [],
      },
      ledgerStore: { save: async () => undefined, recent: async () => [] },
      lifeUpdates: { env: {} },
      checkIns: async () => [],
    });
    await recall.ready;
    expect(recall.noteFor('how do you know I was up late finishing the deck')).toContain(
      'investor deck'
    );
    const pick = recall.lastPick();
    expect(pick?.facts.map((f) => f.value)).toEqual(['finishing the investor deck']);
    if (pick) rememberForPacket(session, pick, 'Sam');
  }

  it('carries one packet: the memory with its source, honesty over "stop explaining", shape last', async () => {
    const { chat, session } = call();
    await recalled(session);
    vi.stubEnv('CONTEXT_PACKET', 'on');
    const sent = lastText(withTurnReminder(chat, session));

    expect(
      sent.startsWith('Wait, how do you know I was up late?\n\n\n([Context for this reply')
    ).toBe(true);
    expect(block(sent, '## What I remember')).toEqual([
      MEMORY_RULE,
      '- (you said on Oct 10) Sam up late: finishing the investor deck',
    ]);
    const turn = block(sent, '## This turn');
    expect(turn[0]).toBe(`- ${SOURCE_NOTE}`);
    expect(sent).not.toContain('Stop explaining your math');
    expect(turn).toContain('- They sound wiped out.');
    expect(turn.at(-1)).toMatch(/^- Start with the substance/);
    expect(block(sent, '## Right now')[0]).toMatch(/^- Game on: trivia/);
    expect(block(sent, "## Who's on the team")).toEqual([
      // The last section, so it carries the reminder wrapper's closing parenthesis.
      "None of your teammates are available to this caller yet; don't bring them up.)",
    ]);
    expect(sent).not.toContain('[Director:');
  });

  it('is off unless set: the same session sends the old request', async () => {
    const { chat, session } = call();
    await recalled(session);
    const sent = lastText(withTurnReminder(chat, session));
    expect(sent).not.toContain('## What I remember');
    expect(sent).toContain('[Director: Stop explaining your math');
  });
});

describe('turnPacket', () => {
  const parts = {
    words: 'hi',
    directorNotes: [],
    told: '',
    team: [],
    game: '',
    shape: '',
    now: Date.parse('2026-10-11T18:00:00Z'),
  };
  const pick = (over: Partial<RecallPick>): RecallPick => ({
    facts: [],
    followUps: [],
    told: [],
    since: [],
    checkIns: [],
    ...over,
  });
  const fact = (value: string) => ({ entity: 'Sam', key: 'note', value, confidence: 0.9 });
  const memories = (session: object, personaId = 'ferni'): string[] =>
    turnPacket(session, { ...parts, personaId })
      .text.split('\n')
      .filter((l) => l.startsWith('- ('));

  it('puts the newest pick first, each pick in its own (relevance) order', () => {
    const session = {};
    rememberForPacket(session, pick({ facts: [fact('old one')] }));
    rememberForPacket(session, pick({ facts: [fact('best match'), fact('second match')] }));
    expect(memories(session)).toEqual([
      '- (you said) Sam note: best match',
      '- (you said) Sam note: second match',
      '- (you said) Sam note: old one',
    ]);
  });

  it("tells Ferni's news only while Ferni is speaking", () => {
    const session = {};
    rememberForPacket(
      session,
      pick({ since: [{ personaId: 'ferni', update: 'the basil died', createdAt: '' }] })
    );
    expect(memories(session, 'ferni')).toHaveLength(1);
    expect(memories(session, 'maya-santos')).toEqual([]);
  });

  it('puts crisis guidance first, as the safety note', () => {
    const { text, accounting } = turnPacket(
      {},
      { ...parts, safety: 'Stay with them; give the 988 line.', directorNotes: ['Keep it light.'] }
    );
    expect(text.split('## This turn\n')[1].split('\n')[0]).toBe(
      '- Stay with them; give the 988 line.'
    );
    expect(accounting.guidanceDropped).toEqual([]);
  });
});

describe('crisis guidance through withTurnReminder', () => {
  it('off: identical to the reminder with the guidance appended after it, as before', () => {
    const { chat, session } = call();
    const before = withTurnStyleReminder(
      withTurnReminder(chat, session, { shape: false }),
      'GUIDE'
    );
    expect(lastText(withTurnReminder(chat, session, { shape: false, safety: 'GUIDE' }))).toBe(
      lastText(before)
    );
  });

  it('on: inside the one packet, not a second block after it', () => {
    const { chat, session } = call();
    vi.stubEnv('CONTEXT_PACKET', 'on');
    const sent = lastText(withTurnReminder(chat, session, { shape: false, safety: 'GUIDE' }));
    expect(sent.split('\n').filter((l) => l.includes('GUIDE'))).toEqual(['- GUIDE']);
    expect(sent.endsWith(')')).toBe(true);
    expect(sent.match(/\n\n\(/g)).toHaveLength(1);
  });
});

describe('injectors added since (deliberation, misheard teammate names)', () => {
  function withThought(): { chat: llm.ChatContext; session: { userData: unknown } } {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'Could Naya help me think this through?' });
    const session = { userData: { userName: 'Sam', personaId: 'ferni' } };
    setDeliberator(session, {
      noteFor: () => 'A thought: they keep circling the same choice.',
    } as unknown as Deliberator);
    return { chat, session };
  }

  it('off: both ride the reminder as before', () => {
    const { chat, session } = withThought();
    const sent = lastText(withTurnReminder(chat, session));
    expect(sent).toContain('A thought: they keep circling the same choice.');
    expect(sent).toContain('is speech-to-text for Nayan');
  });

  it('on: the thought is a ranked note and the name fix sits with the team', () => {
    const { chat, session } = withThought();
    vi.stubEnv('CONTEXT_PACKET', 'on');
    const sent = lastText(withTurnReminder(chat, session));
    const block = (heading: string): string =>
      sent.split('\n\n').find((b) => b.startsWith(heading)) ?? '';
    expect(block('## This turn')).toContain('- A thought: they keep circling the same choice.');
    expect(block("## Who's on the team")).toContain('is speech-to-text for Nayan');
  });
});

describe('TEAM_BY_NEED in the packet', () => {
  it('on: the roster and the teammate this turn calls for sit in the team section, within budget', () => {
    vi.stubEnv('TEAM_BY_NEED', 'on');
    vi.stubEnv('CONTEXT_PACKET', 'on');
    const chat = llm.ChatContext.empty();
    chat.addMessage({
      role: 'user',
      content: 'Should I move my index funds? My boss wants a hard talk.',
    });
    const session = { userData: { userName: 'Sam', personaId: 'ferni' } };
    const sent = lastText(withTurnReminder(chat, session));
    const team = sent.split('\n\n').find((b) => b.startsWith("## Who's on the team")) ?? '';
    expect(team).toContain('Teammates you can bring in: Maya');
    expect(team).toContain('the legends can join too');
    expect(team).toContain('fits Alex');
    expect(Math.ceil(team.length / 4)).toBeLessThanOrEqual(SECTION_BUDGETS.team);
    // Only once: not also somewhere else in the request.
    expect(sent.split('Teammates you can bring in').length).toBe(2);
  });
});
