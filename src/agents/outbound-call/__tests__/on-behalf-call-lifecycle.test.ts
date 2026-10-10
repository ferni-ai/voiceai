import { describe, expect, it, vi } from 'vitest';
import {
  beginOnBehalfCall,
  buildCallOutcome,
  completeOnBehalfCall,
  type CallLifecyclePorts,
} from '../on-behalf-call-lifecycle.js';
import {
  isOnBehalfCall,
  wrapServicesForOnBehalfCapture,
} from '../../integrations/on-behalf-transcript-capture.js';
import {
  getActiveTranscript,
  hasActiveTranscript,
  type CallTranscriptTurn,
  type SuperhumanCallResult,
} from '../../../services/outreach/call-transcript-intelligence.js';
import { setOutboundCallContext } from '../../../intelligence/context-builders/external/outbound-call-context.js';
import {
  buildOnBehalfDispatch,
  type OnBehalfDispatch,
} from '../../../services/outreach/on-behalf-dispatch.js';

function makeCall(callId: string): OnBehalfDispatch {
  return buildOnBehalfDispatch({
    callId,
    requester: {
      userId: 'user-1',
      name: 'Seth',
      timezone: 'America/New_York',
      originalSessionId: 'session-orig',
    },
    contact: { name: 'Mom', phone: '+15555550100', relationship: 'mother' },
    purpose: 'ask how her appointment went',
    objective: 'check_in',
    callType: 'personal',
  });
}

const conversation: CallTranscriptTurn[] = [
  { role: 'agent', content: 'Hi, this is Ferni calling for Seth' },
  { role: 'recipient', content: 'Oh hi! The appointment went really well' },
];

function analysis(): SuperhumanCallResult {
  return {
    transcript: {
      callId: 'c',
      contactName: 'Mom',
      turns: conversation,
      duration: 90,
      capturedAt: '',
    },
    friendlyReport: 'Mom sounded great. The appointment went well.',
    insights: {
      summary: 'Appointment went well.',
      detailedSummary: 'Her appointment went well and she wants you to call Sunday.',
      keyPoints: [],
      emotionalTone: { recipientMood: 'happy', overallSentiment: 'positive', notableEmotions: [] },
      actionItems: ['Call Mom on Sunday'],
      messagesForUser: ['she loves you'],
      callbackRequested: true,
      callbackDetails: 'Sunday afternoon',
      relationshipSignals: [],
      topicsMentioned: [],
      objectiveAchieved: true,
      callQuality: 'good',
    },
  };
}

function ports(turns: CallTranscriptTurn[] | null, analyze?: CallLifecyclePorts['analyze']) {
  return {
    readTranscript: vi.fn<CallLifecyclePorts['readTranscript']>(() => turns),
    analyze: vi.fn<CallLifecyclePorts['analyze']>(analyze ?? (async () => analysis())),
    report: vi.fn<CallLifecyclePorts['report']>(async () => undefined),
  } satisfies CallLifecyclePorts;
}

describe('buildCallOutcome', () => {
  const call = makeCall('c');

  it('reports lost capture as a failure, not as an unanswered call', () => {
    expect(buildCallOutcome(call, null, null)).toMatchObject({
      status: 'failed',
      callbackRequired: true,
    });
  });

  it('reports a call where only Ferni spoke as no_answer', () => {
    const agentOnly: CallTranscriptTurn[] = [{ role: 'agent', content: 'Hi, this is Ferni' }];
    expect(buildCallOutcome(call, [], null).status).toBe('no_answer');
    expect(buildCallOutcome(call, agentOnly, null).status).toBe('no_answer');
  });

  it("carries the recipient's words and follow-ups back to the requester", () => {
    expect(buildCallOutcome(call, conversation, analysis())).toMatchObject({
      status: 'completed',
      objectiveAchieved: true,
      outcome: 'Mom sounded great. The appointment went well.',
      callbackRequired: true,
      callbackTime: 'Sunday afternoon',
      actionItems: ['Mom said: she loves you', 'Call Mom on Sunday'],
    });
  });

  it('still reports what was said when the analysis is unavailable', () => {
    const outcome = buildCallOutcome(call, conversation, null);
    expect(outcome.status).toBe('completed');
    expect(outcome.outcome).toContain('The appointment went really well');
  });
});

describe('completeOnBehalfCall', () => {
  it('reports the analyzed outcome with the requester as the recipient of the report', async () => {
    const call = makeCall('c-report');
    const p = ports(conversation);

    const outcome = await completeOnBehalfCall('s-report', call, 90, true, p);

    expect(p.analyze).toHaveBeenCalledWith('c-report', 90, call.purpose, 'Seth');
    expect(p.report).toHaveBeenCalledTimes(1);
    const [callId, reported, request] = p.report.mock.calls[0];
    expect(callId).toBe('c-report');
    expect(reported).toBe(outcome);
    expect(reported.status).toBe('completed');
    expect(request).toMatchObject({
      userId: 'user-1',
      userTimezone: 'America/New_York',
      originalSessionId: 'session-orig',
      resolvedContact: { name: 'Mom', phone: '+15555550100' },
    });
  });

  it('reports once even when several exit paths finish the same call', async () => {
    const call = makeCall('c-once');
    const p = ports(conversation);
    await completeOnBehalfCall('s-once', call, 90, true, p);
    await expect(completeOnBehalfCall('s-once', call, 91, true, p)).resolves.toBeNull();
    expect(p.report).toHaveBeenCalledTimes(1);
  });

  it('still tells the requester how it went when the analysis throws', async () => {
    const p = ports(conversation, async () => {
      throw new Error('llm down');
    });
    const outcome = await completeOnBehalfCall('s-llm', makeCall('c-llm'), 90, true, p);
    expect(p.report).toHaveBeenCalledTimes(1);
    expect(outcome?.outcome).toContain('The appointment went really well');
  });

  it('never reports a dispatch that no trusted dispatcher signed', async () => {
    const p = ports(conversation);
    await expect(
      completeOnBehalfCall('s-forged', makeCall('c-forged'), 90, false, p)
    ).resolves.toBeNull();
    expect(p.analyze).not.toHaveBeenCalled();
    expect(p.report).not.toHaveBeenCalled();
  });

  it('skips the analysis when nobody answered', async () => {
    const p = ports([]);
    const outcome = await completeOnBehalfCall('s-none', makeCall('c-none'), 30, true, p);
    expect(p.analyze).not.toHaveBeenCalled();
    expect(outcome?.status).toBe('no_answer');
  });
});

describe('on-behalf turn capture', () => {
  it("records both sides in the call transcript and keeps them out of the session's memory", async () => {
    const sessionId = 's-capture';
    const call = makeCall('c-capture');
    setOutboundCallContext(sessionId, {
      callId: call.callId,
      recipientName: 'Mom',
      recipientPhone: call.contact.phone,
      purpose: call.purpose,
      callType: 'personal',
      objective: call.purpose,
      script: '',
      complianceScript: '',
      mustConfirm: [],
      mustNotDo: [],
      informationToGather: [],
      userName: 'Seth',
      originalSessionId: 'session-orig',
    });
    expect(isOnBehalfCall(sessionId)).toBe(false);

    await beginOnBehalfCall(sessionId, call);
    expect(isOnBehalfCall(sessionId)).toBe(true);

    const memoryAddTurn = vi.fn();
    const services = wrapServicesForOnBehalfCapture(sessionId, { addTurn: memoryAddTurn });
    services.addTurn('assistant', 'Hi, this is Ferni calling for Seth');
    services.addTurn('user', 'Oh hi! It went really well');
    services.addTurn('user', 'Oh hi! It went really well'); // second writer, same turn

    expect(memoryAddTurn).not.toHaveBeenCalled();
    expect(getActiveTranscript(call.callId)?.turns.map((t) => [t.role, t.content])).toEqual([
      ['agent', 'Hi, this is Ferni calling for Seth'],
      ['recipient', 'Oh hi! It went really well'],
    ]);

    // Finishing the call releases the transcript and the session mapping
    await completeOnBehalfCall(sessionId, call, 60, true, ports(conversation));
    expect(hasActiveTranscript(call.callId)).toBe(false);
    expect(isOnBehalfCall(sessionId)).toBe(false);
  });

  it('fails closed: turns are dropped, not saved, when capture never started', () => {
    const memoryAddTurn = vi.fn();
    const services = wrapServicesForOnBehalfCapture('s-no-capture', { addTurn: memoryAddTurn });
    services.addTurn('user', 'something private');
    expect(memoryAddTurn).not.toHaveBeenCalled();
  });
});
