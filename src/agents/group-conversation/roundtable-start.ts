/**
 * Opening a team roundtable on a call: build it, show who's speaking, and send the
 * person's turns to it (roundtable-turns.ts). The caller announces it and then awaits
 * roundtable.start(), so the web shows the grid while the moderator opens.
 *
 * @module agents/group-conversation/roundtable-start
 */
import { attachRoundtableTurns } from './roundtable-turns.js';
import { TeamRoundtable, type TeamRoundtableConfig } from './team-roundtable.js';
import type { CollaborationMode } from './types.js';

export function openRoundtable(
  base: Omit<TeamRoundtableConfig, 'roundtable'>,
  message: { personas: string[]; topic?: string; collaborationMode?: string },
  onSpeaker: (speakerId: string | null) => void
): { roundtable: TeamRoundtable; detachTurns: () => void } {
  const roundtable = new TeamRoundtable({
    ...base,
    roundtable: {
      personas: message.personas,
      topic: message.topic,
      collaborationMode: (message.collaborationMode as CollaborationMode) ?? 'discussion',
      moderator: 'ferni',
    },
  });
  roundtable.on('speaker_changed', ({ speakerId }: { speakerId: string | null }) =>
    onSpeaker(speakerId)
  );
  return { roundtable, detachTurns: attachRoundtableTurns(base.sessionId, roundtable) };
}
