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
  };
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
