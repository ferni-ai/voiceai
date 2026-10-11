import { EventEmitter } from 'node:events';
import { voice } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { finishedTurnMinDelayMs, installFinishedTurnEndpointing } from '../unfinished-turn.js';

describe('finishedTurnMinDelayMs', () => {
  it('shortens the floor for a finished sentence of three or more words', () => {
    expect(finishedTurnMinDelayMs('Should I push back on my manager?', 300, 150)).toBe(150);
    expect(finishedTurnMinDelayMs("It's been kind of a long day.", 300, 150)).toBe(150);
    expect(finishedTurnMinDelayMs('We finally closed on the house!', 300, 150)).toBe(150);
  });

  it('keeps the full wait for half a sentence, a trailing-off, or no punctuation', () => {
    expect(finishedTurnMinDelayMs('My manager moved the deadline up to', 300, 150)).toBe(300);
    expect(finishedTurnMinDelayMs('And then I thought, well...', 300, 150)).toBe(300);
    expect(finishedTurnMinDelayMs('So I went over there and', 300, 150)).toBe(300);
    expect(finishedTurnMinDelayMs('I went to the store yesterday', 300, 150)).toBe(300);
  });

  it('keeps the full wait for a short "Yeah." or a run of backchannels people often go on after', () => {
    expect(finishedTurnMinDelayMs('Yeah.', 300, 150)).toBe(300);
    expect(finishedTurnMinDelayMs("It's fine.", 300, 150)).toBe(300);
    expect(finishedTurnMinDelayMs('Yeah, yeah, mm-hmm.', 300, 150)).toBe(300);
  });

  it('never raises the floor above the base', () => {
    expect(finishedTurnMinDelayMs('Should I push back on him?', 100, 150)).toBe(100);
  });
});

function fakeSession() {
  const events = new EventEmitter();
  const floors: number[] = [];
  const session = Object.assign(events, {
    agentState: 'listening' as string,
    updateOptions: (o: { turnHandling: { endpointing: { minDelay: number } } }) =>
      floors.push(o.turnHandling.endpointing.minDelay),
  });
  const say = (transcript: string, isFinal = true) =>
    events.emit('user_input_transcribed', { transcript, isFinal });
  return { session, floors, say };
}

describe('installFinishedTurnEndpointing', () => {
  it('is off unless ENDPOINT_FAST_FINISHED=on', () => {
    const { session, floors, say } = fakeSession();
    expect(installFinishedTurnEndpointing(session, 300, {})).toBeNull();
    say('Should I push back on my manager?');
    expect(floors).toEqual([]);
  });

  it('follows the latest words: fast on a finished sentence, back when they go on', () => {
    const { session, floors, say } = fakeSession();
    installFinishedTurnEndpointing(session, 300, { ENDPOINT_FAST_FINISHED: 'on' });
    say('My manager moved the deadline', false);
    say('My manager moved the deadline up to Friday.');
    say('and I', false);
    say('and I have no idea how to finish.');
    expect(floors).toEqual([150, 300, 150]);
  });

  it('honours ENDPOINT_FINISHED_MIN_MS', () => {
    const { session, floors, say } = fakeSession();
    installFinishedTurnEndpointing(session, 300, {
      ENDPOINT_FAST_FINISHED: 'on',
      ENDPOINT_FINISHED_MIN_MS: '200',
    });
    say('Should I push back on my manager?');
    expect(floors).toEqual([200]);
  });

  it('never changes the floor while Ferni is speaking', () => {
    const { session, floors, say } = fakeSession();
    installFinishedTurnEndpointing(session, 300, { ENDPOINT_FAST_FINISHED: 'on' });
    session.agentState = 'speaking';
    say('Wait, hold on, that is not what I meant.');
    expect(floors).toEqual([]);
  });

  it("moves LiveKit's own endpointing floor through the public session API", () => {
    const session = new voice.AgentSession({});
    const read = () =>
      (
        session as unknown as {
          sessionOptions: { turnHandling: { endpointing: { minDelay: number } } };
        }
      ).sessionOptions.turnHandling.endpointing.minDelay;
    session.updateOptions({ turnHandling: { endpointing: { minDelay: 300 } } });
    expect(read()).toBe(300);
    installFinishedTurnEndpointing(
      session as unknown as Parameters<typeof installFinishedTurnEndpointing>[0],
      300,
      { ENDPOINT_FAST_FINISHED: 'on' }
    );
    (session as unknown as EventEmitter).emit('user_input_transcribed', {
      transcript: 'Should I push back on him?',
      isFinal: true,
    });
    expect(read()).toBe(150);
  });
});
