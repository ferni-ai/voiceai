/**
 * The avatar lab's command table and protocol: every message is checked field
 * by field, each command runs exactly its one real export, and the real gates
 * (the crisis face hold, the motion switch, reduced motion) refuse what a call
 * would refuse, with nothing run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLabCommand, type LabDeps, type LabSoul } from '../../src/avatar-lab/lab-commands.js';
import {
  LAB_MESSAGE_TYPE,
  parseLabReply,
  parseLabRequest,
  type LabCommand,
  type LabMoment,
} from '../../src/avatar-lab/lab-protocol.js';
import { holdCrisisFace, releaseCrisisFace } from '../../src/ui/face/crisis-face-hold.js';
import { EMOTIONAL_EXPRESSIONS } from '../../src/ui/ferni-expressions.ui.js';

const SOUL_EXPORTS: ReadonlyArray<keyof LabSoul> = [
  'triggerWarmthBloom',
  'triggerMemorySpark',
  'startComfortPulse',
  'stopComfortPulse',
  'enterProtectiveMode',
  'exitProtectiveMode',
  'celebrateGrowth',
  'flashShimmer',
  'triggerCameoArrival',
  'triggerCameoReturn',
];

const REDUCED_WHY = 'Reduced motion is on, so this moment does not play';
const HELD_WHY = 'The crisis hold allows only calm moments';
const STARTING_WHY = 'The avatar is still starting, so this moment does not play';
const SHIMMER_WHY = 'The avatar no longer has a shimmer, so this moment does not play';
const NAME_LIFT_WHY = 'Something is already showing, so the name lift does not show';

/** The moments whose soul export returns early under reduced motion or before the soul starts. */
const GATED_MOMENTS: LabMoment[] = [
  'warmthBloom',
  'memorySpark',
  'comfortPulseStart',
  'protectiveOn',
  'celebrateGrowth',
  'cameoArrival',
  'cameoReturn',
];

function fakeDeps() {
  const exports = Object.fromEntries(SOUL_EXPORTS.map((name) => [name, vi.fn()])) as unknown as {
    [K in Exclude<keyof LabSoul, 'getState'>]: ReturnType<typeof vi.fn>;
  };
  /** The soul's own state, as avatarSoul.getState() reports it; tests change it. */
  const soulState = {
    isInitialized: true,
    reducedMotion: false,
    comfortPulseActive: false,
    protectiveMode: false,
  };
  const deps = {
    driver: { update: vi.fn(), shown: vi.fn(() => 'thinking' as const) },
    soulState,
    soul: { ...exports, getState: vi.fn(() => ({ ...soulState })) },
    setExpression: vi.fn(),
    playNameLift: vi.fn(),
    holdCrisisFace: vi.fn(holdCrisisFace),
    releaseCrisisFace: vi.fn(releaseCrisisFace),
    personaColor: vi.fn(() => 'rgb(74, 103, 65)'),
  };
  return deps;
}

type Fake = ReturnType<typeof fakeDeps>;

/** Every export spy in the fake deps, by name. */
function allSpies(d: Fake): Record<string, ReturnType<typeof vi.fn>> {
  const { getState: _read, ...soulExports } = d.soul;
  return {
    ...soulExports,
    update: d.driver.update,
    setExpression: d.setExpression,
    playNameLift: d.playNameLift,
    holdCrisisFace: d.holdCrisisFace,
    releaseCrisisFace: d.releaseCrisisFace,
  };
}

function calledNames(d: Fake): string[] {
  return Object.entries(allSpies(d))
    .filter(([, spy]) => spy.mock.calls.length > 0)
    .map(([name]) => name);
}

function run(cmd: LabCommand, d: Fake) {
  return runLabCommand(cmd, d as unknown as LabDeps);
}

/** The viewer's prefers-reduced-motion setting, as window.matchMedia reports it. */
function reducedMotion(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({ matches: matches && query.includes('reduce'), media: query }) as MediaQueryList
  );
}

function request(command: unknown, extra: Record<string, unknown> = {}): unknown {
  return { type: LAB_MESSAGE_TYPE, id: 'r1', command, ...extra };
}

beforeEach(() => {
  releaseCrisisFace();
  reducedMotion(false);
  document.body.innerHTML = '<div class="avatar-container"></div>'; // the avatar a name lift shows on
});

afterEach(() => {
  releaseCrisisFace();
  vi.restoreAllMocks();
});

describe('parseLabRequest', () => {
  it('accepts a good request and builds a fresh object', () => {
    const data = request({ name: 'face', expression: 'empathetic', extra: 1 });
    const parsed = parseLabRequest(data);
    expect(parsed).toEqual({
      type: LAB_MESSAGE_TYPE,
      id: 'r1',
      command: { name: 'face', expression: 'empathetic' },
    });
    expect(parsed).not.toBe(data);
  });

  it('accepts every command name with a good argument', () => {
    const good: LabCommand[] = [
      { name: 'turn', speaker: 'user' },
      { name: 'face', expression: 'happy' },
      { name: 'moment', moment: 'memorySpark' },
      { name: 'nameLift', effect: 'comfort' },
      { name: 'crisisHold', on: false },
      { name: 'status' },
    ];
    for (const command of good) expect(parseLabRequest(request(command))?.command).toEqual(command);
  });

  it('rejects the wrong type', () => {
    expect(
      parseLabRequest({ type: 'ferni:other', id: 'r1', command: { name: 'status' } })
    ).toBeNull();
  });

  it('rejects a missing or empty id', () => {
    expect(parseLabRequest({ type: LAB_MESSAGE_TYPE, command: { name: 'status' } })).toBeNull();
    expect(parseLabRequest(request({ name: 'status' }, { id: '' }))).toBeNull();
    expect(parseLabRequest(request({ name: 'status' }, { id: 7 }))).toBeNull();
  });

  it('rejects an unknown name', () => {
    expect(parseLabRequest(request({ name: 'dance' }))).toBeNull();
    expect(parseLabRequest(request({ name: 'toString' }))).toBeNull();
  });

  it('rejects a face not in EMOTIONAL_EXPRESSIONS', () => {
    expect(EMOTIONAL_EXPRESSIONS).toContain('excited');
    expect(parseLabRequest(request({ name: 'face', expression: 'smirk' }))).toBeNull();
    expect(parseLabRequest(request({ name: 'face' }))).toBeNull();
  });

  it('rejects a name lift effect that is not brighten, attentive or comfort', () => {
    expect(parseLabRequest(request({ name: 'nameLift', effect: 'sparkle' }))).toBeNull();
  });

  it('rejects a moment the lab does not have', () => {
    expect(parseLabRequest(request({ name: 'moment', moment: 'confetti' }))).toBeNull();
  });

  it('rejects __proto__ and other non-commands', () => {
    expect(parseLabRequest(request({ name: '__proto__' }))).toBeNull();
    expect(
      parseLabRequest(
        JSON.parse(`{"type":"${LAB_MESSAGE_TYPE}","id":"r1","command":{"name":"__proto__"}}`)
      )
    ).toBeNull();
    expect(parseLabRequest(request(null))).toBeNull();
    expect(parseLabRequest(request(['status']))).toBeNull();
    expect(parseLabRequest(null)).toBeNull();
    expect(parseLabRequest('status')).toBeNull();
  });

  it('rejects a turn for a speaker that does not exist, and a non-boolean hold', () => {
    expect(parseLabRequest(request({ name: 'turn', speaker: 'agent' }))).toBeNull();
    expect(parseLabRequest(request({ name: 'crisisHold', on: 'yes' }))).toBeNull();
  });
});

describe('parseLabReply', () => {
  const status = { ready: true, crisisHeld: false, reducedMotion: false, turn: 'none' };

  it('parses a good reply with a status', () => {
    expect(parseLabReply({ type: LAB_MESSAGE_TYPE, id: 'r1', ok: true, status })).toEqual({
      type: LAB_MESSAGE_TYPE,
      id: 'r1',
      ok: true,
      status,
    });
  });

  it('parses a refusal with its why, and a run with its export', () => {
    const refused = { type: LAB_MESSAGE_TYPE, id: 'r2', ok: false, why: 'no' };
    expect(parseLabReply(refused)).toEqual(refused);
    const ran = { type: LAB_MESSAGE_TYPE, id: 'r3', ok: true, ran: 'triggerMemorySpark' };
    expect(parseLabReply(ran)).toEqual(ran);
  });

  it('rejects the wrong type, a missing id and a non-boolean ok', () => {
    expect(parseLabReply({ type: 'ferni:other', id: 'r1', ok: true })).toBeNull();
    expect(parseLabReply({ type: LAB_MESSAGE_TYPE, ok: true })).toBeNull();
    expect(parseLabReply({ type: LAB_MESSAGE_TYPE, id: 'r1', ok: 'true' })).toBeNull();
    expect(parseLabReply({ type: LAB_MESSAGE_TYPE, id: 'r1' })).toBeNull();
  });

  it('rejects a bad ran, why or status', () => {
    const base = { type: LAB_MESSAGE_TYPE, id: 'r1', ok: true };
    expect(parseLabReply({ ...base, ran: 3 })).toBeNull();
    expect(parseLabReply({ ...base, why: {} })).toBeNull();
    expect(parseLabReply({ ...base, status: { ...status, turn: 'agent' } })).toBeNull();
    expect(parseLabReply({ ...base, status: { ...status, ready: 'yes' } })).toBeNull();
  });
});

describe('runLabCommand: each command runs exactly its export', () => {
  const cases: Array<[LabCommand, string]> = [
    [{ name: 'turn', speaker: 'ferni' }, 'update'],
    [{ name: 'face', expression: 'happy' }, 'setExpression'],
    [{ name: 'nameLift', effect: 'brighten' }, 'playNameLift'],
    [{ name: 'crisisHold', on: true }, 'holdCrisisFace'],
    [{ name: 'crisisHold', on: false }, 'releaseCrisisFace'],
    [{ name: 'moment', moment: 'warmthBloom' }, 'triggerWarmthBloom'],
    [{ name: 'moment', moment: 'memorySpark' }, 'triggerMemorySpark'],
    [{ name: 'moment', moment: 'comfortPulseStart' }, 'startComfortPulse'],
    [{ name: 'moment', moment: 'comfortPulseStop' }, 'stopComfortPulse'],
    [{ name: 'moment', moment: 'protectiveOn' }, 'enterProtectiveMode'],
    [{ name: 'moment', moment: 'protectiveOff' }, 'exitProtectiveMode'],
    [{ name: 'moment', moment: 'celebrateGrowth' }, 'celebrateGrowth'],
    [{ name: 'moment', moment: 'cameoArrival' }, 'triggerCameoArrival'],
    [{ name: 'moment', moment: 'cameoReturn' }, 'triggerCameoReturn'],
  ];

  it.each(cases)('%o runs %s and says so', (cmd, exportName) => {
    const d = fakeDeps();
    expect(run(cmd, d)).toEqual({ ok: true, ran: exportName });
    expect(calledNames(d)).toEqual([exportName]);
    expect(allSpies(d)[exportName]).toHaveBeenCalledOnce();
  });

  it('passes the arguments the brief names', () => {
    const d = fakeDeps();
    run({ name: 'face', expression: 'happy' }, d);
    expect(d.setExpression).toHaveBeenCalledWith('happy');
    run({ name: 'nameLift', effect: 'attentive' }, d);
    expect(d.playNameLift).toHaveBeenCalledWith({ effect: 'attentive' });
    run({ name: 'moment', moment: 'warmthBloom' }, d);
    expect(d.soul.triggerWarmthBloom).toHaveBeenCalledWith(1);
    run({ name: 'moment', moment: 'cameoArrival' }, d);
    expect(d.soul.triggerCameoArrival).toHaveBeenCalledWith('rgb(74, 103, 65)');
  });

  it('feeds the turn driver the signals for each speaker', () => {
    const quiet = { userLevel: 0, canInterrupt: false };
    const expected = {
      ferni: { agentState: 'speaking', userSpeaking: false, ...quiet },
      user: { agentState: 'listening', userSpeaking: true, ...quiet },
      thinking: { agentState: 'thinking', userSpeaking: false, ...quiet },
      none: { agentState: 'listening', userSpeaking: false, ...quiet },
    } as const;
    for (const speaker of ['ferni', 'user', 'thinking', 'none'] as const) {
      const d = fakeDeps();
      run({ name: 'turn', speaker }, d);
      expect(d.driver.update).toHaveBeenCalledWith(expected[speaker]);
    }
  });

  it('a command the table does not know runs nothing and replies not ok', () => {
    const d = fakeDeps();
    const unknown = { name: 'dance' } as unknown as LabCommand;
    expect(run(unknown, d)).toEqual({ ok: false, why: 'unknown command' });
    expect(calledNames(d)).toEqual([]);
  });
});

describe('runLabCommand: status', () => {
  it('reports readiness, the real hold, reduced motion and the shown turn, running nothing', () => {
    const d = fakeDeps();
    expect(run({ name: 'status' }, d)).toEqual({
      ok: true,
      status: { ready: true, crisisHeld: false, reducedMotion: false, turn: 'thinking' },
    });
    holdCrisisFace();
    reducedMotion(true);
    d.soulState.isInitialized = false;
    expect(run({ name: 'status' }, d).status).toEqual({
      ready: false,
      crisisHeld: true,
      reducedMotion: true,
      turn: 'thinking',
    });
    expect(calledNames(d)).toEqual([]);
  });
});

describe('runLabCommand: the crisis hold', () => {
  it('refuses an excited face and runs a calm one', () => {
    const d = fakeDeps();
    run({ name: 'crisisHold', on: true }, d);
    expect(run({ name: 'face', expression: 'excited' }, d)).toEqual({
      ok: false,
      why: 'The crisis hold allows only calm faces',
    });
    expect(d.setExpression).not.toHaveBeenCalled();
    expect(run({ name: 'face', expression: 'empathetic' }, d)).toEqual({
      ok: true,
      ran: 'setExpression',
    });
    expect(d.setExpression).toHaveBeenCalledWith('empathetic');
  });

  it('refuses the playful moments and plays the calm ones', () => {
    holdCrisisFace();
    const refused: LabMoment[] = [
      'memorySpark',
      'celebrateGrowth',
      'cameoArrival',
      'cameoReturn',
      'comfortPulseStart',
    ];
    for (const moment of refused) {
      const d = fakeDeps();
      expect(run({ name: 'moment', moment }, d)).toEqual({ ok: false, why: HELD_WHY });
      expect(calledNames(d)).toEqual([]);
    }
    const played: LabMoment[] = [
      'warmthBloom',
      'comfortPulseStop',
      'protectiveOn',
      'protectiveOff',
    ];
    for (const moment of played) expect(run({ name: 'moment', moment }, fakeDeps()).ok).toBe(true);
  });

  it('released, the excited face runs again', () => {
    const d = fakeDeps();
    run({ name: 'crisisHold', on: true }, d);
    run({ name: 'crisisHold', on: false }, d);
    expect(run({ name: 'face', expression: 'excited' }, d).ok).toBe(true);
  });
});

describe('runLabCommand: reduced motion', () => {
  it('refuses every moment whose export returns early, saying why, and runs nothing', () => {
    for (const moment of GATED_MOMENTS) {
      const d = fakeDeps();
      d.soulState.reducedMotion = true; // the state the soul's exports check
      const why =
        moment === 'protectiveOn'
          ? 'Reduced motion is on, so protective mode does not play'
          : REDUCED_WHY;
      expect(run({ name: 'moment', moment }, d)).toEqual({ ok: false, why });
      expect(calledNames(d)).toEqual([]);
    }
  });

  it('still stops the pulse and leaves protective mode', () => {
    for (const moment of ['comfortPulseStop', 'protectiveOff'] as const) {
      const d = fakeDeps();
      d.soulState.reducedMotion = true;
      expect(run({ name: 'moment', moment }, d).ok).toBe(true);
    }
  });

  it('refuses the comfort pulse through the motion switch when the viewer turns reduced motion on later', () => {
    reducedMotion(true); // the live media query; the soul read it as off at start
    const d = fakeDeps();
    expect(run({ name: 'moment', moment: 'comfortPulseStart' }, d)).toEqual({
      ok: false,
      why: REDUCED_WHY,
    });
    expect(d.soul.startComfortPulse).not.toHaveBeenCalled();
  });
});

describe('runLabCommand: nothing shows, so nothing is said to play', () => {
  it('refuses every soul moment before the soul has started', () => {
    for (const moment of GATED_MOMENTS) {
      const d = fakeDeps();
      d.soulState.isInitialized = false;
      expect(run({ name: 'moment', moment }, d)).toEqual({ ok: false, why: STARTING_WHY });
      expect(calledNames(d)).toEqual([]);
    }
  });

  it('refuses the shimmer, whose element the avatar no longer creates', () => {
    const d = fakeDeps();
    expect(run({ name: 'moment', moment: 'shimmer' }, d)).toEqual({ ok: false, why: SHIMMER_WHY });
    expect(d.soul.flashShimmer).not.toHaveBeenCalled();
  });

  it('refuses a name lift over a comfort pulse, protective mode or an open dialog', () => {
    const covers: Array<(d: Fake) => void> = [
      (d) => (d.soulState.comfortPulseActive = true),
      (d) => (d.soulState.protectiveMode = true),
      () => document.body.insertAdjacentHTML('beforeend', '<dialog open></dialog>'),
      () => document.querySelector('.avatar-container')?.remove(),
    ];
    for (const cover of covers) {
      document.body.innerHTML = '<div class="avatar-container"></div>';
      const d = fakeDeps();
      cover(d);
      expect(run({ name: 'nameLift', effect: 'brighten' }, d)).toEqual({
        ok: false,
        why: NAME_LIFT_WHY,
      });
      expect(d.playNameLift).not.toHaveBeenCalled();
    }
  });

  it('plays a name lift under reduced motion, which shows its still warmth', () => {
    reducedMotion(true);
    const d = fakeDeps();
    expect(run({ name: 'nameLift', effect: 'comfort' }, d)).toEqual({
      ok: true,
      ran: 'playNameLift',
    });
  });
});
