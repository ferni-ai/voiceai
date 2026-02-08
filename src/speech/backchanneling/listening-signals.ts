/**
 * Active listening signals for speech-to-speech text guidance.
 * Stub module for Qwen3-Omni SSML-to-text translation.
 */

export interface ListeningSignalInput {
  emotion: string;
  intensity: number;
}

export function getListeningSignals(input: ListeningSignalInput): string[] {
  const { emotion, intensity } = input;

  const signals: Record<string, string[]> = {
    sad: ['I hear that', 'That sounds really hard'],
    anxious: ['Take your time', "I'm here"],
    happy: ['I love hearing that', "That's great"],
    frustrated: ['I understand', 'That makes sense'],
    neutral: ['I see', 'Got it'],
    vulnerable: ['Thank you for sharing that'],
    grief: ['I appreciate you telling me this'],
  };

  const base = signals[emotion] ?? signals.neutral;
  return intensity > 0.6 ? base : base.slice(0, 1);
}
