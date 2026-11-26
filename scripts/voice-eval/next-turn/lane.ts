/**
 * The fast lane's words-only reason for a caller's line, as the eval records it in ferni.json.
 *
 * Built from the predicates the fast lane reads (fast-lane.ts, teammate-talk.ts), in its order,
 * so the eval needs no export the live call doesn't use. A request the crisis gate keeps on the
 * main model has no words-only reason; the eval replays no crisis gate, so that case never
 * arises here.
 */
import { asksAQuestion, mayNeedTool } from '../../../src/agents/model-provider/fast-lane.js';
import { asksForTeammate } from '../../../src/utils/teammate-talk.js';

type WordsLane = 'no_words' | 'teammate' | 'request' | 'question' | 'chat';

export function wordsLane(text: string): WordsLane {
  if (!text) return 'no_words';
  if (asksForTeammate(text)) return 'teammate';
  if (mayNeedTool(text)) return 'request';
  if (asksAQuestion(text)) return 'question';
  return 'chat';
}
