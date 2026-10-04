/**
 * Ferni's spoken replies are recorded (without speech markup) so conversation
 * history has both sides; user, system and handoff items are left alone.
 */
import { describe, expect, it, vi } from 'vitest';
import { assistantTranscriptHandler, transcriptText } from '../assistant-transcript.js';

const ctx = { userId: 'u1', sessionId: 's1', personaId: 'ferni', threadId: 't1' };
const setup = (context: Partial<typeof ctx> = ctx) => {
  const record = vi.fn(async () => undefined);
  const handler = assistantTranscriptHandler(() => ({ sessionId: 's1', ...context }), record);
  return { record, handler };
};
const added = (item: Record<string, unknown>) => ({ type: 'conversation_item_added', item });

describe('assistantTranscriptHandler', () => {
  it('records what Ferni said, without the speech markup', () => {
    const { record, handler } = setup();
    handler(
      added({
        type: 'message',
        role: 'assistant',
        textContent: '<emotion value="calm"/>Oh wow. [laughter] <break time="600ms"/>Tell me more.',
      })
    );
    expect(record).toHaveBeenCalledWith({
      userId: 'u1',
      sessionId: 's1',
      personaId: 'ferni',
      threadId: 't1',
      content: 'Oh wow. Tell me more.',
      interrupted: false,
    });
  });

  it('marks a reply the user cut off', () => {
    const { record, handler } = setup();
    handler(
      added({
        type: 'message',
        role: 'assistant',
        textContent: 'So the thing is',
        interrupted: true,
      })
    );
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ interrupted: true }));
  });

  it('ignores user, system and handoff items, and empty replies', () => {
    const { record, handler } = setup();
    handler(added({ type: 'message', role: 'user', textContent: 'hi' }));
    handler(added({ type: 'message', role: 'system', textContent: 'note' }));
    handler(added({ type: 'agent_handoff', role: 'assistant' }));
    handler(added({ type: 'message', role: 'assistant', textContent: '<break time="600ms"/>' }));
    handler({});
    expect(record).not.toHaveBeenCalled();
  });

  it('skips when the user is unknown', () => {
    const { record, handler } = setup({ userId: undefined });
    handler(added({ type: 'message', role: 'assistant', textContent: 'hello' }));
    expect(record).not.toHaveBeenCalled();
  });
});

describe('transcriptText', () => {
  it('keeps the words and drops tags', () => {
    expect(transcriptText('<speed ratio="0.9"/>Take your time.')).toBe('Take your time.');
    expect(transcriptText('plain words')).toBe('plain words');
  });
});
