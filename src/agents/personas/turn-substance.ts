/**
 * Whether this reply needs substance, for TURN_LENGTH=adaptive (turn-length.ts).
 *
 * Learned length draws from friends' next turns in casual talk, so a real question got the same
 * few words as a passing remark. Three kinds of turn need a real answer instead, each read by a
 * classifier that already exists rather than a new word list:
 *
 *   question  something shared that ends on a real question, not about him (the fast lane's
 *             asksAQuestion, fast-lane.ts): "should I just tell her?". Ending the turn on it
 *             hands him the floor; mid-turn ("remember? we went...") it is a check, and on
 *             friends' talk lifting those cost Ferni 25 points against the real friend.
 *   tool      the reply after a tool that found something out (not an action: a timer is "done")
 *   beat      a specialist asked about their own beat (team-by-need-note.ts): Maya on a habit
 *
 * Requests and look-ups keep their own rules (no learned length); a quick yes, or a question about
 * him, keeps learned. A call with crisis risk keeps learned too: its length rules are not changed.
 *
 * @module agents/personas/turn-substance
 */

import { onOwnBeat } from '../../tools/handoff/team-by-need-note.js';
import { asksAQuestion, callerTurn } from '../model-provider/fast-lane.js';
import type { CallerMove } from './caller-move.js';
import { ACTION_TOOLS, WIDE_ACTION_TOOLS } from './tool-lead-in.js';

export type Substance = 'question' | 'tool' | 'beat';

interface ItemView {
  type?: string;
  role?: string;
  name?: string;
  textContent?: string;
}

/** The tools whose results this reply answers (since the caller last spoke), or none. */
function toolsAnswered(items: readonly ItemView[]): string[] {
  if (callerTurn(items) !== null) return [];
  const names: string[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === 'message' && item.role === 'user') break;
    if (item.type === 'function_call_output') names.push(item.name ?? '');
  }
  return names;
}

const isAction = (tool: string): boolean => ACTION_TOOLS.has(tool) || WIDE_ACTION_TOOLS.has(tool);
const endsOnQuestion = (said: string): boolean =>
  said.trimEnd().endsWith('?') && asksAQuestion(said);

/** What makes this turn need a real answer, or undefined for a social moment. */
export function substanceOf(
  said: string,
  move: CallerMove,
  { items = [], speaker = 'ferni' }: { items?: readonly ItemView[]; speaker?: string } = {}
): Substance | undefined {
  if (move !== 'share') return undefined;
  if (toolsAnswered(items).some((tool) => !isAction(tool))) return 'tool';
  if (onOwnBeat(speaker, said)) return 'beat';
  return endsOnQuestion(said) ? 'question' : undefined;
}
