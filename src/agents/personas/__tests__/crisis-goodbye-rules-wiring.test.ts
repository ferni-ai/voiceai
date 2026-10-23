/**
 * #2539: the gate and the turn pipeline tell the classifier when a turn is a goodbye
 * (goodbye-turn.ts), so the goodbye rules reach its read on a goodbye and never mid-call.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { CRISIS_GOODBYE_RULES } from '../../../services/safety/crisis-goodbye-rules.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate } from '../crisis-gate.js';

const ENV = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_GOODBYE_RULES: 'on',
};

let calls = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
});

function recorder(): { generate: CrisisGenerateFn; ruled: () => number } {
  const prompts: string[] = [];
  return {
    generate: async (prompt) => {
      prompts.push(prompt);
      return '{"risk":"none","subject":"self"}';
    },
    ruled: () => prompts.filter((p) => p.includes(CRISIS_GOODBYE_RULES)).length,
  };
}

function request(ferni: string, latest: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: 'work was long today' });
  ctx.addMessage({ role: 'assistant', content: ferni });
  ctx.addMessage({ role: 'user', content: latest });
  return ctx;
}

const CASES: Array<[ferni: string, latest: string, goodbye: boolean]> = [
  ['Sounds like a lot.', 'love you forever, bye', true],
  ['Talk soon, bye!', 'the game is over', true],
  ['What happened next?', 'goodbye to all of it', false],
  ['What happened next?', 'the game is over', false],
];

describe('the goodbye rules reach the classifier only on a goodbye turn', () => {
  it('through the reply gate', async () => {
    for (const [ferni, latest, goodbye] of CASES) {
      const { generate, ruled } = recorder();
      const gate = startCrisisGate(
        request(ferni, latest),
        { services: { sessionId: `call-${++calls}` } },
        { env: ENV, generate }
      );
      await gate?.escalation;
      expect(ruled() > 0, latest).toBe(goodbye);
    }
  });

  it('through the turn pipeline', async () => {
    for (const [ferni, latest, goodbye] of CASES) {
      const { generate, ruled } = recorder();
      const turn = startTurnCrisis(
        latest,
        { recentTranscripts: ['work was long today'], lastAgentResponse: ferni },
        { sessionId: `call-${++calls}`, env: ENV, generate }
      );
      await turn.resolve();
      expect(ruled() > 0, latest).toBe(goodbye);
    }
  });
});
