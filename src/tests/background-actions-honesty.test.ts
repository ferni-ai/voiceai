/**
 * Background follow-ups and calls must not say "scheduled" when they can't go
 * out, and must not record "queued"/"completed" for something never sent.
 *
 * Runs the real tools and executors with only the email provider and the
 * background-result store stubbed.
 */

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
  email.available = false;
  email.sendEmail.mockReset();
  captured.results = [];
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
    expect(await followupBlocker({ ...base, channel: 'sms' })).toMatch(
      /only send follow-ups by email/
    );
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
