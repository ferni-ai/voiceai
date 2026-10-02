/**
 * Voice preference vocabulary: the `setPreference` types and how each maps onto
 * the profile (domain, key, value, details). Pure.
 *
 * @module services/user-preferences/voice-mapping
 */

import { guessInterestKind } from './interests.js';
import { guessMusicKind, mediaInput } from './media.js';
import {
  ALLERGY_SEVERITIES,
  MEDIA_STATUSES,
  type AllergySeverity,
  type MediaStatus,
  type PreferenceDomain,
  type PreferenceInput,
  type Sentiment,
} from './types.js';

export const VOICE_PREFERENCE_TYPES = [
  'temperature',
  'distance',
  'units',
  'time-format',
  'nickname',
  'pronouns',
  'timezone',
  'language',
  'voice-speed',
  'response-length',
  'tone',
  'directness',
  'pace',
  'humor',
  'follow-up-questions',
  'avoid-topic',
  'do-not-contact',
  'sensitivity',
  'accountability',
  'motivation',
  'four-tendency',
  'like',
  'dislike',
  'interest',
  'music',
  'music-mood',
  'show',
  'movie',
  'book',
  'podcast',
  'game',
  'team',
  'allergy',
  'intolerance',
  'diet',
  'medical',
  'cuisine',
  'dish',
  'spice-tolerance',
  'cooking-skill',
  'recipe',
  'cooking-goal',
  'equipment',
  'custom',
] as const;
export type VoicePreferenceType = (typeof VOICE_PREFERENCE_TYPES)[number];

export const LIKE_CATEGORIES = [
  'food',
  'diet',
  'music',
  'activity',
  'brand',
  'place',
  'other',
] as const;

export interface SetPreferenceArgs {
  readonly preferenceType?: VoicePreferenceType;
  readonly type?: VoicePreferenceType;
  readonly value?: string;
  readonly customKey?: string;
  readonly category?: string;
  /** interest: a specific ("training for a 10k"); show/book: progress ("season 2");
   *  music-mood: the mood/activity ("working"). */
  readonly detail?: string;
  /** show/movie/book/podcast/game: watching, reading, finished, want_to... */
  readonly status?: string;
  readonly action?: 'set' | 'forget';
  /** The user's words, e.g. "I prefer shorter answers" — parsed when no type is given. */
  readonly statement?: string;
}

function pick(value: string, table: readonly [RegExp, string][], fallback: string): string {
  const hit = table.find(([re]) => re.test(value));
  return hit ? hit[1] : fallback;
}

function guessLikeCategory(value: string, category?: string): string {
  if (category && (LIKE_CATEGORIES as readonly string[]).includes(category)) return category;
  if (/\b(music|jazz|rock|pop|band|song|hip hop|classical|country)\b/i.test(value)) return 'music';
  if (/\b(vegetarian|vegan|gluten|dairy|keto|kosher|halal)\b/i.test(value)) return 'diet';
  if (/\b(food|pizza|sushi|coffee|tea|thai|indian|italian|mexican|spicy|chocolate)\b/i.test(value))
    return 'food';
  return 'other';
}

/** Map a typed voice preference onto the profile vocabulary. Pure. */
export function toInput(
  type: VoicePreferenceType,
  value: string,
  extra: { customKey?: string; category?: string; detail?: string; status?: string } = {}
): Omit<PreferenceInput, 'source' | 'confidence'> | null {
  const v = value.trim();
  const lower = v.toLowerCase();
  const one = (domain: PreferenceDomain, key: string, val: string) => ({ domain, key, value: val });
  switch (type) {
    case 'temperature':
      return one('practical', 'temperatureUnit', lower.includes('c') ? 'celsius' : 'fahrenheit');
    case 'distance':
      return one('practical', 'distanceUnit', /k|metric/.test(lower) ? 'kilometers' : 'miles');
    case 'units':
      return one('practical', 'units', /metric|k/.test(lower) ? 'metric' : 'imperial');
    case 'time-format':
      return one('practical', 'timeFormat', /24|military/.test(lower) ? '24h' : '12h');
    case 'nickname':
      return one('conversation', 'preferredName', v);
    case 'pronouns':
      return one('conversation', 'pronouns', v);
    case 'timezone':
      return one('practical', 'timezone', v);
    case 'language':
      return one('conversation', 'language', v);
    case 'voice-speed':
      return one(
        'practical',
        'voiceSpeed',
        pick(
          lower,
          [
            [/slow/, 'slow'],
            [/fast|quick/, 'fast'],
          ],
          'normal'
        )
      );
    case 'response-length':
      return one(
        'conversation',
        'responseLength',
        pick(
          lower,
          [
            [/short|brief|concise|less/, 'short'],
            [/long|detail|more/, 'long'],
          ],
          'medium'
        )
      );
    case 'tone':
      return one('conversation', 'tone', v);
    case 'directness':
      return one(
        'conversation',
        'directness',
        pick(
          lower,
          [
            [/direct|blunt|straight/, 'direct'],
            [/gentle|soft|kind/, 'gentle'],
          ],
          'balanced'
        )
      );
    case 'pace':
      return one(
        'conversation',
        'pace',
        pick(
          lower,
          [
            [/slow/, 'slow'],
            [/fast|quick|brisk/, 'fast'],
          ],
          'normal'
        )
      );
    case 'humor':
      return one(
        'conversation',
        'humor',
        pick(
          lower,
          [
            [/no|none|less|stop|skip/, 'none'],
            [/lot|more|love/, 'lots'],
          ],
          'light'
        )
      );
    case 'follow-up-questions':
      return one(
        'conversation',
        'followUpQuestions',
        pick(
          lower,
          [
            [/few|less|no|stop/, 'fewer'],
            [/more/, 'more'],
          ],
          'normal'
        )
      );
    case 'avoid-topic':
      return { domain: 'boundaries', key: `avoidTopic:${v}`, value: v };
    case 'sensitivity':
      return { domain: 'boundaries', key: `sensitivity:${v}`, value: v };
    case 'do-not-contact':
      return one('boundaries', 'doNotContact', v);
    case 'accountability':
      return one(
        'coaching',
        'accountabilityStyle',
        pick(
          lower,
          [
            [/firm|tough|hard|push/, 'firm'],
            [/gentle|easy|soft/, 'gentle'],
          ],
          'balanced'
        )
      );
    case 'motivation':
      return one('coaching', 'motivationStyle', v);
    case 'four-tendency':
      return one('coaching', 'fourTendency', lower);
    case 'like':
    case 'dislike': {
      const sentiment: Sentiment = type;
      const category = guessLikeCategory(v, extra.category);
      if (category === 'food' || category === 'diet') {
        return category === 'diet'
          ? { domain: 'food', key: `diet:${lower}`, value: lower, details: {} }
          : { domain: 'food', key: `dish:${lower}`, value: lower, sentiment, details: {} };
      }
      if (category === 'music') {
        const name = v.replace(/\s+music$/i, '');
        return mediaInput(guessMusicKind(name), name, { origin: 'user' }, 'explicit', 1, {
          sentiment,
        });
      }
      return { domain: 'likes', key: `${category}:${v}`, value: v, sentiment };
    }
    case 'music': {
      const name = v.replace(/\s+music$/i, '');
      return mediaInput(guessMusicKind(name), name, { origin: 'user' }, 'explicit', 1);
    }
    case 'music-mood': {
      const name = v.replace(/\s+music$/i, '');
      const context = extra.detail?.trim().toLowerCase();
      if (!context) return null;
      return mediaInput(
        guessMusicKind(name),
        name,
        { origin: 'user', contexts: [context] },
        'explicit',
        1
      );
    }
    case 'show':
    case 'movie':
    case 'book':
    case 'podcast':
    case 'game':
    case 'team': {
      const status = (MEDIA_STATUSES as readonly string[]).includes(extra.status ?? '')
        ? (extra.status as MediaStatus)
        : undefined;
      const progress = extra.detail?.trim().slice(0, 120);
      return mediaInput(
        type,
        v,
        { origin: 'user', ...(status ? { status } : {}), ...(progress ? { progress } : {}) },
        'explicit',
        1
      );
    }
    case 'interest': {
      const name = lower.replace(/[.!?]+$/, '');
      const detail = extra.detail?.trim().slice(0, 120);
      return {
        domain: 'interests',
        key: `interest:${name}`,
        value: name,
        details: { kind: guessInterestKind(name), ...(detail ? { specifics: [detail] } : {}) },
      };
    }
    case 'allergy':
    case 'intolerance': {
      const sev = (ALLERGY_SEVERITIES as readonly string[]).find((x) =>
        (extra.detail ?? '').toLowerCase().includes(x)
      );
      return {
        domain: 'food',
        key: `${type}:${lower}`,
        value: lower,
        details: sev ? { severity: sev as AllergySeverity } : {},
      };
    }
    case 'diet':
      return {
        domain: 'food',
        key: `diet:${lower.replace(' ', '-')}`,
        value: lower.replace(' ', '-'),
        details: {},
      };
    case 'medical':
      return { domain: 'food', key: `medical:${lower}`, value: lower, details: {} };
    case 'cuisine':
    case 'dish':
      return {
        domain: 'food',
        key: `${type}:${lower}`,
        value: lower,
        sentiment: 'like',
        details: {},
      };
    case 'spice-tolerance':
      return one(
        'food',
        'spiceTolerance',
        pick(
          lower,
          [
            [/none|no|can'?t/, 'none'],
            [/mild|little/, 'mild'],
            [/very|extra|super/, 'very_hot'],
            [/hot|spicy/, 'hot'],
          ],
          'medium'
        )
      );
    case 'cooking-skill':
      return one(
        'food',
        'cookingSkill',
        pick(
          lower,
          [
            [/begin|new|bad|terrible/, 'beginner'],
            [/advanced|chef|expert/, 'advanced'],
            [/confident|good/, 'confident'],
          ],
          'intermediate'
        )
      );
    case 'recipe': {
      const outcome = extra.detail?.trim().slice(0, 120);
      return {
        domain: 'food',
        key: `recipe:${lower}`,
        value: lower,
        details: outcome ? { outcome, status: 'finished' } : {},
      };
    }
    case 'cooking-goal':
      return { domain: 'food', key: `goal:${lower}`, value: lower, details: { status: 'want_to' } };
    case 'equipment':
      return { domain: 'food', key: `equipment:${lower}`, value: lower, details: {} };
    case 'custom':
      return extra.customKey
        ? { domain: 'practical', key: `custom:${extra.customKey}`, value: v }
        : null;
    default:
      return null;
  }
}
