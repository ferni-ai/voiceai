/**
 * Voice-facing preference operations, shared by the `setPreference` /
 * `getPreferences` tools (native function calling) and their JSON-workaround
 * executor (Gemini Live). Returns short, spoken-friendly strings.
 *
 * A voice command is a deliberate user setting (userEdited), so it beats
 * anything inferred or mined from conversation.
 *
 * @module services/user-preferences/voice
 */

import { isHealthCategoryEnabled } from './food.js';
import { parseFoodStatements } from './food-capture.js';
import { guessInterestKind, parseInterestStatements } from './interests.js';
import { guessMusicKind, mediaInput, parseMediaStatements } from './media.js';
import { isActive, normalizeItem, singular } from './rules.js';
import { parsePreferenceStatements } from './statements.js';
import { deletePreference, listPreferences, upsertPreference } from './store.js';
import {
  ALLERGY_SEVERITIES,
  MEDIA_STATUSES,
  type AllergySeverity,
  type MediaStatus,
  type PreferenceDomain,
  type PreferenceInput,
  type Sentiment,
  type UserPreference,
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

function confirmation(p: UserPreference): string {
  switch (p.key) {
    case 'temperatureUnit':
      return `I'll show temperatures in ${p.value === 'celsius' ? 'Celsius (°C)' : 'Fahrenheit (°F)'} from now on.`;
    case 'distanceUnit':
      return `I'll use ${p.value} for distances.`;
    case 'timeFormat':
      return `I'll show times in ${p.value === '24h' ? '24-hour' : '12-hour'} format.`;
    case 'preferredName':
      return `Got it! I'll call you ${p.value}.`;
    case 'responseLength':
      return p.value === 'short'
        ? "Got it. I'll keep things short."
        : p.value === 'long'
          ? "Sure, I'll give you fuller answers."
          : 'Okay, medium-length answers it is.';
    default:
      break;
  }
  if (p.domain === 'boundaries' && p.key.startsWith('avoidTopic:'))
    return `Understood. I won't bring up ${p.value} unless you do.`;
  if (p.domain === 'boundaries' && p.key === 'doNotContact')
    return `Okay, I won't reach out during ${p.value}.`;
  if (p.domain === 'interests') return `Love that. I'll remember you're into ${p.value}.`;
  if (p.domain === 'food') {
    const kind = p.key.split(':')[0];
    if (kind === 'allergy')
      return `Got it. You're allergic to ${p.value}; I'll always keep that in mind with food.`;
    if (kind === 'intolerance') return `Noted: ${p.value} doesn't agree with you.`;
    if (kind === 'diet') return `Got it: ${p.value}.`;
    if (kind === 'medical') return `Okay, I'll steer clear of ${p.value}.`;
    if (kind === 'recipe' && p.details?.outcome)
      return `Noted: the ${p.value} came out ${p.details.outcome}.`;
    if (kind === 'goal') return `Love it. Learning to make ${p.value} it is.`;
  }
  if (p.domain === 'media') {
    const d = p.details ?? {};
    if (d.contexts?.length)
      return `Got it: ${p.value} when you're ${d.contexts[d.contexts.length - 1]}.`;
    if (d.status || d.progress)
      return `Noted: ${p.value}${d.progress ? `, ${d.progress}` : ''}${d.status ? ` (${d.status.replace('_', ' ')})` : ''}.`;
    return p.sentiment === 'dislike' ? `Got it, no ${p.value}.` : `Noted: you like ${p.value}.`;
  }
  if (p.domain === 'likes')
    return `Noted: you ${p.sentiment === 'dislike' ? "don't like" : 'like'} ${p.value}.`;
  return `Noted. ${labelFor(p)}: ${p.value}.`;
}

const LABELS: Record<string, string> = {
  preferredName: 'Name',
  pronouns: 'Pronouns',
  language: 'Language',
  responseLength: 'Answer length',
  tone: 'Tone',
  directness: 'Directness',
  pace: 'Pace',
  humor: 'Humour',
  followUpQuestions: 'Follow-up questions',
  doNotContact: 'Quiet hours',
  accountabilityStyle: 'Accountability',
  motivationStyle: 'Motivation',
  fourTendency: 'Tendency',
  units: 'Units',
  spiceTolerance: 'Spice',
  cookingSkill: 'Cooking',
  temperatureUnit: 'Temperature',
  distanceUnit: 'Distance',
  timeFormat: 'Time format',
  timezone: 'Timezone',
  voiceSpeed: 'Voice speed',
};

export function labelFor(p: Pick<UserPreference, 'key'>): string {
  const [prefix, ...rest] = p.key.split(':');
  if (rest.length > 0) return prefix === 'custom' ? rest.join(':') : prefix;
  return LABELS[p.key] ?? p.key;
}

async function forget(userId: string, args: SetPreferenceArgs): Promise<string> {
  const target = normalizeItem(
    args.value ??
      args.statement?.replace(/^.*?\b(?:that i (?:like|love|hate)|about|my)\s+/i, '') ??
      ''
  );
  const prefs = await listPreferences(userId);
  const type = args.preferenceType ?? args.type;
  const mapped = type && args.value ? toInput(type, args.value, args) : null;
  const matches = prefs.filter((p) => {
    if (
      mapped &&
      p.domain === mapped.domain &&
      (p.key === mapped.key || normalizeItem(p.key) === normalizeItem(mapped.key))
    )
      return true;
    if (mapped && !mapped.key.includes(':') && p.key === mapped.key) return true;
    return Boolean(target) && [target, singular(target)].includes(normalizeItem(p.value));
  });
  if (matches.length === 0)
    return target ? `I don't have anything saved about ${target}.` : 'What should I forget?';
  for (const p of matches) await deletePreference(userId, p.id, 'voice_forget');
  return `Done. I've forgotten that${matches.length === 1 ? '' : ` (${matches.length} things)`}.`;
}

/** Execute a set/forget request from voice. */
export async function setPreferenceFromVoice(
  userId: string | undefined,
  args: SetPreferenceArgs,
  conversationId?: string
): Promise<string> {
  if (!userId || userId === 'anonymous') {
    return "I can't save that until you're signed in, but I'll keep it in mind for now.";
  }
  if (args.action === 'forget') return forget(userId, args);

  const type = args.preferenceType ?? args.type;
  let inputs: Omit<PreferenceInput, 'source' | 'confidence'>[] = [];
  if (type && args.value) {
    const mapped = toInput(type, args.value, args);
    if (mapped) inputs = [mapped];
  } else if (args.statement || args.value) {
    const said = args.statement ?? args.value ?? '';
    inputs = [
      ...parsePreferenceStatements(said, 'explicit', 1),
      ...parseInterestStatements(said, 'explicit', 1),
      ...parseMediaStatements(said, 'explicit', 1),
      ...parseFoodStatements(said, 'explicit', 1),
    ];
  }
  if (inputs.length === 0) {
    return "I need to know what preference you're setting. Try: 'Use celsius', 'Call me Alex' or 'Keep answers short'.";
  }

  if (
    inputs.some((i) => i.key.startsWith('medical:')) &&
    !(await isHealthCategoryEnabled(userId))
  ) {
    inputs = inputs.filter((i) => !i.key.startsWith('medical:'));
    if (inputs.length === 0) return "Health memories are switched off, so I won't save that one.";
  }
  const saved: UserPreference[] = [];
  for (const input of inputs) {
    const result = await upsertPreference(userId, {
      ...input,
      source: 'explicit',
      confidence: 1,
      userEdited: true,
      ...(conversationId ? { conversationId } : {}),
    });
    if (result.preference) saved.push(result.preference);
  }
  if (saved.length === 0) return "Hmm, I couldn't save that one. Could you say it another way?";
  return saved.map(confirmation).join(' ');
}

/** "What do you know about my preferences?" */
export async function describePreferencesForVoice(userId: string | undefined): Promise<string> {
  if (!userId || userId === 'anonymous') return "I haven't saved any preferences for you yet.";
  const prefs = await listPreferences(userId);
  if (prefs.length === 0) {
    return "I haven't saved any preferences yet. You can tell me things like 'call me Sam', 'keep answers short' or 'don't bring up work'.";
  }
  const active = prefs.filter(isActive);
  const tentative = prefs.length - active.length;
  const lines = active.slice(0, 12).map((p) => {
    if (p.domain === 'food') {
      const [kind] = p.key.split(':');
      if (kind === 'allergy')
        return `• Allergic to ${p.value}${p.details?.severity ? ` (${p.details.severity})` : ''}`;
      if (p.sentiment === 'dislike') return `• Not a fan of ${p.value}`;
      return `• ${labelFor(p)}: ${p.value}${p.details?.outcome ? ` (came out ${p.details.outcome})` : ''}`;
    }
    if (p.domain === 'media') {
      const d = p.details ?? {};
      const extra = [
        d.progress,
        d.status?.replace('_', ' '),
        d.contexts?.length ? `for ${d.contexts.join(', ')}` : '',
      ].filter(Boolean);
      return `• ${p.sentiment === 'dislike' ? 'Not a fan of' : p.key.split(':')[0]} ${p.value}${extra.length ? ` (${extra.join(', ')})` : ''}`;
    }
    if (p.domain === 'interests') {
      const specific = p.details?.specifics?.[p.details.specifics.length - 1];
      return `• Into ${p.value}${specific ? ` (${specific})` : ''}`;
    }
    if (p.domain === 'likes')
      return `• ${p.sentiment === 'dislike' ? 'Not a fan of' : 'Likes'} ${p.value}`;
    if (p.key.startsWith('avoidTopic:')) return `• I won't bring up ${p.value}`;
    if (p.key.startsWith('sensitivity:')) return `• Handle gently: ${p.value}`;
    return `• ${labelFor(p)}: ${p.value}`;
  });
  const more =
    active.length > 12 ? `\n…and ${active.length - 12} more on your Preferences page.` : '';
  const hunch =
    tentative > 0
      ? `\nI'm still getting a feel for ${tentative} other thing${tentative === 1 ? '' : 's'}.`
      : '';
  return `Here's what I go by:\n${lines.join('\n')}${more}${hunch}\nWant me to change or forget any of it?`;
}
