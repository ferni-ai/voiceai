/**
 * Connection opportunities: the Relationship Network's rules for when to
 * gently suggest reconnecting, appreciating, checking in, setting a
 * boundary, or healing. Pure (no I/O) so both the network service
 * (relationship-network.ts, its own collection) and personal insights
 * (people profiles built from extracted memory) use the same rules.
 *
 * @module services/superhuman/connection-opportunities
 */

import type { ConnectionOpportunity, RelationshipPerson } from './relationship-network.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A friend's news counts as "going on" for this long. */
const LIFE_EVENT_DAYS = 10;

export function computeConnectionOpportunities(
  network: readonly RelationshipPerson[],
  now: number = Date.now(),
  max = 5
): ConnectionOpportunity[] {
  const opportunities: ConnectionOpportunity[] = [];

  for (const person of network) {
    const daysSinceLastMention = Math.floor((now - person.lastMentioned) / DAY_MS);

    // Check-in opportunity - something is going on in their life
    const news = (person.lifeEvents ?? [])
      .filter((e) => now - e.date <= LIFE_EVENT_DAYS * DAY_MS)
      .sort((a, b) => b.date - a.date)[0];
    if (news) {
      opportunities.push({
        personId: person.id,
        personName: person.name,
        type: 'check_in',
        reason: `${person.name} has something going on: ${news.text}`,
        suggestedAction: `Want to check in with ${person.name}?`,
        urgency: 'normal',
      });
    }

    // Reconnect opportunity - hasn't been mentioned in a while but was important
    if (daysSinceLastMention > 14 && person.importance > 0.5) {
      opportunities.push({
        personId: person.id,
        personName: person.name,
        type: 'reconnect',
        reason: `You haven't mentioned ${person.name} in ${daysSinceLastMention} days.`,
        suggestedAction: `Check in with ${person.name}? Sometimes people are waiting for us to reach out.`,
        urgency: daysSinceLastMention > 30 ? 'high' : 'normal',
      });
    }

    // Boundary opportunity - frequently mentioned with negative sentiment
    if (
      (person.sentiment === 'negative' || person.sentiment === 'tense') &&
      person.mentionCount > 5
    ) {
      opportunities.push({
        personId: person.id,
        personName: person.name,
        type: 'boundary',
        reason: `${person.name} keeps coming up, and it seems tense.`,
        suggestedAction: `Is there a boundary that needs setting with ${person.name}?`,
        urgency: 'normal',
      });
    }

    // Appreciation opportunity - positive relationship, could use recognition
    if (
      (person.sentiment === 'positive' || person.sentiment === 'very_positive') &&
      person.mentionCount > 3
    ) {
      const daysSincePositive = person.lastPositiveMention
        ? Math.floor((now - person.lastPositiveMention) / DAY_MS)
        : 999;
      if (daysSincePositive > 7) {
        opportunities.push({
          personId: person.id,
          personName: person.name,
          type: 'appreciation',
          reason: `${person.name} sounds important to you.`,
          suggestedAction: `Have you told ${person.name} how much they mean to you lately?`,
          urgency: 'low',
        });
      }
    }

    // Healing opportunity - ex or complicated relationship
    if (
      (person.type === 'ex' || person.sentiment === 'complicated') &&
      person.lastMentioned > now - 7 * DAY_MS
    ) {
      opportunities.push({
        personId: person.id,
        personName: person.name,
        type: 'healing',
        reason: `Your relationship with ${person.name} seems to still be processing.`,
        suggestedAction: `Want to talk through what's unresolved with ${person.name}?`,
        urgency: 'low',
      });
    }
  }

  const urgencyOrder = { high: 0, normal: 1, low: 2 };
  opportunities.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  return opportunities.slice(0, max);
}
