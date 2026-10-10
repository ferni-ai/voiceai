// Record a live LiveKit call (e.g. a real phone call) as a hidden listener, so it
// can be listened to and scored like a scripted eval call.
//
// usage: node record-room.mjs <wss-url> <token> <out.json>
//
// The token should be a hidden, subscribe-only grant (record.sh makes one), so
// nobody on the call sees or hears the recorder. Saves every audio track as its own
// 24 kHz WAV plus a mix of all of them, and the transcribed words of everyone in the
// room (lk.transcription), as events in the same shape converse.mjs writes. Stops
// when every other participant has left, or on Ctrl-C.
import { writeFileSync } from 'node:fs';
import { AudioStream, Room, RoomEvent, TrackKind } from '@livekit/rtc-node';

const [url, token, outJson] = process.argv.slice(2);
if (!url || !token || !outJson) {
  console.error('usage: node record-room.mjs <wss-url> <token> <out.json>');
  process.exit(2);
}

const RATE = 24000;
const t0 = Date.now();
const now = () => Date.now() - t0;
const room = new Room();
const events = []; // { t, who, from, text }
const tracks = new Map(); // sid -> { name, kind, bufs, startT }
const pumps = [];

room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
  if (track.kind !== TrackKind.KIND_AUDIO) return;
  const rec = { name: `${participant.identity}:${pub.name || track.sid}`, bufs: [], startT: null };
  tracks.set(track.sid, rec);
  pumps.push(
    (async () => {
      for await (const frame of new AudioStream(track, { sampleRate: RATE, numChannels: 1 })) {
        if (rec.startT === null) rec.startT = now();
        rec.bufs.push(Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength));
      }
    })()
  );
});

room.registerTextStreamHandler('lk.transcription', async (reader, info) => {
  const startT = now(); // when the words began; readAll resolves when they end
  const text = await reader.readAll();
  if (!text.trim()) return;
  // Each stream is sent as the speaker's identity, and a caption is re-sent as it
  // grows ("Okay", "Okay, so", ...): a line that extends that speaker's last line
  // replaces it, so each utterance is kept once with its first timestamp.
  const who = /agent/.test(info.identity) ? 'agent' : 'user';
  const line = text.trim();
  const prev = events.findLast((e) => e.who === who);
  if (prev && (line.startsWith(prev.text) || prev.text.startsWith(line))) {
    if (line.length > prev.text.length) prev.text = line;
  } else {
    events.push({ t: startT, who, from: info.identity, text: line });
  }
});

await room.connect(url, token, { autoSubscribe: true });
console.error(`recording ${room.name}; Ctrl-C to stop early`);

let stopped = false;
const stop = () => (stopped = true);
process.on('SIGINT', stop);
room.on(RoomEvent.Disconnected, stop);
// Wait for someone to show up, then until everyone else has gone.
let seenOthers = false;
while (!stopped) {
  const others = room.remoteParticipants.size;
  if (others > 0) seenOthers = true;
  if (seenOthers && others === 0) break;
  await new Promise((r) => setTimeout(r, 500));
}
await room.disconnect();
await Promise.race([Promise.allSettled(pumps), new Promise((r) => setTimeout(r, 2000))]);

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Each track starts when it was first heard; the mix lines them up on the call's clock.
const trackSummaries = [];
let mixLen = 0;
for (const [sid, rec] of tracks) {
  const pcm = Buffer.concat(rec.bufs);
  const file = outJson.replace(/\.json$/, `.${rec.name.replace(/[^A-Za-z0-9_-]/g, '_')}.${sid.slice(-6)}.wav`);
  writeFileSync(file, wav(pcm));
  trackSummaries.push({ name: rec.name, file, startT: rec.startT });
  mixLen = Math.max(mixLen, Math.round(((rec.startT ?? 0) * RATE) / 1000) + pcm.length / 2);
}
const mix = new Int32Array(mixLen);
for (const rec of tracks.values()) {
  const pcm = Buffer.concat(rec.bufs);
  const off = Math.round(((rec.startT ?? 0) * RATE) / 1000);
  for (let i = 0; i < pcm.length / 2; i++) mix[off + i] += pcm.readInt16LE(i * 2);
}
const mixPcm = Buffer.alloc(mixLen * 2);
for (let i = 0; i < mixLen; i++) mixPcm.writeInt16LE(Math.max(-32768, Math.min(32767, mix[i])), i * 2);
const mixFile = outJson.replace(/\.json$/, '.mix.wav');
writeFileSync(mixFile, wav(mixPcm));

writeFileSync(
  outJson,
  JSON.stringify({ room: room.name, wallT0: t0, events, tracks: trackSummaries, mix: mixFile }, null, 2)
);
console.error(`saved ${outJson} (${(mixLen / RATE).toFixed(1)} s, ${tracks.size} tracks, ${events.length} lines)`);
process.exit(0);
