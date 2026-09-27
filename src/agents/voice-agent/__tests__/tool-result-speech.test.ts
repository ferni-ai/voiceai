/**
 * Only OpenAI Realtime (createResponse=false) needs us to ask for a reply
 * after a tool result. The check used to be "not Gemini Live", so the
 * cascade asked too: every music call produced a second reply that called
 * playMusic again (three tracks for one request on a live call), timed out
 * at 6s and fell back to canned "Done!".
 */
import { describe, expect, it } from 'vitest';
import { needsExplicitToolResultReply } from '../tool-result-speech.js';

describe('needsExplicitToolResultReply', () => {
  it('is true only for OpenAI Realtime', () => {
    expect(needsExplicitToolResultReply('openai-realtime')).toBe(true);
    for (const id of ['cartesia-cascade', 'gemini-live', 'gemini-native-audio']) {
      expect(needsExplicitToolResultReply(id)).toBe(false);
    }
  });
});
