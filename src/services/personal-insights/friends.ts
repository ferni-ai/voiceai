/**
 * Keep-in-touch nudges for friends, using the Relationship Network's own
 * rules (superhuman/connection-opportunities.ts) on people profiles built
 * from the user's extracted memory, so nudges carry provenance and vanish
 * when their sources are deleted.
 *
 * Only gentle kinds are surfaced here: a check-in when a friend has news,
 * or a reconnect when a close friend has not come up in a while. Boundary
 * and healing suggestions stay out of proactive openers.
 *
 * @module services/personal-insights/friends
 */

import { computeConnectionOpportunities } from '../superhuman/connection-opportunities.js';
import type {
  RelationshipPerson,
  RelationshipSentiment,
  RelationshipType,
} from '../superhuman/relationship-network.js';
import { sensitivityOf } from './text-utils.js';
import type { GroundedItem, PersonProfile } from './types.js';

const NUDGE_TYPES = new Set(['check_in', 'reconnect']);

function typeOf(p: PersonProfile): RelationshipType {
  switch (p.group) {
    case 'family':
      return 'family';
    case 'partner':
      return 'partner';
    case 'friend':
      return 'friend';
    case 'work':
      return p.relationship === 'boss' ? 'mentor' : 'colleague';
    default:
      return 'acquaintance';
  }
}

function sentimentOf(p: PersonProfile): RelationshipSentiment {
  return p.sentimentTrend === 'improving'
    ? 'positive'
    : p.sentimentTrend === 'declining'
      ? 'tense'
      : 'neutral';
}

/** Adapt a profile to the Relationship Network's person shape. */
export function toRelationshipPerson(p: PersonProfile, userId: string): RelationshipPerson {
  const closeness = p.connection?.closeness;
  return {
    id: p.id,
    userId,
    name: p.name,
    aliases: [...p.aliases],
    type: typeOf(p),
    sentiment: sentimentOf(p),
    importance: closeness === 'close' ? 0.8 : closeness === 'regular' ? 0.5 : 0.2,
    firstMentioned: p.firstMentionedAt,
    lastMentioned: p.lastMentionedAt,
    mentionCount: p.mentionCount,
    recentMentions: [],
    themes: [],
    positiveAspects: [],
    painPoints: [],
    contextNotes: [],
    lifeEvents: (p.connection?.lifeEvents ?? []).map((e) => ({
      date: e.mentionedAt,
      text: e.text,
    })),
  };
}

/** Gentle keep-in-touch suggestions for friends, grounded in their profiles. */
export function keepInTouchNudges(
  people: readonly PersonProfile[],
  userId: string,
  nowMs: number,
  max = 2
): GroundedItem[] {
  const friends = people.filter(
    (p) =>
      p.kind === 'person' &&
      !p.memorial &&
      p.connection &&
      (p.group === 'friend' || p.connection.closeness === 'close')
  );
  const byId = new Map(friends.map((p) => [p.id, p]));
  const opportunities = computeConnectionOpportunities(
    friends.map((p) => toRelationshipPerson(p, userId)),
    nowMs,
    friends.length * 5
  ).filter((o) => NUDGE_TYPES.has(o.type));

  const out: GroundedItem[] = [];
  for (const o of opportunities) {
    const p = byId.get(o.personId);
    if (!p || out.some((n) => n.personId === p.id)) continue;
    const news =
      o.type === 'check_in'
        ? p.connection?.lifeEvents[p.connection.lifeEvents.length - 1]
        : undefined;
    const text = `${o.reason} ${o.suggestedAction}`;
    out.push({
      text,
      evidence: [`person:${p.id}`],
      sensitive: sensitivityOf(text),
      personId: p.id,
      sourceConversationIds: news ? [...news.sourceConversationIds] : [...p.sourceConversationIds],
    });
    if (out.length >= max) break;
  }
  return out;
}
