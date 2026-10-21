/**
 * CALL_WRAP_UP after a goodbye: the farewell is detected only on two real
 * goodbyes, it quiets the call, and IDLE_AFTER_GOODBYE_MS of quiet ends it.
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import {
  callerAsksToHangUp,
  callerSaysGoodbye,
  clearFarewell,
  farewellSaid,
  ferniSaysGoodbye,
  IDLE_AFTER_GOODBYE_MS,
  markFarewell,
  MAX_CALLER_CHARS,
  stayQuiet,
  stayQuietOn,
  watchFarewell,
} from '../call-farewell.js';
import { clearSessionClosing, markSessionClosing } from '../session-closing-tracker.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';

const ON = { CALL_WRAP_UP: 'on' };
const used: string[] = [];
let n = 0;
const newId = (): string => {
  const id = `farewell-${++n}`;
  used.push(id);
  return id;
};
afterEach(() => {
  used.splice(0).forEach((id) => {
    clearFarewell(id);
    clearSessionClosing(id);
  });
  resetCrisisCallRisk();
});

describe('callerSaysGoodbye', () => {
  it.each([
    'okay bye',
    'Bye!',
    'goodbye',
    'alright, talk to you later',
    'Good night Ferni.',
    'gotta go, bye',
    "I'll let you go",
    'see you tomorrow',
    'talk soon',
    'thanks, bye bye',
    'ok I have to go now',
    'bye, thanks',
    'Catch you later!',
    'Take care, bye.',
    'I’ll let you go now',
    // What callers said on 2026-10-19 prod calls that never ended
    "All right, frame. I'll talk to you later.",
    'Yeah, I got to go. Sorry. See you, bro.',
    'Hey, Bernie, hang up the phone. Yeah, hang up right now.',
    'I said hang up now. You need to hang up. You hang up.',
    'you can hang up now',
    'okay, end the call',
  ])('"%s" is a goodbye', (text) => {
    expect(callerSaysGoodbye(text)).toBe(true);
  });

  it.each([
    'goodbye to my old job',
    'say bye to grandma for me',
    'I said goodbye to him yesterday',
    'it was hard to say goodbye',
    'I have to go to the dentist tomorrow',
    'bye, actually wait, one more thing',
    "later today I'm seeing my sister",
    'I need to go back to school',
    'byelaws are boring',
    'bye?',
    '',
    "don't hang up",
    'did you hang up',
    'wait, why did you hang up on me',
    "I'm going to hang up the laundry",
    'I hung up on my boss today',
    "come on, you got to go, it's your sister's wedding",
    'you gotta go',
  ])('"%s" is not a goodbye', (text) => {
    expect(callerSaysGoodbye(text)).toBe(false);
  });
});

describe('callerAsksToHangUp', () => {
  it('is an explicit ask to end the call, not any goodbye', () => {
    expect(callerAsksToHangUp('Yeah, hang up right now.')).toBe(true);
    expect(callerAsksToHangUp('I said hang up now. You need to hang up.')).toBe(true);
    expect(callerAsksToHangUp('okay, you can end the call')).toBe(true);
    expect(callerAsksToHangUp('okay bye')).toBe(false);
    expect(callerAsksToHangUp("please don't hang up")).toBe(false);
    expect(callerAsksToHangUp('can you hang up?')).toBe(false);
  });
});

describe('callerSaysGoodbye on long or hostile turns', () => {
  // The old regex nested overlapping alternatives under `*`: "thank you" x26
  // took 1.4 s and each repeat roughly doubled it. These run on live transcripts.
  it.each([
    ['thank you ', 'x'],
    ['bye ', 'x'],
    ['bye-bye ', 'x'],
    ['okay ', 'x'],
    ['thanks so much ', 'later x'],
  ])('"%s" x10,000 then "%s" is checked in under 50 ms', (fragment, end) => {
    const text = fragment.repeat(10_000) + end;
    const started = performance.now();
    expect(callerSaysGoodbye(text)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('reads only the end of a long turn, where a goodbye is', () => {
    expect(callerSaysGoodbye(`${'so anyway '.repeat(100)}. okay bye`)).toBe(true);
    expect(callerSaysGoodbye(`okay bye. ${'and then we talked about work '.repeat(20)}`)).toBe(
      false
    );
  });

  it('looks no further back than MAX_CALLER_CHARS', () => {
    expect(callerSaysGoodbye(`bye, ${'ok, '.repeat(10)}`)).toBe(true);
    expect(callerSaysGoodbye(`bye, ${'ok, '.repeat(60)}`)).toBe(false);
  });

  it('drops the word the length cap cut through', () => {
    // The last MAX_CALLER_CHARS characters start at "later", inside "translater".
    const tail = `${', ok'.repeat(48)},ok`;
    const text = `translater${tail}`;
    expect(('later' + tail).length).toBe(MAX_CALLER_CHARS);
    expect(callerSaysGoodbye(text)).toBe(false);
  });
});

describe('ferniSaysGoodbye', () => {
  it('needs a goodbye and no closing question', () => {
    expect(ferniSaysGoodbye('Bye, take care.')).toBe(true);
    expect(ferniSaysGoodbye('Talk soon.')).toBe(true);
    expect(ferniSaysGoodbye('Good night, sleep well.')).toBe(true);
    expect(ferniSaysGoodbye('Before you go, how did the interview go?')).toBe(false);
    expect(ferniSaysGoodbye("I see you've been busy.")).toBe(false);
    expect(ferniSaysGoodbye('Okay bye, but wait, did you call your mom?')).toBe(false);
  });
});

describe('stayQuiet', () => {
  it('is isSessionClosing with the flag off, and adds the farewell with it on', () => {
    const id = newId();
    markFarewell(id, 'goodbyes');
    expect(stayQuiet(id, {})).toBe(false);
    expect(stayQuiet(id, ON)).toBe(true);
    const closing = newId();
    markSessionClosing(closing);
    expect(stayQuiet(closing, {})).toBe(true);
  });
});

/** A fake session plus a manual clock for the idle timer. */
function call(opts: { crisis?: () => boolean } = {}) {
  const session = new EventEmitter();
  const sessionId = newId();
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 0;
  let idle = 0;
  const stop = watchFarewell(session, {
    sessionId,
    onIdle: () => void idle++,
    setTimer: (fn, ms) => {
      timers.set(++next, { fn, ms });
      return next;
    },
    clearTimer: (h) => void timers.delete(h as number),
    ...(opts.crisis && { crisis: opts.crisis }),
  });
  const say = (role: 'user' | 'assistant', text: string) =>
    session.emit('conversation_item_added', { item: { type: 'message', role, textContent: text } });
  const agent = (s: string) => session.emit('agent_state_changed', { newState: s });
  const user = (s: string) => session.emit('user_state_changed', { newState: s });
  const fire = () => {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach((t) => t.fn());
  };
  return {
    session,
    sessionId,
    timers,
    say,
    agent,
    user,
    fire,
    stop,
    idle: () => idle,
  };
}

describe('watchFarewell', () => {
  it('a caller goodbye then Ferni goodbye is a farewell; a few seconds of quiet ends the call', () => {
    const c = call();
    c.say('user', 'okay, bye!');
    expect(farewellSaid(c.sessionId)).toBe(false);
    c.agent('speaking');
    c.say('assistant', 'Bye, take care.');
    expect(farewellSaid(c.sessionId)).toBe(true);
    expect(stayQuiet(c.sessionId, ON)).toBe(true);
    expect(stayQuietOn(c.session, ON)).toBe(true);
    expect(stayQuietOn({}, ON)).toBe(false);
    expect(c.timers.size).toBe(0); // still speaking
    c.agent('listening');
    expect([...c.timers.values()].map((t) => t.ms)).toEqual([IDLE_AFTER_GOODBYE_MS]);
    expect(IDLE_AFTER_GOODBYE_MS).toBe(4_000);
    c.fire();
    expect(c.idle()).toBe(1);
  });

  it('needs both goodbyes: neither alone arms anything', () => {
    const a = call();
    a.say('user', 'goodbye to my old job, honestly');
    a.say('assistant', 'Bye to that place, then.');
    a.agent('listening');
    expect(farewellSaid(a.sessionId)).toBe(false);
    expect(a.timers.size).toBe(0);

    const q = call();
    q.say('user', 'okay bye');
    q.say('assistant', 'Before you go, did you call your mom?');
    q.agent('listening');
    expect(farewellSaid(q.sessionId)).toBe(false);
    expect(q.timers.size).toBe(0);

    const b = call();
    b.say('user', 'what should I cook tonight');
    b.say('assistant', 'Have a good dinner.');
    b.agent('listening');
    expect(farewellSaid(b.sessionId)).toBe(false);
    expect(b.timers.size).toBe(0);
  });

  it('the caller speaking holds the window; carrying on clears the farewell', () => {
    const c = call();
    c.say('user', 'bye');
    c.say('assistant', 'Bye!');
    c.agent('listening');
    c.user('speaking');
    expect(c.timers.size).toBe(0);
    c.say('user', 'oh wait, one more thing');
    expect(farewellSaid(c.sessionId)).toBe(false);
    c.user('listening');
    expect(c.timers.size).toBe(0);
    expect(c.idle()).toBe(0);
  });

  it('a call already closing (endCall ran) never fires the idle end', () => {
    const c = call();
    c.say('user', 'bye');
    c.say('assistant', 'Bye!');
    c.agent('listening');
    markSessionClosing(c.sessionId);
    c.fire();
    expect(c.idle()).toBe(0);
  });

  it('Ferni said goodbye first, then the caller: that is a farewell too', () => {
    // 2026-10-19 prod: "See you, bro." -> Ferni's goodbye -> "All right, bye." -> nothing ended it
    const c = call();
    c.say('user', "it's getting late here, man");
    c.agent('speaking');
    c.say('assistant', 'No worries. Go get some rest and we will catch up later. Take care, man.');
    c.agent('listening');
    c.say('user', 'All right, bye.');
    expect(farewellSaid(c.sessionId)).toBe(true);
    c.fire();
    expect(c.idle()).toBe(1);
  });

  it('an explicit "hang up" ends the call after Ferni\'s reply even if he did not say goodbye', () => {
    const c = call();
    c.say('user', 'Hey, hang up the phone. Yeah, hang up right now.');
    c.agent('speaking');
    c.say('assistant', "Well, I'm still here. I didn't hang up.");
    expect(c.timers.size).toBe(0); // not while he is still speaking
    c.agent('listening');
    expect([...c.timers.values()].map((t) => t.ms)).toEqual([IDLE_AFTER_GOODBYE_MS]);
    c.fire();
    expect(c.idle()).toBe(1);
  });

  it('"wait" during the goodbye window keeps the call, even after a hang-up ask', () => {
    const c = call();
    c.say('user', 'okay hang up now');
    c.say('assistant', 'Okay, bye!');
    c.agent('listening');
    c.say('user', 'wait, actually one more thing');
    expect(farewellSaid(c.sessionId)).toBe(false);
    expect(c.timers.size).toBe(0);
    c.fire();
    expect(c.idle()).toBe(0);
  });

  it('Ferni carrying on after the goodbyes (a question) clears the farewell', () => {
    const c = call();
    c.say('user', 'bye');
    c.say('assistant', 'Bye!');
    c.agent('speaking');
    c.say('assistant', 'Oh, before you go, did you ever call your mom?');
    c.agent('listening');
    expect(farewellSaid(c.sessionId)).toBe(false);
    expect(c.timers.size).toBe(0);
  });

  it('never ends a call with crisis risk on it, whatever was said', () => {
    const c = call();
    noteCrisisRisk(c.sessionId);
    c.say('user', 'okay, bye');
    c.say('assistant', 'Bye. I am here whenever you need me.');
    c.agent('listening');
    c.fire();
    expect(c.idle()).toBe(0);

    const h = call({ crisis: () => true });
    h.say('user', 'hang up now');
    h.say('assistant', 'Okay.');
    h.agent('listening');
    h.fire();
    expect(h.idle()).toBe(0);
  });

  it('a "bye" inside a sentence never arms the end', () => {
    const c = call();
    c.say('user', 'I have to say bye to my sister before she flies out, she leaves at six');
    c.say('assistant', 'That is a big send-off. Take care of yourself today.');
    c.agent('listening');
    expect(farewellSaid(c.sessionId)).toBe(false);
    expect(c.timers.size).toBe(0);
    c.fire();
    expect(c.idle()).toBe(0);
  });

  it('stops on session close and forgets the farewell', () => {
    const c = call();
    c.say('user', 'bye');
    c.say('assistant', 'Bye!');
    c.session.emit('close', {});
    expect(farewellSaid(c.sessionId)).toBe(false);
    expect(c.session.listenerCount('conversation_item_added')).toBe(0);
  });
});
