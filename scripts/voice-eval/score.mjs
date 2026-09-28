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

const delays = [];
const replies = [];
let backchannels = 0;
let interruptions = 0;
let userSpeechMs = 0;

for (const file of process.argv.slice(2)) {
  const run = JSON.parse(readFileSync(file, 'utf8'));
  for (const r of run.results) if (r.replyDelayMs !== null) delays.push(r.replyDelayMs);

  // Agent replies to the scripted turns (skip the greeting, before the first turn).
  const firstTurnAt = run.userSpeech[0]?.[0] ?? 0;
  for (const e of run.events) if (e.who === 'agent' && e.t > firstTurnAt) replies.push(e.text);

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
  wordsPerReply: { mean: round(m, 1), min: words.length ? Math.min(...words) : null, max: words.length ? Math.max(...words) : null, cv: m ? round(sd / m) : null },
  questionEndRate: round(replies.filter((t) => /\?\s*$/.test(t)).length / (replies.length || 1)),
  stockOpenerRate: round(replies.filter((t) => STOCK_OPENER.test(t.trim())).length / (replies.length || 1)),
  markupInCaptions: replies.filter((t) => /<[^>]+>|\[[a-z_ ]+\]/i.test(t)).length,
  backchannelsPerMinuteOfUserSpeech: round(backchannels / Math.max(userSpeechMs / 60000, 1e-9), 1),
  backchannels,
  interruptions,
  replyTexts: replies,
};
console.log(JSON.stringify(score, null, 2));
