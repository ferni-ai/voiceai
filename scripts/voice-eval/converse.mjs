// Voice eval: play one scripted conversation into a live LiveKit room and record it.
//
// usage: node converse.mjs <wss-url> <token> <out.json> <turn1.pcm> [turn2.pcm ...]
//
// Each turn is 48 kHz mono s16le PCM, spoken after the agent finishes. A turn
// given as "<pcm>::backchannel::<ms>" or "<pcm>::interrupt::<ms>" is instead
// spoken <ms> after the agent started its current reply, over it: a caller's
// "mm-hmm" should not stop the agent; a real interruption should, quickly. The mic
// streams continuous silence between turns, like a real microphone (ink-2 turn
// detection needs continuous audio). Records the agent's transcribed words
// (lk.transcription text streams), per-turn reply delay, when the user was
// speaking, and each agent audio track separately (main voice vs. background,
// so backchannels on a side track can be counted).
import { writeFileSync, readFileSync } from 'node:fs';
import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node';

const [url, token, outJson, ...turns] = process.argv.slice(2);
if (!url || !token || !outJson || turns.length === 0) {
  console.error('usage: node converse.mjs <wss-url> <token> <out.json> <turn.pcm>...');
  process.exit(2);
}

const t0 = Date.now();
const now = () => Date.now() - t0;
const room = new Room();
const events = []; // { t, who, text }
const tracks = new Map(); // sid -> { name, bufs, voice: [[startT, endT], ...] }
const userSpeech = []; // [startT, endT] of each scripted utterance
let mainVoiceLastAt = 0;
let mainVoiceStartedAt = 0;

room.on(RoomEvent.TrackSubscribed, async (track, pub, participant) => {
  if (track.kind !== TrackKind.KIND_AUDIO) return;
  const name = `${participant.identity}:${pub.name || track.sid}`;
  const rec = { name, bufs: [], voice: [], startT: null };
  tracks.set(track.sid, rec);
  const isMain = /roomio_audio|agent_audio|^[^:]+:$/.test(name) || !/background/.test(name);
  let open = null;
  let lastLoud = 0;
  for await (const frame of new AudioStream(track, { sampleRate: 24000, numChannels: 1 })) {
    const pcm = new Int16Array(frame.data.buffer, frame.data.byteOffset, frame.data.length);
    if (rec.startT === null) rec.startT = now();
    rec.bufs.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    let peak = 0;
    for (const s of pcm) peak = Math.max(peak, Math.abs(s));
    const t = now();
    if (peak > 500) {
      if (open === null || t - lastLoud > 400) {
        if (open !== null) rec.voice.push([open, lastLoud]);
        open = t;
      }
      lastLoud = t;
      if (isMain) {
        if (t - mainVoiceLastAt > 700) mainVoiceStartedAt = t;
        mainVoiceLastAt = t;
      }
    } else if (open !== null && t - lastLoud > 400) {
      rec.voice.push([open, lastLoud]);
      open = null;
    }
  }
  if (open !== null) rec.voice.push([open, lastLoud]);
});

room.registerTextStreamHandler('lk.transcription', async (reader, info) => {
  const text = await reader.readAll();
  const who = info.identity === room.localParticipant?.identity ? 'user' : 'agent';
  if (text.trim()) events.push({ t: now(), who, text: text.trim() });
});

await room.connect(url, token, { autoSubscribe: true, dynacast: false });
// A 40 ms queue keeps captureFrame() in step with the wire. The default
// 1000 ms queue let the pump run up to a second ahead, so "caller finished"
// was stamped before the audio was sent and every reply delay (and barge-in
// timing) read up to a second long.
const source = new AudioSource(48000, 1, 40);
const mic = LocalAudioTrack.createAudioTrack('mic', source);
const opts = new TrackPublishOptions();
opts.source = TrackSource.SOURCE_MICROPHONE;
await room.localParticipant.publishTrack(mic, opts);

const CHUNK = 480; // 10 ms at 48 kHz
const silence = new Int16Array(CHUNK);
let speaking = null;
let pos = 0;
let stop = false;
const micBufs = [];
let micStartT = null;
const pump = (async () => {
  while (!stop) {
    let frame = silence;
    if (speaking) {
      frame = new Int16Array(CHUNK);
      frame.set(speaking.subarray(pos, pos + CHUNK));
      pos += CHUNK;
      if (pos >= speaking.length) speaking = null;
    }
    if (micStartT === null) micStartT = now();
    micBufs.push(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength));
    await source.captureFrame(new AudioFrame(frame, 48000, 1, CHUNK));
  }
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function say(path) {
  const buf = readFileSync(path);
  const start = now();
  speaking = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  pos = 0;
  while (speaking) await sleep(10);
  userSpeech.push([start, now()]);
  return now();
}

async function waitAgentDone(maxMs) {
  const start = now();
  while (now() - start < maxMs) {
    if (mainVoiceLastAt > start && now() - mainVoiceLastAt > 2000) return;
    await sleep(100);
  }
}

/** Until the agent has been quiet for 2 s (it may already be). */
async function waitQuiet(maxMs) {
  const start = now();
  while (now() - start < maxMs && now() - mainVoiceLastAt < 2000) await sleep(100);
}

/** Talk over the agent's current reply; report whether and how fast it stopped. */
async function overlap(path, mode, atMs, replyStartedAt) {
  while (now() < replyStartedAt + atMs) await sleep(10);
  const startedAt = now();
  const agentTalking = now() - mainVoiceLastAt < 300;
  const said = say(path);
  // The agent has stopped when its voice has been silent for 700 ms; natural
  // pauses between its sentences are shorter.
  let stoppedAt = null;
  while (now() - startedAt < 4000) {
    if (now() - mainVoiceLastAt > 700) {
      stoppedAt = mainVoiceLastAt;
      break;
    }
    await sleep(20);
  }
  const endedAt = await said;
  return {
    turn: path.split('/').pop(),
    mode,
    overlapAt: atMs,
    agentTalking,
    stopped: stoppedAt !== null,
    stopLatencyMs: stoppedAt !== null ? Math.max(0, stoppedAt - startedAt) : null,
    userEndedAt: endedAt,
  };
}

await waitAgentDone(20000); // greeting
const results = [];
let replyStartedAt = 0;
for (const arg of turns) {
  const [path, mode, at] = arg.split('::');
  if (mode) {
    results.push(await overlap(path, mode, Number(at), replyStartedAt));
    if (mode === 'interrupt') {
      // The agent should now answer the interruption.
      const before = mainVoiceLastAt;
      const waitStart = now();
      while (now() - waitStart < 15000 && mainVoiceLastAt <= before) await sleep(20);
      results[results.length - 1].replyDelayMs =
        mainVoiceLastAt > before ? mainVoiceStartedAt - results[results.length - 1].userEndedAt : null;
      replyStartedAt = mainVoiceStartedAt;
    }
    continue;
  }
  await waitQuiet(30000);
  const endedAt = await say(path);
  const before = mainVoiceLastAt;
  const waitStart = now();
  while (now() - waitStart < 15000 && mainVoiceLastAt <= before) await sleep(20);
  const first = mainVoiceLastAt > before ? mainVoiceStartedAt : null;
  if (first !== null) replyStartedAt = first;
  results.push({
    turn: path.split('/').pop(),
    userEndedAt: endedAt,
    replyDelayMs: first !== null ? first - endedAt : null,
  });
}
await waitAgentDone(30000);
await sleep(1500);
stop = true;
await pump;
await room.disconnect();

function wav(pcm, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const micFile = outJson.replace(/\.json$/, '.mic.wav');
writeFileSync(micFile, wav(Buffer.concat(micBufs), 48000));
const trackSummaries = [];
for (const [sid, rec] of tracks) {
  const pcm = Buffer.concat(rec.bufs);
  const file = outJson.replace(/\.json$/, `.${rec.name.replace(/[^A-Za-z0-9_-]/g, '_')}.${sid.slice(-6)}.wav`);
  writeFileSync(file, wav(pcm, 24000));
  trackSummaries.push({ name: rec.name, file, voice: rec.voice, startT: rec.startT });
}
writeFileSync(outJson, JSON.stringify({ results, events, userSpeech, tracks: trackSummaries, mic: { file: micFile, startT: micStartT } }, null, 2));
console.log(JSON.stringify(results));
process.exit(0);
