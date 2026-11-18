/**
 * PHONE_STEP_UP: a caller Ferni knows by their verified number asks him to call
 * or text someone. With the flag on, the model's turn note says why calling and
 * texting wait and how to open them, and a claim the guard drops is replaced by
 * the offer of a texted code. Flag off, a crisis turn, a call Ferni placed, or a
 * caller not known by number: everything as before.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  rememberCallerRecognition,
  rememberDispatchIdentity,
} from '../../voice-agent-entry/caller-recognition.js';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { STEP_UP_OFFER } from '../honest-line.js';
import { phoneStepUpNote } from '../phone-step-up-note.js';
import { withTurnReminder } from '../turn-request.js';

initializeLogger({ pretty: false, level: 'warn' });
afterEach(() => vi.unstubAllEnvs());

const ASK = 'Can you call my sister for me and tell her I land at six?';
/** The reason the note gives: words no other note carries. */
const REASON = 'stay closed until they say back a code texted to their verified phone';
const CANNOT_CALL =
  "I can't actually make calls for you, so I haven't rung anyone. I can help you work out what to say, though.";

/** A session recognised by phone: 'known' is the verified owner with a signed attestation A. */
function phoneSession(id: string, status: 'known' | 'maybe' | 'stranger' = 'known') {
  rememberCallerRecognition(id, { status, attestation: status === 'known' ? 'A' : 'none' });
  return { userData: { services: { sessionId: id } } };
}

function chatWith(said: string): llm.ChatContext {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: said });
  return chat;
}

describe('phoneStepUpNote', () => {
  it('flag on, the owner phoned in, an action asked for: the reason and the way forward', () => {
    phoneSession('note-known');
    vi.stubEnv('PHONE_STEP_UP', 'off');
    expect(phoneStepUpNote('note-known', chatWith(ASK), false)).toBe('');
    vi.stubEnv('PHONE_STEP_UP', 'on');
    const note = phoneStepUpNote('note-known', chatWith(ASK), false);
    expect(note).toContain(REASON);
    expect(note).toContain(STEP_UP_OFFER);
  });

  it('never on a crisis turn', () => {
    phoneSession('note-crisis');
    vi.stubEnv('PHONE_STEP_UP', 'on');
    expect(phoneStepUpNote('note-crisis', chatWith(ASK), true)).toBe('');
  });

  it('never for a caller the number alone does not prove (maybe, stranger) or no session', () => {
    vi.stubEnv('PHONE_STEP_UP', 'on');
    phoneSession('note-maybe', 'maybe');
    phoneSession('note-stranger', 'stranger');
    expect(phoneStepUpNote('note-maybe', chatWith(ASK), false)).toBe('');
    expect(phoneStepUpNote('note-stranger', chatWith(ASK), false)).toBe('');
    expect(phoneStepUpNote(undefined, chatWith(ASK), false)).toBe('');
  });

  it('never on a call Ferni placed: whoever answered is not proven to be the owner', () => {
    vi.stubEnv('PHONE_STEP_UP', 'on');
    vi.stubEnv('PLACED_CALL_NOT_OWNER_PROOF', 'on');
    phoneSession('note-placed');
    expect(phoneStepUpNote('note-placed', chatWith(ASK), false)).toContain(REASON);
    rememberDispatchIdentity('note-placed', 'firebase', '{"type":"proactive_outreach"}');
    expect(phoneStepUpNote('note-placed', chatWith(ASK), false)).toBe('');
  });

  it('only with an action in play', () => {
    phoneSession('note-quiet');
    vi.stubEnv('PHONE_STEP_UP', 'on');
    expect(phoneStepUpNote('note-quiet', chatWith('It was a lovely day.'), false)).toBe('');
  });

  it('reaches the request through withTurnReminder only with the flag on', () => {
    const session = phoneSession('note-request');
    const sent = (): string =>
      (withTurnReminder(chatWith(ASK), session).items.at(-1) as llm.ChatMessage).textContent ?? '';
    vi.stubEnv('PHONE_STEP_UP', 'off');
    expect(sent()).not.toContain(REASON);
    vi.stubEnv('PHONE_STEP_UP', 'on');
    expect(sent()).toContain(REASON);
  });
});

function streamOf(...parts: string[]): ReadableStream<llm.ChatChunk> {
  return new ReadableStream({
    start(c) {
      for (const content of parts) c.enqueue({ id: 'r', delta: { role: 'assistant', content } });
      c.close();
    },
  });
}

type Caller = Parameters<typeof withActionClaimCheck>[3];

async function guarded(userData: object, said: string[], env: Record<string, string>) {
  const out = await withActionClaimCheck(
    Promise.resolve(streamOf(...said)),
    chatWith(ASK),
    { functionTools: { getWeather: {} } }, // the phone-safe set: no call or text tool
    userData as Caller, // the session's userData, as ferni-agent.ts passes it
    { ACTION_CLAIM_STREAM: 'on', ...env }
  );
  let text = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) {
    text += c.delta?.content ?? '';
  }
  return text;
}

describe('the honest line for a call claim with no call tool', () => {
  const claim = ['Sure. ', "I'm calling her right now. ", 'Anything else?'];

  it('flag on, the owner phoned in: the offer of a texted code goes where the claim was', async () => {
    const { userData } = phoneSession('guard-known');
    expect(await guarded(userData, claim, { PHONE_STEP_UP: 'on' })).toBe(
      `Sure. ${STEP_UP_OFFER} Anything else?`
    );
  });

  it('a text claim gets the offer too', async () => {
    const { userData } = phoneSession('guard-text');
    const text = ['Okay. ', "I've texted your sister. "];
    expect(await guarded(userData, text, { PHONE_STEP_UP: 'on' })).toBe(`Okay. ${STEP_UP_OFFER}`);
  });

  it('flag off: the line as today', async () => {
    const { userData } = phoneSession('guard-off');
    expect(await guarded(userData, claim, { PHONE_STEP_UP: 'off' })).toBe(
      `Sure. ${CANNOT_CALL} Anything else?`
    );
  });

  it('a caller not known by number: the line as today', async () => {
    const { userData } = phoneSession('guard-maybe', 'maybe');
    expect(await guarded(userData, claim, { PHONE_STEP_UP: 'on' })).toBe(
      `Sure. ${CANNOT_CALL} Anything else?`
    );
  });

  it('a claim that is not a call or text: the line as today', async () => {
    const { userData } = phoneSession('guard-save');
    const saved = await guarded(userData, ["I've saved that."], { PHONE_STEP_UP: 'on' });
    expect(saved).not.toContain(STEP_UP_OFFER);
    expect(saved).toMatch(/can't actually save/);
  });
});
