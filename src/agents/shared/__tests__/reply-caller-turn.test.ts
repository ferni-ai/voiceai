/**
 * The caller's words a reply answers come from that reply's own chat context
 * (noted in llmNode), not userData.lastUserMessage, which the background turn
 * processor can leave on the previous turn when the reply starts.
 *
 * The wiring test runs the prod order: the previous turn is still in
 * lastUserMessage, llmNode notes the new turn's chat context, then the real
 * tts-wrapper builds the TTS context and the real gateway runs the real
 * Director, whose EMOTION_LIFT line and Cartesia push are checked.
 */
import { ReadableStream } from 'node:stream/web';
import { llm, type voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-context-header.js';
import type { ReplyStream } from '../../../speech/tts-gateway/providers/cartesia-reply-stream.js';
import type { ITTSProvider } from '../../../speech/tts-gateway/types.js';
import {
  callerWordsAnswered,
  noteReplyCallerTurn,
  replyCallerTurnFields,
} from '../reply-caller-turn.js';

const liftLog = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: { module?: string }) =>
      bindings.module === 'EmotionLift'
        ? { info: liftLog, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
        : actual.createLogger(bindings),
  };
});

class RecordingReply implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {
    yield new ArrayBuffer(960);
  }
}
const replies = vi.hoisted(() => [] as RecordingReply[]);
const provider = vi.hoisted((): ITTSProvider => ({
  name: 'cartesia',
  synthesize: async () => new ArrayBuffer(4800),
  synthesizeStream: async function* () {},
  isAvailable: async () => true,
  estimateDuration: () => 100,
  openReplyStream: () => {
    const reply = new RecordingReply();
    replies.push(reply);
    return reply;
  },
}));
vi.mock('../../../speech/tts-gateway/providers/index.js', () => ({
  getTTSProvider: () => provider,
  getCartesiaProvider: () => provider,
}));
vi.mock('@livekit/rtc-node', () => ({
  AudioFrame: class {
    constructor(
      public data: Int16Array,
      public sampleRate: number,
      public channels: number,
      public samplesPerChannel: number
    ) {}
  },
}));

const message = (role: 'user' | 'assistant', text: string) => ({
  type: 'message',
  role,
  textContent: text,
});

describe('callerWordsAnswered', () => {
  it("is the caller's messages since Ferni last spoke, joined", () => {
    const items = [
      message('user', 'my dad is sick'),
      message('assistant', 'I am sorry.'),
      message('user', 'okay you are not going to believe this.'),
      message('user', 'I got the job!'),
    ];
    expect(callerWordsAnswered(items)).toBe(
      'okay you are not going to believe this. I got the job!'
    );
  });

  it('skips tool calls and turn-context notes the machinery pushed as user messages', () => {
    const items = [
      message('assistant', 'Hi.'),
      message('user', 'what is the weather'),
      { type: 'function_call' },
      { type: 'function_call_output' },
      message('user', `${TURN_CONTEXT_HEADER}\nthey like rain`),
    ];
    expect(callerWordsAnswered(items)).toBe('what is the weather');
  });

  it('is empty for a reply nobody prompted (the context ends on Ferni)', () => {
    expect(callerWordsAnswered([message('user', 'hi'), message('assistant', 'Hey.')])).toBe('');
  });
});

/**
 * The chat the SDK hands llmNode for the reply after a tool step, built as
 * agent_activity.js builds it: the step's text is an assistant message with the
 * generation's id, its calls are `${id}/fnc_${n}`, then their outputs.
 */
describe('callerWordsAnswered after a tool step (real ChatContext shape)', () => {
  let at = 1_000;
  const said = (chat: llm.ChatContext, role: 'user' | 'assistant', text: string, id?: string) =>
    chat.insert(
      llm.ChatMessage.create({ role, content: text, createdAt: at++, ...(id && { id }) })
    );
  const toolStep = (chat: llm.ChatContext, generation: string, text: string | null) => {
    if (text !== null) said(chat, 'assistant', text, generation);
    const callId = `call_${generation}`;
    chat.insert([
      llm.FunctionCall.create({
        id: `${generation}/fnc_0`,
        callId,
        name: 'getWeather',
        args: '{}',
        createdAt: at++,
      }),
      llm.FunctionCallOutput.create({
        callId,
        name: 'getWeather',
        output: '"sunny"',
        isError: false,
        createdAt: at++,
      }),
    ]);
  };
  const history = () => {
    const chat = llm.ChatContext.empty();
    said(chat, 'user', 'my dad is sick');
    said(chat, 'assistant', 'I am sorry.', 'item_earlier');
    return chat;
  };

  it("walks past the step's own lead-in to the caller's question", () => {
    const chat = history();
    said(chat, 'user', 'what is the weather?');
    toolStep(chat, 'item_g1', 'Let me check.');
    expect(callerWordsAnswered(chat.items)).toBe('what is the weather?');
  });

  it('walks past chained tool steps, with and without lead-ins', () => {
    const chat = history();
    said(chat, 'user', 'should I leave now?');
    toolStep(chat, 'item_g1', 'Let me look.');
    toolStep(chat, 'item_g2', null);
    toolStep(chat, 'item_g3', 'And the roads.');
    expect(callerWordsAnswered(chat.items)).toBe('should I leave now?');
  });

  it('does not cross a reply that ended an earlier turn', () => {
    const chat = history();
    toolStep(chat, 'item_g1', null); // a tool step with no lead-in, right after "I am sorry."
    expect(callerWordsAnswered(chat.items)).toBe('');
  });

  it('a caller message after a tool step is the turn, as before', () => {
    const chat = history();
    said(chat, 'user', 'what is the weather?');
    toolStep(chat, 'item_g1', 'Let me check.');
    said(chat, 'assistant', 'Sunny all day.', 'item_g2');
    said(chat, 'user', 'nice, thanks');
    expect(callerWordsAnswered(chat.items)).toBe('nice, thanks');
  });
});

describe('replyCallerTurnFields', () => {
  it('reads the noted turn when llmNode ran, else falls back to lastUserMessage', () => {
    const agent = {};
    expect(replyCallerTurnFields(agent, 'old words')).toEqual({
      userRequest: 'old words',
      callerTurnFresh: false,
    });
    noteReplyCallerTurn(agent, { items: [message('user', 'new words')] });
    expect(replyCallerTurnFields(agent, 'old words')).toEqual({
      userRequest: 'new words',
      callerTurnFresh: true,
    });
    noteReplyCallerTurn(agent, { items: [message('assistant', 'Hey.')] });
    expect(replyCallerTurnFields(agent, 'old words')).toEqual({
      userRequest: undefined,
      callerTurnFresh: true,
    });
  });

  it('is read once: a say() line after the reply falls back, not fresh', () => {
    const agent = {};
    noteReplyCallerTurn(agent, { items: [message('user', 'I got the job!')] });
    expect(replyCallerTurnFields(agent, 'old words').callerTurnFresh).toBe(true);
    expect(replyCallerTurnFields(agent, 'old words')).toEqual({
      userRequest: 'old words',
      callerTurnFresh: false,
    });
  });
});

describe('prod order: tts-wrapper → gateway → Director sees THIS turn', () => {
  const ENV = {
    SPEECH_DIRECTOR: 'live',
    EMOTION_LIFT: 'on',
    FERNI_VOICE_EMOTION: 'excited',
    FERNI_VOICE_SPEED: '1.08',
    FERNI_VOICE_ID: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc', // prod's secret since 2026-10-20
  };
  beforeEach(() => {
    Object.assign(process.env, ENV);
    replies.length = 0;
    liftLog.mockClear();
  });
  afterEach(() => {
    for (const key of Object.keys(ENV)) delete process.env[key];
  });

  it('good news is lifted although lastUserMessage still holds the previous turn', async () => {
    const { extractTtsSessionContext, wrappedTtsNode } = await import('../tts-wrapper.js');
    // The background turn processor has not caught up: lastUserMessage is the last turn.
    const userData = {
      services: { sessionId: 'reply-caller-wire' },
      personaId: 'ferni',
      lastUserMessage: 'work was fine I guess',
    };
    const agent = { session: { userData } } as unknown as voice.Agent;
    // The SDK hands llmNode this reply's context, the new caller turn in it.
    const chatCtx = llm.ChatContext.empty();
    chatCtx.addMessage({ role: 'user', content: 'work was fine I guess' });
    chatCtx.addMessage({ role: 'assistant', content: 'Fair enough.' });
    chatCtx.addMessage({ role: 'user', content: 'I got the job!!' });
    noteReplyCallerTurn(agent, chatCtx);

    const sessionContext = extractTtsSessionContext(agent, 'ferni');
    expect(sessionContext.userRequest).toBe('I got the job!!');
    expect(sessionContext.callerTurnFresh).toBe(true);

    const audio = await wrappedTtsNode(
      agent,
      new ReadableStream<string>({
        start(c) {
          c.enqueue('Ha, congrats! ');
          c.enqueue('You worked so hard for this.');
          c.close();
        },
      }),
      {} as voice.ModelSettings,
      { sessionContext, enablePostTTSEnhancement: false }
    );
    const reader = audio?.getReader();
    while (reader && !(await reader.read()).done) {
      /* drain */
    }
    const pushes = replies.flatMap((r) => r.pushes);
    expect(pushes[0]).toMatch(/<emotion value="excited"\/>/);
    expect(liftLog).toHaveBeenCalledWith(
      expect.objectContaining({
        lifted: true,
        reason: 'lifted',
        sentEmotion: 'excited',
        sentSpeed: 1.08,
        callerTextLen: 'I got the job!!'.length,
        callerTextIsThisTurn: true,
      }),
      'EMOTION_LIFT'
    );
    expect(JSON.stringify(liftLog.mock.calls)).not.toContain('job');
  });
});
