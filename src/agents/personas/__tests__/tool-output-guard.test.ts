/**
 * No tool result reaches the model empty (tool-output-guard.ts).
 *
 * Dev call 2026-10-12: playMusic started the music and returned '', the model
 * read `""` and Peter said "I don't actually have a way to spin tunes". The
 * turn runs here on a real SDK AgentSession with a real PersonaVoiceAgent:
 * the model's second request (after the tool) must carry an explicit result.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PersonaVoiceAgent } from '../ferni-agent.js';
import { emptyToolOutputText, fillEmptyToolOutputs } from '../tool-output-guard.js';
import { REMEMBERED, REMEMBERED_THIS_CALL } from '../../../tools/domains/memory/tools.js';

initializeLogger({ pretty: false, level: 'warn' });

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function contextWith(name: string, output: string): llm.ChatContext {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Hey, can you play some music?' });
  chat.insert([
    llm.FunctionCall.create({ callId: `call-${name}`, name, args: '{}' }),
    llm.FunctionCallOutput.create({ callId: `call-${name}`, name, output, isError: false }),
  ]);
  return chat;
}

const outputOf = (chat: llm.ChatContext) => (chat.items.at(-1) as llm.FunctionCallOutput).output;

describe('fillEmptyToolOutputs', () => {
  it.each(['""', '', 'null', '  '])('turns an empty result (%j) into an explicit one', (raw) => {
    const chat = contextWith('playMusic', raw);
    expect(fillEmptyToolOutputs(chat, 's1')).toBe(1);
    expect(outputOf(chat)).toBe(JSON.stringify('playMusic ran; no details returned.'));
    // Idempotent: the filled result is not filled again.
    expect(fillEmptyToolOutputs(chat, 's1')).toBe(0);
  });

  it('leaves real results and handoffs alone', () => {
    const real = contextWith('getWeather', JSON.stringify('72 and sunny'));
    const handoff = contextWith('handoffToPeter', '');
    expect(fillEmptyToolOutputs(real) + fillEmptyToolOutputs(handoff)).toBe(0);
    expect(outputOf(real)).toBe(JSON.stringify('72 and sunny'));
    expect(outputOf(handoff)).toBe('');
  });

  it('TOOL_EMPTY_RESULT_GUARD=off leaves the context exactly as it was', () => {
    const chat = contextWith('playMusic', '""');
    expect(fillEmptyToolOutputs(chat, 's1', { TOOL_EMPTY_RESULT_GUARD: 'off' })).toBe(0);
    expect(outputOf(chat)).toBe('""');
  });

  it('names the tool, or says "The tool" when the name is missing', () => {
    expect(emptyToolOutputText('rememberAboutUser')).toBe(
      'rememberAboutUser ran; no details returned.'
    );
    expect(emptyToolOutputText('')).toBe('The tool ran; no details returned.');
  });
});

describe('rememberAboutUser says what happened', () => {
  it('has short, non-empty results for saved and not saved', () => {
    expect(REMEMBERED).toMatch(/saved/i);
    expect(REMEMBERED_THIS_CALL).toMatch(/couldn't be saved/i);
  });
});

/** FakeLLM keyed on a fragment of the request's last item, since the turn reminder rides on the user's words. */
class ScriptLLM extends voice.testing.FakeLLM {
  readonly seen: string[] = [];
  constructor(private readonly script: voice.testing.FakeLLMResponse[]) {
    super(script);
  }
  lookup(input: string) {
    this.seen.push(input);
    const hit = this.script.find((r) => input.includes(r.input));
    return hit ? super.lookup(hit.input) : undefined;
  }
}

describe('a music request on a real agent session', () => {
  async function run(env: Record<string, string>) {
    Object.assign(process.env, env);
    // The tool as it behaved on the dev call: music started, '' returned.
    const playMusic = llm.tool({
      description: 'Play music.',
      parameters: z.object({ query: z.string() }),
      execute: async () => '',
    });
    const model = new ScriptLLM([
      {
        input: 'can you play some music',
        toolCalls: [{ name: 'playMusic', args: { query: 'relaxing late night music' } }],
      },
      { input: emptyToolOutputText('playMusic'), content: "Okay, it's on." },
      { input: '""', content: "I don't actually have a way to spin tunes." },
    ]);
    const agent = new PersonaVoiceAgent('You are Peter.', {
      tools: { playMusic } as unknown as llm.ToolContext,
      skipGreeting: true,
    });
    const session = new voice.AgentSession({ llm: model, userData: { personaId: 'peter-john' } });
    await session.start({ agent });
    const result = session.run({ userInput: 'Hey, can you play some music?' });
    await result.wait();
    const said = result.events
      .filter((e) => e.type === 'message')
      .map((e) => (e as { item: llm.ChatMessage }).item.textContent)
      .join(' ');
    await session.close();
    return { said, seen: model.seen };
  }

  it('the model reads "playMusic ran; no details returned." and does not deny the music', async () => {
    const { said, seen } = await run({});
    expect(seen.at(-1)).toBe(JSON.stringify(emptyToolOutputText('playMusic')));
    expect(said).toContain("Okay, it's on.");
    expect(said).not.toContain('spin tunes');
  });

  it('with the guard off, the model reads "" (the dev call)', async () => {
    const { said, seen } = await run({ TOOL_EMPTY_RESULT_GUARD: 'off' });
    expect(seen.at(-1)).toBe('""');
    expect(said).toContain('spin tunes');
  });
});
