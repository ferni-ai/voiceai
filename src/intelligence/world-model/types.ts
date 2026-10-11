/**
 * Compact per-user world-model snapshot for the live voice prompt.
 *
 * Product equivalent of h-uman W9: people, relations, goals, facts,
 * emotion register, theory of mind, and never-say negatives.
 * Not a physics simulator or causal graph.
 *
 * @module intelligence/world-model/types
 */

export interface WorldModelPerson {
  name: string;
  type: string;
  relation?: string;
}

export interface WorldModelRelation {
  source: string;
  relation: string;
  target: string;
}

export interface WorldModelGoal {
  text: string;
}

export interface WorldModelFact {
  subject: string;
  key: string;
  value: string;
}

export interface WorldModelEmotion {
  register: string;
  valence?: string;
}

export interface WorldModelTheoryOfMind {
  userThinksWeAre?: string;
  userExpectsWeCan?: string;
  userExpectsWeCannot?: string;
  interactionStyle?: string;
}

export interface WorldModelNegative {
  text: string;
  source: 'user' | 'policy' | 'auto';
  reason?: string;
}

export interface WorldModelSnapshot {
  userId: string;
  builtAtMs: number;
  people: WorldModelPerson[];
  relations: WorldModelRelation[];
  goals: WorldModelGoal[];
  facts: WorldModelFact[];
  recentTopics: string[];
  emotion?: WorldModelEmotion;
  theoryOfMind?: WorldModelTheoryOfMind;
  negatives: WorldModelNegative[];
}

export function createEmptySnapshot(userId: string, builtAtMs: number): WorldModelSnapshot {
  return {
    userId,
    builtAtMs,
    people: [],
    relations: [],
    goals: [],
    facts: [],
    recentTopics: [],
    negatives: [],
  };
}

export function isEmptySnapshot(snapshot: WorldModelSnapshot): boolean {
  const emo = snapshot.emotion?.register;
  const hasEmotion = Boolean(emo && emo !== 'neutral');
  const tom = snapshot.theoryOfMind;
  const hasTom = Boolean(
    tom?.userThinksWeAre ||
      tom?.userExpectsWeCan ||
      tom?.userExpectsWeCannot ||
      tom?.interactionStyle
  );
  return (
    snapshot.people.length === 0 &&
    snapshot.relations.length === 0 &&
    snapshot.goals.length === 0 &&
    snapshot.facts.length === 0 &&
    snapshot.recentTopics.length === 0 &&
    snapshot.negatives.length === 0 &&
    !hasEmotion &&
    !hasTom
  );
}
