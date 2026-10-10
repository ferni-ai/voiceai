/**
 * The music player's state reaches the DJ controller, whose state_changed is what the app
 * hears (music_state). After a resume, the app was never told the music was playing again.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getDJController, resetDJController, type DJEvent } from '../../../audio/dj-controller.js';
import type { MusicState, MusicTrack } from '../../../audio/music-player.js';
import { djCommandFor } from '../music-state-bridge.js';

const jazz = { name: 'Quiet Jazz', artist: 'Ønejazz' } as MusicTrack;
const bossa = { name: 'Bossa', artist: 'Someone' } as MusicTrack;

function controllerFedByPlayer() {
  const controller = getDJController();
  controller.initialize({ sessionId: 'bridge-test', personaId: 'ferni' });
  const heard: string[] = [];
  controller.on('state_changed', (event: DJEvent) => {
    if (event.type === 'state_changed') heard.push(`${event.from}->${event.to}`);
  });
  // As music-handler.ts wires the player to the controller
  const player = (state: MusicState, track: MusicTrack | null) => {
    const command = djCommandFor(state, track, false, controller.getState());
    if (command) controller.dispatch(command);
  };
  return { controller, heard, player };
}

beforeEach(() => resetDJController());

describe('music state from the player to the app', () => {
  it('a resumed track tells the app it is playing again', () => {
    const { controller, heard, player } = controllerFedByPlayer();
    player('playing', jazz);
    player('paused', jazz);
    heard.length = 0;

    player('playing', jazz); // resume replays the paused track

    expect(controller.getState().state).toBe('playing');
    expect(heard).toEqual(['paused->playing']);
  });

  it('the same track coming back after a duck is not a new track', () => {
    const { controller, player } = controllerFedByPlayer();
    player('playing', jazz);
    controller.dispatch({ type: 'DUCK', reason: 'agent_speaking' });
    expect(djCommandFor('playing', jazz, false, controller.getState())).toBeNull();
  });

  it('another recording with the same title is a new track', () => {
    const { controller, player } = controllerFedByPlayer();
    player('playing', jazz);
    const sameTitle = { name: 'Quiet Jazz', artist: 'Someone Else' } as MusicTrack;
    expect(djCommandFor('playing', sameTitle, false, controller.getState())?.type).toBe(
      'PLAY_TRACK'
    );
  });

  it.each([
    ['stopped', 'STOP'],
    ['paused', 'PAUSE'],
    ['fading', 'TRACK_NEAR_END'],
  ] as const)('%s reaches the controller as %s', (state, command) => {
    const { controller } = controllerFedByPlayer();
    expect(djCommandFor(state, jazz, false, controller.getState())?.type).toBe(command);
  });

  it('a different track is a new track', () => {
    const { controller, player } = controllerFedByPlayer();
    player('playing', jazz);
    expect(djCommandFor('playing', bossa, true, controller.getState())).toEqual({
      type: 'PLAY_TRACK',
      track: bossa,
      isAmbient: true,
    });
  });
});
