/**
 * Render a world-model snapshot for the live voice prompt.
 *
 * Section language mirrors h-uman W9 (World Model / Theory of mind / Avoid)
 * without copying C code.
 *
 * @module intelligence/world-model/render
 */

import { isEmptySnapshot, type WorldModelSnapshot } from './types.js';

/** ~300 tokens. Voice context is already crowded. */
export const WORLD_MODEL_MAX_CHARS = 1200;

function appendLine(lines: string[], line: string, budget: { left: number }): boolean {
  if (budget.left <= 0) return false;
  const next = line.length + 1;
  if (next > budget.left) return false;
  lines.push(line);
  budget.left -= next;
  return true;
}

export function renderWorldModelSection(
  snapshot: WorldModelSnapshot,
  maxChars: number = WORLD_MODEL_MAX_CHARS
): string {
  if (isEmptySnapshot(snapshot)) {
    return '';
  }

  const lines: string[] = [];
  const budget = { left: maxChars };
  appendLine(lines, '## World Model', budget);

  if (snapshot.people.length > 0) {
    appendLine(lines, 'Known entities:', budget);
    for (const person of snapshot.people) {
      const label = person.relation
        ? `- ${person.name} (${person.type}, ${person.relation})`
        : `- ${person.name} (${person.type})`;
      if (!appendLine(lines, label, budget)) break;
    }
  }

  if (snapshot.relations.length > 0) {
    appendLine(lines, 'Key relationships:', budget);
    for (const rel of snapshot.relations) {
      if (!appendLine(lines, `- ${rel.source} ${rel.relation} ${rel.target}`, budget)) break;
    }
  }

  if (snapshot.goals.length > 0) {
    appendLine(lines, 'Active goals:', budget);
    for (const goal of snapshot.goals) {
      if (!appendLine(lines, `- ${goal.text}`, budget)) break;
    }
  }

  if (snapshot.facts.length > 0) {
    appendLine(lines, 'Recent facts:', budget);
    for (const fact of snapshot.facts) {
      if (!appendLine(lines, `- ${fact.subject}: ${fact.key} = ${fact.value}`, budget)) break;
    }
  }

  if (snapshot.emotion?.register && snapshot.emotion.register !== 'neutral') {
    const valence = snapshot.emotion.valence ? ` (${snapshot.emotion.valence})` : '';
    appendLine(lines, `Emotion register: ${snapshot.emotion.register}${valence}`, budget);
  }

  if (snapshot.negatives.length > 0) {
    appendLine(lines, 'Avoid:', budget);
    for (const negative of snapshot.negatives) {
      const tag = negative.source === 'user' ? '[hard]' : negative.source === 'policy' ? '[policy]' : '[confirm]';
      const reason = negative.reason ? ` — ${negative.reason}` : '';
      if (!appendLine(lines, `- ${tag} ${negative.text}${reason}`, budget)) break;
    }
  }

  const tom = snapshot.theoryOfMind;
  if (tom && (tom.userThinksWeAre || tom.userExpectsWeCan || tom.userExpectsWeCannot || tom.interactionStyle)) {
    appendLine(lines, 'Theory of mind (what they think of me):', budget);
    if (tom.userThinksWeAre) {
      appendLine(lines, `- They see me as: ${tom.userThinksWeAre}`, budget);
    }
    if (tom.userExpectsWeCan) {
      appendLine(lines, `- They expect I can: ${tom.userExpectsWeCan}`, budget);
    }
    if (tom.userExpectsWeCannot) {
      appendLine(lines, `- They expect I cannot: ${tom.userExpectsWeCannot}`, budget);
    }
    if (tom.interactionStyle) {
      appendLine(lines, `- Interaction style: ${tom.interactionStyle}`, budget);
    }
  }

  if (snapshot.recentTopics.length > 0) {
    appendLine(lines, `Recent topics: ${snapshot.recentTopics.join(', ')}`, budget);
  }

  return lines.join('\n');
}
