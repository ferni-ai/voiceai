/**
 * Natural speech pattern guidance for speech-to-speech text translation.
 * Stub module for Qwen3-Omni SSML-to-text translation.
 */

export interface NaturalSpeechInput {
  personaId: string;
  emotion: string;
}

export interface NaturalSpeechPatterns {
  useContractions: boolean;
  fillers: string[];
  hedging: boolean;
  allowIncomplete: boolean;
}

export function getNaturalSpeechPatterns(input: NaturalSpeechInput): NaturalSpeechPatterns {
  const { emotion } = input;

  const isEmotional = ['sad', 'grief', 'anxious', 'vulnerable'].includes(emotion);

  return {
    useContractions: true,
    fillers: isEmotional ? ['um', 'you know'] : ['like', 'you know', 'honestly'],
    hedging: isEmotional,
    allowIncomplete: isEmotional,
  };
}
