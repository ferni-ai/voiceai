/**
 * Self-Registration Tool Tests
 *
 * The caller's phone must come from the inbound call context the telephony
 * layer sets, never from a model-supplied argument: a caller can read out
 * any number, and a web session has no caller ID at all.
 *
 * Run with: pnpm vitest run src/tools/domains/voice-enrollment
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  return {
    getLogger: () => ({ ...logger(), child: vi.fn(logger) }),
    createLogger: () => ({ ...logger(), child: vi.fn(logger) }),
  };
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

vi.mock('../../../../intelligence/context-builders/external/inbound-call-context.js', () => ({
  getInboundCallContext: vi.fn(),
}));

vi.mock('../../../../services/identity/sponsored-identity.js', () => ({
  createSelfRegisteredIdentity: vi.fn(),
  lookupByPhone: vi.fn(),
  getPendingIdentities: vi.fn(),
}));

import type { ToolContext } from '../../../registry/types.js';
import { getInboundCallContext } from '../../../../intelligence/context-builders/external/inbound-call-context.js';
import {
  createSelfRegisteredIdentity,
  lookupByPhone,
} from '../../../../services/identity/sponsored-identity.js';
import { getToolDefinitions } from '../self-registration-tool.js';

const CALLER_ID_PHONE = '+15551230001';
const SPOKEN_PHONE = '+15559990002';

interface TestTool {
  parameters: { properties: Record<string, unknown>; required: string[] };
  execute: (args: Record<string, unknown>) => Promise<{ success: boolean; message: string }>;
}

function makeTool(ctx: Partial<ToolContext>): TestTool {
  const def = getToolDefinitions().find((d) => d.id === 'selfRegisterCaller');
  if (!def) throw new Error('selfRegisterCaller definition missing');
  return def.create({
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    userId: 'test_user',
    ...ctx,
  } as ToolContext) as unknown as TestTool;
}

describe('selfRegisterCaller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(lookupByPhone).mockResolvedValue({ found: false } as never);
    vi.mocked(createSelfRegisteredIdentity).mockResolvedValue({ id: 'sid_new' } as never);
  });

  it('does not accept a phone number from the model', () => {
    const tool = makeTool({ sessionId: 'session-1' });
    expect(tool.parameters.properties).not.toHaveProperty('callerPhone');
    expect(tool.parameters.required).toEqual(['callerName']);
  });

  it('refuses without writing when the tool has no session id', async () => {
    const tool = makeTool({ sessionId: undefined });

    const result = await tool.execute({ callerName: 'Pat', callerPhone: SPOKEN_PHONE });

    expect(result.success).toBe(false);
    expect(getInboundCallContext).not.toHaveBeenCalled();
    expect(lookupByPhone).not.toHaveBeenCalled();
    expect(createSelfRegisteredIdentity).not.toHaveBeenCalled();
  });

  it('refuses without writing when the session is not an inbound phone call', async () => {
    vi.mocked(getInboundCallContext).mockReturnValue(undefined);
    const tool = makeTool({ sessionId: 'web-session' });

    const result = await tool.execute({ callerName: 'Pat', callerPhone: SPOKEN_PHONE });

    expect(getInboundCallContext).toHaveBeenCalledWith('web-session');
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/phone/i);
    expect(lookupByPhone).not.toHaveBeenCalled();
    expect(createSelfRegisteredIdentity).not.toHaveBeenCalled();
  });

  it('refuses without writing when the call context has no caller phone', async () => {
    vi.mocked(getInboundCallContext).mockReturnValue({
      callSid: 'CA123',
      callerPhone: '',
      isKnownCaller: false,
      isVoiceEnrolled: false,
    });
    const tool = makeTool({ sessionId: 'session-1' });

    const result = await tool.execute({ callerName: 'Pat', callerPhone: SPOKEN_PHONE });

    expect(result.success).toBe(false);
    expect(createSelfRegisteredIdentity).not.toHaveBeenCalled();
  });

  it('registers the caller ID number, not the number the model passes', async () => {
    vi.mocked(getInboundCallContext).mockReturnValue({
      callSid: 'CA123',
      callerPhone: CALLER_ID_PHONE,
      isKnownCaller: false,
      isVoiceEnrolled: false,
    });
    const tool = makeTool({ sessionId: 'session-1' });

    const result = await tool.execute({
      callerName: 'Pat',
      callerPhone: SPOKEN_PHONE,
      claimedRelationship: "Seth's cousin",
      claimedSponsorName: 'Seth',
    });

    expect(result.success).toBe(true);
    expect(lookupByPhone).toHaveBeenCalledTimes(1);
    expect(lookupByPhone).toHaveBeenCalledWith(CALLER_ID_PHONE);
    expect(createSelfRegisteredIdentity).toHaveBeenCalledTimes(1);
    expect(createSelfRegisteredIdentity).toHaveBeenCalledWith(
      CALLER_ID_PHONE,
      'Pat',
      "Seth's cousin",
      'Seth'
    );
  });

  it('does not create a second identity for a number already registered', async () => {
    vi.mocked(getInboundCallContext).mockReturnValue({
      callSid: 'CA123',
      callerPhone: CALLER_ID_PHONE,
      isKnownCaller: true,
      isVoiceEnrolled: false,
    });
    vi.mocked(lookupByPhone).mockResolvedValue({ found: true } as never);
    const tool = makeTool({ sessionId: 'session-1' });

    const result = await tool.execute({ callerName: 'Pat' });

    expect(result.success).toBe(true);
    expect(lookupByPhone).toHaveBeenCalledWith(CALLER_ID_PHONE);
    expect(createSelfRegisteredIdentity).not.toHaveBeenCalled();
  });
});
