/**
 * Live Transcription Service
 *
 * The voice agent never sends `user_transcript` / `agent_transcript` data
 * messages. LiveKit agents-js (RoomIO, transcriptionEnabled by default)
 * publishes every transcript as a text stream on the `lk.transcription` topic:
 * - user speech: one stream per interim result with the full text so far,
 *   then a last one with `lk.transcription_final: "true"`;
 * - agent speech: one stream per spoken segment, written as deltas and closed
 *   when the segment ends (synced to the audio, so it is what the user heard).
 *
 * This service reads those streams. It shows them live (the `ferni:transcript`
 * window event, rendered by transcriptUI in app.ts) and hands each finished
 * utterance to the data-message handlers as `user_transcript` /
 * `agent_transcript`, which feed the conversation tracker, journal capture and
 * repeat-last.
 *
 * @module services/live-transcription
 */

import type { DataMessage } from '../types/events.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LiveTranscription');

/** Text-stream topic agents-js publishes transcriptions on. */
export const TRANSCRIPTION_TOPIC = 'lk.transcription';
const ATTR_FINAL = 'lk.transcription_final';
const ATTR_TRACK_ID = 'lk.transcribed_track_id';

/** The livekit-client TextStreamReader surface this service uses. */
export interface TranscriptionStreamReader extends AsyncIterable<string> {
  readonly info: { readonly id: string; readonly attributes?: Record<string, string> };
}

type TextStreamHandler = (
  reader: TranscriptionStreamReader,
  participant: { identity: string }
) => void;

/** The livekit-client Room surface this service uses (livekit-client ≥ 2.9). */
export interface TranscriptionRoom {
  localParticipant: {
    identity: string;
    getTrackPublications?(): Array<{ trackSid: string }>;
  };
  registerTextStreamHandler(topic: string, handler: TextStreamHandler): void;
  unregisterTextStreamHandler(topic: string): void;
}

export type TranscriptSpeaker = 'user' | 'agent';

function supportsTextStreams(room: object): room is TranscriptionRoom {
  const candidate = room as Partial<TranscriptionRoom>;
  return (
    typeof candidate.registerTextStreamHandler === 'function' &&
    typeof candidate.unregisterTextStreamHandler === 'function' &&
    typeof candidate.localParticipant === 'object'
  );
}

/**
 * User transcripts are published on behalf of the user (sender identity is the
 * user) and name the user's own microphone track; anything else is the agent.
 */
function speakerOf(
  room: TranscriptionRoom,
  reader: TranscriptionStreamReader,
  participant: { identity: string }
): TranscriptSpeaker {
  const local = room.localParticipant;
  if (participant.identity === local.identity) return 'user';
  const trackId = reader.info.attributes?.[ATTR_TRACK_ID];
  const ownTracks = local.getTrackPublications?.() ?? [];
  if (trackId && ownTracks.some((publication) => publication.trackSid === trackId)) return 'user';
  return 'agent';
}

function showLive(speaker: TranscriptSpeaker, text: string, isFinal: boolean): void {
  window.dispatchEvent(
    new CustomEvent('ferni:transcript', { detail: { type: speaker, text, isFinal } })
  );
}

async function readTranscription(
  reader: TranscriptionStreamReader,
  speaker: TranscriptSpeaker,
  onTranscript: (message: DataMessage) => void
): Promise<void> {
  let text = '';
  for await (const chunk of reader) {
    text += chunk;
    if (speaker === 'agent') showLive('agent', text, false);
  }
  text = text.trim();
  if (!text) return;

  if (speaker === 'agent') {
    showLive('agent', text, true);
    onTranscript({ type: 'agent_transcript', text });
    return;
  }

  const isFinal = reader.info.attributes?.[ATTR_FINAL] === 'true';
  showLive('user', text, isFinal);
  if (isFinal) onTranscript({ type: 'user_transcript', text });
}

/**
 * Start reading live transcriptions from a connected room.
 *
 * @param room - the LiveKit room (the UMD `LivekitClient.Room` instance)
 * @param onTranscript - receives each finished utterance as a data message
 * @returns a cleanup that stops reading
 */
export function attachLiveTranscription(
  room: object,
  onTranscript: (message: DataMessage) => void
): () => void {
  if (!supportsTextStreams(room)) {
    log.warn('LiveKit client has no text streams; live transcripts are unavailable');
    return () => undefined;
  }

  try {
    room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader, participant) => {
      const speaker = speakerOf(room, reader, participant);
      readTranscription(reader, speaker, onTranscript).catch((error: unknown) => {
        log.warn('Transcription stream ended abnormally', {
          speaker,
          streamId: reader.info.id,
          error: String(error),
        });
      });
    });
  } catch (error) {
    // Thrown when a handler is already registered for the topic on this room.
    log.warn('Could not register the transcription handler', { error: String(error) });
    return () => undefined;
  }

  return () => {
    try {
      room.unregisterTextStreamHandler(TRANSCRIPTION_TOPIC);
    } catch (error) {
      log.debug('Transcription handler already removed', { error: String(error) });
    }
  };
}
