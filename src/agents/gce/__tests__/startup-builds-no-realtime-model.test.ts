/**
 * #3886: every job child ran a fast-join warmup step that built a pool of Gemini realtime
 * models nothing ever took out (the default pipeline is the Cartesia cascade). A realtime
 * pipeline builds its own model per call (agents/model-provider/), so no startup file under
 * agents/gce/ may build one.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const GCE = fileURLToPath(new URL('..', import.meta.url));
const BUILDS_REALTIME_MODEL = /\bnew\s+[\w.]*\bRealtimeModel\s*\(/;

const startupFiles = (): string[] =>
  readdirSync(GCE).filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'));

describe('job child startup', () => {
  it('reads every startup file, warmup.ts and job-child.ts among them', () => {
    expect(startupFiles()).toEqual(expect.arrayContaining(['warmup.ts', 'job-child.ts']));
  });

  it('builds no realtime model in any startup file', () => {
    const building = startupFiles().filter((name) =>
      BUILDS_REALTIME_MODEL.test(readFileSync(join(GCE, name), 'utf8'))
    );
    expect(building).toEqual([]);
  });

  it('the pattern finds a realtime model built the way the old pool built it', () => {
    expect(BUILDS_REALTIME_MODEL.test('const m = new google.beta.realtime.RealtimeModel({')).toBe(
      true
    );
    expect(BUILDS_REALTIME_MODEL.test("await import('@livekit/agents-plugin-google')")).toBe(false);
  });
});
