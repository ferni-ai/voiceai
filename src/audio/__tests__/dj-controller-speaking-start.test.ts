/**
 * DJController: music started or resumed while someone is speaking (#4400).
 *
 * Prod: `Invalid state transition attempted` 18 times in 3 days, always idle to ducking. The table
 * let idle go only to playing or changing, so a track that started while Ferni was still speaking
 * stayed in 'idle' with a track set, and pause, fade and ducking all checked for playing/ducking
 * and did nothing. The REAL controller; only the logger is recorded. Fictional track.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<{ level: string; fields: unknown; msg: unknown }>);
vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const recorder = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = { child: () => logger };
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      logger[level] = (fields: unknown, msg?: unknown) => logged.push({ level, fields, msg });
    }
    return logger;
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    getLogger: recorder,
    createLogger: recorder,
  };
});

const { DJController, getDJController, resetDJController } = await import('../dj-controller.js');

const track = {
  name: 'Fictional Song',
  artist: 'Fictional Band',
  duration: 180000,
  uri: 'fiction',
};
const illegal = () => logged.filter(({ msg }) => msg === 'Invalid state transition attempted');

type Start = 'idle' | 'playing' | 'fading' | 'paused' | 'stopped';
type Speaker = 'agent' | 'caller' | 'nobody';

let controller: InstanceType<typeof DJController>;

/** Bring the controller to `start` with nobody speaking. */
function reach(start: Start): void {
  if (start !== 'idle') controller.dispatch({ type: 'PLAY_TRACK', track, isAmbient: false });
  if (start === 'fading') controller.dispatch({ type: 'TRACK_NEAR_END' });
  if (start === 'paused') controller.dispatch({ type: 'PAUSE' });
  if (start === 'stopped') controller.dispatch({ type: 'SKIP' });
  expect(controller.getState().state).toBe(start);
}

function speak(who: Speaker): void {
  if (who === 'agent') controller.dispatch({ type: 'AGENT_SPEAKING_START' });
  if (who === 'caller') controller.dispatch({ type: 'USER_SPEAKING_START' });
}

const expectedAfterPlay = (who: Speaker) =>
  who === 'nobody'
    ? { state: 'playing', duckReason: null }
    : { state: 'ducking', duckReason: who === 'agent' ? 'agent_speaking' : 'user_speaking' };

beforeEach(() => {
  logged.length = 0;
  resetDJController();
  controller = getDJController();
  controller.initialize({
    sessionId: 'fictional-session',
    personaId: 'ferni',
    userId: 'fictional',
  });
});

describe('PLAY_TRACK', () => {
  const starts: Start[] = ['idle', 'playing', 'fading', 'paused', 'stopped'];
  const speakers: Speaker[] = ['agent', 'caller', 'nobody'];
  const cases = starts.flatMap((start) => speakers.map((who) => [start, who] as const));

  it.each(cases)(
    'from %s with %s speaking ends in the right state, by a legal path',
    (start, who) => {
      reach(start);
      speak(who);
      logged.length = 0;
      controller.dispatch({ type: 'PLAY_TRACK', track, isAmbient: false });
      expect(controller.getState()).toMatchObject({
        ...expectedAfterPlay(who),
        currentTrack: track,
      });
      expect(illegal()).toEqual([]);
    }
  );
});

describe('RESUME', () => {
  it.each([
    ['agent', 'ducking'],
    ['caller', 'ducking'],
    ['nobody', 'playing'],
  ] as const)('from paused with %s speaking ends in %s', (who, end) => {
    reach('paused');
    speak(who);
    logged.length = 0;
    controller.dispatch({ type: 'RESUME' });
    expect(controller.getState().state).toBe(end);
    expect(illegal()).toEqual([]);
  });
});

describe('a track started while the agent is speaking', () => {
  beforeEach(() => {
    speak('agent');
    controller.dispatch({ type: 'PLAY_TRACK', track, isAmbient: false });
  });

  it('can be paused', () => {
    controller.dispatch({ type: 'PAUSE' });
    expect(controller.getState().state).toBe('paused');
  });

  it('fades near its end', () => {
    controller.dispatch({ type: 'TRACK_NEAR_END' });
    expect(controller.getState().state).toBe('fading');
  });

  it('returns to playing when the speech ends', () => {
    controller.dispatch({ type: 'AGENT_SPEAKING_END' });
    expect(controller.getState()).toMatchObject({ state: 'playing', duckReason: null });
  });
});

describe('an illegal transition', () => {
  it('still warns, and names the handler that asked', () => {
    // No public command asks for paused -> fading, so call the private method directly.
    reach('paused');
    (controller as unknown as { transitionTo: (s: string, by: string) => void }).transitionTo(
      'fading',
      'handleFictional'
    );
    expect(controller.getState().state).toBe('paused');
    expect(illegal()).toHaveLength(1);
    expect(illegal()[0]?.fields).toMatchObject({
      from: 'paused',
      to: 'fading',
      by: 'handleFictional',
    });
  });
});
