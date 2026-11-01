/**
 * The outbound gate (outbound-gate.ts) holds on every path that can build an
 * outbound tool, not only ToolRegistry.register():
 * - code that builds tools straight from a domain's exported definitions
 *   (the persona agents' legacy "no options.tools" branch);
 * - the Alex persona's legacy communication tools, which have no definition;
 * - public posts (postToTwitter / postToLinkedIn with action 'post');
 * - the executor path, for every name an outbound executor handles.
 *
 * Mocked only at the edges that would reach a person: the background call
 * queue, the Twitter client and marketing storage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMemoryTexts } from '../../../services/outreach/__tests__/memory-text-store.js';

const edge = vi.hoisted(() => ({
  queueCall: vi.fn(async (..._a: unknown[]) => 'task-12345678'),
  postThread: vi.fn(async (..._a: unknown[]) => ({ success: true, ids: ['1'] })),
  saveDraft: vi.fn(async (..._a: unknown[]) => 'draft-1'),
  legacySend: vi.fn(async (..._a: unknown[]) => 'sent'),
  createReminder: vi.fn(async (..._a: unknown[]) => ({ id: 'reminder-123456' })),
}));
// The real text guards over an in-memory store (no Firestore).
vi.mock('../../../services/outreach/guarded-text.js', async (orig) =>
  (await import('../../../services/outreach/__tests__/memory-text-store.js')).withMemoryTextStore(
    await orig()
  )
);
vi.mock('../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: edge.createReminder,
}));

vi.mock('../../../services/background-agents/executors/call-executor.js', () => ({
  cantCallReply: async () => null,
  queueCall: edge.queueCall,
}));
vi.mock('../../../services/communication-service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/communication-service.js')>()),
  sendSMS: edge.legacySend,
  sendEmail: edge.legacySend,
}));
vi.mock('../../domains/marketing/twitter-client.js', () => ({
  TwitterClient: class {
    isConfigured = () => true;
    postThread = edge.postThread;
  },
}));
vi.mock('../../domains/marketing/storage.js', () => ({
  MarketingStorage: class {
    getDraft = async () => ({ content: { twitter: { thread: ['THE OLD DRAFT'] } } });
    saveDraft = edge.saveDraft;
    savePostedContent = async () => undefined;
  },
}));

import { communicationExecutor } from '../../../agents/shared/tool-executors/communication-executor.js';
import { conciergeExecutor } from '../../../agents/shared/tool-executors/concierge-executor.js';
import { openclawExecutor } from '../../../agents/shared/tool-executors/openclaw-executor.js';
import { schedulingExecutor } from '../../../agents/shared/tool-executors/scheduling-executor.js';
import { telephonyExecutor } from '../../../agents/shared/tool-executors/telephony-executor.js';
import { outreachConfirmListeners } from '../../domains/communication/outreach/outreach-confirm.js';
import { definitions as marketingDefs } from '../../domains/marketing/index.js';
import { definitions as proactiveDefs } from '../../domains/proactive/index.js';
import { gateLegacyTool, outboundDispatchRefusal } from '../outbound-gate.js';
import type { Tool, ToolContext } from '../types.js';

const ctx: ToolContext = { userId: 'user-1', agentId: 'ferni', agentDisplayName: 'Ferni' };

function liveCall(userId = 'user-1') {
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session);
  return {
    run: async (tool: Tool, args: Record<string, unknown>, callId: string) => {
      const runCtx = { session, userData: { userId } }; // LiveKit's RunContext
      const out = await tool.execute(args, { ctx: runCtx, toolCallId: callId });
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}

const fetchSpy = vi.fn(async () => new Response('{}'));
beforeEach(() => vi.stubGlobal('fetch', fetchSpy)); // Twilio REST calls, if anything got through
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => resetMemoryTexts());

describe('tools built straight from a domain export are gated', () => {
  it("backgroundCall from proactive's definitions (as ferni-agent builds it) queues nothing without a yes", async () => {
    const def = proactiveDefs.find((d) => d.id === 'backgroundCall')!;
    const args = { contactName: 'Dr. Lee', contactPhone: '8015550163', objective: 'reschedule' };
    const noSession = await def.create(ctx).execute(args, { toolCallId: 'x', ctx: {} });
    expect(String(noSession)).toMatch(/^Nothing was sent/);
    const call = liveCall();
    expect(await call.run(def.create(ctx), args, 'c1')).toContain('Dr. Lee at 8015550163');
    expect(edge.queueCall).not.toHaveBeenCalled();
    call.caller('yes go ahead');
    await call.run(def.create(ctx), args, 'c2');
    expect(edge.queueCall).toHaveBeenCalledTimes(1);
  });
});

describe('legacy persona tools without a definition are gated', () => {
  it("Alex's sendTextMessage sends nothing without a yes", async () => {
    const send = vi.fn(async () => 'sent');
    const tool = gateLegacyTool('sendTextMessage', { description: '', execute: send }, ctx) as Tool;
    const out = await tool.execute(
      { to: '2125550199', message: 'hi' },
      { toolCallId: 'x', ctx: {} }
    );
    expect(String(out)).toMatch(/^Nothing was sent/);
    const preview = await liveCall().run(tool, { to: '2125550199', message: 'hi' }, 'c1');
    expect(preview).toContain('a text to 2125550199');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the Alex persona agent (legacy tool set) gets the gated tools', () => {
  it('its sendTextMessage, makePhoneCall, sendVoiceMessage and sendApprovedEmail send nothing without a live yes', async () => {
    const { AlexAgent } = await import('../../../agents/personas/alex-agent.js');
    const tools = new AlexAgent('You are Alex.').toolCtx.functionTools as unknown as Record<
      string,
      Tool
    >;
    for (const id of [
      'sendTextMessage',
      'makePhoneCall',
      'sendVoiceMessage',
      'sendApprovedEmail',
    ]) {
      const args = {
        to: '2125550199',
        phoneNumber: '2125550199',
        message: 'hi',
        subject: 's',
        body: 'b',
      };
      const out = await tools[id].execute(args, { toolCallId: 'x', ctx: {} });
      expect(String(out), id).toMatch(/^Nothing was sent/);
    }
    expect(edge.legacySend).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("checks the session's own user, never a placeholder", async () => {
    const { AlexAgent } = await import('../../../agents/personas/alex-agent.js');
    const tools = new AlexAgent('You are Alex.').toolCtx.functionTools as unknown as Record<
      string,
      Tool
    >;
    const text = { to: '2125550199', message: 'hi' };
    expect(await liveCall('voice-eval-sam').run(tools.sendTextMessage, text, 'c1')).toContain(
      'test account'
    );
    expect(await liveCall('').run(tools.sendTextMessage, text, 'c1')).toMatch(/^Nothing was sent/);
    const call = liveCall('owner-uid');
    expect(await call.run(tools.sendTextMessage, text, 'c1')).toContain('NOT SENT YET');
    call.caller('yes');
    await call.run(tools.sendTextMessage, text, 'c2');
    expect(edge.legacySend).toHaveBeenCalledTimes(1);
  });

  it('a reminder to an address the model named waits for a yes; one to the owner does not', async () => {
    const { definitions } = await import('../../domains/productivity/index.js');
    const setReminder = () => definitions.find((d) => d.id === 'setReminder')!.create(ctx);
    const remind = { message: 'pay rent', when: 'in 2 hours', deliveryMethod: 'email' };
    const toStranger = { ...remind, deliveryAddress: 'stranger@example.com' };
    const out = await liveCall().run(setReminder(), toStranger, 'c1');
    expect(out).toContain('a reminder sent to stranger@example.com');
    expect(edge.createReminder).not.toHaveBeenCalled();
    const inApp = { message: 'pay rent', when: 'in 2 hours', deliveryMethod: 'in_app' };
    expect(await liveCall().run(setReminder(), inApp, 'c1')).not.toContain('NOT SENT YET');
    const legacy = { reminderText: 'pay rent', when: 'in 2 hours', contactMethod: 'sms' };
    expect(outboundDispatchRefusal('scheduleReminder', 'user-1', legacy)).toBeNull();
    expect(
      outboundDispatchRefusal('scheduleReminder', 'user-1', { ...legacy, contact: '2125550199' })
    ).toMatch(/^Nothing was sent/);
  });
});

describe('public posts wait for a yes; drafts do not', () => {
  const twitter = () => marketingDefs.find((d) => d.id === 'postToTwitter')!.create(ctx);

  it('posts exactly the words read back, once, and drops a saved draft', async () => {
    const call = liveCall();
    const args = { action: 'post', content: 'Shipping today', useDraft: 'd-9' };
    expect(await call.run(twitter(), args, 'c1')).toContain('Twitter saying "Shipping today"');
    call.caller('hmm');
    await call.run(twitter(), args, 'c2');
    expect(edge.postThread).not.toHaveBeenCalled();
    await call.run(twitter(), args, 'c3');
    call.caller('Yes.');
    await call.run(twitter(), args, 'c4');
    expect(edge.postThread).toHaveBeenCalledTimes(1);
    expect(edge.postThread.mock.calls[0][0]).toEqual(['Shipping today']);
  });

  it('a draft saves at once (nothing is published)', async () => {
    const out = await liveCall().run(twitter(), { action: 'draft', content: 'Idea' }, 'c1');
    expect(out).not.toContain('NOT SENT YET');
    expect(edge.saveDraft).toHaveBeenCalledTimes(1);
    expect(edge.postThread).not.toHaveBeenCalled();
  });
});

describe('the executor path refuses every outbound executor name', () => {
  // Names these executors handle that never reach another person. A new name
  // must be classified here or refused, or this test fails.
  const NOT_OUTBOUND = new Set(
    [
      'schedulecallback checkvoicemail requestcallback call_voicemail call_history callstatus',
      'schedulemessage scheduletext schedulecall scheduleemail sendmessagenow sendtextnow',
      'listscheduled getscheduled cancelscheduled cancelreminder savecontact savecontactinfo',
      'addcontact reminder_set reminder_create productivity_commitments reminder_list',
      'reminder_delete reminder_complete sms_read draftmessage analyzemessage',
      'checkconciergerstatus sms_search email_read email_search email_prioritize contact_find',
      // FTIS aliases of the owner-only scheduleemail / savecontact handlers
      'email_send email_draft message_craft contact_add contact_list',
    ]
      .join(' ')
      .split(' ')
  );
  const executors = [
    telephonyExecutor,
    schedulingExecutor,
    communicationExecutor,
    conciergeExecutor,
    openclawExecutor,
  ];

  it.each(executors.map((e) => [e.domain, e] as const))('%s', (_domain, executor) => {
    const unrefused = executor.handles.filter(
      (name) => !NOT_OUTBOUND.has(name) && outboundDispatchRefusal(name, 'user-1') === null
    );
    expect(unrefused, 'these reach someone: refuse them or classify them').toEqual([]);
  });
});
