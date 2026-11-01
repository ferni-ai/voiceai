import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isQuietCaller, presentAck, QUIET_LINE } from '../quiet-caller.js';
import { regexSignals } from '../turn-extras.js';
import { withTurnReminder } from '../turn-request.js';
import { callerMove, rngFor, turnShapeFor } from '../turn-shape.js';

const CANDOR_LINE = /if something they said is wrong, or a plan looks like a real mistake/;
const THINK_ALOUD_LINE = /Work it out aloud/;

/** Seth's dev call, 2026-10-11, up to the turn that got the lecture. */
function sethCall(): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'assistant', content: 'Hey Seth, still feeling that quiet Sunday vibe?' });
  ctx.addMessage({ role: 'user', content: 'Still on there.' });
  ctx.addMessage({
    role: 'assistant',
    content:
      "That mail isn't going to clear itself, but honestly mine's still sitting right where it was this morning too.",
  });
  ctx.addMessage({ role: 'user', content: 'Why is that?' });
  ctx.addMessage({
    role: 'assistant',
    content: "I think I'm just avoiding the electric bill, to be honest.",
  });
  ctx.addMessage({ role: 'user', content: 'Yeah.' });
  ctx.addMessage({ role: 'assistant', content: 'Mm.' });
  ctx.addMessage({ role: 'user', content: 'Not much going on.' });
  return ctx;
}
const lastText = (ctx: llm.ChatContext): string =>
  (ctx.items[ctx.items.length - 1] as { textContent?: string }).textContent ?? '';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a quiet caller', () => {
  it('is two short turns in a row, the latest asking nothing', () => {
    expect(isQuietCaller(['Why is that?', "I'm still here."])).toBe(true);
    expect(isQuietCaller(['Yeah.', 'Not much going on.'])).toBe(true);
    expect(isQuietCaller(['Still on there.', 'Why is that?'])).toBe(false);
    expect(isQuietCaller(['Yeah.'])).toBe(false);
    expect(
      isQuietCaller(['Yeah.', 'So my sister called about the house in Denver last night.'])
    ).toBe(false);
  });

  it('"I\'m still here" and friends are an ack, not news', () => {
    for (const t of ["I'm still here.", 'Still here', "I'm listening", 'Go on.', 'Mm-hm.'])
      expect(presentAck(t), t).toBe(true);
    for (const t of ["I'm still here at the office, it's crazy.", 'Here we go again'])
      expect(presentAck(t), t).toBe(false);
  });
});

describe('the turn shape for a quiet caller (CANDOR=on)', () => {
  const said = 'Not much going on.';
  const sig = regexSignals(said, callerMove(said));
  const reminders = (quiet: boolean | undefined): string[] =>
    Array.from(
      { length: 80 },
      (_, i) => turnShapeFor(said, rngFor(`q-${i}`), 'model', { ...sig, quiet }).reminder
    );

  it('without it, the candor line and thinking aloud ride these turns', () => {
    vi.stubEnv('CANDOR', 'on');
    const r = reminders(undefined);
    expect(r.every((x) => CANDOR_LINE.test(x))).toBe(true);
    expect(r.some((x) => THINK_ALOUD_LINE.test(x))).toBe(true);
    expect(r.some((x) => x.includes(QUIET_LINE))).toBe(false);
  });

  it('quiet: no verdict, no thinking aloud, no opinion line, on any draw, and the quiet line', () => {
    vi.stubEnv('CANDOR', 'on');
    for (const r of reminders(true)) {
      expect(r).not.toMatch(CANDOR_LINE);
      expect(r).not.toMatch(THINK_ALOUD_LINE);
      expect(r).not.toMatch(/say what you would do or what you think/i);
      expect(r).toContain(QUIET_LINE);
    }
  });
});

describe('on the reply path', () => {
  it("QUIET_CALLER=on: Seth's quiet turns get the quiet line and no candor line", () => {
    vi.stubEnv('CANDOR', 'on');
    vi.stubEnv('QUIET_CALLER', 'on');
    const asked = lastText(withTurnReminder(sethCall(), {}));
    expect(asked).toContain(QUIET_LINE);
    expect(asked).not.toMatch(CANDOR_LINE);
  });

  it('off (default): unchanged, the candor line rides it', () => {
    vi.stubEnv('CANDOR', 'on');
    const asked = lastText(withTurnReminder(sethCall(), {}));
    expect(asked).not.toContain(QUIET_LINE);
    expect(asked).toMatch(CANDOR_LINE);
  });

  it('a caller who says something of substance is not quiet', () => {
    vi.stubEnv('CANDOR', 'on');
    vi.stubEnv('QUIET_CALLER', 'on');
    const ctx = sethCall();
    ctx.addMessage({ role: 'assistant', content: 'Mm.' });
    ctx.addMessage({
      role: 'user',
      content: "Honestly I've been thinking about quitting my job and moving to Denver.",
    });
    const asked = lastText(withTurnReminder(ctx, {}));
    expect(asked).not.toContain(QUIET_LINE);
    expect(asked).toMatch(CANDOR_LINE);
  });
});

describe('with ATTUNE=on', () => {
  it('the quiet line gives way to attunement, and the verdict still stays out', () => {
    vi.stubEnv('CANDOR', 'on');
    vi.stubEnv('QUIET_CALLER', 'on');
    vi.stubEnv('ATTUNE', 'on');
    const asked = lastText(withTurnReminder(sethCall(), {}));
    expect(asked).not.toContain(QUIET_LINE);
    expect(asked).not.toMatch(CANDOR_LINE);
  });
});
