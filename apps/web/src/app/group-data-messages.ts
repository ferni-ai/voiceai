/**
 * Group conversation data messages (agent → web).
 *
 * The agent's GroupVoiceIntegration (src/agents/group-conversation/voice-integration.ts)
 * publishes group_* messages on the room's data channel. This module turns them
 * into group-conversation.ui.ts state: who is in the room, who is speaking,
 * when a roundtable starts or ends, and a translated toast when the agent
 * reports an error. data-message-handlers.ts only delegates here.
 *
 * Payload shapes are the agent's GroupDataChannelResponse (plus the
 * group_speaker_changed broadcast). Participant ids follow the agent's registry:
 * `agent_<personaId>`, `user_<identity>`, `ext_<callSid>`.
 */

import { t } from '../i18n/index.js';
import { toast } from '../ui/whisper.ui.js';
import { groupConversationUI } from '../ui/group-conversation.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('GroupDataMessages');

type GroupParticipant = Parameters<typeof groupConversationUI.addParticipant>[0];

/** Id of the signed-in user when the agent hasn't named them (roundtable start). */
const HUMAN_ID = 'user';

const PERSONA_NAMES: Record<string, string> = {
  ferni: 'Ferni',
  'peter-john': 'Peter',
  'maya-habits': 'Maya',
  'alex-chen': 'Alex',
  'jordan-taylor': 'Jordan',
  'nayan-sharma': 'Nayan',
};

const PARTICIPANT_TYPES = ['human', 'agent', 'external'] as const;

/** Who the grid shows. The UI keeps its own copy; this one survives a redraw. */
const roster = new Map<string, GroupParticipant>();
/** Phone participants dialed but not yet connected: name by participant id. */
const dialing = new Map<string, string>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

function human(id = HUMAN_ID, name = t('common.you')): GroupParticipant {
  return { id, name, type: 'human', role: 'initiator', isSpeaking: false };
}

function agent(personaId: string): GroupParticipant {
  return {
    id: `agent_${personaId}`,
    name: PERSONA_NAMES[personaId] ?? personaId,
    type: 'agent',
    role: personaId === 'ferni' ? 'moderator' : 'expert',
    isSpeaking: false,
  };
}

function showRoster(): void {
  groupConversationUI.showParticipantGrid(Array.from(roster.values()));
}

function resetRoster(participants: GroupParticipant[]): void {
  roster.clear();
  for (const p of participants) roster.set(p.id, p);
  showRoster();
}

function join(participant: GroupParticipant): void {
  roster.set(participant.id, participant);
  if (groupConversationUI.isGroupActive()) {
    groupConversationUI.addParticipant(participant);
    return;
  }
  if (!Array.from(roster.values()).some((p) => p.type === 'human')) {
    resetRoster([human(), ...roster.values()]);
  } else {
    showRoster();
  }
  toast.success(t('toasts.participantJoined', { name: participant.name }));
}

function clear(): void {
  roster.clear();
  dialing.clear();
  groupConversationUI.hideParticipantGrid();
}

/** The agent names the user `user_<identity>`; a speaker id may not match the roster verbatim. */
function resolveSpeaker(speakerId: unknown): string | null {
  const id = str(speakerId);
  if (!id) return null;
  if (roster.has(id)) return id;
  if (id.startsWith('user_')) {
    return Array.from(roster.values()).find((p) => p.type === 'human')?.id ?? null;
  }
  return null;
}

function onRoundtableStarted(message: Record<string, unknown>): void {
  const personas = Array.isArray(message['personas'])
    ? message['personas'].filter((p): p is string => typeof p === 'string' && p !== '')
    : [];
  if (personas.length === 0) {
    log.warn('group_roundtable_started without personas', { sessionId: message['sessionId'] });
    return;
  }
  const external = Array.from(roster.values()).filter((p) => p.type === 'external');
  resetRoster([human(), ...personas.map(agent), ...external]);
  toast.success(t('groupConversation.roundtableStarted'));
}

function onRoundtableEnded(): void {
  const rest = Array.from(roster.values()).filter((p) => p.type !== 'agent');
  if (rest.every((p) => p.type === 'human')) {
    clear();
  } else {
    resetRoster(rest); // a phone call is still going
  }
  toast.info(t('groupConversation.roundtableEnded'));
}

function onCallParticipantAdded(message: Record<string, unknown>): void {
  const id = str(message['participantId']);
  const name = str(message['name']);
  if (!id || !name) return;
  if (message['status'] === 'connected') {
    join({ id, name, type: 'external', role: 'participant', isSpeaking: false });
    return;
  }
  dialing.set(id, name); // not in the room yet: dialing or ringing
  toast.info(t('groupConversation.calling', { name }));
}

function onCallParticipantStatus(message: Record<string, unknown>): void {
  const id = str(message['participantId']);
  const name = id ? dialing.get(id) : undefined;
  if (!id || !name || message['status'] !== 'connected') return;
  dialing.delete(id);
  join({ id, name, type: 'external', role: 'participant', isSpeaking: false });
}

function onCallParticipantRemoved(message: Record<string, unknown>): void {
  const id = str(message['participantId']);
  if (!id) return;
  const pending = dialing.get(id);
  if (pending !== undefined) {
    dialing.delete(id);
    toast.info(t('groupConversation.callNotConnected', { name: pending }));
    return;
  }
  if (!roster.delete(id)) return;
  groupConversationUI.removeParticipant(id);
  if (Array.from(roster.values()).every((p) => p.type === 'human')) clear();
}

/** group_state: the agent's full picture. An empty one changes nothing. */
function onState(message: Record<string, unknown>): void {
  if (message['mode'] === null) {
    clear();
    return;
  }
  const listed = Array.isArray(message['participants']) ? message['participants'] : [];
  const participants: GroupParticipant[] = [];
  for (const entry of listed) {
    if (!isRecord(entry)) continue;
    const id = str(entry['id']);
    const name = str(entry['name']);
    const type = PARTICIPANT_TYPES.find((candidate) => candidate === entry['type']);
    if (!id || !name || !type) continue;
    participants.push({
      id,
      name,
      type,
      role: type === 'human' ? 'initiator' : id === 'agent_ferni' ? 'moderator' : 'expert',
      isSpeaking: entry['isSpeaking'] === true,
    });
  }
  if (participants.length > 0) resetRoster(participants);
}

function onError(message: Record<string, unknown>): void {
  log.warn('group_error from agent', { error: message['error'] });
  toast.error(t('groupConversation.errorGeneric'));
}

/**
 * Handle one agent data message. Returns true when it was a group_* message
 * (handled or ignored as malformed), false when it belongs to someone else.
 */
export function handleGroupDataMessage(message: unknown): boolean {
  if (!isRecord(message)) return false;
  switch (message['type']) {
    case 'group_roundtable_started':
      onRoundtableStarted(message);
      return true;
    case 'group_roundtable_ended':
      onRoundtableEnded();
      return true;
    case 'group_call_participant_added':
      onCallParticipantAdded(message);
      return true;
    case 'group_call_participant_status':
      onCallParticipantStatus(message);
      return true;
    case 'group_call_participant_removed':
      onCallParticipantRemoved(message);
      return true;
    case 'group_speaker_changed':
      groupConversationUI.highlightSpeaker(resolveSpeaker(message['speakerId']));
      return true;
    case 'group_state':
      onState(message);
      return true;
    case 'group_error':
      onError(message);
      return true;
    default:
      return false;
  }
}

/** Test seam: forget everything shown so far. */
export function resetGroupDataMessages(): void {
  clear();
}
