/**
 * Action tools must not tell the user something happened when it didn't.
 *
 * Each case runs the real tool code with only Firestore stubbed and checks
 * the reply in the situation where the action can't actually happen.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Alarm tools fall back to their in-memory store when there's no Firestore.
vi.mock('../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const alarmWrite = vi.hoisted(() => ({ fail: false, writes: 0 }));
vi.mock('firebase-admin/firestore', () => {
  const chain: Record<string, unknown> = {};
  chain.collection = () => chain;
  chain.doc = () => chain;
  chain.set = async () => {
    if (alarmWrite.fail) throw new Error('firestore down');
    alarmWrite.writes++;
  };
  return { getFirestore: () => chain };
});

import { alarmToolDefinitions } from '../tools/domains/simple-utilities/alarm-tools.js';
import { ALARM_CANT_RING } from '../tools/domains/simple-utilities/alarm-ring.js';
import { productivityExecutor } from '../agents/shared/tool-executors/productivity-executor.js';
import type { ToolContext } from '../tools/registry/types.js';

const ctx = { userId: 'user-honesty', agentId: 'ferni', sessionId: 's1' } as ToolContext;
const opts = { toolCallId: 't', ctx: {} as never };

async function runTool(
  defs: Array<{ id: string; create: (c: ToolContext) => unknown }>,
  id: string,
  args: object
) {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`${id} not registered`);
  const tool = def.create(ctx) as { execute: (a: object, o: unknown) => Promise<unknown> };
  return String(await tool.execute(args, opts));
}

beforeEach(() => {
  alarmWrite.fail = false;
  alarmWrite.writes = 0;
});

describe('alarms: saved, but nothing rings them', () => {
  it('setAlarm says it saved the alarm and that it cannot ring', async () => {
    const result = await runTool(alarmToolDefinitions, 'setAlarm', { time: '7am', label: 'gym' });
    expect(result).toContain('Saved an alarm for 7 AM');
    expect(result).toContain(ALARM_CANT_RING);
    expect(result).not.toMatch(/Alarm set/);
  });

  it('the chat path says so too, and admits a failed save', async () => {
    const saved = await productivityExecutor.execute(
      'setAlarm',
      { time: '7:00' },
      { userId: 'u1' }
    );
    expect(alarmWrite.writes).toBe(1);
    expect(String(saved)).toContain(ALARM_CANT_RING);

    alarmWrite.fail = true;
    const failed = await productivityExecutor.execute(
      'setAlarm',
      { time: '7:00' },
      { userId: 'u1' }
    );
    expect(String(failed)).toMatch(/couldn't save/);
    expect(String(failed)).not.toMatch(/Saved an alarm|Alarm set/);
  });
});

/**
 * Stub markers left in action code ("simulate the call", "simulated
 * response") are where fake successes hide. These files still have one and
 * still claim the action happened; the list may only shrink.
 */
const KNOWN_STUBS: Record<string, number> = {
  'src/services/background-agents/executors/call-executor.ts': 1, // "queued" with no call
  'src/services/background-agents/executors/followup-executor.ts': 1, // "queued" with no send
  'src/tools/domains/home/packages.ts': 1, // made-up tracking events
  'src/tools/domains/smart-home/index.ts': 1, // "Message sent!" to speakers
  'src/tools/domains/travel/travel.ts': 2, // made-up flights and hotels
  'src/tools/scheduling/appointment-core.ts': 3, // "I'm calling X now" without Twilio
  'src/tools/scheduling/appointments-tools.ts': 1, // checkAvailability "I'm calling X"
};
const STUB_MARKER =
  /simulat(e|ed|ing)\b[^\n]*\b(call|send|sms|text|email|broadcast)|simulated response|demo mode|imagine your phone|in a real implementation/gi;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

describe('no new simulated actions', () => {
  it('stub markers appear only in the known files, and no more often', () => {
    const root = join(__dirname, '..', '..');
    const roots = [
      'src/tools',
      'src/agents/shared/tool-executors',
      'src/services/background-agents',
    ];
    const found: Record<string, number> = {};
    for (const file of roots.flatMap((r) => sourceFiles(join(root, r)))) {
      const hits = readFileSync(file, 'utf8').match(STUB_MARKER)?.length ?? 0;
      if (hits > 0) found[relative(root, file)] = hits;
    }
    for (const [file, hits] of Object.entries(found)) {
      expect({ file, hits }).toEqual({ file, hits: Math.min(hits, KNOWN_STUBS[file] ?? 0) });
    }
    expect(found['src/tools/domains/telephony/telephony.ts']).toBeUndefined();
  });
});
