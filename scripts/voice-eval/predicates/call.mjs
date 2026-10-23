// A run file (out/<scenario>-<label>.json from run.sh) as the predicates read it: captions (events),
// the scripted caller's audio (userSpeech: [[start, end]]), each agent track's voiced stretches
// (tracks[].voice) and per-turn REPLY_GAP (results[].replyDelayMs). Times are ms on the run clock.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { turnsOf } from '../humanness.mjs';

export function callOf(run, file = '') {
  const meta = run.meta ?? {};
  // Background tracks carry backchannels and earcons: a 0.4 s "mm" doesn't fill 16 s.
  const voiced = (run.tracks ?? []).filter(
    (t) => Array.isArray(t?.voice) && !/background/.test(t.name)
  );
  return {
    file,
    scenario: meta.scenario ?? '',
    label: meta.label ?? '',
    uid: meta.uid ?? '',
    room: meta.room ?? file,
    wallT0: run.wallT0 ?? 0,
    priorCalls: 0,
    turns: turnsOf(run, { greeting: true }),
    events: (run.events ?? []).filter((e) => typeof e.text === 'string'),
    agentVoice: voiced.flatMap((t) => t.voice).sort((a, b) => a[0] - b[0]),
    callerSpeech: run.userSpeech ?? [],
    replyGaps: (run.results ?? []).map((r) => r.replyDelayMs ?? null),
    ...timeline(run, meta),
  };
}

/** The audio timeline the dead-air predicates read: every agent sound (voice, opening clips,
 *  presence and backchannels), the call's end, each caller turn's reply gap with the persona
 *  that was on, and the handoffs (data messages state_reset / handoff_complete). */
function timeline(run, meta) {
  const tracks = (run.tracks ?? []).filter((t) => Array.isArray(t?.voice));
  const agentSound = tracks.flatMap((t) => t.voice).sort((a, b) => a[0] - b[0]);
  const ends = [...agentSound, ...(run.userSpeech ?? [])].map(([, e]) => e);
  const callEnd = Math.max(0, ...ends, ...(run.events ?? []).map((e) => e.t ?? 0));
  const marks = []; // [t, persona]
  const handoffs = [];
  for (const { t, payload: p } of run.data ?? []) {
    if (p?.type === 'state_reset' && p.activePersona) marks.push([t, p.activePersona]);
    if (p?.type === 'handoff_complete' && p.target) {
      marks.push([t, p.target]);
      handoffs.push({ t, from: p.from ?? '?', to: p.target });
    }
  }
  const personaAt = (t) => marks.filter(([m]) => m <= t).at(-1)?.[1] ?? (meta.persona || 'ferni');
  const turnGaps = (run.results ?? []).map((r) => ({
    persona: personaAt(r.userEndedAt ?? 0),
    gapMs: Number.isFinite(r.replyDelayMs) ? r.replyDelayMs : null,
    end: r.userEndedAt ?? null,
  }));
  return { agentSound, callEnd, turnGaps, handoffs };
}

const readRun = (f) => {
  try {
    const run = JSON.parse(readFileSync(f, 'utf8'));
    return run?.meta && Array.isArray(run.events) ? run : null;
  } catch {
    return null;
  }
};

/** Every call under dir, one per room (a seed copied under two names is one call). priorCalls
 *  counts the same caller's earlier calls, so a return call after its seed has 1. The array's
 *  `skipped` lists the .json files that aren't run files (unparseable, or no meta/events). */
export function loadSweep(dir) {
  const files = readdirSync(dir, { recursive: true })
    .map((p) => join(dir, p))
    .filter((p) => /(?<!\.judge|\.score)\.json$/.test(p) && statSync(p).isFile())
    .sort();
  const byRoom = new Map();
  const skipped = [];
  for (const f of files) {
    const run = readRun(f);
    const call = run && callOf(run, f);
    if (!call) skipped.push(f);
    else if (!byRoom.has(call.room)) byRoom.set(call.room, call);
  }
  const calls = [...byRoom.values()].sort((a, b) => a.wallT0 - b.wallT0);
  for (const c of calls)
    c.priorCalls = calls.filter((o) => o.uid && o.uid === c.uid && o.wallT0 < c.wallT0).length;
  return Object.assign(calls, { skipped });
}
