/**
 * CALL_WRAP_UP after a goodbye: the farewell is detected only on two real
 * goodbyes, it quiets the call, and IDLE_AFTER_GOODBYE_MS of quiet ends it.
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import {
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
  ])('"%s" is not a goodbye', (text) => {
    expect(callerSaysGoodbye(text)).toBe(false);
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
function call() {
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
  it('a caller goodbye then Ferni goodbye is a farewell; 10 s of quiet ends the call', () => {
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
    expect(IDLE_AFTER_GOODBYE_MS).toBe(10_000);
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

  it('stops on session close and forgets the farewell', () => {
    const c = call();
    c.say('user', 'bye');
    c.say('assistant', 'Bye!');
    c.session.emit('close', {});
    expect(farewellSaid(c.sessionId)).toBe(false);
    expect(c.session.listenerCount('conversation_item_added')).toBe(0);
  });
});
