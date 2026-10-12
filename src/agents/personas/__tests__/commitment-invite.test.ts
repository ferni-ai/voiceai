/**
 * COMMITMENT_INVITE: once a call, when a caller working something through
 * reaches clarity, the reply's reminder invites one small step in their words;
 * the reply after says back what they named. Runs through the real request
 * builder (withTurnReminder), no fakes.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  commitmentInviteNote,
  holdCommitmentInvite,
  INVITE_NOTE,
  inviteFits,
  NAMED_NOTE,
  REFLECT_NOTE,
  type InviteInput,
} from '../commitment-invite.js';
import { gatedReply } from '../crisis-gate.js';
import { withTurnReminder } from '../turn-request.js';

const INVITE = /one small thing they want to try before you talk again/;
const REFLECT = /say back what and when/;
const NAMED = /floated a small step of their own/;

/** Six caller turns: a decision worked through over two turns, landing on the last. */
const WORKING_CALL = [
  'Hey, not much. Busy week.',
  "I've been trying to figure out whether to ask my manager for a raise.",
  "I keep putting it off because I don't know how to bring it up.",
  "She's been pretty slammed lately.",
  'Yeah, the review cycle starts next month.',
  "Hm, that makes sense actually. I hadn't thought about it that way.",
];

function ctx(said: readonly string[], ferni = 'Huh, okay.'): llm.ChatContext {
  const c = llm.ChatContext.empty();
  said.forEach((s, i) => {
    c.addMessage({ role: 'user', content: s });
    if (i < said.length - 1) c.addMessage({ role: 'assistant', content: ferni });
  });
  return c;
}
const last = (c: llm.ChatContext): string =>
  (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';
const reminder = (said: readonly string[], session: object, crisis = false): string =>
  last(withTurnReminder(ctx(said), session, crisis ? { shape: false } : {}));

const input = (callerTurns: readonly string[], over: Partial<InviteInput> = {}): InviteInput => ({
  said: callerTurns[callerTurns.length - 1],
  callerTurns,
  ferniLines: [],
  careful: false,
  firstCall: false,
  ...over,
});

beforeEach(() => {
  process.env.COMMITMENT_INVITE = 'on';
});
afterEach(() => {
  delete process.env.COMMITMENT_INVITE;
});

describe('when an invite fits', () => {
  it('fits a call worked through over two turns that is now landing', () => {
    expect(inviteFits(input(WORKING_CALL))).toBe(true);
  });

  it('not in the first minutes, and later still on a first call', () => {
    expect(inviteFits(input(WORKING_CALL.slice(1)))).toBe('early');
    expect(inviteFits(input(WORKING_CALL, { firstCall: true }))).toBe('early');
    const longer = [...WORKING_CALL.slice(0, 5), 'Mm.', 'Right.', 'Ha, yeah.', 'Sure.'];
    expect(inviteFits(input([...longer, WORKING_CALL[5]], { firstCall: true }))).toBe(true);
  });

  it('needs two turns working on it, not one', () => {
    const once = [...WORKING_CALL];
    once[2] = 'Anyway she has been around a while.';
    expect(inviteFits(input(once))).toBe('not-working');
  });

  it('not for venting alone, however long', () => {
    const venting = [
      'Ugh, long day.',
      'My boss was so annoying today.',
      'Everyone kept interrupting me.',
      'And then traffic was awful.',
      'I just wanted to complain to someone.',
      'Okay that helps, honestly.',
    ];
    expect(inviteFits(input(venting))).toBe('not-working');
  });

  it('not until it lands: clarity, winding down or a goodbye', () => {
    const mid = [...WORKING_CALL.slice(0, 5), 'She might say no though.'];
    expect(inviteFits(input(mid))).toBe('not-landing');
    const winding = [...WORKING_CALL.slice(0, 5), 'Anyway, thanks for listening.'];
    expect(inviteFits(input(winding))).toBe(true);
    // "I should probably head out" is leaving, not a second goal.
    const leavingOnly = [
      ...WORKING_CALL.slice(0, 2),
      'Ha.',
      'I should probably head out soon.',
      'Mm.',
      'That makes sense.',
    ];
    expect(inviteFits(input(leavingOnly))).toBe('not-working');
  });

  it('never on the goodbye itself: asking as they leave holds them on the line', () => {
    const bye = [...WORKING_CALL.slice(0, 5), 'Okay, I gotta go. Bye!'];
    expect(inviteFits(input(bye))).toBe('goodbye');
    expect(inviteFits(input(WORKING_CALL, { wantsToEnd: true }))).toBe('goodbye');
    expect(reminder(bye, {})).not.toMatch(INVITE);
  });

  it('"I should probably head out" is a goodbye too, though the goodbye words miss it', () => {
    const leaving = [
      ...WORKING_CALL.slice(0, 5),
      'Look, I should probably head out, thanks for listening.',
    ];
    expect(inviteFits(input(leaving))).toBe('goodbye');
  });

  it('a "maybe I will" is not yet a promise; "I\'ll" is', () => {
    const floated = [...WORKING_CALL.slice(0, 5), "Maybe I'll text her this weekend."];
    expect(inviteFits(input(floated))).toBe(true);
    const promised = [
      ...WORKING_CALL.slice(0, 5),
      "Okay, that makes sense. I'll text her this weekend.",
    ];
    expect(inviteFits(input(promised))).toBe('committed');
  });

  it('never on a heavy call or a careful turn', () => {
    const heavy = [...WORKING_CALL];
    heavy[3] = 'My dad is in the hospital again, so that too.';
    expect(inviteFits(input(heavy))).toBe('heavy');
    // A loss said softly, which the hard-news words miss.
    heavy[3] = 'My brother passed in the spring, so everything feels like a lot.';
    expect(inviteFits(input(heavy))).toBe('heavy');
    expect(inviteFits(input(WORKING_CALL, { careful: true }))).toBe('careful');
  });

  it("not when they've already said what they'll do, or Ferni already asked", () => {
    const committed = [...WORKING_CALL];
    committed[4] = "I'm going to email her Thursday about it.";
    expect(inviteFits(input(committed))).toBe('committed');
    // Said, even after a hedge.
    committed[4] = "I don't know. I'll email her Thursday.";
    expect(inviteFits(input(committed))).toBe('committed');
    // "not gonna call her" is no promise; "I'll talk to you later" isn't one either.
    committed[4] = "I'm not gonna call her about it. I'll talk to you about it more.";
    expect(inviteFits(input(committed))).toBe(true);
    const asked = { ferniLines: ["What's one small thing you could do this week?"] };
    expect(inviteFits(input(WORKING_CALL, asked))).toBe('asked');
  });
});

describe('on the live request path', () => {
  it('adds nothing with the flag off', () => {
    delete process.env.COMMITMENT_INVITE;
    expect(reminder(WORKING_CALL, {})).not.toMatch(INVITE);
  });

  it('invites once, last in the reminder, and the same turn asked again keeps it', () => {
    const session = {};
    const note = reminder(WORKING_CALL, session);
    expect(note).toMatch(INVITE);
    // Last, after the turn style's question allowance: nearest the reply.
    expect(note.endsWith(`${INVITE_NOTE})`)).toBe(true);
    expect(note).not.toMatch(REFLECT);
    // The preemptive and the final request for one turn agree.
    expect(reminder(WORKING_CALL, session)).toMatch(INVITE);
  });

  it('says back what they named on the next reply, then never again on the call', () => {
    const session = {};
    reminder(WORKING_CALL, session);
    const answered = [...WORKING_CALL, "Yeah. I'll email her Thursday to set up a time."];
    const reflect = reminder(answered, session);
    expect(reflect).toMatch(REFLECT);
    expect(reflect).not.toMatch(INVITE);
    const after = [...answered, 'Anyway, that makes sense. Ha.'];
    const later = [...after, 'Okay, you are right, that helps.'];
    expect(reminder(after, session)).not.toMatch(INVITE);
    expect(reminder(after, session)).not.toMatch(REFLECT);
    expect(reminder(later, session)).not.toMatch(INVITE);
  });

  it('a step they floated themselves is said back, not asked for again, then nothing', () => {
    const session = {};
    const floated = [
      ...WORKING_CALL.slice(0, 5),
      'Hm, that makes sense. I might text her this weekend.',
    ];
    const note = reminder(floated, session);
    expect(note).toMatch(NAMED);
    expect(note).not.toMatch(INVITE);
    expect(reminder(floated, session)).toMatch(NAMED); // same turn, asked again
    const next = [...floated, 'Yeah. Anyway, that makes sense.'];
    for (const turn of [next, [...next, 'Okay, you are right, that helps.']]) {
      expect(reminder(turn, session)).not.toMatch(INVITE);
      expect(reminder(turn, session)).not.toMatch(NAMED);
      expect(reminder(turn, session)).not.toMatch(REFLECT);
    }
  });

  it('a decline gets the let-it-go line once and no second invite', () => {
    const session = {};
    reminder(WORKING_CALL, session);
    const declined = [...WORKING_CALL, 'Eh, not really. I just needed to talk it out.'];
    expect(reminder(declined, session)).toContain(
      "If they passed, let it go lightly; don't bring it up again."
    );
    const more = [...declined, 'Anyway, that helps. Makes sense.'];
    const again = [...more, 'Okay you are right, that makes sense.'];
    for (const turn of [more, again]) {
      expect(reminder(turn, session)).not.toMatch(INVITE);
      expect(reminder(turn, session)).not.toMatch(REFLECT);
    }
  });

  it('a heavy reply after the invite gets no say-it-back', () => {
    const session = {};
    reminder(WORKING_CALL, session);
    expect(
      reminder([...WORKING_CALL, "Honestly I'm just so stressed and tired."], session)
    ).not.toMatch(REFLECT);
  });

  it('crisis guidance closes the call to invites, then and on every later turn', () => {
    const session = {};
    const earlier = WORKING_CALL.slice(0, 5);
    expect(reminder(earlier, session, true)).not.toMatch(INVITE);
    expect(reminder(WORKING_CALL, session)).not.toMatch(INVITE);
    expect(reminder(WORKING_CALL, session)).not.toMatch(REFLECT);
  });

  it('a crisis script from the gate (no reminder built) holds it too', async () => {
    const session = { userData: undefined };
    const model = vi.fn();
    const crisis = ctx(['I want to kill myself tonight']);
    const env = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
    await gatedReply(crisis, session, model as never, { wrap: (s: unknown) => s } as never, {
      env,
    });
    expect(model).not.toHaveBeenCalled();
    expect(reminder(WORKING_CALL, session)).not.toMatch(INVITE);
    // An ordinary session on the same words still gets it.
    expect(reminder(WORKING_CALL, { userData: undefined })).toMatch(INVITE);
    const held = {};
    holdCommitmentInvite(held);
    expect(reminder(WORKING_CALL, held)).not.toMatch(INVITE);
    expect(reminder(WORKING_CALL, held)).not.toMatch(REFLECT);
  });

  it('waits on a first call until there is some rapport', () => {
    const firstCall = { userData: { isReturningUser: false, userId: 'u1' } };
    expect(reminder(WORKING_CALL, firstCall)).not.toMatch(INVITE);
  });
});

describe('the notes', () => {
  it('stay short and never hand them a step', () => {
    for (const note of [INVITE_NOTE, REFLECT_NOTE, NAMED_NOTE])
      expect(note.split(/\s+/).length).toBeLessThanOrEqual(60);
    expect(INVITE_NOTE).toMatch(/easy to say no/);
    expect(INVITE_NOTE).toMatch(/don't suggest one/);
    // It must beat the turn shape's "No question this time" line it follows.
    expect(INVITE_NOTE).toMatch(/over any length or no-question line above/);
  });

  it('returns nothing without caller words', () => {
    expect(commitmentInviteNote({}, input(WORKING_CALL, { said: '' }))).toBe('');
  });
});
