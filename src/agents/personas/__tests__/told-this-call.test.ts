/**
 * The record of what Ferni has already told on a call, from the 2026-10-03
 * dev call where he brought up Tanaka-san in five replies and said "the quiet
 * hum of a winter night still feels like coming home" twice in a row.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';
import { Director, getDirector, linesFromChat, setDirector, type Line } from '../director-notes.js';
import { toldThisCall, toldThisCallNote } from '../told-this-call.js';
import { withTurnReminder } from '../turn-request.js';
import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-intelligence.js';
import { installDirectorNotes } from '../../multi-agent/turn-observers.js';

const user = (text: string): Line => ({ speaker: 'user', text });
const ferni = (text: string): Line => ({ speaker: 'ferni', text });

// Lines from the call (calltap-raw.log, E2E_TTS_OUTPUT and USER TRANSCRIPT), markup removed.
const call: Line[] = [
  user('Imagine trundle was useful. Hey there, how are you?'),
  ferni("Well, if Trundle was useful, he'd probably actually be winning some games for once."),
  user('Uh, tell me a story about uh life experience.'),
  ferni('Tanaka-san, my old neighbor in Japan, taught me the true art of the pause.'),
  user('What do you think about Donald Trump?'),
  ferni('Well, after that silence, he stood up and poured us more barley tea.'),
  user("It's hard to say."),
  ferni(
    'You know, after Tanaka-san passed, those quiet moments became even more precious. Winter mornings in Wyoming taught me the value of warmth.'
  ),
  user('caught up in reviews.'),
  ferni(
    "Yeah, we really don't. You know, I remember Tanaka-san in Japan, he always said the real conversation starts after the tea gets cold."
  ),
  user('So, tell me uh another story.'),
  ferni(
    'Well, there was this one morning in Wyoming, totally frozen over, when I found a great horned owl just sitting on our porch railing.'
  ),
  user('yet. Hello, how does that make you feel?'),
  ferni(
    'It makes me feel, well, grounded, I guess. Even after all these years, the quiet hum of a winter night still feels like coming home.'
  ),
  user('When you go to sleep, what do you dream of?'),
  ferni(
    "Honestly, I don't think I dream the way you do, but, even after all these years, the quiet hum of a winter night still feels like coming home to me."
  ),
  user('What more can we do to make you human?'),
];

afterEach(() => {
  delete process.env.TOLD_THIS_CALL;
  delete process.env.DIRECTOR_NOTES;
});

describe('what Ferni has already told on this call', () => {
  it('counts the names he brought up, by reply, and not the ones the caller did', () => {
    const told = toldThisCall(call);
    expect(told.names[0]).toEqual({ name: 'Tanaka-san', replies: 3 });
    expect(told.names).toContainEqual({ name: 'Wyoming', replies: 2 });
    expect(told.names).toContainEqual({ name: 'Japan', replies: 2 });
    // The caller said these; bringing them back is following, not telling.
    const names = told.names.map((n) => n.name);
    expect(names).not.toContain('Trundle');
    expect(names).not.toContain('Donald Trump');
    // Capitalized only because a sentence starts there.
    expect(names).not.toContain('Well');
    expect(names).not.toContain('Honestly');
  });

  it('counts his stories about himself and finds the sentence he repeated', () => {
    const told = toldThisCall(call);
    expect(told.selfStories).toBe(4);
    expect(told.repeated).toEqual([
      'Even after all these years, the quiet hum of a winter night still feels like coming home.',
    ]);
    expect(told.askedAboutFerni).toBe(false); // "What more can we do to make you human?"
  });

  it('writes a note that keeps the next reply on the caller', () => {
    const note = toldThisCallNote(call);
    expect(note).toMatch(/^\[Already said this call: /);
    expect(note).toContain('Tanaka-san (3 replies)');
    expect(note).toContain(
      "You've told 4 stories about yourself already. Keep this reply on them."
    );
    expect(note).toContain(
      '"Even after all these years, the quiet hum of a winter night still feels like coming home."'
    );
  });

  it('lets him tell something new when they ask for a story', () => {
    const note = toldThisCallNote([...call, ferni('Sure.'), user('Tell me another story.')]);
    expect(note).toContain("They asked, so tell something you haven't told yet.");
    expect(note).not.toContain('Keep this reply on them');
  });

  it('says nothing before Ferni has told anything', () => {
    expect(toldThisCallNote([user('hey'), ferni("Hey, what's up?")])).toBe('');
  });

  it('reaches the next request through the director, without a model', async () => {
    const director = new Director({ sessionId: 's', writeNotes: false });
    await director.observe(call);
    const session = {};
    setDirector(session, director);
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'What more can we do to make you human?' });
    const sent = withTurnReminder(ctx, session).items.at(-1) as llm.ChatMessage;
    expect(sent.textContent).toContain('[Already said this call: ');
    expect(sent.textContent).toContain('Tanaka-san (3 replies)');
    expect(director.current()).toEqual([]); // no model notes asked for
    setDirector(session, null);
  });

  it('is off with TOLD_THIS_CALL=off', async () => {
    process.env.TOLD_THIS_CALL = 'off';
    const director = new Director({ sessionId: 's', writeNotes: false });
    await director.observe(call);
    expect(director.told()).toBe('');
  });

  it("doesn't read the pushed turn context as the caller's words", () => {
    const lines = linesFromChat([
      { type: 'message', role: 'user', textContent: 'hey' },
      {
        type: 'message',
        role: 'user',
        textContent: `${TURN_CONTEXT_HEADER}\n[PERSONALITY EXPRESSION] Stevie Wonder just came on in my head.`,
      },
    ]);
    expect(lines).toEqual([{ speaker: 'user', text: 'hey' }]);
  });

  it('is installed on a live call without DIRECTOR_NOTES and updates after each reply', async () => {
    delete process.env.DIRECTOR_NOTES;
    const handlers: Array<(ev: unknown) => void> = [];
    const session = {
      on: (_e: string, h: (ev: unknown) => void) => handlers.push(h),
      off: () => {},
    };
    const items = call.map((l) => ({
      type: 'message',
      role: l.speaker === 'ferni' ? 'assistant' : 'user',
      textContent: l.text,
    }));
    await installDirectorNotes({
      session: session as never,
      sessionId: 's',
      userName: undefined,
      agent: { chatCtx: { items } },
      cleanupFunctions: [],
    });
    const director = getDirector(session);
    expect(director).toBeDefined();
    handlers.forEach((h) => h({ newState: 'speaking' }));
    handlers.forEach((h) => h({ newState: 'listening' }));
    expect(director?.told()).toContain('Tanaka-san (3 replies)');
    expect(director?.current()).toEqual([]);
    setDirector(session, null);
  });
});
