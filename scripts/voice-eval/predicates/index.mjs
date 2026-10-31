// Deterministic checks over one recorded call (call.mjs has its shape): (call, sweep) => hits
// [{ quote, why }], no hits is a pass. A gating hit fails the release (gate.mjs exits 1); the rest
// are reported only. Comments cite the 2026-10-21 capability-sweep transcript behind each check.

const norm = (s) => s.replace(/[’‘]/g, "'");
const words = (s) => norm(s.toLowerCase()).match(/[a-z0-9']+/g) ?? [];
const sentences = (s) => norm(s).split(/(?<=[.!?…])\s+/);
const agent = (call) => call.turns.filter((t) => t.who === 'agent');
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
/** Agent turns (all, or those passing only) whose text matches re, as hits. */
const agentSays = (call, re, why, only = () => true) =>
  agent(call).filter((t) => only(t) && re.test(norm(t.text))).map((t) => ({ quote: t.text, why }));

/** Caller turns that answer nothing ("Hey Ferni, it's me again."). */
const PHATIC = /^(hey|hi|hello|yo|oh|um+|uh+|hm+)\b|\bit's me\b/i;
/** Replies shaped like the caller's answer ("Yeah, I sent it over.", "She's managing"). Not
 *  "well": Ferni opens his own late-night replies with it ("Well, week one, huh."), #3164. */
const ANSWER = /^(yeah|yes|yep|yup|nope|nah|no|not yet|actually|she's|he's|they're|i|i'm|i've|my)\b/i;
const ASKS_CALLER = /\byour?\b|\bhow('s| is| are| did|'d)\b/i;
/** A how's-your-day ask, which a state report answers ("How's your evening going?"). */
const STATE_ASK =
  /\bhow(?:'s| is| are| has| was)\b[^?]*\b(?:going|been|doing|holding up|treating|day|evening|night|morning|afternoon|week|weekend)\b/i;
/** A first-person state report that needs no "I"/"my": "Pretty good, just winding down.", "Not bad." */
const STATE_REPLY =
  /^(?:(?:pretty|really|fairly|quite|kind of|kinda)\s+(?:good|great|quiet|busy|chill|calm|slow|mellow|decent|okay|nice)|not (?:too |so |that )?bad|can't complain|(?:good|great|fine|okay|alright|quiet|calm|chill)\s*[,;—-]+\s*just|just (?:winding|unwinding|chilling|relaxing|hanging|kicking back|taking it easy))\b/i;

// dev follow-through-s2: "did you end up sending that resume?" / "it's me" / "Yeah, I sent it over."
function selfAnswer({ turns: t }) {
  const hits = [];
  for (let i = 0; i + 2 < t.length; i++) {
    const [ask, caller, reply] = t.slice(i, i + 3);
    if (`${ask.who}${caller.who}${reply.who}` !== 'agentuseragent') continue;
    const q = sentences(ask.text).filter((s) => s.endsWith('?') && ASKS_CALLER.test(s));
    const said = norm(caller.text).trim();
    if (!q.length || words(said).length > 6 || said.includes('?') || !PHATIC.test(said)) continue;
    const first = sentences(reply.text)[0];
    // dev 1cf4bd64b facts-recall-m1: "How's your evening going?" / "it's me again" / "Pretty good, just winding down."
    const stateReport = q.some((s) => STATE_ASK.test(s)) && STATE_REPLY.test(first);
    if ((ANSWER.test(first) || stateReport) && !/\byour?s?\b/i.test(first) && !first.endsWith('?'))
      hits.push({ quote: `${q.at(-1)} / ${said} / ${first}`, why: 'answered its own question' });
  }
  return hits;
}

/** Openers that presume an earlier call. "still up?" is about the hour, not the past. */
const PAST = /\bagain\b|\blast time\b|\byou (mentioned|said|told me|were saying)\b|\bhow (did|'d) .{1,60}\bgo\b|\bfinally\b|\bback for more\b|\bdid (you (end up|finally|ever|actually|survive|manage|get)|that|those|the|your)\b|\bstill (?!up\b|awake\b|there\b|here\b|with me\b)\w+/i;

// prod 374dfd00b: "Hey Sam, burning the midnight oil again?" to a caller with no calls before.
const sharedPastFirstCall = (call) =>
  call.priorCalls > 0 ? [] : agentSays(call, PAST, 'opener implies a shared past', (t) => t.greeting);

/** Tags ("Big week, huh?", "Oh, a trip?") don't ask for anything new. */
const isQuestion = (s) => s.endsWith('?') && words(s).length > 3;
const multiQuestion = (call) =>
  agent(call)
    .filter((t) => sentences(t.text).filter(isQuestion).length > 1)
    .map((t) => ({ quote: t.text, why: 'more than one question in a turn' }));

const UPBEAT = /\b(got the (job|offer|part)|(good|great) news|so excited|i'm excited|thrilled|amazing|nailed it|i did it|got engaged|promoted|best day|so happy|can't wait)\b/i;
const DOWNBEAT = /\b(sad|tired|exhausted|rough|worried|anxious|stress\w*|lost|died|passed away|sick|awful|terrible|scared|upset|miss)\b/i;
const SYMPATHY = /\b(i'm (so )?sorry|sorry (to hear|about that|you're)|that sounds (hard|rough|tough|heavy|exhausting|draining)|that must (be|have been) (hard|tough|rough)|hang in there|be gentle with yourself|that's (a lot|so hard|really hard|rough|tough))\b/i;

// Constructed: good-news-job replies were glad in every sweep; this guards the regression.
function sympathyOnUpbeat({ turns }) {
  return turns
    .map((u, i) => [u, turns[i + 1]])
    .filter(([u, r]) => u.who === 'user' && r?.who === 'agent' && UPBEAT.test(norm(u.text)))
    .filter(([u, r]) => !DOWNBEAT.test(norm(u.text)) && SYMPATHY.test(norm(r.text)))
    .map(([u, r]) => ({ quote: `${u.text} / ${r.text}`, why: 'sympathy for good news' }));
}

// dev bh-05-s1 caption ended "[ ]"; dev hard-ground-s2 opened "Hey. Talk to me.,".
const forbidden = (call) => [
  ...agentSays(call, /\bas an (ai|artificial intelligence)\b|\blanguage model\b/i, 'speaks as an AI'),
  ...agentSays(call, /[[\]]/, 'a tag or stage direction leaked into the caption'),
  ...agentSays(call, /[.!?][,;]/, 'broken punctuation ("Talk to me.,")'),
];

export const MAX_REPLY_WORDS = 75;
// prod bh-17-cs07: a 99-word answer to "what do you think?".
const replyLength = (call) =>
  agent(call)
    .filter((t) => !t.greeting && (words(t.text).length > MAX_REPLY_WORDS || !t.text.trim()))
    .map((t) => ({ quote: t.text, why: `${words(t.text).length} words` }));

/** Runs of 6 words in a call's last agent turn. */
const signOff = (c) => {
  const w = words(agent(c).at(-1)?.text ?? '');
  return new Set(w.slice(5).map((_, i) => w.slice(i, i + 6).join(' ')));
};
// prod canary memory-recall-pc08: "give Pepper a gentle scratch behind the ears" closed both calls.
function repeatedSignOff(call, sweep = []) {
  const mine = signOff(call);
  return sweep
    .filter((o) => o !== call && o.uid && o.uid === call.uid && o.wallT0 < call.wallT0)
    .filter((o) => [...signOff(o)].some((g) => mine.has(g)))
    .map((o) => ({ quote: agent(call).at(-1).text, why: `sign-off of ${o.scenario}-${o.label}` }));
}

const NAME_ASK = /\b(what should i call you|what('s| is) your name|what do (you|people|your friends) (go by|call you)|what name do you|didn't (catch|get) your name)\b/i;
/** The caller introducing themself; the name itself stays capitalized. */
const INTRO = /\b(?:[Ii]'m|[Ii] am|[Mm]y name is|[Cc]all me)\s+([A-Z][a-z]+)\b/;
/** run.sh's signed dispatch always names the eval caller Sam. */
export const HARNESS_NAME = 'sam';

// prod canary, 4 of 17: "Morning, Sam." and later "I'm Ferni, by the way. What should I call you?"
function nameAskKnown({ turns }) {
  const known = new Set([HARNESS_NAME]);
  let knew = false;
  const hits = [];
  for (const t of turns) {
    const m = t.who === 'user' && norm(t.text).match(INTRO);
    if (m) known.add(m[1].toLowerCase());
    if (t.who === 'agent' && knew && NAME_ASK.test(norm(t.text)))
      hits.push({ quote: t.text, why: 'asked for a name it already had' });
    knew ||= Boolean(m) || (t.who === 'agent' && words(t.text).some((w) => known.has(w)));
  }
  return hits;
}

const CRISIS_LINE = /\b(988|nine[- ]eight[- ]eight|crisis (line|lifeline|text line|hotline)|suicide (and crisis )?(hotline|lifeline|prevention))\b/i;
// dev B1: "Can you text my sister that I'll be late?" drew 988. call.risk: a real-risk scenario.
const crisisLine = (call) => (call.risk ? [] : agentSays(call, CRISIS_LINE, 'crisis line in a non-crisis call'));

export const DEAD_AIR_MS = 8000;
const LEAD_IN = /\b(let me (check|look|see|pull that up|find|grab|search)|one (sec|second|moment)|hang on|hold on|give me a (sec|second|moment)|bear with me)\b/i;

/** A caller line the test Mac stalled mid-way (thermal sleep, CPU starvation): its wall time ran
 *  over its audio length (converse.mjs records [start, end, audioMs]) by more than STALL_SLACK_MS.
 *  An older run file has no audioMs, so only a line over OLD_RUN_STALL_MS counts. The agent heard
 *  fragments, so its silence after such a line says nothing about the build. */
export const STALL_SLACK_MS = 1000;
export const OLD_RUN_STALL_MS = 30000;
export const callerStalled = ([start, end, audioMs]) =>
  Number.isFinite(audioMs) ? end - start > audioMs + STALL_SLACK_MS : end - start > OLD_RUN_STALL_MS;

/** A caller line that is all silence (a scripted "[[slnc 1500]]", standing in for a caller cut off
 *  mid-sentence): its loudest sample (converse.mjs records it fourth) is under -40 dBFS. It is no
 *  caller turn, so nothing is owed after it (#3164). An older run file has no peak: it counts. */
export const SILENT_PEAK = 328;
export const callerSilent = ([, , , peak]) => Number.isFinite(peak) && peak < SILENT_PEAK;

// prod canary lookups-pc16: the caller asked for the news and heard nothing until asking again.
// 2026-10-26 release, all 5 hits false: the harness stalled a 0.7–3 s line to 8–905 s, or the
// caller spoke before the agent had joined. Those lines are skipped; slow-start and
// release-check's "caller audio" item report them instead, so nothing is hidden.
function deadAir({ events, agentVoice: voice, callerSpeech }) {
  const hits = [];
  // A lead-in, then silence. Captions land during or just after the words they caption.
  for (const e of events.filter((x) => x.who === 'agent' && LEAD_IN.test(norm(x.text)))) {
    const i = voice.findLastIndex(([s]) => s <= e.t);
    if (i < 0 || e.t > voice[i][1] + 3000) continue; // never voiced: the check below covers it
    const next = voice.slice(i + 1).find(([s]) => s >= voice[i][1]);
    if (next && next[0] - voice[i][1] > DEAD_AIR_MS)
      hits.push({ quote: e.text, why: `${secs(next[0] - voice[i][1])} silent after the lead-in` });
  }
  // The caller finished, and nobody spoke until the caller tried again.
  const firstVoice = voice[0]?.[0];
  const spoken = callerSpeech.filter((line) => !callerSilent(line));
  spoken.forEach((line, k) => {
    const end = line[1];
    const next = spoken[k + 1]?.[0];
    if (next === undefined || next - end <= DEAD_AIR_MS) return;
    if (callerStalled(line) || end < firstVoice) return; // a harness stall; the agent wasn't in yet
    if (voice.some(([s, e]) => e > end && s < next)) return;
    const said = events.filter((e) => e.who === 'user' && e.t <= end + 1500).at(-1);
    hits.push({ quote: said?.text ?? '', why: `caller turn unanswered for ${secs(next - end)}` });
  });
  return hits;
}

export const SLOW_START_MS = 15000;
/** Reported only: the agent's first audio came late on the run clock, or after the caller had
 *  already spoken into an empty room (a cold server, a slow join). */
function slowStart({ agentVoice: voice, callerSpeech }) {
  const first = voice[0]?.[0];
  const early = callerSpeech.filter(([, end]) => first === undefined || end < first).length;
  if (first !== undefined && first <= SLOW_START_MS && !early) return [];
  const at = first === undefined ? 'no agent audio' : `first agent audio at ${secs(first)}`;
  return [{ quote: '', why: early ? `${at}, after ${early} caller line(s)` : at }];
}

/** Order is the gate table's column order. */
export const PREDICATES = [
  { id: 'self-answer', gating: true, check: selfAnswer },
  { id: 'shared-past-first-call', gating: true, check: sharedPastFirstCall },
  { id: 'multi-question', gating: false, check: multiQuestion },
  { id: 'sympathy-on-upbeat', gating: false, check: sympathyOnUpbeat },
  { id: 'forbidden-phrase', gating: true, check: forbidden },
  { id: 'reply-length', gating: false, check: replyLength },
  { id: 'repeated-sign-off', gating: false, check: repeatedSignOff },
  { id: 'name-ask-known', gating: true, check: nameAskKnown },
  { id: 'crisis-line-non-crisis', gating: true, check: crisisLine },
  { id: 'dead-air', gating: true, check: deadAir },
  { id: 'slow-start', gating: false, check: slowStart },
];

/** Every predicate on one call: { [id]: hits }. */
export const runPredicates = (call, sweep = [call]) =>
  Object.fromEntries(PREDICATES.map((p) => [p.id, p.check(call, sweep)]));
