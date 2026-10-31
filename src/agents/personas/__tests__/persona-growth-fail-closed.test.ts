/**
 * PERSONA_GROWTH fails closed: when the crisis check itself throws, no growth
 * note is offered, and one already in the chat comes back out
 * (persona-growth-recall.ts check, persona-growth-note.ts sendGrowth).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const broken = vi.hoisted(() => ({ on: false }));
vi.mock('../../../services/safety/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../services/safety/index.js')>();
  return {
    ...real,
    crisisRiskThisCall: (...args: Parameters<typeof real.crisisRiskThisCall>) => {
      if (broken.on) throw new Error('risk store unavailable');
      return real.crisisRiskThisCall(...args);
    },
  };
});

import { GROWTH_NOTE_ID } from '../../multi-agent/recall-note.js';
import { sendGrowth } from '../persona-growth-note.js';
import { growthRecallFor, withGrowth } from '../persona-growth-recall.js';
import {
  clearAllUserGrowth,
  loadPersonaGrowthProfile,
  type PersonaGrowthProfile,
} from '../../../services/trust-systems/persona-growth.js';

const USER = 'u-fail-closed';
let calls = 0;

function profile(): PersonaGrowthProfile {
  return {
    userId: USER,
    personaId: 'ferni',
    growthRecords: [
      {
        id: 'g1',
        userId: USER,
        personaId: 'ferni',
        growthType: 'learned_from_user',
        topic: 'rest',
        beforeThinking: '',
        afterThinking: 'rest early',
        userContribution: 'q',
        triggerQuote: 'you rest before you are tired not after',
        createdAt: new Date(Date.now() - 86_400_000),
        significance: 'moderate',
        relationshipStage: 'familiar',
      },
    ],
    sharedTopics: [],
  } as unknown as PersonaGrowthProfile;
}

/** A recall wrapped the way createMemoryRecall wraps it, and a chat to send into. */
function call() {
  clearAllUserGrowth(USER);
  loadPersonaGrowthProfile(USER, 'ferni', profile());
  const recall = withGrowth(growthRecallFor(USER, 'ferni', `s-fail-${++calls}`), {
    noteFor: (_said: string, _opts?: { final?: boolean }): string | null => null,
    newTurn: () => undefined,
  });
  let items: Array<{ id: string }> = [];
  const agent = {
    chatCtx: {
      copy: () => {
        const ctx = {
          items: [...items],
          addMessage: (m: { id?: string }) => void ctx.items.push({ id: m.id ?? '' }),
        };
        return ctx;
      },
    },
    updateChatCtx: async (ctx: unknown) => {
      items = (ctx as { items: typeof items }).items;
    },
  };
  const turn = (said: string) => {
    recall.noteFor(said, { final: true });
    sendGrowth(agent as never, recall, said);
    recall.newTurn();
  };
  return { turn, growth: () => items.filter((i) => i.id === GROWTH_NOTE_ID).length };
}

afterEach(() => {
  broken.on = false;
  vi.unstubAllEnvs();
});

describe('persona growth fails closed', () => {
  it('offers nothing when the crisis check throws', () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    broken.on = true;
    const c = call();
    for (const said of ['hey', 'long week', 'took friday off', 'anyway']) c.turn(said);
    expect(c.growth()).toBe(0);
  });

  it('takes an offered note back out when the check starts throwing', () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const c = call();
    for (const said of ['hey', 'long week', 'took friday off']) c.turn(said);
    expect(c.growth()).toBe(1); // the same call with a working check gets it
    broken.on = true;
    c.turn('anyway');
    expect(c.growth()).toBe(0);
  });
});
