// Run by livekit-read-stream-retention.test.ts in a plain `node --expose-gc` process (the test
// runner's own process hides this growth): reads `frames` 16 kHz 10 ms frames through
// @livekit/agents readStream with a live abort signal, and prints how much the heap grew, in MB.
import { readStream } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

const count = Number(process.argv[2] ?? 180_000);
const live = new AbortController(); // the call goes on: never aborted while reading
let i = 0;
const source = new ReadableStream(
  {
    pull(c) {
      if (i++ >= count) c.close();
      else c.enqueue({ data: new Int16Array(160) });
    },
  },
  { highWaterMark: 1 }
);
const settle = async () => {
  for (let k = 0; k < 3; k++) {
    await new Promise((r) => setTimeout(r, 0));
    global.gc();
  }
};
await settle();
const before = process.memoryUsage().heapUsed;
for await (const _frame of readStream(source, live.signal)) {
  // read and dropped, as the STT does with each frame once sent
}
await settle();
console.log(JSON.stringify({ grewMb: (process.memoryUsage().heapUsed - before) / 1048576 }));
live.abort();
