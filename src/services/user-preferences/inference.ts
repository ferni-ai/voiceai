/**
 * Inferred preferences: from conversation turns and summaries, from the
 * existing music/lifestyle extractors, and from B's dynamic_facts.
 *
 * Nothing here changes behaviour on its own: inferred preferences become
 * ACTIVE only with repeated evidence or high confidence (rules.isActive).
 * Statements in the user's own words ("I prefer shorter answers") are recorded
 * as `explicit` — but never override a deliberate user setting.
 *
 * @module services/user-preferences/inference
 */

import {
  extractMusicPreferences,
  hasMusicContext,
  type ExtractedMusicPreference,
} from '../../audio/music-preference-extractor.js';
import {
  extractPreferences,
  hasPreferenceContent,
  type ExtractedPreference,
} from '../../intelligence/tracking/preferences.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isHealthCategoryEnabled } from './food.js';
import { parseFoodStatements } from './food-capture.js';
import { interestFromActivity, parseInterestStatements } from './interests.js';
import {
  fromMusicExtraction,
  guessMusicKind,
  mediaInput,
  parseMediaStatements,
  type MediaKind,
} from './media.js';
import { parsePreferenceStatements } from './statements.js';
import { upsertPreference } from './store.js';
import type { PreferenceInput, UpsertResult } from './types.js';

const log = createLogger({ module: 'UserPreferenceInference' });

/** Fact categories (B's schema + legacy `factType`) that carry preferences. */
export const PREFERENCE_FACT_CATEGORIES: ReadonlySet<string> = new Set([
  'preference',
  'preferences',
  'like',
  'likes',
  'dislike',
  'dislikes',
  'likes_dislikes',
  'food_preference',
  'music_preference',
  'hobby',
  'interest',
  'allergy',
  'allergies',
  'dietary_restriction',
]);

/** Map the lifestyle extractor's categories onto likes prefixes. */
const LIFESTYLE_TO_LIKES: Readonly<Record<string, string>> = {
  favorite_place: 'place',
  bucket_list_destination: 'place',
  shopping_preference: 'brand',
};

/** Lifestyle categories that belong to food & cooking. */
const LIFESTYLE_TO_FOOD: Readonly<Record<string, string>> = {
  cuisine_preference: 'cuisine',
  drink_preference: 'drink',
  restaurant_favorite: 'restaurant',
  dietary_restriction: 'diet',
  allergy: 'allergy',
};

/** Lifestyle categories that belong to music & entertainment. */
const LIFESTYLE_TO_MEDIA: Readonly<Record<string, MediaKind>> = {
  music_genre: 'genre',
  music_artist: 'artist',
  tv_show: 'show',
  sports_team: 'team',
};

/** Lifestyle categories that are really interests/hobbies. */
const LIFESTYLE_TO_INTERESTS: ReadonlySet<string> = new Set([
  'exercise_routine',
  'wellness_practice',
  'skill_building',
  'learning_goal',
]);

export function fromLifestyleExtraction(
  prefs: readonly ExtractedPreference[],
  conversationId?: string
): PreferenceInput[] {
  const out: PreferenceInput[] = [];
  for (const p of prefs) {
    const media = LIFESTYLE_TO_MEDIA[p.category];
    if (media && p.value) {
      out.push(
        mediaInput(media, p.value, { origin: 'conversation' }, 'inferred', p.confidence, {
          sentiment: p.isNegative ? 'dislike' : 'like',
          conversationId,
        })
      );
      continue;
    }
    if (LIFESTYLE_TO_INTERESTS.has(p.category) && p.value && !p.isNegative) {
      out.push(interestFromActivity(p.value, 'inferred', p.confidence, conversationId));
      continue;
    }
    const foodPrefix = LIFESTYLE_TO_FOOD[p.category];
    if (foodPrefix && p.value) {
      out.push({
        domain: 'food',
        key: `${foodPrefix}:${p.value}`,
        value: p.value,
        ...(foodPrefix === 'allergy' || foodPrefix === 'diet'
          ? { details: {} }
          : { sentiment: p.isNegative ? 'dislike' : 'like', details: {} }),
        source: 'inferred',
        confidence: p.confidence,
        ...(conversationId ? { conversationId } : {}),
      });
      continue;
    }
    const prefix = LIFESTYLE_TO_LIKES[p.category];
    if (!prefix || !p.value) continue;
    out.push({
      domain: 'likes',
      key: `${prefix}:${p.value}`,
      value: p.value,
      sentiment: p.isNegative ? 'dislike' : 'like',
      source: 'inferred',
      confidence: p.confidence,
      ...(conversationId ? { conversationId } : {}),
    });
  }
  return out;
}

export interface FactLike {
  readonly id: string;
  readonly text?: string;
  readonly category?: string;
  readonly factType?: string;
  readonly key?: string;
  readonly value?: string;
  readonly confidence?: number;
  readonly sourceConversationIds?: readonly string[];
}

const MUSIC_HINT =
  /\b(music|song|band|artist|album|jazz|rock|pop|hip hop|classical|country|indie|metal)\b/i;
const FOOD_HINT =
  /\b(food|eat|eating|dish|cuisine|coffee|tea|pizza|sushi|restaurant|cook|vegetarian|vegan)\b/i;
const NEGATIVE =
  /\b(dislikes?|hates?|can'?t stand|doesn'?t like|does not like|not a fan|avoids?)\b/i;

/** Pure: turn preference-category facts into inferred inputs (read-only use of B's data). */
export function preferencesFromFacts(
  facts: readonly FactLike[],
  conversationId?: string
): PreferenceInput[] {
  const out: PreferenceInput[] = [];
  for (const f of facts) {
    const category = (f.category ?? f.factType ?? '').toLowerCase();
    if (!PREFERENCE_FACT_CATEGORIES.has(category)) continue;
    const raw = (f.value ?? f.text ?? '').trim();
    if (!raw || raw.length > 120) continue;
    const item = raw
      .replace(
        /^(?:user|they|he|she)\s+(?:really\s+)?(?:likes?|loves?|enjoys?|prefers?|dislikes?|hates?|can'?t stand|(?:is|are) allergic to)\s+/i,
        ''
      )
      .replace(/[.!]+$/, '')
      .trim();
    if (!item || item.split(' ').length > 6) continue;
    const context = `${f.key ?? ''} ${f.text ?? ''} ${raw}`;
    const sentiment = NEGATIVE.test(context) || category.startsWith('dislike') ? 'dislike' : 'like';
    const confidence = Math.min(0.8, (f.confidence ?? 0.6) * 0.9);
    if (category.startsWith('allerg') || category === 'dietary_restriction') {
      const key = category === 'dietary_restriction' ? 'diet' : 'allergy';
      const value = item.replace(/^(?:is )?allergic to /i, '');
      out.push({
        domain: 'food',
        key: `${key}:${value}`,
        value,
        details: {},
        source: 'inferred',
        confidence,
        factId: f.id,
        ...(conversationId ? { conversationId } : {}),
      });
      continue;
    }
    if ((category === 'hobby' || category === 'interest') && sentiment === 'like') {
      out.push({
        ...interestFromActivity(item, 'inferred', confidence, conversationId),
        factId: f.id,
      });
      continue;
    }
    if (MUSIC_HINT.test(context) || category === 'music_preference') {
      out.push({
        ...mediaInput(
          guessMusicKind(item),
          item,
          { origin: 'conversation' },
          'inferred',
          confidence,
          { sentiment, conversationId }
        ),
        factId: f.id,
      });
      continue;
    }
    const isFood = FOOD_HINT.test(context);
    out.push({
      domain: isFood ? 'food' : 'likes',
      key: `${isFood ? 'dish' : 'other'}:${item}`,
      ...(isFood ? { details: {} } : {}),
      value: item,
      sentiment,
      source: 'inferred',
      confidence,
      factId: f.id,
      ...(conversationId ? { conversationId } : {}),
    });
  }
  return out;
}

/** Liked activities ("I love hiking") are interests, not plain likes. */
function activitiesToInterests(inputs: readonly PreferenceInput[]): PreferenceInput[] {
  return inputs.map((p) =>
    p.domain === 'likes' && p.key.startsWith('activity:') && p.sentiment !== 'dislike'
      ? interestFromActivity(p.value, p.source, p.confidence, p.conversationId)
      : p
  );
}

/** Everything one user utterance tells us (explicit statements + reused extractors). */
export function inputsFromUserText(
  text: string,
  conversationId?: string,
  opts: { healthEnabled?: boolean } = {}
): PreferenceInput[] {
  const inputs = activitiesToInterests(
    parsePreferenceStatements(text, 'explicit', 0.9, conversationId)
  );
  inputs.push(...parseInterestStatements(text, 'explicit', 0.9, conversationId));
  inputs.push(...parseMediaStatements(text, 'explicit', 0.9, conversationId));
  inputs.push(
    ...parseFoodStatements(text, 'explicit', 0.9, {
      conversationId,
      healthEnabled: opts.healthEnabled,
    })
  );
  if (hasMusicContext(text))
    inputs.push(...fromMusicExtraction(extractMusicPreferences(text), conversationId));
  if (hasPreferenceContent(text))
    inputs.push(...fromLifestyleExtraction(extractPreferences(text), conversationId));
  return inputs;
}

async function applyAll(
  userId: string,
  inputs: readonly PreferenceInput[]
): Promise<UpsertResult[]> {
  const results: UpsertResult[] = [];
  for (const input of inputs) results.push(await upsertPreference(userId, input));
  return results;
}

/** Live capture for one user turn (called from the voice agent's preference handler). */
export async function recordUserTurnPreferences(
  userId: string,
  text: string,
  conversationId?: string
): Promise<UpsertResult[]> {
  if (!userId || userId === 'anonymous') return [];
  const healthEnabled = await isHealthCategoryEnabled(userId);
  return applyAll(userId, inputsFromUserText(text, conversationId, { healthEnabled }));
}

/** Persist the music extractor's output into the profile (single store for music likes). */
export async function recordMusicPreferences(
  userId: string,
  prefs: readonly ExtractedMusicPreference[],
  conversationId?: string
): Promise<UpsertResult[]> {
  if (!userId || userId === 'anonymous') return [];
  return applyAll(userId, fromMusicExtraction(prefs, conversationId));
}

async function factsForConversation(userId: string, conversationId: string): Promise<FactLike[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('dynamic_facts')
      .where('sourceConversationIds', 'array-contains', conversationId)
      .limit(200)
      .get();
    return (snap.docs ?? []).map((d) => ({ id: d.id, ...(d.data() as Omit<FactLike, 'id'>) }));
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Could not read facts for preference inference');
    return [];
  }
}

export interface SummarizedTurn {
  readonly role: 'user' | 'assistant' | string;
  readonly text: string;
}

/**
 * Hook for A's session-end / catch-up summarisation:
 *   await onConversationSummarized(userId, conversationId, summary, turns)
 * Reads user turns (explicit statements), the summary (paraphrase → inferred,
 * lower confidence) and this conversation's preference facts (inferred).
 */
export async function onConversationSummarized(
  userId: string,
  conversationId: string,
  summary: string,
  turns: readonly SummarizedTurn[]
): Promise<{ applied: number; skipped: number }> {
  if (!userId || userId === 'anonymous' || !conversationId) return { applied: 0, skipped: 0 };
  const inputs: PreferenceInput[] = [];
  const healthEnabled = await isHealthCategoryEnabled(userId);
  for (const turn of turns) {
    if (turn.role === 'user' && turn.text) {
      inputs.push(...inputsFromUserText(turn.text, conversationId, { healthEnabled }));
    }
  }
  if (summary) {
    inputs.push(
      ...activitiesToInterests(parsePreferenceStatements(summary, 'inferred', 0.6, conversationId))
    );
    inputs.push(...parseInterestStatements(summary, 'inferred', 0.6, conversationId));
    inputs.push(...parseMediaStatements(summary, 'inferred', 0.6, conversationId));
    inputs.push(
      ...parseFoodStatements(summary, 'inferred', 0.6, { conversationId, healthEnabled })
    );
  }
  inputs.push(
    ...preferencesFromFacts(await factsForConversation(userId, conversationId), conversationId)
  );

  const results = await applyAll(userId, inputs);
  const applied = results.filter((r) =>
    ['created', 'updated', 'reinforced'].includes(r.outcome)
  ).length;
  log.debug(
    { userId, conversationId, applied, total: results.length },
    'Preferences inferred from conversation'
  );
  return { applied, skipped: results.length - applied };
}
