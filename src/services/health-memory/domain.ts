/**
 * Health memory as seen by memory control: export and voice-forget search.
 * (Registration lives in services/memory-control/builtin-domains.ts.)
 *
 * @module services/health-memory/domain
 */

import { getConsent } from '../memory-consent/store.js';
import type { MemoryConsent } from '../memory-consent/types.js';
import { listMoodTimeline } from './mood-timeline.js';
import { listHealthItems } from './store.js';
import type { HealthItem, MoodConversation } from './types.js';

export interface HealthMemoryExport {
  readonly consent: MemoryConsent | null;
  readonly healthItems: readonly HealthItem[];
  readonly moodTimeline: readonly MoodConversation[];
  readonly exportedAt: string;
}

/** Everything health/mood plus the consent record (export is the user's right whatever the switches say). */
export async function exportHealthMemory(userId: string): Promise<HealthMemoryExport> {
  const [consent, healthItems, moodTimeline] = await Promise.all([
    getConsent(userId, { fresh: true }),
    listHealthItems(userId),
    listMoodTimeline(userId),
  ]);
  return {
    consent: consent.success ? consent.data : null,
    healthItems,
    moodTimeline,
    exportedAt: new Date().toISOString(),
  };
}

/** Health items matching a spoken description ("my knee", "the metformin"). */
export async function findHealthMemory(
  userId: string,
  query: string
): Promise<Array<{ id: string; label: string; score: number }>> {
  const { matchScore, tokenize } = await import('../memory-control/find.js');
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  return (await listHealthItems(userId))
    .map((i) => ({
      id: i.id,
      label: `the health note "${i.text}"`,
      score: matchScore(tokens, `${i.subject} ${i.text}`),
    }))
    .filter((m) => m.score >= 0.5);
}
