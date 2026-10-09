// Count audio tags in what the agent actually sent to TTS.
//
// usage: node tts-tags.mjs <agent.log> [more.log ...]
//
// Captions strip tags like [laughter], so score.mjs, which reads captions,
// can never see Ferni laugh. The agent logs every reply's TTS text
// (trace E2E_TTS_OUTPUT); capture it while the eval runs, e.g.
//   lk agent logs --project ferni-dev --config <abs>/livekit.toml > agent.log &
// The lines carry no session id, so one log should cover one batch of runs.
import { readFileSync } from 'node:fs';

const TAG = /\[([a-z ]+)\]/gi;
let replies = 0;
const counts = new Map();
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const i = line.indexOf('{');
    if (i < 0 || !line.includes('E2E_TTS_OUTPUT')) continue;
    let entry;
    try {
      entry = JSON.parse(line.slice(i));
    } catch {
      continue;
    }
    if (entry.trace !== 'E2E_TTS_OUTPUT' || entry.isEmpty || !entry.ttsText) continue;
    replies += 1;
    // Count a tag once per reply: "how often he laughs", not how many times.
    const tags = new Set([...entry.ttsText.matchAll(TAG)].map((m) => m[1].toLowerCase()));
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
}
const tags = Object.fromEntries(
  [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => [tag, { replies: n, rate: Math.round((n / replies) * 100) / 100 }])
);
console.log(JSON.stringify({ replies, tags }, null, 2));
