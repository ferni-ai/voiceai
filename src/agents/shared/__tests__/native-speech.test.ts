/**
 * When Gemini Live speaks, every line must come from the model: a scripted
 * say() (greeting, handoff line, recovery line) would otherwise be voiced by the
 * Cartesia TTS or played from pre-rendered Cartesia audio, so one call
 * alternates between two voices. Found on a ferni-dev test call, 2026-09-27.
 */
import { describe, expect, it, vi } from 'vitest';
import { routeSayThroughModel, sayExactlyInstruction } from '../native-speech.js';

function fakeSession() {
  const say = vi.fn((_text: unknown, _options?: unknown) => 'say-handle');
  const generateReply = vi.fn((_options: { instructions: string; allowInterruptions?: boolean }) => 'reply-handle');
  return { say, generateReply, originalSay: say };
}

describe('routeSayThroughModel', () => {
  it('turns a scripted line into a model reply instead of TTS', () => {
    const s = fakeSession();
    routeSayThroughModel(s);
    const handle = s.say('Hey, good to hear from you.', { allowInterruptions: false });
    expect(handle).toBe('reply-handle');
    expect(s.originalSay).not.toHaveBeenCalled();
    expect(s.generateReply).toHaveBeenCalledWith({
      instructions: sayExactlyInstruction('Hey, good to hear from you.'),
      allowInterruptions: false,
    });
  });

  it('ignores pre-rendered Cartesia audio and still lets the model speak', () => {
    const s = fakeSession();
    routeSayThroughModel(s);
    s.say('Welcome back.', { audio: {} as never });
    expect(s.originalSay).not.toHaveBeenCalled();
    expect(s.generateReply).toHaveBeenCalledTimes(1);
  });

  it('strips Cartesia markup from the scripted text', () => {
    const s = fakeSession();
    routeSayThroughModel(s);
    s.say('<emotion value="curious"/>Hey!<break time="80ms"/> [laughter] How are you?');
    const { instructions } = s.generateReply.mock.calls[0][0];
    expect(instructions).toContain('Hey! How are you?');
    expect(instructions).not.toMatch(/<|\[laughter\]/);
  });

  it('leaves streamed text on the original path', () => {
    const s = fakeSession();
    routeSayThroughModel(s);
    const stream = new ReadableStream<string>();
    s.say(stream);
    expect(s.originalSay).toHaveBeenCalledWith(stream, undefined);
  });
});
