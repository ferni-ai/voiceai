/**
 * Prompt-facing wrapper for compound-effects.
 *
 * @module services/superhuman/compound-effects-context
 */

import { getUserCompoundModels } from './compound-effects.js';

export async function buildCompoundEffectsContext(userId: string): Promise<string> {
  const models = await getUserCompoundModels(userId);
  if (models.length === 0) return '';

  const top = models[0];
  const next = top.projections[0];
  const outlook = next?.outcomes[0] ? ` Looking ahead: ${next.outcomes[0]}` : '';
  return (
    `[COMPOUND EFFECTS] ${top.habitName} is at ${top.currentConsistency}% consistency` +
    ` with a ${top.currentStreak}-day streak.${outlook}`
  );
}
