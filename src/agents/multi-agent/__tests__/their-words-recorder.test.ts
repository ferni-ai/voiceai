import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { TheirWords } from '../../../conversation/their-words.js';
import { applyStoredWords, wireTheirWordsRecorder } from '../their-words-recorder.js';

describe('wireTheirWordsRecorder', () => {
  it('picks up their words from committed turns and saves only what changed', () => {
    const emitter = new EventEmitter();
    const userData: { theirWords?: TheirWords } = {};
    const saved: TheirWords[] = [];
    wireTheirWordsRecorder(
      { on: (e, h) => emitter.on(e, h), off: (e, h) => emitter.off(e, h) },
      userData,
      (w) => saved.push(w)
    );
    const user = (text: string) =>
      emitter.emit('conversation_item_added', { item: { role: 'user', textContent: text } });
    user('My bestie and I went hiking');
    user('My bestie says hi');
    expect(userData.theirWords).toEqual({ 'best friend': 'my bestie' });
    expect(saved).toEqual([{ 'best friend': 'my bestie' }]);
  });

  it('adds stored words without overriding ones heard this call', () => {
    const userData: { theirWords?: TheirWords } = { theirWords: { partner: 'my person' } };
    applyStoredWords(userData, { partner: 'my hubby', pet: 'my fur baby' });
    expect(userData.theirWords).toEqual({ partner: 'my person', pet: 'my fur baby' });
  });
});
