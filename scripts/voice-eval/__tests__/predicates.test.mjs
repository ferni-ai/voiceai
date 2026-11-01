// Each predicate against a positive and a negative call. The lines paraphrase
// the 2026-10-21 capability sweeps (voiceai-evidence/capability-sweep-2026-10-21),
// with names swapped out and the shape kept.
import { describe, expect, it } from 'vitest';
import { callOf } from '../predicates/call.mjs';
import { PREDICATES, runPredicates } from '../predicates/index.mjs';

/**
 * A run file from 'a: ...' / 'u: ...' lines, 4 s apart. Agent lines before the
 * first caller line are the greeting. Agent voice spans each agent line; `gaps`
 * maps a line index to extra silence after it (ms).
 */
function run(
  lines,
  { gaps = {}, uid = 'voice-eval-x', wallT0 = 0, scenario = 'scn', drop = [] } = {}
) {
  let t = 1000;
  const events = [];
  const userSpeech = [];
  const voice = [];
  lines.forEach((line, i) => {
    const who = line.startsWith('u:') ? 'user' : 'agent';
    const text = line.slice(2).trim();
    if (who === 'user') {
      userSpeech.push([t, t + 2000]);
      events.push({ t: t + 2000, who, text });
    } else {
      if (!drop.includes(i)) voice.push([t, t + 2000]);
      events.push({ t: t + 2100, who, text });
    }
    t += 4000 + (gaps[i] ?? 0);
  });
  return {
    meta: { scenario, label: 's1', uid, room: `${scenario}-${uid}-${wallT0}` },
    wallT0,
    events,
    userSpeech,
    tracks: [
      { name: 'agent:roomio_audio', voice },
      { name: 'agent:background_reactions', voice: [] },
    ],
    results: [],
  };
}
const call = (lines, opts = {}) => {
  const r = run(lines, opts);
  opts.edit?.(r);
  const c = callOf(r);
  c.priorCalls = opts.priorCalls ?? 0;
  c.risk = opts.risk ?? false;
  return c;
};
const hits = (id, c, sweep) => PREDICATES.find((p) => p.id === id).check(c, sweep ?? [c]);

describe('self-answer', () => {
  it('flags answering its own opener after "it\'s me" (dev follow-through-s2)', () => {
    const c = call(
      [
        'a: Hey Sam, did you end up mailing that application to the recruiter?',
        "u: Hey Ferni, it's me.",
        'a: Yeah, I mailed it off. Felt good to finally hit send.',
      ],
      { priorCalls: 1 }
    );
    expect(hits('self-answer', c)).toHaveLength(1);
  });
  it('flags the pet shape (dev memory-recall-s1)', () => {
    const c = call(
      [
        'a: Hey Sam, how is the dog doing with that cone?',
        "u: Hey Ferni, it's me again.",
        "a: She's coping, but that plastic thing is her worst enemy. How are you?",
      ],
      { priorCalls: 1 }
    );
    expect(hits('self-answer', c)).toHaveLength(1);
  });
  it('passes when the reply turns back to the caller', () => {
    const c = call(
      [
        'a: Hey Sam, did you end up mailing that application?',
        "u: Hey Ferni, it's me.",
        'a: Hey you! So, did it go out?',
      ],
      { priorCalls: 1 }
    );
    expect(hits('self-answer', c)).toEqual([]);
  });
  it('passes when the caller asked Ferni something (dev crisis-relay-s2)', () => {
    const c = call([
      "a: Hey Sam, evening. How's it going?",
      'u: Hey, are you my friend?',
      'a: I am, yeah.',
    ]);
    expect(hits('self-answer', c)).toEqual([]);
  });
});

describe('self-answer: "Well," opens Ferni\'s own reply, not an answer for the caller (#3164)', () => {
  const lateNight = (reply) =>
    call(["a: Hey Sam, what's keeping you up so late?", "u: Hey Ferni, it's me.", `a: ${reply}`]);
  it.each([
    'Well, hey, Jazz… good to hear you.',
    'Well, week one, huh.',
    "Well, four in the morning is a rough time… What's got you awake?",
  ])('passes %j', (reply) => {
    expect(hits('self-answer', lateNight(reply))).toEqual([]);
  });
  it('still flags a real answer after the same opener', () => {
    expect(hits('self-answer', lateNight("Yeah, I just can't sleep tonight."))).toHaveLength(1);
  });
});

describe("self-answer: a state report to its own how's-your-evening ask (dev 1cf4bd64b facts-recall)", () => {
  const evening = (reply, said = "Hey Ferni, it's me again.") =>
    call(["a: Hey Sam, how's your evening going?", `u: ${said}`, `a: ${reply}`], { priorCalls: 1 });
  it.each([
    'Pretty good, just winding down.', // m1: the old ANSWER list had no "pretty good"
    "My evening's been quiet, just winding down.", // m3
    'Not bad, just winding down. Long day?',
    "Just winding down, honestly. It's been a slow one.",
  ])('flags %j', (reply) => {
    expect(hits('self-answer', evening(reply))).toHaveLength(1);
  });
  it('passes "Pretty good! How about you?" when the CALLER asked first', () => {
    expect(hits('self-answer', evening('Pretty good! How about you?', "Hey Ferni! How's yours?"))).toEqual([]); // prettier-ignore
  });
  it('passes a reply that turns to the caller', () => {
    expect(hits('self-answer', evening('Good to hear your voice. So, how was it?'))).toEqual([]);
  });
  it('passes "not bad" when the ask was not about their day', () => {
    const c = call(
      [
        'a: Hey Sam, did you end up mailing that application?',
        "u: Hey Ferni, it's me again.",
        'a: Not bad timing, I was just thinking about that.',
      ],
      { priorCalls: 1 }
    );
    expect(hits('self-answer', c)).toEqual([]);
  });
});

describe('shared-past-first-call', () => {
  it('flags "again?" to a first-time caller (prod 374dfd00b, 5 of 16)', () => {
    expect(
      hits(
        'shared-past-first-call',
        call(['a: Hey Sam, burning the midnight oil again?', 'u: Hi.'])
      )
    ).toHaveLength(1);
  });
  it('flags a presumed event (prod "Did that coffee finally kick in?")', () => {
    expect(
      hits(
        'shared-past-first-call',
        call(['a: Morning, Sam. Did that coffee finally kick in?', 'u: Hi.'])
      )
    ).toHaveLength(1);
  });
  it('passes the same opener on a return call', () => {
    expect(
      hits(
        'shared-past-first-call',
        call(['a: Hey Sam, burning the midnight oil again?', 'u: Hi.'], { priorCalls: 1 })
      )
    ).toEqual([]);
  });
  it('passes an hour remark (dev lookups-s1 "still up?")', () => {
    expect(hits('shared-past-first-call', call(['a: Hey Sam, still up?', 'u: Hi.']))).toEqual([]);
  });
});

describe('multi-question', () => {
  it('flags two real questions in one turn', () => {
    const c = call([
      'a: Hi.',
      'u: The interview moved.',
      'a: Oh, it moved to Monday? How are you feeling about the prep so far?',
    ]);
    expect(hits('multi-question', c)).toHaveLength(1);
  });
  it('passes a tag plus one question (dev facts-seed "Big week, huh?")', () => {
    expect(
      hits(
        'multi-question',
        call(['a: Hi.', 'u: Busy week.', "a: Big week, huh? What's on the schedule?"])
      )
    ).toEqual([]);
  });
});

describe('sympathy-on-upbeat', () => {
  // Constructed: no sweep reply did this (good-news-job replies were glad). The caller line is real.
  it('flags sympathy for good news', () => {
    const c = call([
      'a: Hi.',
      'u: I got the job. The one at the design studio.',
      "a: Oh, I'm so sorry. That sounds like a lot.",
    ]);
    expect(hits('sympathy-on-upbeat', c)).toHaveLength(1);
  });
  it('passes gladness (dev good-news-job-s1)', () => {
    const c = call([
      'a: Hi.',
      'u: I got the job. The one at the design studio.',
      'a: That is huge. I am so glad.',
    ]);
    expect(hits('sympathy-on-upbeat', c)).toEqual([]);
  });
  it('passes sympathy when the news is mixed', () => {
    const c = call([
      'a: Hi.',
      "u: I got the job, but I'm exhausted and worried about the move.",
      'a: That sounds hard.',
    ]);
    expect(hits('sympathy-on-upbeat', c)).toEqual([]);
  });
});

describe('forbidden-phrase', () => {
  it('flags a leaked caption bracket (dev bh-05-s1)', () => {
    expect(
      hits(
        'forbidden-phrase',
        call(['a: Hi.', 'u: Long commute.', 'a: Twenty past eight every day is rough. [ ]'])
      )
    ).toHaveLength(1);
  });
  it('flags "Talk to me.," (dev hard-ground-s2)', () => {
    expect(hits('forbidden-phrase', call(['a: Hey. Talk to me.,', 'u: Hi.']))).toHaveLength(1);
  });
  it('flags speaking as an AI', () => {
    expect(
      hits(
        'forbidden-phrase',
        call(['a: Hi.', 'u: Do you get tired?', "a: As an AI, I don't get tired."])
      )
    ).toHaveLength(1);
  });
  it('passes a clean reply', () => {
    expect(
      hits(
        'forbidden-phrase',
        call(['a: Hey. Talk to me.', 'u: Hi.', 'a: Rough way to start, huh?'])
      )
    ).toEqual([]);
  });
});

describe('reply-length', () => {
  it('flags a monologue (prod bh-17-cs07, 99 words)', () => {
    const long = Array.from({ length: 99 }, () => 'word').join(' ');
    expect(hits('reply-length', call(['a: Hi.', 'u: Thoughts?', `a: ${long}.`]))).toHaveLength(1);
  });
  it('passes a short greeting and a normal reply', () => {
    expect(
      hits(
        'reply-length',
        call(['a: Hey.', 'u: Thoughts?', 'a: Honestly, I would sleep on it first.'])
      )
    ).toEqual([]);
  });
});

describe('repeated-sign-off', () => {
  const seed = call(
    [
      'a: Hi.',
      'u: Gotta go.',
      "a: Go get 'em, Sam. Give the dog a gentle scratch behind the ears for me. Talk soon.",
    ],
    { wallT0: 1 }
  );
  it("flags the same caller hearing last call's sign-off (prod canary memory-recall-pc08)", () => {
    const next = call(
      [
        'a: Hi.',
        'u: Gotta run.',
        'a: Good luck with the boxes, and give the dog a gentle scratch behind the ears for me.',
      ],
      { wallT0: 2 }
    );
    expect(hits('repeated-sign-off', next, [seed, next])).toHaveLength(1);
  });
  it('passes a different sign-off, or the same one to a different caller', () => {
    const fresh = call(
      [
        'a: Hi.',
        'u: Gotta run.',
        "a: Take care of yourself today, and we'll chat whenever you're ready.",
      ],
      { wallT0: 2 }
    );
    const other = call(
      ['a: Hi.', 'u: Gotta run.', 'a: Give the dog a gentle scratch behind the ears for me.'],
      { wallT0: 2, uid: 'voice-eval-y' }
    );
    expect(hits('repeated-sign-off', fresh, [seed, fresh])).toEqual([]);
    expect(hits('repeated-sign-off', other, [seed, other])).toEqual([]);
  });
});

describe('name-ask-known', () => {
  it('flags greeting by name, then asking for it (prod canary, 4 of 17)', () => {
    const c = call([
      'a: Morning, Sam.',
      'u: Hi.',
      "a: Glad you found your way here. I'm Ferni, by the way. What should I call you?",
    ]);
    expect(hits('name-ask-known', c)).toHaveLength(1);
  });
  it('flags asking after the caller introduced themself', () => {
    const c = call(['a: Hey there.', "u: I'm Jess, by the way.", "a: Nice. What's your name?"]);
    expect(hits('name-ask-known', c)).toHaveLength(1);
  });
  it('passes asking when no name was known', () => {
    expect(
      hits(
        'name-ask-known',
        call(['a: Hey there, welcome.', 'u: Hi.', 'a: What should I call you?'])
      )
    ).toEqual([]);
  });
});

describe('crisis-line-non-crisis', () => {
  const line = 'a: If it ever feels like too much, you can call or text 988 any time.';
  it('flags 988 on an everyday request (dev crisis-relay-s2)', () => {
    expect(
      hits(
        'crisis-line-non-crisis',
        call(['a: Hi.', "u: Can you text my sister that I'll be late?", line])
      )
    ).toHaveLength(1);
  });
  it('passes the same line in a real-risk scenario', () => {
    expect(
      hits(
        'crisis-line-non-crisis',
        call(['a: Hi.', 'u: I have a plan to end it tonight.', line], { risk: true })
      )
    ).toEqual([]);
  });
  it('passes a call with no crisis line', () => {
    expect(
      hits(
        'crisis-line-non-crisis',
        call(['a: Hi.', 'u: Long day.', 'a: Want to tell me about it?'])
      )
    ).toEqual([]);
  });
});

describe('dead-air', () => {
  it('flags silence over 8 s after a lead-in', () => {
    const c = call(
      [
        'a: Hi.',
        'u: Any news today?',
        'a: One sec, let me check.',
        'a: Looks like the vote passed.',
      ],
      { gaps: { 2: 9000 } }
    );
    expect(hits('dead-air', c)).toEqual([
      expect.objectContaining({ why: expect.stringMatching(/after the lead-in/) }),
    ]);
  });
  it('flags a caller turn nobody answered (prod canary lookups-pc16, ~15 s)', () => {
    // The lead-in was generated but never played: no agent voice until the caller tries again.
    const c = call(
      [
        'a: Morning.',
        'u: Anything big in the news today?',
        'a: One sec, let me check.',
        'u: Who won the game last night?',
      ],
      { drop: [2], gaps: { 1: 9000 } }
    );
    expect(hits('dead-air', c)).toEqual([
      expect.objectContaining({ why: expect.stringMatching(/unanswered/) }),
    ]);
  });
  it('passes a lead-in answered within 8 s', () => {
    const c = call(
      [
        'a: Hi.',
        'u: Any news today?',
        'a: One sec, let me check.',
        'a: Looks like the vote passed.',
      ],
      { gaps: { 2: 3000 } }
    );
    expect(hits('dead-air', c)).toEqual([]);
  });

  // 2026-10-26 release: all 5 dead-air hits were the harness, not the agent.
  // Caller line 1 (2 s on the clock) then 15 s with no agent voice before the caller tries again.
  const unanswered = ['a: Hi.', 'u: Any news today?', 'a: One sec.', 'u: Hello?'];
  /** Gives caller line k (in userSpeech order) its recorded audio length, as converse.mjs does. */
  const audioMs = (k, ms) => (r) => r.userSpeech[k].push(ms);
  it('skips a caller line the harness stretched (0.5 s of audio took 2 s on the clock)', () => {
    const c = call(unanswered, { drop: [2], gaps: { 1: 9000 }, edit: audioMs(0, 500) });
    expect(c.callerSpeech[0][2]).toBe(500);
    expect(hits('dead-air', c)).toEqual([]);
  });
  it('still flags the same unanswered line when its audio filled the clock (1.9 s of 2 s)', () => {
    const c = call(unanswered, { drop: [2], gaps: { 1: 9000 }, edit: audioMs(0, 1900) });
    expect(hits('dead-air', c)).toEqual([
      expect.objectContaining({ why: 'caller turn unanswered for 15.0 s' }),
    ]);
  });
  it('skips caller lines that end before the agent first speaks (a cold server)', () => {
    const c = call(['u: Hello?', 'u: Hello, anyone there?', 'a: Hey Sam, sorry, I am here.'], {
      gaps: { 0: 9000 },
      edit: (r) => r.userSpeech.forEach((l) => l.push(2000)),
    });
    expect(c.agentVoice[0][0]).toBeGreaterThan(c.callerSpeech[1][1]);
    expect(hits('dead-air', c)).toEqual([]);
    expect(hits('slow-start', c)).toEqual([
      expect.objectContaining({ why: 'first agent audio at 18.0 s, after 2 caller line(s)' }),
    ]);
  });
  it('still flags a real unanswered turn after the agent has spoken, in a slow-start call', () => {
    const c = call(['u: Hello?', 'a: Hey Sam.', 'u: Any news today?', 'a: One sec.', 'u: Hello?'], {
      gaps: { 0: 9000, 2: 9000 },
      drop: [3],
      edit: (r) => r.userSpeech.forEach((l) => l.push(2000)),
    });
    expect(hits('dead-air', c)).toEqual([
      expect.objectContaining({
        quote: 'Any news today?',
        why: 'caller turn unanswered for 15.0 s',
      }),
    ]);
  });
  it('skips a 905 s line in an older run file without audio lengths (timer-n1026s1)', () => {
    const stretch = (r) => (r.userSpeech[0][1] = r.userSpeech[0][0] + 905000);
    const c = call(unanswered, { drop: [2], gaps: { 1: 920000 }, edit: stretch });
    expect(c.callerSpeech[0]).toHaveLength(2);
    expect(hits('dead-air', c)).toEqual([]);
  });
});

describe('dead-air: a silence-only caller line is no caller turn (#3164, crisis-relay t4)', () => {
  // Ferni asks back, the caller's next line is [[slnc 1500]] (a cut-off), then the caller speaks
  // 15 s later: the silence owed no reply, and the turn before it was answered.
  const cutOff = ['a: Hi.', 'u: Can you call my dad for me?', 'a: Want me to call him now?', 'u: [[slnc 1500]]', 'u: Sorry. Yes please.']; // prettier-ignore
  /** converse.mjs records [start, end, audioMs, peak]; line 1 is the silence. */
  const peaks =
    (...p) =>
    (r) =>
      r.userSpeech.forEach((l, k) => l.push(2000, p[k]));
  it('passes when the silent line (peak 18) is followed by 15 s of quiet', () => {
    const c = call(cutOff, { gaps: { 3: 13000 }, edit: peaks(25649, 18, 25649) });
    expect(c.callerSpeech[1][3]).toBe(18);
    expect(hits('dead-air', c)).toEqual([]);
  });
  it('flags the same 15 s when that line was speech (peak 9000)', () => {
    const c = call(cutOff, { gaps: { 3: 13000 }, edit: peaks(25649, 9000, 25649) });
    expect(hits('dead-air', c)).toEqual([
      expect.objectContaining({ why: 'caller turn unanswered for 15.0 s' }),
    ]);
  });
  it('flags a spoken turn left unanswered across a silent line', () => {
    const ignored = ['a: Hi.', 'u: Can you call my dad?', 'u: [[slnc 1500]]', 'u: Hello?'];
    const c = call(ignored, { gaps: { 1: 6000, 2: 6000 }, edit: peaks(25649, 18, 25649) });
    expect(hits('dead-air', c)).toEqual([
      expect.objectContaining({ why: 'caller turn unanswered for 18.0 s' }),
    ]);
  });
  it('counts a line from an older run file with no peak', () => {
    const c = call(cutOff, { gaps: { 3: 13000 }, edit: (r) => r.userSpeech.forEach((l) => l.push(2000)) }); // prettier-ignore
    expect(hits('dead-air', c)).toHaveLength(1);
  });
});

describe('dead-air boundaries', () => {
  /** Caller lines and agent voice on the run clock; captions don't matter here. */
  const at = (callerSpeech, agentVoice) => ({ events: [], callerSpeech, agentVoice, turns: [] });
  const quiet = (line, voice) => hits('dead-air', at([line, [50000, 52000, 2000]], voice));
  it('a line exactly 1000 ms over its audio still counts; 1001 ms over is a stall', () => {
    const greeted = [[0, 500]];
    expect(quiet([1000, 3000, 1000], greeted)).toHaveLength(1);
    expect(quiet([1000, 3000, 999], greeted)).toEqual([]);
  });
  it('an old line of exactly 30 s still counts; 30.001 s is a stall', () => {
    expect(quiet([1000, 31000], [[0, 500]])).toHaveLength(1);
    expect(quiet([1000, 31001], [[0, 500]])).toEqual([]);
  });
  it('a line ending exactly at, or 100 ms after, the first agent audio still counts', () => {
    expect(quiet([1000, 3000, 2000], [[3000, 3000]])).toHaveLength(1);
    expect(quiet([1000, 3000, 2000], [[2900, 2950]])).toHaveLength(1);
    // control: the same line before any agent audio is skipped
    expect(quiet([1000, 3000, 2000], [[55000, 56000]])).toEqual([]);
  });
});

describe('slow-start (reported only)', () => {
  it('reports first agent audio over 15 s, not at 15 s', () => {
    const c = (first) => ({ callerSpeech: [[20000, 21000, 1000]], agentVoice: [[first, 19000]] });
    expect(hits('slow-start', c(15000))).toEqual([]);
    expect(hits('slow-start', c(15001))).toEqual([
      expect.objectContaining({ why: 'first agent audio at 15.0 s' }),
    ]);
  });
  it('passes a greeting before the caller speaks, and reports a late one', () => {
    expect(hits('slow-start', call(['a: Hi.', 'u: Hey.', 'a: How are you?']))).toEqual([]);
    const late = call(['a: Hi.', 'u: Hey.'], {
      edit: (r) => (r.tracks[0].voice[0] = [16000, 17000]),
    });
    expect(hits('slow-start', late)).toEqual([
      expect.objectContaining({ why: expect.stringMatching(/^first agent audio at 16\.0 s/) }),
    ]);
    expect(PREDICATES.find((p) => p.id === 'slow-start').gating).toBe(false);
  });
});

describe('runPredicates', () => {
  it('returns every predicate id, empty on a clean call', () => {
    const out = runPredicates(
      call(['a: Hey Sam, how is your evening going?', 'u: Not bad.', 'a: Glad to hear it.'])
    );
    expect(Object.keys(out)).toEqual(PREDICATES.map((p) => p.id));
    expect(Object.values(out).every((h) => h.length === 0)).toBe(true);
  });
});
