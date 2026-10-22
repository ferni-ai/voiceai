// One known-bad call per gating predicate. release-check.mjs runs each predicate on its canary
// before gating and refuses to gate if one no longer fires: a check that can't go red proves
// nothing. The lines paraphrase the 2026-10-21 transcripts the predicates cite.
import { callOf } from './call.mjs';
import { PREDICATES } from './index.mjs';

/** A run file from 'a: ' / 'u: ' lines, 4 s apart; agent lines before the first caller line are
 *  the greeting. gaps: extra silence after line i (ms). */
export function runFromLines(
  lines,
  { gaps = {}, scenario = 'canary', uid = 'voice-eval-canary' } = {}
) {
  let t = 1000;
  const [events, userSpeech, voice] = [[], [], []];
  lines.forEach((line, i) => {
    const who = line.startsWith('u:') ? 'user' : 'agent';
    if (who === 'user') userSpeech.push([t, t + 2000]);
    else voice.push([t, t + 2000]);
    events.push({ t: t + 2000 + (who === 'agent' ? 100 : 0), who, text: line.slice(2).trim() });
    t += 4000 + (gaps[i] ?? 0);
  });
  return {
    meta: { scenario, label: 'c', uid, room: `${scenario}-${uid}` },
    wallT0: 0,
    events,
    userSpeech,
    tracks: [{ name: 'agent:roomio_audio', voice }],
    results: [],
  };
}

const CANARIES = {
  'self-answer': [
    'a: Hey Sam, did you end up sending that resume?',
    "u: Hey Ferni, it's me.",
    'a: Yeah, I sent it over. Felt good to finally hit send.',
  ],
  'shared-past-first-call': [
    'a: Hey Sam, burning the midnight oil again?',
    'u: Hi.',
    'a: What is on your mind?',
  ],
  'forbidden-phrase': ['a: Hey Sam.', 'u: Hi.', 'a: Hey. Talk to me.,'],
  'name-ask-known': [
    'a: Morning, Sam.',
    'u: Morning.',
    "a: I'm Ferni, by the way. What should I call you?",
  ],
  'crisis-line-non-crisis': [
    'a: Hey Sam.',
    "u: Can you text my sister that I'll be late?",
    'a: You can call or text 988 any time.',
  ],
  'dead-air': [
    'a: Hey Sam.',
    'u: Anything big in the news today?',
    'u: Hello? Anything big in the news?',
    'a: Sorry, here it is.',
  ],
};
const GAPS = { 'dead-air': { 1: 12000 } };

/** Gating predicates whose canary no longer draws a hit: [] means every gate can go red. */
export function deadGates() {
  return PREDICATES.filter((p) => p.gating).flatMap((p) => {
    if (!CANARIES[p.id]) return [`${p.id}: no canary`];
    const call = callOf(runFromLines(CANARIES[p.id], { gaps: GAPS[p.id] }));
    Object.assign(call, { priorCalls: 0, risk: false });
    return p.check(call, [call]).length ? [] : [`${p.id}: its canary no longer fails`];
  });
}
