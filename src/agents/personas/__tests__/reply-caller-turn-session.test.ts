/**
 * The caller's words each reply answers, on a real SDK AgentSession with a real
 * PersonaVoiceAgent (reply-caller-turn.ts, noted in ferni-agent.ts llmNode).
 *
 * The model reads the TTS context the moment it is asked, which is after
 * llmNode noted the turn and where ttsNode reads it (ferni-agent.ts ttsNode ->
 * extractTtsSessionContext). Text-only sessions never call ttsNode, so this
 * read stands in for it.
 *
 * - The reply after a tool step runs llmNode on [caller, "Let me check.", tool
 *   call, tool result] with no new caller message: it still answers the
 *   caller's question (SDK agent_activity.js tool reply).
 * - A say() line goes straight to ttsNode: it must not reuse the last reply's
 *   words as fresh.
 * - Removing the noteReplyCallerTurn call from llmNode fails these tests.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PersonaVoiceAgent } from '../ferni-agent.js';
import { extractTtsSessionContext } from '../../shared/tts-wrapper.js';

initializeLogger({ pretty: false, level: 'warn' });

interface Heard {
  userRequest?: string;
  callerTurnFresh?: boolean;
}
const STALE = 'the previous turn, still in lastUserMessage';

/** Keyed on a fragment of the request's last item (the turn reminder rides on the caller's words). */
class ReadingLLM extends voice.testing.FakeLLM {
  readonly heard: Heard[] = [];
  agent?: voice.Agent;
  constructor(private readonly script: voice.testing.FakeLLMResponse[]) {
    super(script);
  }
  lookup(input: string) {
    const hit = this.script.find((r) => input.includes(r.input));
    if (hit && this.agent) {
      const { userRequest, callerTurnFresh } = extractTtsSessionContext(this.agent, 'ferni');
      this.heard.push({ userRequest, callerTurnFresh });
    }
    return hit ? super.lookup(hit.input) : undefined;
  }
}

const lookup = (name: string, output: string) =>
  llm.tool({
    description: `Look up ${name}.`,
    parameters: z.object({ q: z.string() }),
    execute: async () => output,
  });

async function startSession(script: voice.testing.FakeLLMResponse[]) {
  const model = new ReadingLLM(script);
  const agent = new PersonaVoiceAgent('You are Ferni.', {
    tools: {
      getWeather: lookup('the weather', 'seventy-two and sunny'),
      getTraffic: lookup('the traffic', 'the bridge is clear'),
    } as unknown as llm.ToolContext,
    skipGreeting: true,
  });
  model.agent = agent as unknown as voice.Agent;
  const session = new voice.AgentSession({
    llm: model,
    userData: { personaId: 'ferni', lastUserMessage: STALE },
  });
  await session.start({ agent });
  const say = async (userInput: string) => {
    const result = session.run({ userInput });
    await result.wait();
  };
  return { model, agent, session, say };
}

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('the caller turn a reply answers, on a real agent session', () => {
  it('the reply after a tool step still answers the question that started it', async () => {
    const asked = 'what is the weather in Tampa?';
    const { model, session, say } = await startSession([
      {
        input: asked,
        content: 'Let me check.',
        toolCalls: [{ name: 'getWeather', args: { q: 'Tampa' } }],
      },
      { input: 'seventy-two and sunny', content: "It's seventy-two and sunny." },
    ]);
    await say(asked);
    await session.close();
    expect(model.heard).toEqual([
      { userRequest: asked, callerTurnFresh: true },
      { userRequest: asked, callerTurnFresh: true }, // was undefined: stopped at "Let me check."
    ]);
  }, 90_000);

  it('chained tool steps all answer the same question', async () => {
    const asked = 'should I leave now for the airport?';
    const { model, session, say } = await startSession([
      {
        input: asked,
        content: 'Let me look.',
        toolCalls: [{ name: 'getWeather', args: { q: 'x' } }],
      },
      {
        input: 'seventy-two and sunny',
        content: 'And the roads.',
        toolCalls: [{ name: 'getTraffic', args: { q: 'x' } }],
      },
      { input: 'the bridge is clear', content: 'Yes, go now.' },
    ]);
    await say(asked);
    await session.close();
    expect(model.heard).toHaveLength(3);
    for (const heard of model.heard)
      expect(heard).toEqual({ userRequest: asked, callerTurnFresh: true });
  }, 90_000);

  it('two replies each read their own turn; a say() line after them is not fresh', async () => {
    const { model, agent, session, say } = await startSession([
      { input: 'I got the job!', content: 'Congrats!' },
      { input: 'it starts Monday', content: 'So soon.' },
    ]);
    await say('I got the job!');
    await say('it starts Monday');
    expect(model.heard).toEqual([
      { userRequest: 'I got the job!', callerTurnFresh: true },
      { userRequest: 'it starts Monday', callerTurnFresh: true },
    ]);
    // session.say() runs ttsNode with no llmNode: the note was the reply's, already read.
    const sayLine = extractTtsSessionContext(agent as unknown as voice.Agent, 'ferni');
    await session.close();
    expect(sayLine.callerTurnFresh).toBe(false);
    expect(sayLine.userRequest).toBe(STALE); // as before #1838: userData.lastUserMessage
  }, 90_000);
});
