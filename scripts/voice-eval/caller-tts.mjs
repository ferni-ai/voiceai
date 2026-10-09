// Render one caller line with a Cartesia voice, as 48 kHz mono s16le PCM.
//
// macOS `say` reads "Mm-hmm." as something Ink-2 transcribes "M M M." and that
// LiveKit's barge-in model scored as an interruption (0.70) while it scored
// "Wait, sorry, hold on" as not one (0.37) (dev, 2026-10-04). A natural voice
// makes the harness hear backchannels and interruptions the way a person says them.
//
// usage: node caller-tts.mjs <voiceId> <out.pcm> <text...>
//   CARTESIA_API_KEY must be set (run.sh fetches it; it is never printed).
import { writeFileSync } from 'node:fs';

const [voiceId, out, ...words] = process.argv.slice(2);
const text = words.join(' ');
const key = process.env.CARTESIA_API_KEY;
if (!voiceId || !out || !text || !key) {
  console.error('usage: CARTESIA_API_KEY=… node caller-tts.mjs <voiceId> <out.pcm> <text…>');
  process.exit(2);
}

// `say` reads [[slnc N]] as N ms of silence; Cartesia would read it as text.
// Render the words between markers and put real silence in between.
const RATE = 48000;
async function render(part) {
  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': key,
      'Cartesia-Version': '2024-06-10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-3.6-2026-08-27',
      transcript: part,
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: RATE },
      language: 'en',
    }),
  });
  if (!res.ok) {
    console.error(`caller-tts: Cartesia ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  return Buffer.from(await res.arrayBuffer());
}

const pieces = [];
for (const [i, part] of text.split(/\[\[slnc (\d+)\]\]/).entries()) {
  if (i % 2 === 1) pieces.push(Buffer.alloc(Math.round((Number(part) / 1000) * RATE) * 2));
  else if (part.trim()) pieces.push(await render(part.trim()));
}
writeFileSync(out, Buffer.concat(pieces));
