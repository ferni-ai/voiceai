/**
 * gateWordsFor: the caller's words the reply gate will score, rebuilt from a turn hook's chat
 * context and its new message, through the gate's own callerWords (crisis-gate-words.ts).
 * Fictional lines.
 */
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { callerWords } from '../../../personas/crisis-gate-words.js';
import { gateWordsFor } from '../gate-words.js';

function chat(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

describe('gateWordsFor', () => {
  it('adds the new message the hook has not got yet', () => {
    expect(gateWordsFor(chat(), 'I want to die')).toBe('I want to die');
  });

  it('joins every caller message since Ferni last spoke, as the gate does', () => {
    const hook = chat(['assistant', 'How are you?'], ['user', "I'm not saying"]);
    expect(gateWordsFor(hook, 'I want to die')).toBe("I'm not saying I want to die");
    const request = chat(
      ['assistant', 'How are you?'],
      ['user', "I'm not saying"],
      ['user', 'I want to die']
    );
    expect(gateWordsFor(hook, 'I want to die')).toBe(callerWords(request).latest);
  });

  it('never counts a message twice when the context already holds it', () => {
    const ctx = chat(['user', "I'm not saying"], ['user', 'I want to die']);
    expect(gateWordsFor(ctx, 'I want to die')).toBe("I'm not saying I want to die");
  });

  it("starts after Ferni's last line", () => {
    const hook = chat(['user', "I'm not saying"], ['assistant', "I'm listening."]);
    expect(gateWordsFor(hook, 'I want to die')).toBe('I want to die');
  });

  it("leaves the hook's context as it was", () => {
    const hook = chat(['user', "I'm not saying"]);
    gateWordsFor(hook, 'I want to die');
    expect(hook.items).toHaveLength(2);
  });
});
