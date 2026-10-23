// One known-bad call per gating predicate. release-check.mjs runs each predicate on its canary
// before gating and refuses to gate if one no longer fires: a check that can't go red proves
// nothing. The lines paraphrase the 2026-10-21 transcripts the predicates cite.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gateSweep } from '../gate.mjs';
import { loadSweep } from './call.mjs';
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

// Lines are ' | '-separated: 'a: ' is Ferni, 'u: ' the caller.
const CANARIES = Object.fromEntries(
  Object.entries({
    'self-answer':
      "a: Hey Sam, did you end up sending that resume? | u: Hey Ferni, it's me. | a: Yeah, I sent it over. Felt good to finally hit send.",
    'shared-past-first-call':
      'a: Hey Sam, burning the midnight oil again? | u: Hi. | a: What is on your mind?',
    'forbidden-phrase': 'a: Hey Sam. | u: Hi. | a: Hey. Talk to me.,',
    'name-ask-known':
      "a: Morning, Sam. | u: Morning. | a: I'm Ferni, by the way. What should I call you?",
    'crisis-line-non-crisis':
      "a: Hey Sam. | u: Can you text my sister that I'll be late? | a: You can call or text 988 any time.",
    'dead-air':
      'a: Hey Sam. | u: Anything big in the news today? | a: Let me check. | a: Here it is.',
    'unanswered-turn': 'a: Hey Sam. | u: Are you there?',
    'handoff-gap':
      'a: Hey Sam. | u: Can I talk to Maya? | a: Sure, I will bring her in. | a: Hi, Maya here.',
  }).map(([id, lines]) => [id, lines.split(' | ')])
);
const GAPS = { 'dead-air': { 2: 3000 }, 'handoff-gap': { 2: 2500 } };
const EDITS = {
  'unanswered-turn': (r) => (r.results = [{ userEndedAt: r.userSpeech[0][1], replyDelayMs: null }]),
  'handoff-gap': (r) => {
    const t = r.tracks[0].voice[1][1] + 100;
    r.data = [{ t, payload: { type: 'handoff_complete', from: 'ferni', target: 'maya-santos' } }];
  },
};
// Real calls as canaries: dev action-claim-b (8981d4f03), 12 s of silence and a 23 ms "reply".
const ACTION_CLAIM_B = new URL('./fixtures/action-claim-b.json', import.meta.url);
const FILES = { 'unfilled-silence': ACTION_CLAIM_B, 'inaudible-reply': ACTION_CLAIM_B };
const canaryRun = (id) => {
  const uid = `voice-eval-canary-${id}`;
  if (FILES[id]) {
    const run = JSON.parse(readFileSync(FILES[id], 'utf8'));
    return { ...run, meta: { ...run.meta, scenario: `canary-${id}`, uid, room: uid } };
  }
  const run = runFromLines(CANARIES[id], { gaps: GAPS[id], scenario: `canary-${id}`, uid });
  EDITS[id]?.(run);
  return run;
};

/** Gating predicates whose canary no longer draws a hit: [] means every gate can go red. The
 *  canaries go through the real path (run files in a temp dir, loadSweep, gateSweep), so a
 *  loader that drops calls or a sweep-level guard can't make a gate look alive. */
export function deadGates() {
  const gating = PREDICATES.filter((p) => p.gating);
  const dir = mkdtempSync(join(tmpdir(), 'canaries-'));
  gating.forEach((p, i) => {
    if (!CANARIES[p.id] && !FILES[p.id]) return;
    const run = canaryRun(p.id);
    writeFileSync(join(dir, `canary-${p.id}.json`), JSON.stringify({ ...run, wallT0: i + 1 }));
  });
  const { rows } = gateSweep(loadSweep(dir));
  rmSync(dir, { recursive: true, force: true });
  return gating.flatMap((p) => {
    if (!CANARIES[p.id] && !FILES[p.id]) return [`${p.id}: no canary`];
    const row = rows.find((r) => r.call.scenario === `canary-${p.id}`);
    return row?.hits[p.id].length ? [] : [`${p.id}: its canary no longer fails`];
  });
}
