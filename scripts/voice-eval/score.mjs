// Score a converse.mjs recording.
//
// usage: node score.mjs <run.json> [more.json ...]   (several runs are pooled)
//
// Reply timing: gap from the end of the user's audio to the first agent audio.
//   Human median is ~200 ms; over ~700 ms reads as hesitation (Levinson &
//   Torreira 2015). Ours includes STT end-of-turn, LLM and TTS.
// Reply shape: words per reply, their spread (humans vary a lot), how often a
//   reply ends on a question, stock reaction-word openers, markup leaking into
//   captions.
// Listening: short agent sounds while the user is still talking are
//   backchannels ("mm-hm"); long ones are interruptions.
import { readFileSync } from 'node:fs';

const STOCK_OPENER = /^(?:oh+|ugh+|ha(?:ha)*|hah|yeah|yep|hmm+|mm+|ah+|aw+|wow|whoa)\b/i;
const BACKCHANNEL_MAX_MS = 1500;

const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

const THERAPIST =
  /how (does|did|do) (that|it|this) (feel|make you feel)|what's that like for you|what's underneath|that sounds (really |so |incredibly )?(exhausting|frustrating|hard|tough|overwhelming|stressful|difficult)|that's (so |incredibly |really )?(valid|frustrating|exhausting)|i hear you|thank you for (sharing|trusting)|i'm honored|i'm (right )?here (for you|if you)|sit (with|in) (that|the quiet)|be gentle with yourself|give yourself permission/i;
const HUMAN_MARKERS =
  /\b(i mean|honestly|kinda|sort of|kind of|you know|wait|actually|oh man|man,|haha|ha,|like,|anyway|i dunno|i guess|pretty much)\b|\[laughter\]/i;
const HUMAN_MARKERS_G = new RegExp(HUMAN_MARKERS.source, 'gi');
let greeting = null;
const delays = [];
const perceived = [];
let openingSounds = 0;
const replies = [];
let backchannels = 0;
let interruptions = 0;
let userSpeechMs = 0;
const overlaps = []; // caller talking over the agent (converse.mjs @backchannel / @interrupt)

for (const file of process.argv.slice(2)) {
  const run = JSON.parse(readFileSync(file, 'utf8'));
  for (const r of run.results) if (typeof r.replyDelayMs === 'number') delays.push(r.replyDelayMs);
  for (const r of run.results) if (r.mode) overlaps.push(r);

  // Side-track clips (backchannels, opening sounds) come from a track whose
  // name mentions "background"; the reply voice is the other agent track.
  const side = run.tracks.filter((t) => /background/i.test(t.name));
  for (const r of run.results) {
    if (typeof r.replyDelayMs !== 'number') continue;
    const replyAt = r.userEndedAt + r.replyDelayMs;
    const clipStarts = side.flatMap((t) => t.voice.map(([vs]) => vs)).filter((vs) => vs >= r.userEndedAt && vs < replyAt);
    if (clipStarts.length) openingSounds++;
    perceived.push(Math.min(r.replyDelayMs, ...clipStarts.map((vs) => vs - r.userEndedAt)));
  }

  // Agent replies to the scripted turns (skip the greeting, before the first turn).
  const firstTurnAt = run.userSpeech[0]?.[0] ?? 0;
  for (const e of run.events) if (e.who === 'agent' && e.t > firstTurnAt) replies.push(e.text);
  greeting ??= run.events.filter((e) => e.who === 'agent' && e.t <= firstTurnAt).map((e) => e.text).join(' ') || null;

  for (const [start, end] of run.userSpeech) {
    userSpeechMs += end - start;
    for (const track of run.tracks) {
      for (const [vs, ve] of track.voice) {
        if (vs < start + 300 || vs > end) continue; // starts while the user is talking
        if (ve - vs <= BACKCHANNEL_MAX_MS) backchannels++;
        else interruptions++;
      }
    }
  }
}

const words = replies.map((t) => t.split(/\s+/).filter(Boolean).length);
const m = mean(words);
const sd = m === null ? null : Math.sqrt(mean(words.map((w) => (w - m) ** 2)));
const score = {
  replies: replies.length,
  replyDelayMs: { p50: pct(delays, 50), p90: pct(delays, 90), n: delays.length },
  // First agent sound of any kind (an opening "mm" counts): the gap people hear.
  perceivedDelayMs: { p50: pct(perceived, 50), p90: pct(perceived, 90) },
  openingSounds,
  wordsPerReply: { mean: round(m, 1), min: words.length ? Math.min(...words) : null, max: words.length ? Math.max(...words) : null, cv: m ? round(sd / m) : null },
  questionEndRate: round(replies.filter((t) => /\?\s*$/.test(t)).length / (replies.length || 1)),
  stockOpenerRate: round(replies.filter((t) => STOCK_OPENER.test(t.trim())).length / (replies.length || 1)),
  markupInCaptions: replies.filter((t) => /<[^>]+>|\[[a-z_ ]+\]/i.test(t)).length,
  backchannelsPerMinuteOfUserSpeech: round(backchannels / Math.max(userSpeechMs / 60000, 1e-9), 1),
  backchannels,
  interruptions,
  // A caller's "mm-hmm" while the agent talks should not stop it (a human
  // keeps going); a real interruption should stop it fast (people yield
  // within a few hundred ms).
  talkOver: (() => {
    const bc = overlaps.filter((o) => o.mode === 'backchannel' && o.agentTalking);
    const it = overlaps.filter((o) => o.mode === 'interrupt' && o.agentTalking);
    return {
      backchannels: bc.length,
      backchannelStoppedAgent: bc.filter((o) => o.stopped && o.stopLatencyMs < 1500).length,
      interruptYieldedFast: it.filter((o) => o.stopped && o.stopLatencyMs < 1500).length,
      interrupts: it.length,
      interruptYielded: it.filter((o) => o.stopped).length,
      interruptStopMs: { p50: pct(it.filter((o) => o.stopped).map((o) => o.stopLatencyMs), 50) },
      notTalkingWhenOverlapped: overlaps.filter((o) => !o.agentTalking).length,
    };
  })(),
  // Therapist / host register a friend wouldn't use (feelings probes, stock
  // validation, performative gratitude), and hype.
  therapistRate: round(replies.filter((t) => THERAPIST.test(t)).length / (replies.length || 1)),
  // Spoken-language markers people use and written text doesn't.
  humanMarkerRate: round(replies.filter((t) => HUMAN_MARKERS.test(t)).length / (replies.length || 1)),
  // A marker in too many replies is a tic, not a person ("honestly" in 10 of 26).
  topMarkerRate: (() => {
    const counts = new Map();
    for (const t of replies) {
      for (const m of new Set((t.toLowerCase().match(HUMAN_MARKERS_G) ?? []).map((x) => x.trim()))) {
        counts.set(m, (counts.get(m) ?? 0) + 1);
      }
    }
    const [word, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    return { word, rate: round(n / (replies.length || 1)) };
  })(),
  exclamationRate: round(replies.filter((t) => /!/.test(t)).length / (replies.length || 1)),
  greeting,
  replyTexts: replies,
};
console.log(JSON.stringify(score, null, 2));
