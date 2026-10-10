/**
 * Build a compact WorldModelSnapshot from existing stores.
 *
 * @module intelligence/world-model/snapshot
 */

import { isCrisisText } from './crisis-filter.js';
import {
  createDefaultWorldModelSources,
  type LooseEntity,
  type LooseUserModel,
  type WorldModelSources,
} from './sources.js';
import {
  createEmptySnapshot,
  type WorldModelFact,
  type WorldModelGoal,
  type WorldModelNegative,
  type WorldModelPerson,
  type WorldModelRelation,
  type WorldModelSnapshot,
  type WorldModelTheoryOfMind,
} from './types.js';

const MAX_PEOPLE = 8;
const MAX_RELATIONS = 6;
const MAX_GOALS = 8;
const MAX_FACTS = 8;
const MAX_TOPICS = 10;
const MAX_NEGATIVES = 6;

export interface BuildWorldModelInput {
  userId: string;
  sessionId?: string;
  nowMs?: number;
  sources?: WorldModelSources;
  emotionRegister?: string;
  emotionValence?: string;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function entityName(entity: LooseEntity): string | null {
  return asTrimmedString(entity.canonicalName) ?? asTrimmedString(entity.name);
}

function entityId(entity: LooseEntity): string | null {
  return asTrimmedString(entity.id);
}

function entityType(entity: LooseEntity): string {
  return asTrimmedString(entity.type) ?? 'unknown';
}

function personRelation(entity: LooseEntity): string | undefined {
  const specific = asTrimmedString(entity.specificRelation);
  if (specific) return specific;
  const top = asTrimmedString(entity.relationship);
  if (top) return top;
  if (entity.attributes && typeof entity.attributes === 'object') {
    const attrs = entity.attributes as Record<string, unknown>;
    return asTrimmedString(attrs.relationship) ?? asTrimmedString(attrs.relationshipCategory) ?? undefined;
  }
  return undefined;
}

function attributeRecord(entity: LooseEntity): Record<string, unknown> | null {
  if (!entity.attributes || typeof entity.attributes !== 'object' || Array.isArray(entity.attributes)) {
    return null;
  }
  return entity.attributes as Record<string, unknown>;
}

function propertyRecord(entity: LooseEntity): Record<string, unknown> | null {
  if (!entity.properties || typeof entity.properties !== 'object' || Array.isArray(entity.properties)) {
    return null;
  }
  return entity.properties as Record<string, unknown>;
}

/**
 * The extractor files the agent and pronoun phrases as people too ("Ferni",
 * "AI Assistant", "They (Prospective Employer / Interviewers)" on a
 * 2026-10-10 eval user). Those are not people in the caller's life. Other
 * persona names stay: a caller's friend can be called Maya or Alex.
 */
const NOT_A_PERSON =
  /^(?:ferni|they|them|he|she|it|we|you|i|me|user|speaker)\b|\bassistant\b|\bAI\b/i;

export function isCallersPerson(name: string): boolean {
  return !NOT_A_PERSON.test(name.trim());
}

function isOpenGoalStatus(status: string | null): boolean {
  if (!status) return true;
  return !['abandoned', 'completed', 'achieved', 'resolved'].includes(status);
}

function collectFacts(entity: LooseEntity, name: string): WorldModelFact[] {
  const facts: WorldModelFact[] = [];
  const attrs = attributeRecord(entity);
  if (attrs) {
    const status = asTrimmedString(attrs.lastKnownStatus);
    if (status && !isCrisisText(status)) {
      facts.push({ subject: name, key: 'status', value: status });
    }
    const recent = attrs.recentContext;
    if (Array.isArray(recent)) {
      for (const item of recent.slice(0, 2)) {
        const value = asTrimmedString(item);
        if (value && !isCrisisText(value)) {
          facts.push({ subject: name, key: 'recent', value });
        }
      }
    }
  }
  const props = propertyRecord(entity);
  if (props) {
    for (const [key, raw] of Object.entries(props).slice(0, 3)) {
      const value = asTrimmedString(raw);
      if (!value || isCrisisText(key) || isCrisisText(value)) continue;
      if (key === 'embedding' || key.length > 40) continue;
      facts.push({ subject: name, key, value });
    }
  }
  return facts;
}

function buildTheoryOfMind(model: LooseUserModel | null): WorldModelTheoryOfMind | undefined {
  if (!model) return undefined;
  const style = model.communicationStyle;
  const emo = model.emotionalProfile;
  const parts: string[] = [];
  if (style?.formality && style.formality !== 'balanced') parts.push(style.formality);
  if (style?.verbosity && style.verbosity !== 'moderate') parts.push(style.verbosity);
  if (style?.preferredResponseLength && style.preferredResponseLength !== 'medium') {
    parts.push(`${style.preferredResponseLength} replies`);
  }
  const tom: WorldModelTheoryOfMind = {};
  if (parts.length > 0) {
    tom.interactionStyle = parts.join(', ');
  }
  if (emo?.supportStyle && emo.supportStyle !== 'balanced') {
    if (emo.supportStyle === 'active_advice') {
      tom.userExpectsWeCan = 'practical advice';
    } else if (emo.supportStyle === 'reflective_listening') {
      tom.userExpectsWeCan = 'reflective listening';
    }
  }
  return tom.interactionStyle || tom.userExpectsWeCan ? tom : undefined;
}

export async function buildWorldModelSnapshot(
  input: BuildWorldModelInput
): Promise<WorldModelSnapshot> {
  const nowMs = input.nowMs ?? Date.now();
  const snapshot = createEmptySnapshot(input.userId, nowMs);
  if (!input.userId) {
    return snapshot;
  }

  const sources = input.sources ?? createDefaultWorldModelSources();
  const entities = await sources.listEntities(input.userId);
  const people: WorldModelPerson[] = [];
  const goals: WorldModelGoal[] = [];
  const facts: WorldModelFact[] = [];
  const idToName = new Map<string, string>();

  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue;
    const name = entityName(entity);
    if (!name || isCrisisText(name)) continue;
    const type = entityType(entity);
    if (isCrisisText(type)) continue;
    const id = entityId(entity);
    if (id) idToName.set(id, name);

    if (type === 'person' && !isCallersPerson(name)) continue;
    if (type === 'person' && people.length < MAX_PEOPLE) {
      const relation = personRelation(entity);
      if (relation && isCrisisText(relation)) continue;
      people.push({ name, type, relation });
    } else if ((type === 'goal' || type === 'commitment') && goals.length < MAX_GOALS) {
      const attrs = attributeRecord(entity);
      const status = asTrimmedString(attrs?.status);
      if (!isOpenGoalStatus(status)) continue;
      if (isCrisisText(name)) continue;
      goals.push({ text: name });
    }

    if (facts.length < MAX_FACTS) {
      facts.push(...collectFacts(entity, name));
    }
  }

  const personIds = [...idToName.keys()].filter((id) => {
    const name = idToName.get(id);
    return Boolean(name && people.some((p) => p.name === name));
  });
  const edges = await sources.listRelationships(input.userId, personIds);
  const relations: WorldModelRelation[] = [];
  const relSeen = new Set<string>();

  for (const person of people) {
    if (!person.relation) continue;
    const key = `user:${person.relation}:${person.name}`.toLowerCase();
    if (relSeen.has(key)) continue;
    relSeen.add(key);
    relations.push({ source: 'User', relation: person.relation, target: person.name });
  }

  for (const edge of edges) {
    if (!edge || typeof edge !== 'object') continue;
    const fromId = asTrimmedString(edge.fromEntity);
    const toId = asTrimmedString(edge.toEntity);
    const label = asTrimmedString(edge.label) ?? asTrimmedString(edge.type);
    if (!fromId || !toId || !label || isCrisisText(label)) continue;
    const source = idToName.get(fromId);
    const target = idToName.get(toId);
    if (!source || !target || isCrisisText(source) || isCrisisText(target)) continue;
    const key = `${source}:${label}:${target}`.toLowerCase();
    if (relSeen.has(key)) continue;
    relSeen.add(key);
    relations.push({ source, relation: label, target });
    if (relations.length >= MAX_RELATIONS) break;
  }

  const signals = await sources.getHumanSignals(input.userId);
  const negatives: WorldModelNegative[] = [];
  for (const avoidance of signals?.avoidances ?? []) {
    const topic = asTrimmedString(avoidance?.topic);
    if (!topic || isCrisisText(topic)) continue;
    const approach = asTrimmedString(avoidance?.approach);
    negatives.push({
      text: topic,
      source: approach === 'never_raise' ? 'user' : 'auto',
      reason: asTrimmedString(avoidance?.possibleReason) ?? undefined,
    });
    if (negatives.length >= MAX_NEGATIVES) break;
  }

  if (signals?.dreams) {
    for (const dream of signals.dreams) {
      const text = asTrimmedString(dream?.description) ?? asTrimmedString(dream?.title);
      if (!text || isCrisisText(text)) continue;
      if (goals.length >= MAX_GOALS) break;
      goals.push({ text });
    }
  }

  const model = await sources.getUserModel(input.userId);
  const theoryOfMind = buildTheoryOfMind(model);

  let emotion = snapshot.emotion;
  const register = asTrimmedString(input.emotionRegister);
  if (register && register !== 'neutral' && !isCrisisText(register)) {
    emotion = {
      register,
      valence: asTrimmedString(input.emotionValence) ?? undefined,
    };
  }

  const recentTopics = (input.sessionId ? sources.getSessionTopics(input.sessionId) : [])
    .map((t) => asTrimmedString(t))
    .filter((t): t is string => Boolean(t) && !isCrisisText(t))
    .slice(0, MAX_TOPICS);

  return {
    ...snapshot,
    people,
    relations: relations.slice(0, MAX_RELATIONS),
    goals: goals.slice(0, MAX_GOALS),
    facts: facts.slice(0, MAX_FACTS),
    recentTopics,
    emotion,
    theoryOfMind,
    negatives,
  };
}
