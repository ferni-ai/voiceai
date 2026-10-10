/**
 * Action tools must not tell the user something happened when it didn't.
 *
 * Each case runs the real tool code with only the outside world stubbed
 * (Firestore, the email provider, the background-result store) and checks the
 * reply in the situation where the action can't actually happen.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const email = vi.hoisted(() => ({ available: false, sendEmail: vi.fn() }));
vi.mock('../services/outreach/delivery/email-delivery.js', () => ({
  isEmailDeliveryAvailable: () => email.available,
  sendEmail: email.sendEmail,
}));

const captured = vi.hoisted(() => ({ results: [] as Array<Record<string, unknown>> }));
vi.mock('../services/background-agents/unified-result-capture.js', () => ({
  captureBackgroundResult: async (r: Record<string, unknown>) => {
    captured.results.push(r);
  },
}));

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

import { alarmToolDefinitions, ALARM_CANT_RING } from '../tools/domains/simple-utilities/alarm-tools.js';
import { productivityExecutor } from '../agents/shared/tool-executors/productivity-executor.js';
import {
  executeFollowup,
  followupBlocker,
  type FollowupRequest,
} from '../services/background-agents/executors/followup-executor.js';
import { getToolDefinitions as getCommunicationTools } from '../tools/domains/communication/index.js';
import { getToolDefinitions as getProactiveTools } from '../tools/domains/proactive/index.js';
import { callBlocker, executeCall } from '../services/background-agents/executors/call-executor.js';
import type { ToolContext } from '../tools/registry/types.js';

const ctx = { userId: 'user-honesty', agentId: 'ferni', sessionId: 's1' } as ToolContext;
const opts = { toolCallId: 't', ctx: {} as never };

async function runTool(defs: Array<{ id: string; create: (c: ToolContext) => unknown }>, id: string, args: object) {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`${id} not registered`);
  const tool = def.create(ctx) as { execute: (a: object, o: unknown) => Promise<unknown> };
  return String(await tool.execute(args, opts));
}

beforeEach(() => {
  email.available = false;
  email.sendEmail.mockReset();
  captured.results = [];
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
    const saved = await productivityExecutor.execute('setAlarm', { time: '7:00' }, { userId: 'u1' });
    expect(alarmWrite.writes).toBe(1);
    expect(String(saved)).toContain(ALARM_CANT_RING);

    alarmWrite.fail = true;
    const failed = await productivityExecutor.execute('setAlarm', { time: '7:00' }, { userId: 'u1' });
    expect(String(failed)).toMatch(/couldn't save/);
    expect(String(failed)).not.toMatch(/Saved an alarm|Alarm set/);
  });
});

describe('follow-ups: only email can go out', () => {
  const base: FollowupRequest = {
    userId: 'u1',
    recipientName: 'Sarah',
    subject: 'Thanks',
    message: 'Thank you!',
    channel: 'email',
  };

  it('names what is missing before anything is queued', async () => {
    expect(await followupBlocker({ ...base, channel: 'sms' })).toMatch(/only send follow-ups by email/);
    expect(await followupBlocker(base)).toMatch(/Sarah's email address/);
    expect(await followupBlocker({ ...base, recipientEmail: 's@x.com' })).toMatch(/isn't set up/);
    email.available = true;
    expect(await followupBlocker({ ...base, recipientEmail: 's@x.com' })).toBeNull();
  });

  it('a text follow-up is recorded as failed, not "queued" and sent', async () => {
    const result = await executeFollowup({ ...base, channel: 'sms' });
    expect(result.sent).toBe(false);
    expect(result.deliveryStatus).toBe('failed');
    expect(captured.results[0]).toMatchObject({ status: 'failed' });
  });

  it('an email that goes out is recorded as sent', async () => {
    email.available = true;
    email.sendEmail.mockResolvedValue({ success: true, messageId: 'm1' });
    const result = await executeFollowup({ ...base, recipientEmail: 's@x.com' });
    expect(email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 's@x.com' }));
    expect(result).toMatchObject({ sent: true, deliveryStatus: 'sent' });
  });

  it('the backgroundFollowUp tool says nothing was sent instead of "scheduled"', async () => {
    const tools = await getCommunicationTools();
    const reply = await runTool(tools, 'backgroundFollowUp', {
      recipientName: 'Sarah',
      subject: 'Thanks',
      message: 'Thank you!',
      channel: 'sms',
    });
    expect(reply).toMatch(/Nothing was sent/);
    expect(reply).not.toMatch(/Scheduled|I'll send/);
    expect(captured.results).toHaveLength(0);
  });
});

describe('background calls: none without a number and a calling service', () => {
  const call = { userId: 'u1', contactName: 'Mom', objective: 'say happy birthday' };

  it('names what is missing', async () => {
    expect(await callBlocker(call)).toMatch(/Mom's phone number/);
    expect(await callBlocker({ ...call, contactPhone: '+15551234567' })).toMatch(/can't be placed/);
  });

  it('the backgroundCall tool says no call was made instead of "Call Scheduled"', async () => {
    const tools = await getProactiveTools();
    const reply = await runTool(tools, 'backgroundCall', {
      contactName: 'Mom',
      contactPhone: '+15551234567',
      objective: 'say happy birthday',
    });
    expect(reply).toMatch(/No call was made/);
    expect(reply).not.toMatch(/Call Scheduled|I'll call/);
  });

  it('an unplaced call is recorded as failed, not completed', async () => {
    const result = await executeCall({ ...call, contactPhone: '+15551234567' });
    expect(result.success).toBe(false);
    expect(captured.results[0]).toMatchObject({ status: 'failed' });
  });
});

/**
 * Stub markers left in action code ("simulate the call", "simulated
 * response") are where fake successes hide. These files still have one and
 * still claim the action happened; the list may only shrink.
 */
const KNOWN_STUBS: Record<string, number> = {
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
    const roots = ['src/tools', 'src/agents/shared/tool-executors', 'src/services/background-agents'];
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
