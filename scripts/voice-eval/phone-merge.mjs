// Merge the agent side of a phone eval call into the caller side, so judge.mjs and
// score.mjs read it like any other run.
//
// usage: node phone-merge.mjs <run.json> <agent-room.json>
//
// run.sh phone records a call twice: converse.mjs in the caller room (the agent's
// voice as it came back over the phone network, but no captions: the agent isn't
// in that room) and record-room.mjs in the agent's dev-call-* room (captions and
// the agent's own tracks, before the phone network). Both stamp times from their
// own start, so the agent room's are shifted onto the caller's clock.
//
// Also reports whether the agent's background clips (backchannels, presence
// sounds) reached the phone: a clip played while the reply voice was quiet,
// heard on the caller's side within PHONE_PATH_MS of when it was played.
import { readFileSync, writeFileSync } from 'node:fs';

const PHONE_PATH_MS = 1500; // phone-network delay allowed between the two rooms

/** Loud stretches of 16-bit mono PCM as [startMs, endMs], like converse.mjs counts voice. */
export function voiceSegments(pcm, rate, { peak = 500, gapMs = 400 } = {}) {
  const frame = Math.round(rate / 100); // 10 ms
  const segs = [];
  let open = null;
  let lastLoud = -Infinity;
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    const t = (i / rate) * 1000;
    let max = 0;
    for (let j = i; j < i + frame; j++) max = Math.max(max, Math.abs(pcm[j]));
    if (max > peak) {
      if (open === null) open = t;
      else if (t - lastLoud > gapMs) {
        segs.push([open, lastLoud]);
        open = t;
      }
      lastLoud = t;
    }
  }
  if (open !== null) segs.push([open, lastLoud]);
  return segs;
}

const overlaps = (segs, s, e) => segs.some(([a, b]) => a <= e && b >= s);

/**
 * Background clips that played while the reply voice was quiet, and how many of
 * them the caller heard. All times on one clock.
 */
export function backgroundReach(background, replyVoice, heard) {
  const alone = background.filter(([s, e]) => !overlaps(replyVoice, s - 300, e + 300));
  const reached = alone.filter(([s, e]) => overlaps(heard, s, e + PHONE_PATH_MS));
  return { clips: alone.length, reached: reached.length };
}

/**
 * Each turn's heard gap split into legs, all on the caller's clock:
 *   uplinkMs   caller stopped (converse) -> caller audio ended at the agent (its SIP track)
 *   agentMs    -> the agent's first sound of any kind, as published (agentVoiceMs: reply voice)
 *   downlinkMs -> first agent sound heard back over the phone
 * so heardGapMs = uplinkMs + agentMs + downlinkMs. agentMs lines up with the
 * agent's REPLY_GAP log (stopToCommitMs + commitToAudioMs) for the same call.
 */
export function turnLegs(results, { caller, reply, background }) {
  const firstFrom = (segs, t) => Math.min(...segs.filter(([s]) => s >= t).map(([s]) => s));
  return results
    .filter((r) => typeof r.replyDelayMs === 'number' && !r.mode)
    .map((r) => {
      const ends = caller
        .map(([, e]) => e)
        .filter((e) => e >= r.userEndedAt - 500 && e <= r.userEndedAt + 2000);
      if (!ends.length) return { turn: r.turn, heardGapMs: r.replyDelayMs };
      const atAgent = Math.max(...ends);
      const sound = firstFrom([...reply, ...background], atAgent);
      const voice = firstFrom(reply, atAgent);
      const heard = r.userEndedAt + r.replyDelayMs;
      return {
        turn: r.turn,
        heardGapMs: r.replyDelayMs,
        uplinkMs: atAgent - r.userEndedAt,
        agentMs: Number.isFinite(sound) ? sound - atAgent : null,
        agentVoiceMs: Number.isFinite(voice) ? voice - atAgent : null,
        downlinkMs: Number.isFinite(sound) ? heard - sound : null,
      };
    });
}

/** The caller-side run with the agent room's captions and tracks on its clock. */
export function mergeAgentRoom(run, agentRoom, { readPcm } = {}) {
  const shift = agentRoom.wallT0 - run.wallT0;
  const at = (t) => (t === null || t === undefined ? t : t + shift);
  const events = [
    ...(run.events ?? []),
    ...agentRoom.events.map((e) => ({ ...e, t: at(e.t) })),
  ].sort((a, b) => a.t - b.t);
  const merged = {
    ...run,
    events,
    agentRoom: {
      room: agentRoom.room,
      shiftMs: shift,
      tracks: agentRoom.tracks.map((t) => ({ ...t, startT: at(t.startT) })),
    },
  };
  if (readPcm) {
    const segsOf = (t) =>
      voiceSegments(readPcm(t.file), 24000).map(([s, e]) => [s + at(t.startT), e + at(t.startT)]);
    const agentTracks = agentRoom.tracks.filter((t) => /agent/.test(t.name) && t.startT !== null);
    const background = agentTracks.filter((t) => /background/.test(t.name)).flatMap(segsOf);
    const reply = agentTracks.filter((t) => !/background/.test(t.name)).flatMap(segsOf);
    const heard = run.tracks.flatMap((t) => t.voice);
    merged.agentRoom.backgroundReach = backgroundReach(background, reply, heard);
    const caller = agentRoom.tracks
      .filter((t) => /^sip_/.test(t.name) && t.startT !== null)
      .flatMap(segsOf);
    merged.agentRoom.turns = turnLegs(run.results, { caller, reply, background });
  }
  return merged;
}

function readWavPcm(file) {
  const buf = readFileSync(file);
  return new Int16Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) >> 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [runFile, agentFile] = process.argv.slice(2);
  if (!runFile || !agentFile) {
    console.error('usage: node phone-merge.mjs <run.json> <agent-room.json>');
    process.exit(2);
  }
  const run = JSON.parse(readFileSync(runFile, 'utf8'));
  const merged = mergeAgentRoom(run, JSON.parse(readFileSync(agentFile, 'utf8')), {
    readPcm: readWavPcm,
  });
  writeFileSync(runFile, JSON.stringify(merged, null, 2));
  console.error(
    `phone-merge: ${merged.events.length} captions, background ${JSON.stringify(merged.agentRoom.backgroundReach)}`
  );
}
