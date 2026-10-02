/**
 * Dream Keeper storage, backed by the canonical aspirations store
 * (`bogle_users/{uid}/aspirations`, level 'dream').
 *
 * The Dream shape is kept for the many existing readers (context builders,
 * insight generators, outreach); it's a view over aspiration records. The
 * old `dreams` collection is copied in once by the aspirations migration.
 *
 * @module services/superhuman/dream-keeper-storage
 */

import { createLogger } from '../../utils/safe-logger.js';
import { indexDream } from '../data-layer/integrations/index.js';
import {
  getAspiration,
  listAspirations,
  saveAspiration,
  titlesOverlap,
  upsertAspiration,
  type AspirationRecord,
  type AspirationStatus,
} from '../aspirations/index.js';
import type { Dream, DreamStatus, DreamType } from './dream-keeper.js';

const log = createLogger({ module: 'dream-keeper:storage' });

const DREAM_TYPES: readonly DreamType[] = [
  'career',
  'creative',
  'adventure',
  'relationship',
  'impact',
  'lifestyle',
  'growth',
  'healing',
];

const TO_DREAM_STATUS: Record<AspirationStatus, DreamStatus> = {
  active: 'alive',
  dormant: 'dormant',
  paused: 'deferred',
  achieved: 'achieved',
  'let-go': 'released',
};

const FROM_DREAM_STATUS: Record<DreamStatus, AspirationStatus> = {
  alive: 'active',
  dormant: 'dormant',
  deferred: 'paused',
  evolved: 'active',
  achieved: 'achieved',
  released: 'let-go',
};

export function generateDreamTitle(type: DreamType, statement: string): string {
  const prefixes: Record<DreamType, string> = {
    career: 'The career',
    creative: 'The creative project',
    adventure: 'The journey',
    relationship: 'The relationship',
    impact: 'The legacy',
    lifestyle: 'The life',
    growth: 'The becoming',
    healing: 'The healing',
  };
  const keyWords = statement
    .slice(0, 50)
    .replace(/^i (want|dream|wish|hope) to /i, '')
    .trim();
  return `${prefixes[type]}: ${keyWords}...`;
}

const ms = (iso: string | undefined): number | undefined =>
  iso ? new Date(iso).getTime() : undefined;

export function dreamFromRecord(
  userId: string,
  r: AspirationRecord,
  goals: AspirationRecord[] = []
): Dream {
  const type = DREAM_TYPES.includes(r.category as DreamType) ? (r.category as DreamType) : 'growth';
  const status = TO_DREAM_STATUS[r.status];
  return {
    id: r.id,
    userId,
    statement: r.title,
    type,
    title: generateDreamTitle(type, r.title),
    status,
    confidence: r.confidence,
    firstMentioned: ms(r.createdAt) ?? Date.now(),
    lastMentioned: ms(r.lastMentionedAt) ?? Date.now(),
    mentionCount: r.evidenceCount,
    ...(r.why ? { whyItMatters: r.why } : {}),
    obstacles: r.notes.filter((n) => n.startsWith('Obstacle: ')).map((n) => n.slice(10)),
    progressNotes: r.notes.filter((n) => !n.startsWith('Obstacle: ')),
    ...(r.personaId ? { personaId: r.personaId } : {}),
    connectedToGoals: goals.filter((g) => g.parentId === r.id).map((g) => g.id),
    ...(status === 'dormant' && r.statusChangedAt ? { dormantSince: ms(r.statusChangedAt) } : {}),
    ...(r.lastResurfacedAt ? { lastReminded: ms(r.lastResurfacedAt) } : {}),
  };
}

export async function loadUserDreams(userId: string): Promise<Dream[]> {
  const listed = await listAspirations(userId);
  if (!listed.success) {
    log.warn({ userId, error: listed.error.message }, 'Failed to load dreams');
    return [];
  }
  const goals = listed.data.filter((r) => r.level === 'goal');
  return listed.data
    .filter((r) => r.level === 'dream')
    .sort((a, b) => (a.lastMentionedAt < b.lastMentionedAt ? 1 : -1))
    .slice(0, 30)
    .map((r) => dreamFromRecord(userId, r, goals));
}

function indexForSearch(dream: Dream): void {
  indexDream(
    dream.userId,
    {
      id: dream.id,
      dream: dream.statement,
      category: dream.type,
      timeframe: undefined,
      status: dream.status === 'alive' ? 'active' : dream.status,
      steps: dream.progressNotes,
      obstacles: dream.obstacles,
    },
    'update'
  );
}

/** Persist a Dream view back onto its aspiration record. */
export async function saveDream(dream: Dream): Promise<void> {
  const existing = await getAspiration(dream.userId, dream.id);
  if (existing.success) {
    const r = existing.data;
    const status = FROM_DREAM_STATUS[dream.status];
    const now = new Date().toISOString();
    const userEdited = r.userEdited;
    await saveAspiration(dream.userId, {
      ...r,
      // The user's own edits win over Dream Keeper's automation.
      status: userEdited && status !== 'dormant' ? r.status : status,
      ...(status !== r.status ? { statusChangedAt: now } : {}),
      ...(dream.whyItMatters && !userEdited ? { why: dream.whyItMatters } : {}),
      lastMentionedAt: new Date(dream.lastMentioned).toISOString(),
      ...(dream.lastReminded
        ? { lastResurfacedAt: new Date(dream.lastReminded).toISOString() }
        : {}),
      updatedAt: now,
    });
  } else {
    await upsertAspiration(dream.userId, {
      level: 'dream',
      title: dream.statement,
      category: dream.type,
      status: FROM_DREAM_STATUS[dream.status],
      ...(dream.whyItMatters ? { why: dream.whyItMatters } : {}),
      source: dream.confidence >= 0.85 ? 'explicit' : 'inferred',
      confidence: dream.confidence,
      ...(dream.personaId ? { personaId: dream.personaId } : {}),
    });
  }
  indexForSearch(dream);
  try {
    const { captureDream } = await import('../memory-lane/real-time-collector.js');
    void captureDream({
      userId: dream.userId,
      dreamId: dream.id,
      statement: dream.statement,
      type: dream.type,
      personaId: dream.personaId,
    });
  } catch {
    // Memory capture is optional
  }
}

export async function recordDreamMention(
  userId: string,
  detected: { type: DreamType; statement: string; confidence: number },
  ctx: { conversationId?: string; personaId?: string } = {}
): Promise<Dream> {
  const dreams = await listAspirations(userId, { level: 'dream' });
  const similar = dreams.success
    ? dreams.data.find((d) => titlesOverlap(d.title, detected.statement))
    : undefined;
  const out = await upsertAspiration(userId, {
    level: 'dream',
    title: similar?.title ?? detected.statement,
    category: detected.type,
    source: detected.confidence >= 0.85 ? 'explicit' : 'inferred',
    confidence: detected.confidence,
    ...(ctx.conversationId ? { sourceConversationIds: [ctx.conversationId] } : {}),
    ...(ctx.personaId ? { personaId: ctx.personaId } : {}),
  });
  const record = out.success ? out.data.record : undefined;
  const dream: Dream = record
    ? dreamFromRecord(userId, record)
    : {
        id: out.success ? out.data.id : 'unsaved',
        userId,
        statement: detected.statement,
        type: detected.type,
        title: generateDreamTitle(detected.type, detected.statement),
        status: 'alive',
        confidence: detected.confidence,
        firstMentioned: Date.now(),
        lastMentioned: Date.now(),
        mentionCount: 1,
        obstacles: [],
        progressNotes: [],
      };
  if (record) indexForSearch(dream);
  log.info(
    { userId, dreamType: dream.type, status: out.success ? out.data.status : 'failed' },
    'Dream mention recorded'
  );
  return dream;
}
