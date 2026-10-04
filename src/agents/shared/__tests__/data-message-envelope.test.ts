/**
 * Data-message envelope: a payload's own `type` must never replace the
 * message type on the live-call data channel.
 */

import { describe, expect, it } from 'vitest';
import {
  buildDataMessage,
  createDataMessageSender,
  DEFAULT_PAYLOAD_TYPE_FIELD,
  type DataMessageRoom,
} from '../data-message-envelope.js';
import { FrontendPublisher } from '../../realtime/frontend-publisher.js';

function capturingRoom(): { room: DataMessageRoom; sent: Array<Record<string, unknown>> } {
  const sent: Array<Record<string, unknown>> = [];
  const room: DataMessageRoom = {
    localParticipant: {
      publishData: async (data) => {
        sent.push(JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>);
      },
    },
  };
  return { room, sent };
}

describe('buildDataMessage', () => {
  it('keeps the message type and moves a behavior signal kind to signalType', () => {
    const msg = buildDataMessage('behavior_signal', { type: 'mode_shift', mode: 'presence' });
    expect(msg).toEqual({ type: 'behavior_signal', signalType: 'mode_shift', mode: 'presence' });
  });

  it('maps each receiver field: trust_signal→signalType, avatar_cue→anticipatoryType, speech_state→innerType', () => {
    expect(buildDataMessage('trust_signal', { type: 'celebration_opportunity' })).toMatchObject({
      type: 'trust_signal',
      signalType: 'celebration_opportunity',
    });
    expect(buildDataMessage('avatar_cue', { type: 'anticipatory_response' })).toMatchObject({
      type: 'avatar_cue',
      anticipatoryType: 'anticipatory_response',
    });
    expect(buildDataMessage('speech_state', { type: 'speech_pause' })).toMatchObject({
      type: 'speech_state',
      innerType: 'speech_pause',
    });
  });

  it('keeps an unmapped payload type under the default field', () => {
    expect(buildDataMessage('some_message', { type: 'kind' })).toEqual({
      type: 'some_message',
      [DEFAULT_PAYLOAD_TYPE_FIELD]: 'kind',
    });
  });

  it('does not overwrite a field the payload already sets, and drops a type equal to the message type', () => {
    expect(buildDataMessage('trust_signal', { type: 'x', signalType: 'growth' })).toEqual({
      type: 'trust_signal',
      signalType: 'growth',
    });
    expect(buildDataMessage('feedback_prompt', { type: 'feedback_prompt', id: 1 })).toEqual({
      type: 'feedback_prompt',
      id: 1,
    });
  });
});

describe('generic senders', () => {
  it('createDataMessageSender publishes the enveloped message', async () => {
    const { room, sent } = capturingRoom();
    await createDataMessageSender(room)('behavior_signal', { type: 'hold_space', duration: 3000 });
    expect(sent).toEqual([{ type: 'behavior_signal', signalType: 'hold_space', duration: 3000 }]);
  });

  it('createDataMessageSender never throws when publishing fails', async () => {
    const room: DataMessageRoom = {
      localParticipant: {
        publishData: async () => {
          throw new Error('room closed');
        },
      },
    };
    await expect(createDataMessageSender(room)('trust_signal', {})).resolves.toBeUndefined();
  });

  it('FrontendPublisher.sendData keeps the message type', async () => {
    const { room, sent } = capturingRoom();
    const publisher = new FrontendPublisher(
      room as ConstructorParameters<typeof FrontendPublisher>[0]
    );
    await publisher.sendData('avatar_cue', {
      type: 'anticipatory_response',
      expression: 'concern',
    });
    expect(sent[0]).toMatchObject({
      type: 'avatar_cue',
      anticipatoryType: 'anticipatory_response',
      expression: 'concern',
    });
    expect(typeof sent[0]?.timestamp).toBe('number');
  });
});
