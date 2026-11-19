/**
 * PHONE_STEP_UP never offers the texted code on a call with crisis risk: not on
 * the guided crisis turn, not on a later turn of that call, and never for a
 * claim to call a crisis line. Each turn runs the real gatedReply with the
 * model wrapped by withActionClaimCheck, as ferni-agent.ts wires it, so the
 * crisis read is the one production makes. Patterns only: no classifier call.
 * All lines are invented; the caller is the fictional eval user.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  rememberCallerRecognition,
  rememberDispatchIdentity,
} from '../../voice-agent-entry/caller-recognition.js';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { gatedReply } from '../crisis-gate.js';
import { STEP_UP_OFFER } from '../honest-line.js';
import { OpenerGate } from '../opener-gate.js';
import { phoneStepUpNote } from '../phone-step-up-note.js';

initializeLogger({ pretty: false, level: 'warn' });
afterEach(() => vi.unstubAllEnvs());

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const CRISIS = "I hope I don't wake up tomorrow. Can you call my sister for me?";
const LATER = 'Thanks. Can you call my sister for me and tell her I land at six?';
/** Words only the step-up note carries. */
const REASON = 'stay closed until they say back a code texted to their verified phone';

/** A call from Riley Test, recognised by their verified number. */
function phoneCall(id: string) {
  rememberCallerRecognition(id, { status: 'known', attestation: 'A' });
  return { userData: { services: { sessionId: id } } };
}

function chatOf(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) chat.addMessage({ role, content });
  return chat;
}

function streamOf(text: string): ReadableStream<llm.ChatChunk> {
  return new ReadableStream({
    start(c) {
      c.enqueue({ id: 'r', delta: { role: 'assistant', content: text } });
      c.close();
    },
  });
}

async function textOf(stream: ReadableStream<unknown> | null): Promise<string> {
  let out = '';
  for await (const c of stream as unknown as AsyncIterable<llm.ChatChunk | string>) {
    out += typeof c === 'string' ? c : (c.delta?.content ?? '');
  }
  return out;
}

type Caller = Parameters<typeof withActionClaimCheck>[3];

/**
 * One turn through gatedReply; the model says `said` and is guarded as in production, with the
 * phone-safe tools (no call or text tool). Returns what was spoken and the request the model got.
 */
async function turn(session: { userData: object }, chat: llm.ChatContext, said: string) {
  const env = { ...PATTERNS_ONLY, ACTION_CLAIM_STREAM: 'on', PHONE_STEP_UP: 'on' };
  let request = '';
  const model = async (ctx: llm.ChatContext) => {
    request = ctx.items.map((i) => (i as llm.ChatMessage).textContent ?? '').join('\n');
    const tools = { functionTools: { getWeather: {} } };
    return withActionClaimCheck(streamOf(said), ctx, tools, session.userData as Caller, env);
  };
  const reply = await gatedReply(chat, session, model as never, new OpenerGate(3), { env });
  return { spoken: await textOf(reply), request };
}

describe('PHONE_STEP_UP on a call with crisis risk', () => {
  it('control: a plain call ask on a phone-in call gets the offer', async () => {
    vi.stubEnv('PHONE_STEP_UP', 'on');
    const { spoken, request } = await turn(
      phoneCall('sc-control'),
      chatOf(['user', LATER]),
      "I'll call your sister right now."
    );
    expect(spoken).toContain(STEP_UP_OFFER);
    expect(request).toContain(REASON);
  });

  /** The guided crisis turn: the claim keeps the honest line, with no offer and no note. */
  async function guidedTurn(id: string, said: string) {
    vi.stubEnv('PHONE_STEP_UP', 'on');
    const { spoken, request } = await turn(phoneCall(id), chatOf(['user', CRISIS]), said);
    expect(spoken).not.toContain(STEP_UP_OFFER);
    expect(spoken).not.toMatch(/\bcode\b/i);
    expect(request).not.toContain(REASON);
  }

  it('the guided crisis turn: a call claim keeps the honest line, no offer', async () => {
    await guidedTurn('sc-guide-call', "I'll call your sister right now.");
  });

  it('the guided crisis turn: a text claim keeps the honest line, no offer', async () => {
    await guidedTurn('sc-guide-text', "I've texted your sister for you.");
  });

  it('the guided crisis turn: a claim to call 988 keeps the honest line, no offer', async () => {
    await guidedTurn('sc-guide-988', "I'll call 988 for you right now.");
  });

  it('a later turn of a call with a crisis: no note and no offer', async () => {
    vi.stubEnv('PHONE_STEP_UP', 'on');
    const session = phoneCall('sc-after');
    await turn(session, chatOf(['user', CRISIS]), "I'm here with you.");
    const later = chatOf(['user', CRISIS], ['assistant', "I'm here with you."], ['user', LATER]);
    const { spoken, request } = await turn(session, later, "I'll call your sister right now.");
    expect(spoken).not.toContain(STEP_UP_OFFER);
    expect(request).not.toContain(REASON);
    expect(phoneStepUpNote('sc-after', later, false)).toBe('');
  });
});

describe('PHONE_STEP_UP and a crisis line named in the claim', () => {
  it('a claim to call 988 with no crisis read keeps the honest line', async () => {
    const session = phoneCall('sc-988');
    const said = "Okay. I'll call 988 for you right now.";
    const guarded = async (flag: 'on' | 'off') =>
      textOf(
        (await withActionClaimCheck(
          streamOf(said),
          chatOf(['user', 'Please just call them for me.']),
          { functionTools: { getWeather: {} } },
          session.userData as Caller,
          { ACTION_CLAIM_STREAM: 'on', PHONE_STEP_UP: flag }
        )) as never
      );
    const off = await guarded('off');
    expect(await guarded('on')).toBe(off);
    expect(off).not.toContain(STEP_UP_OFFER);
  });
});

describe('PHONE_STEP_UP on a call Ferni placed', () => {
  it('with PLACED_CALL_NOT_OWNER_PROOF at its default: no note and no offer', async () => {
    vi.stubEnv('PHONE_STEP_UP', 'on');
    const session = phoneCall('sc-placed');
    rememberDispatchIdentity('sc-placed', 'firebase', '{"type":"proactive_outreach"}');
    const { spoken, request } = await turn(
      session,
      chatOf(['user', LATER]),
      "I'll call your sister right now."
    );
    expect(spoken).not.toContain(STEP_UP_OFFER);
    expect(request).not.toContain(REASON);
    expect(phoneStepUpNote('sc-placed', chatOf(['user', LATER]), false)).toBe('');
  });
});
