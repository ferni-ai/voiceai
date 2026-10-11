/**
 * Runs each former bare-require() site under plain Node ESM (via the tsx
 * loader), where `require` is not defined, the same as the built app in
 * prod. Vitest injects `require` into every module, so it cannot reproduce
 * the bug. Prints one RESULT line of JSON for the test to parse.
 */
import { getUserContext } from '../../../services/outreach/context-aggregator.js';
import { getOutreachDecisionEngine } from '../../../services/outreach/decision-engine.js';
import {
  generateOutreach,
  type OutreachContext,
} from '../../../services/outreach/engagement/personalization-engine.js';
import { shouldSharePersonalMoment } from '../../../personality/infrastructure/legacy-bridge.js';
import { createDomainServices } from '../../../personality/v2/index.js';

type Outcome = { ok: true; value: unknown } | { ok: false; error: string };

function run(fn: () => unknown): Outcome {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, error: `${(err as Error).name}: ${(err as Error).message}` };
  }
}

const userId = 'esm-driver-user';
getUserContext(userId).personal.preferredName = 'Sam';

const outreachContext: OutreachContext = {
  userId,
  userName: 'Sam',
  relationshipStage: 'friend',
  trigger: { type: 'thinking_of_you', reason: 'Just checking in', urgency: 'low' },
  context: { recentTopics: ['the marathon'] },
};

const engine = getOutreachDecisionEngine() as unknown as {
  getUserNameFromContext: (id: string, state: unknown) => string;
};

const results = {
  userName: run(() => engine.getUserNameFromContext(userId, {})),
  call: run(() => {
    const out = generateOutreach('ferni', outreachContext, 'call');
    return { message: out.message, voicemailMessage: out.voicemailMessage };
  }),
  voiceMessage: run(() => generateOutreach('ferni', outreachContext, 'voice_message').message),
  sms: run(() => generateOutreach('ferni', outreachContext, 'sms').message),
  domainServices: run(() => Object.keys(createDomainServices()).sort()),
  sharePersonalMoment: run(() =>
    shouldSharePersonalMoment(
      'What do you think about that?',
      0.9,
      { isNegative: false, intensity: 0.2 },
      'friend'
    )
  ),
};

process.stdout.write(`\nRESULT:${JSON.stringify(results)}\n`);
process.exit(0);
