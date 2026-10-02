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
import { parseInterestStatements } from './interests.js';
import { parseMediaStatements } from './media.js';
import { isActive, normalizeItem, singular } from './rules.js';
import { parsePreferenceStatements } from './statements.js';
import { deletePreference, listPreferences, upsertPreference } from './store.js';
import type { PreferenceInput, UserPreference } from './types.js';
import { toInput, type SetPreferenceArgs } from './voice-mapping.js';

export {
  LIKE_CATEGORIES,
  toInput,
  VOICE_PREFERENCE_TYPES,
  type SetPreferenceArgs,
  type VoicePreferenceType,
} from './voice-mapping.js';

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
