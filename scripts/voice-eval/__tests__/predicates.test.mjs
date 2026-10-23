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
  const c = callOf(run(lines, opts));
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
  it('passes a lead-in answered within 4 s, and fails one at 5 s (tightened from 8 s, audit 10-22)', () => {
    const lines = [
      'a: Hi.',
      'u: Any news today?',
      'a: One sec, let me check.',
      'a: Looks like the vote passed.',
    ];
    expect(hits('dead-air', call(lines, { gaps: { 2: 1500 } }))).toEqual([]); // 3.5 s
    expect(hits('dead-air', call(lines, { gaps: { 2: 3000 } }))).toHaveLength(1); // 5.0 s
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
