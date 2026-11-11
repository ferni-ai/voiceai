import { describe, expect, it } from 'vitest';

import { type HeapSampleNode, summarizeHeapSample } from '../heap-sample-summary.js';

const MB = 1048576;
const node = (
  functionName: string,
  url: string,
  selfSize: number,
  children: HeapSampleNode[] = [],
  lineNumber = 0
): HeapSampleNode => ({ callFrame: { functionName, url, lineNumber }, selfSize, children });

// (root) -> recordTurn (ours) -> push (pkg) holds 3 MB; recordTurn itself holds 1 MB;
// (root) -> (V8 API) holds 0.5 MB with no frame of ours or a package's above it.
const profile = {
  head: node('(root)', '', 0, [
    node(
      'recordTurn',
      'file:///app/dist/memory/stm-buffer.js',
      1 * MB,
      [node('push', 'file:///app/node_modules/denque/index.js', 3 * MB)],
      41
    ),
    node('(V8 API)', '', 0.5 * MB),
  ]),
};

describe('summarizeHeapSample', () => {
  it('charges live bytes to the nearest frame of our own code', () => {
    const s = summarizeHeapSample(profile);
    expect(s.liveMb).toBe(4.5);
    expect(s.ownerTop[0]).toEqual({ name: 'recordTurn memory/stm-buffer.js:42', mb: 4 });
  });

  it('ranks allocating functions by their own live bytes', () => {
    const s = summarizeHeapSample(profile);
    expect(s.selfTop.map((r) => r.name)).toEqual([
      'push denque/index.js:1',
      'recordTurn memory/stm-buffer.js:42',
      '(V8 API)',
    ]);
    expect(s.selfTop[0].mb).toBe(3);
  });

  it('falls back to the package, then the V8 name, when no frame is ours', () => {
    const s = summarizeHeapSample({
      head: node('(root)', '', 0, [
        node('emit', 'file:///app/node_modules/@livekit/rtc-node/dist/a.js', 0, [
          node('alloc', '', 2 * MB),
        ]),
        node('(V8 API)', '', 1 * MB),
      ]),
    });
    expect(s.ownerTop).toEqual([
      { name: '@livekit/rtc-node', mb: 2 },
      { name: '(V8 API)', mb: 1 },
    ]);
  });
});
