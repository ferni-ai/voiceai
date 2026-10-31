/**
 * A text-only crisis call for tests: each caller line goes through the real reply gate
 * (crisis-gate.ts) and the real turn pipeline (turn-crisis.ts) with one scripted classifier, and
 * Ferni's next line is what the caller would hear: the script when a path replaces the reply, the
 * 988 line when crisis guidance asks for it, or a plain stub otherwise. Every line is fictional.
 */
import { llm } from '@livekit/agents';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  CRISIS_EVERYDAY_RULES,
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetImminentAgreement } from '../../../services/safety/crisis-imminent-agreement.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { buildCrisisGuidance } from '../../../services/safety/crisis-guard.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import type { CrisisDetection } from '../../processors/types.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

export type Risk = 'imminent' | 'crisis' | 'none';

/** Per caller line: [the read with the everyday rules, the read without]. Anything else: none. */
export function classifier(reads: Record<string, Risk | [Risk, Risk]>): CrisisGenerateFn {
  return async (prompt, content) => {
    const latest = (JSON.parse(content) as { latest: string }).latest;
    const read = reads[latest] ?? 'none';
    const [ruled, plain] = Array.isArray(read) ? read : [read, read];
    const risk = prompt.includes(CRISIS_EVERYDAY_RULES.trim()) ? ruled : plain;
    return JSON.stringify({ risk, subject: 'self' });
  };
}

/** Prod's crisis flags on ff834a2b9: guard and classifier live, agreement gate and rules on. */
export const PROD = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_IMMINENT_NEEDS_AGREEMENT: 'off',
};

/** What a stub reply model says when crisis guidance asks for the 988 line. */
export const SAYS_988 = "I'm right here with you. You can call or text 988, any time.";
export const PLAIN = 'Okay, I hear you. Tell me more.';

export interface SimTurn {
  caller: string;
  gate: CrisisGateDecision;
  pipeline: CrisisDetection;
  /** The guidance turn-handler.ts adds for the pipeline's crisis read, if any. */
  injected: string | null;
  ferni: string;
}

const asks988 = (text: string | null | undefined): boolean =>
  typeof text === 'string' && text.includes('Include the 988');

export function resetCrisisSim(): void {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetImminentAgreement();
}

/** One call, line by line, through both paths at once, as a live turn runs them. */
export async function simulateCall(
  lines: readonly string[],
  generate: CrisisGenerateFn,
  env: Record<string, string>,
  sessionId: string,
  opening = 'Hey, it is Ferni. What is on your mind?'
): Promise<SimTurn[]> {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'assistant', content: opening });
  const earlier: string[] = [];
  let lastFerni = opening;
  const out: SimTurn[] = [];
  for (const caller of lines) {
    ctx.addMessage({ role: 'user', content: caller });
    const userData = { services: { sessionId } };
    const gate = startCrisisGate(ctx.copy(), userData, { env, generate });
    const turn = startTurnCrisis(
      caller,
      { recentTranscripts: [...earlier], lastAgentResponse: lastFerni },
      { sessionId, env, generate }
    );
    const [escalated, pipeline] = await Promise.all([gate?.escalation, turn.summary()]);
    const decision = escalated ?? gate?.decision ?? { action: 'pass' as const };
    const injected = pipeline.shouldOverrideLLM
      ? null
      : pipeline.isCrisis
        ? buildCrisisGuidance(pipeline as Parameters<typeof buildCrisisGuidance>[0])
        : (pipeline.softGuidance ?? null);
    const override = pipeline.shouldOverrideLLM ? pipeline.suggestedResponse : undefined;
    const ferni =
      decision.action === 'replace'
        ? decision.script
        : (override ??
          (asks988(decision.action === 'guide' ? decision.guidance : null) || asks988(injected)
            ? SAYS_988
            : PLAIN));
    out.push({ caller, gate: decision, pipeline, injected, ferni });
    ctx.addMessage({ role: 'assistant', content: ferni });
    earlier.push(caller);
    lastFerni = ferni;
  }
  return out;
}
