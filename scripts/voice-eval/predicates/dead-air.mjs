// Dead-air checks on the harness's audio timeline (call.mjs `timeline`), not caption timing:
// captions land at the end of an utterance, and a caption can arrive with no audio at all. That is
// how dev action-claim-b (8981d4f03, 2026-10-22) passed `dead-air` with 12 s of silence.
// Bounds from the dead-air audit 2026-10-22 ("Gate proposals"); human norms there.

export const SOUND_MS = 2500; // longest a caller waits with no agent sound at all
export const VOICE_MS = 5000; // longest to a voiced reply, even with a clip in between
// A caption's audio is voiced within this of the caption. The audit proposed 1.5 s, but over 427
// agent captions (10-21 dev sweep + 10-22 release eval) three heard replies captioned 2.05-2.11 s
// after their voice ended (p99 1.3 s); the one silent caption (action-claim-b) was 10 s from voice.
export const CAPTION_WINDOW_MS = 2500;
export const MIN_VOICED_MS = 300; // shorter than this is not a heard reply (NEVER_SILENT: 23 ms)
export const HANDOFF_MS = 2500; // longest unfilled silence between the old and the new persona
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const words = (s) => (s.match(/[\p{L}\p{N}']+/gu) ?? []).length;

/** When sound first plays at or after t (an interval already playing counts as t), or null. */
const firstFrom = (spans, t) => {
  const s = spans.filter(([, e]) => e > t).map(([b]) => Math.max(b, t));
  return s.length ? Math.min(...s) : null;
};
/** Where the caller's turn ending at `end` stops waiting: their next turn, or the call's end. */
const windowEnd = (call, end) =>
  call.callerSpeech.map(([b]) => b).find((b) => b > end) ?? call.callEnd;

// action-claim-b: goodbye at 98.2 s, presence whistle at 110.5 s, Ferni's voice at 119.9 s.
export function unfilledSilence(call) {
  return call.callerSpeech.flatMap(([, end]) => {
    const stop = windowEnd(call, end);
    const wait = (spans) => Math.min(firstFrom(spans, end) ?? stop, stop) - end;
    const [sound, voice] = [wait(call.agentSound), wait(call.agentVoice)];
    if (sound <= SOUND_MS && voice <= VOICE_MS) return [];
    const said = call.events.filter((e) => e.who === 'user' && e.t <= end + 1500).at(-1);
    const why = `${secs(sound)} with no agent sound, ${secs(voice)} to a voiced reply`;
    return [{ quote: said?.text ?? '', why }];
  });
}

/** A caller turn the harness saw no reply to (replyDelayMs null) and no agent voice after it. */
export function unansweredTurn(call) {
  return call.turnGaps
    .filter((g) => g.gapMs === null && g.end !== null)
    .filter((g) => !call.agentVoice.some(([b, e]) => e > g.end && b < windowEnd(call, g.end)))
    .map((g) => ({ quote: `turn ending ${secs(g.end)}`, why: 'caller turn with no reply' }));
}

// action-claim-b at 103.9 s: an 11-word caption, and the agent track silent from 93.9 to 119.9 s.
export function inaudibleReply(call) {
  return call.events
    .filter((e) => e.who === 'agent' && words(e.text) >= 5)
    .flatMap((e) => {
      const near = call.agentVoice.filter(
        ([b, end]) => b <= e.t + CAPTION_WINDOW_MS && end >= e.t - CAPTION_WINDOW_MS
      );
      const longest = Math.max(0, ...near.map(([b, end]) => end - b));
      if (!near.length) return [{ quote: e.text, why: 'caption with no voice' }];
      return longest < MIN_VOICED_MS ? [{ quote: e.text, why: `voiced ${longest} ms` }] : [];
    });
}

/** Longest stretch in [from, to] with no agent sound and no caller speech. */
function longestUnfilled(call, from, to) {
  const busy = [...call.agentSound, ...call.callerSpeech].sort((a, b) => a[0] - b[0]);
  let [at, worst] = [from, 0];
  for (const [b, e] of busy) {
    if (e <= at) continue;
    if (b >= to) break;
    worst = Math.max(worst, b - at);
    at = Math.max(at, e);
  }
  return Math.max(worst, to - at);
}

/** From the old persona's last voice before handoff_complete to the new persona's first voice. */
export function handoffGap(call) {
  return call.handoffs.flatMap((h) => {
    const before = call.agentVoice.filter(([b]) => b < h.t).at(-1);
    const after = call.agentVoice.find(([b]) => b >= h.t);
    if (!before) return [];
    const gap = longestUnfilled(call, before[1], after ? after[0] : call.callEnd);
    return gap > HANDOFF_MS
      ? [{ quote: `${h.from} -> ${h.to}`, why: `${h.from} -> ${h.to}: ${secs(gap)} unfilled` }]
      : [];
  });
}

export const DEAD_AIR_PREDICATES = [
  { id: 'unfilled-silence', gating: true, check: unfilledSilence },
  { id: 'unanswered-turn', gating: true, check: unansweredTurn },
  { id: 'inaudible-reply', gating: true, check: inaudibleReply },
  { id: 'handoff-gap', gating: true, check: handoffGap },
];
