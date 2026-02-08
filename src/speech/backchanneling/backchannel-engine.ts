/**
 * Backchannel response engine for speech-to-speech text guidance.
 * Stub module for Qwen3-Omni SSML-to-text translation.
 */

export interface BackchannelContext {
  userEmotion: string;
  turnCount: number;
}

export interface BackchannelResponse {
  shouldUse: boolean;
  phrase: string;
}

export function getBackchannelResponse(context: BackchannelContext): BackchannelResponse {
  const phrases: Record<string, string> = {
    sad: 'I hear you',
    anxious: "I'm listening",
    happy: "That's wonderful",
    frustrated: 'I get that',
    neutral: 'Mmhmm',
    excited: 'Yes!',
    vulnerable: "I'm right here",
  };

  return {
    shouldUse: context.turnCount > 1,
    phrase: phrases[context.userEmotion] ?? 'Mmhmm',
  };
}
