/**
 * What today's rules decide for one caller turn, read without their flags so
 * the shadow record and the offline eval (scripts/understanding/eval.ts) see
 * each rule's own decision. Text only: ATTUNE's voice tie-break is left out.
 *
 * @module agents/personas/understanding-rules
 */
import { scoreCrisisLanguage } from '../../services/safety/index.js';
import type { RulesRead, TurnInput } from '../../understanding/index.js';
import { classifyBackchannelContext } from '../integrations/backchannel-context.js';
import { commitmentAhead } from '../multi-agent/greeting-not-yet.js';
import { answersQuestion } from './answer-turn.js';
import { callerCue } from './laugh-ledger.js';
import { readCaller } from './turn-attunement.js';

export function rulesRead(input: TurnInput, { opener = false } = {}): RulesRead {
  const said = input.callerTurn;
  const crisis = scoreCrisisLanguage(said, undefined, { recentMessages: input.priorCallerTurns });
  const at = Date.parse(input.callTimestamp);
  return {
    answer: answersQuestion(input.ferniLast, said, { opener }),
    attune: readCaller([...input.priorCallerTurns, said]),
    backchannel: classifyBackchannelContext(said),
    crisis: {
      isCrisis: crisis.isCrisis,
      severity: Math.round(crisis.severity * 100) / 100,
      indicators: crisis.indicators,
    },
    laughCue: callerCue(said),
    dayAhead: commitmentAhead({ statement: said, createdAt: at }, at, input.callerTimezone),
  };
}
