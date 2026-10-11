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
  call: Omit<TeamRoundtableConfig, 'roundtable' | 'createAgent' | 'userId'> & {
    userId?: string;
    createRoundtableAgent?: TeamRoundtableConfig['createAgent'];
  },
  message: { personas: string[]; topic?: string; collaborationMode?: string },
  on: { speaker: (speakerId: string | null) => void; crisis: () => void }
): { roundtable: TeamRoundtable; detachTurns: () => void } {
  if (!call.createRoundtableAgent) throw new Error('Roundtable not configured');
  const { ctx, room, userParticipant, sessionId, userId } = call;
  const base = { ctx, room, userParticipant, sessionId, userId: userId ?? 'anonymous' };
  const roundtable = new TeamRoundtable({
    ...base,
    createAgent: call.createRoundtableAgent,
    roundtable: {
      personas: message.personas,
      topic: message.topic,
      collaborationMode: (message.collaborationMode as CollaborationMode) ?? 'discussion',
      moderator: 'ferni',
    },
  });
  roundtable.on('speaker_changed', ({ speakerId }: { speakerId: string | null }) =>
    on.speaker(speakerId)
  );
  return { roundtable, detachTurns: attachRoundtableTurns(base.sessionId, roundtable, on.crisis) };
}
