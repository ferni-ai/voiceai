/**
 * One caption line, shared by live-captions.ts and the Heard helpers.
 * Lives on its own so heard-turn.ts and heard-check.ts can use the type
 * without importing live-captions.ts, which imports them (an import cycle).
 */
export type CaptionSpeaker = 'user' | 'agent';

export interface CaptionEntry {
  speaker: CaptionSpeaker;
  text: string;
  final: boolean;
}
