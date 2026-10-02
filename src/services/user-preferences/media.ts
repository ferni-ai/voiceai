/**
 * Music & entertainment — the `media` domain of the preference profile.
 *
 * Keys: `artist|genre|song:<name>` (music) and `show|movie|book|podcast|game|team:<name>`
 * (entertainment). Details carry status/progress/opinion, moods-to-music
 * contexts ("working", "runs"), memories and related people.
 *
 * Precedence for music: user edits > explicit statements > conversation
 * mentions / listening history (inferred). Listening history (Spotify library
 * sync) is stored as inferred with `origin: 'listening_history'` — it never
 * overrides anything the user said, but it beats knowing nothing.
 *
 * Callers:
 *   DJ (music-executor): resolveMusicQueryForUser(userId, query) for generic
 *     "play something" / mood requests.
 *   F (openers): getMediaProfile(userId).inProgress — "Did you finish the season?"
 *     (still gate with isTopicAllowedProactively).
 *   Spotify library sync: importListeningHistory(userId, { artists, genres }).
 *
 * @module services/user-preferences/media
 */

import type { ExtractedMusicPreference } from '../../audio/music-preference-extractor.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isActive, rankOf } from './rules.js';
import { listPreferences, upsertPreference } from './store.js';
import type {
  InterestDetails,
  InterestPerson,
  MediaStatus,
  PreferenceInput,
  PreferenceSource,
  UpsertResult,
  UserPreference,
} from './types.js';

const log = createLogger({ module: 'UserPreferenceMedia' });

export const MUSIC_KINDS = ['artist', 'genre', 'song'] as const;
export const ENTERTAINMENT_KINDS = ['show', 'movie', 'book', 'podcast', 'game', 'team'] as const;
export type MediaKind = (typeof MUSIC_KINDS)[number] | (typeof ENTERTAINMENT_KINDS)[number];

const KNOWN_GENRES =
  /^(pop|rock|jazz|classical|hip hop|hip-hop|rap|r&b|rnb|country|folk|electronic|edm|house|techno|metal|punk|indie|blues|soul|funk|reggae|latin|k-pop|kpop|lo-fi|lofi|ambient|disco|gospel|opera|grunge|alternative|upbeat|chill|acoustic|instrumental)( music)?$/i;

export function guessMusicKind(name: string): 'artist' | 'genre' {
  return KNOWN_GENRES.test(name.trim()) ? 'genre' : 'artist';
}

export interface MediaItem {
  readonly id: string;
  readonly kind: MediaKind;
  readonly name: string;
  readonly sentiment: 'like' | 'dislike';
  readonly status?: MediaStatus;
  readonly progress?: string;
  readonly opinion?: string;
  readonly contexts: readonly string[];
  readonly memories: readonly string[];
  readonly relatedPeople: readonly InterestPerson[];
  readonly fromListeningHistory: boolean;
  readonly userEdited: boolean;
  readonly source: PreferenceSource;
  readonly active: boolean;
  readonly lastMentionedAt?: string;
}

export interface MediaProfile {
  readonly music: {
    /** What they've said they like (or edited), strongest first. */
    readonly favorites: readonly MediaItem[];
    readonly dislikes: readonly MediaItem[];
    /** Mood/activity → picks: { context: 'working', picks: ['jazz'] }. */
    readonly moods: readonly { readonly context: string; readonly picks: readonly string[] }[];
    /** From the connected music library, used only when nothing better is known. */
    readonly listeningHistory: readonly MediaItem[];
  };
  readonly entertainment: readonly MediaItem[];
  /** Watching / reading / listening / playing now — good follow-up material. */
  readonly inProgress: readonly MediaItem[];
}

export function toMediaItem(p: UserPreference): MediaItem {
  const d: InterestDetails = p.details ?? {};
  const kind = p.key.split(':')[0] as MediaKind;
  return {
    id: p.id,
    kind,
    name: p.value,
    sentiment: p.sentiment === 'dislike' ? 'dislike' : 'like',
    ...(d.status ? { status: d.status } : {}),
    ...(d.progress ? { progress: d.progress } : {}),
    ...(d.opinion ? { opinion: d.opinion } : {}),
    contexts: d.contexts ?? [],
    memories: d.memories ?? [],
    relatedPeople: d.relatedPeople ?? [],
    fromListeningHistory:
      d.origin === 'listening_history' && !p.userEdited && p.source !== 'explicit',
    userEdited: p.userEdited,
    source: p.source,
    active: isActive(p),
    ...(d.lastMentionedAt ? { lastMentionedAt: d.lastMentionedAt } : {}),
  };
}

const IN_PROGRESS: ReadonlySet<string> = new Set([
  'watching',
  'reading',
  'listening',
  'playing',
  'following',
]);

function strength(p: UserPreference): number {
  return rankOf(p) * 10 + p.confidence + p.sourceConversationIds.length * 0.1;
}

/** Pure: build the media profile from preference docs. */
export function mediaProfileFrom(prefs: readonly UserPreference[]): MediaProfile {
  const media = prefs.filter((p) => p.domain === 'media').sort((a, b) => strength(b) - strength(a));
  const items = media.map(toMediaItem);
  const music = items.filter((i) => (MUSIC_KINDS as readonly string[]).includes(i.kind));
  const favorites = music.filter(
    (i) => i.sentiment === 'like' && !i.fromListeningHistory && i.active
  );
  const moods = new Map<string, string[]>();
  for (const item of music.filter((i) => i.sentiment === 'like')) {
    for (const ctx of item.contexts) moods.set(ctx, [...(moods.get(ctx) ?? []), item.name]);
  }
  const entertainment = items.filter((i) =>
    (ENTERTAINMENT_KINDS as readonly string[]).includes(i.kind)
  );
  return {
    music: {
      favorites,
      dislikes: music.filter((i) => i.sentiment === 'dislike'),
      moods: [...moods.entries()].map(([context, picks]) => ({ context, picks })),
      listeningHistory: music.filter((i) => i.fromListeningHistory && i.sentiment === 'like'),
    },
    entertainment,
    inProgress: entertainment.filter((i) => i.status && IN_PROGRESS.has(i.status) && i.active),
  };
}

export async function getMediaProfile(userId: string): Promise<MediaProfile> {
  return mediaProfileFrom(await listPreferences(userId));
}

// ── DJ: honour the profile for open-ended requests ───────────────────────────

const GENERIC_QUERY =
  /^(?:play\s+)?(?:some\s+|any\s+|my\s+)?(?:music|songs?|tunes|something|anything|whatever|stuff i like|my favorites?|my favourites?)(?:\s+(?:to|for|while)\s+(.+))?$/i;

/** Pure: a better search query for an open-ended request, or null to keep the original. */
export function resolveMusicQuery(
  profile: MediaProfile,
  query: string,
  mood?: string
): string | null {
  const q = query.trim().replace(/[.!?]+$/, '');
  const m = GENERIC_QUERY.exec(q);
  if (!m && !mood) return null;
  const context = (mood ?? m?.[1] ?? '').toLowerCase();
  const disliked = new Set(profile.music.dislikes.map((d) => d.name.toLowerCase()));
  if (context) {
    const hit = profile.music.moods.find(
      (x) => context.includes(x.context.toLowerCase()) || x.context.toLowerCase().includes(context)
    );
    const pick = hit?.picks.find((p) => !disliked.has(p.toLowerCase()));
    if (pick) return pick;
    if (!m) return null; // a mood request with no association: let the mood picker run
  }
  const fav = profile.music.favorites.find(
    (f) => f.kind !== 'song' && !disliked.has(f.name.toLowerCase())
  );
  if (fav) return fav.name;
  const hist = profile.music.listeningHistory.find((h) => !disliked.has(h.name.toLowerCase()));
  return hist ? hist.name : null;
}

export async function resolveMusicQueryForUser(
  userId: string | undefined,
  query: string,
  mood?: string
): Promise<string | null> {
  if (!userId || userId === 'anonymous') return null;
  try {
    return resolveMusicQuery(await getMediaProfile(userId), query, mood);
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Could not resolve music query from profile');
    return null;
  }
}

// ── capture ────────────────────────────────────────────────────────────────

export function mediaInput(
  kind: MediaKind,
  name: string,
  details: InterestDetails,
  source: PreferenceSource,
  confidence: number,
  extra: { sentiment?: 'like' | 'dislike'; conversationId?: string } = {}
): PreferenceInput {
  const value = name
    .replace(/[.!?,;"“”]+$/g, '')
    .replace(/^["“]/, '')
    .trim();
  return {
    domain: 'media',
    key: `${kind}:${value}`,
    value,
    sentiment: extra.sentiment ?? 'like',
    details,
    source,
    confidence,
    ...(extra.conversationId ? { conversationId: extra.conversationId } : {}),
  };
}

/** The existing music extractor's output, as media entries (single store for music taste). */
export function fromMusicExtraction(
  prefs: readonly ExtractedMusicPreference[],
  conversationId?: string
): PreferenceInput[] {
  return prefs.map((p) =>
    mediaInput(p.category, p.value, { origin: 'conversation' }, 'inferred', p.confidence, {
      sentiment: p.type,
      conversationId,
    })
  );
}

/** Spotify/Apple library taste → inferred media entries (origin: listening_history). */
export async function importListeningHistory(
  userId: string,
  taste: { readonly artists?: readonly string[]; readonly genres?: readonly string[] }
): Promise<UpsertResult[]> {
  if (!userId || userId === 'anonymous') return [];
  const inputs: PreferenceInput[] = [];
  (taste.artists ?? []).slice(0, 10).forEach((name, i) => {
    if (name)
      inputs.push(
        mediaInput('artist', name, { origin: 'listening_history' }, 'inferred', i < 3 ? 0.8 : 0.7)
      );
  });
  (taste.genres ?? []).slice(0, 5).forEach((name, i) => {
    if (name)
      inputs.push(
        mediaInput('genre', name, { origin: 'listening_history' }, 'inferred', i < 2 ? 0.8 : 0.7)
      );
  });
  const results: UpsertResult[] = [];
  for (const input of inputs) results.push(await upsertPreference(userId, input));
  return results;
}

const TITLE = "([A-Z0-9][\\w'’:&.-]*(?:\\s+(?:of|the|and|in|a|to|on|&|[A-Z0-9][\\w'’:&.-]*)){0,6})";
const re = (src: string, flags = ''): RegExp => new RegExp(src.replace('TITLE', TITLE), flags);

const ENTERTAINMENT_RULES: readonly [
  RegExp,
  (m: RegExpExecArray) => [MediaKind, string, InterestDetails] | null,
][] = [
  [
    re("\\b[Ii]'?m (?:on|halfway through) season (\\d+) of TITLE"),
    (m) => ['show', m[2], { status: 'watching', progress: `season ${m[1]}` }],
  ],
  [
    re("\\b[Ii]'?m on book (\\d+) of (?:the )?TITLE"),
    (m) => ['book', m[2], { status: 'reading', progress: `book ${m[1]}` }],
  ],
  [re("\\b[Ii]'?m (?:re)?watching TITLE"), (m) => ['show', m[1], { status: 'watching' }]],
  [re("\\b[Ii]'?m reading TITLE"), (m) => ['book', m[1], { status: 'reading' }]],
  [
    re("\\b[Ii]'?m (?:listening to|hooked on) (?:the )?TITLE podcast"),
    (m) => ['podcast', m[1], { status: 'listening' }],
  ],
  [
    re('\\b[Ii] (?:just )?finished (?:watching |reading )?TITLE'),
    (m) => ['show', m[1], { status: 'finished' }],
  ],
  [
    re('\\b[Ii] (?:want|need) to (watch|read) TITLE'),
    (m) => [m[1] === 'read' ? 'book' : 'show', m[2], { status: 'want_to' }],
  ],
  [
    re('\\b(?:[Ww]e|[Mm]y \\w+ and [Ii]) (?:are|have been) watching TITLE'),
    (m) => ['show', m[1], { status: 'watching' }],
  ],
];

const SHARED_WITH =
  /\bwith my (wife|husband|partner|son|daughter|kids|mom|dad|mother|father|sister|brother|friend|girlfriend|boyfriend)\b/i;
const MUSIC_CONTEXT =
  /\b[Ii] (?:listen to|like|put on|play|love)\s+([a-z][a-z0-9 &'-]{1,30}?)\s+(?:when|while)\s+(?:i'?m\s+|i\s+)?([a-z]+)/i;
const MEMORY_SONG = /["“]([^"”]{2,60})["”][^.]{0,20}\breminds me of\s+(my\s+[a-z]+|[A-Z][a-z]+)/;
const OUR_SONG = /\bour song is\s+["“]?([^"”.!?]{2,60})/i;

function contextWord(raw: string): string {
  const w = raw.toLowerCase();
  const map: Record<string, string> = {
    work: 'working',
    run: 'running',
    runs: 'running',
    cook: 'cooking',
    study: 'studying',
    drive: 'driving',
    sleep: 'sleeping',
  };
  return map[w] ?? w;
}

/** Media mentioned in the user's words (shows, books, podcasts, moods-to-music, songs tied to people). */
export function parseMediaStatements(
  text: string,
  source: PreferenceSource,
  confidence: number,
  conversationId?: string
): PreferenceInput[] {
  const out: PreferenceInput[] = [];
  const shared = SHARED_WITH.exec(text);
  const people: InterestPerson[] = shared ? [{ name: shared[1].toLowerCase() }] : [];
  if (/\b(?:my \w+ and i|we) (?:are|have been) watching\b/i.test(text) && !shared) {
    const who = /\bmy (\w+) and i\b/i.exec(text);
    if (who) people.push({ name: who[1].toLowerCase() });
  }
  for (const [rule, build] of ENTERTAINMENT_RULES) {
    const m = rule.exec(text);
    const built = m ? build(m) : null;
    if (!built || built[1].trim().length < 2) continue;
    const [kind, name, details] = built;
    const kindFromText = /\b(movie|film)\b/i.test(text)
      ? 'movie'
      : /\bbook|novel\b/i.test(text) && kind === 'show'
        ? 'book'
        : kind;
    out.push(
      mediaInput(
        kindFromText,
        name,
        { ...details, origin: 'conversation', ...(people.length ? { relatedPeople: people } : {}) },
        source,
        confidence,
        { conversationId }
      )
    );
    break;
  }
  const ctx = MUSIC_CONTEXT.exec(text);
  if (ctx) {
    const name = ctx[1].replace(/\s+music$/i, '').trim();
    out.push(
      mediaInput(
        guessMusicKind(name),
        name,
        { contexts: [contextWord(ctx[2])], origin: 'conversation' },
        source,
        confidence,
        { conversationId }
      )
    );
  }
  const memory = MEMORY_SONG.exec(text);
  if (memory && /\b(song|track|music|tune|album)\b/i.test(text)) {
    const who = memory[2].replace(/^my\s+/i, '');
    out.push(
      mediaInput(
        'song',
        memory[1],
        {
          memories: [`reminds them of ${memory[2].toLowerCase()}`],
          relatedPeople: [{ name: who.toLowerCase() }],
          origin: 'conversation',
        },
        source,
        confidence,
        { conversationId }
      )
    );
  }
  const ours = OUR_SONG.exec(text);
  if (ours)
    out.push(
      mediaInput(
        'song',
        ours[1],
        { memories: ['"our song"'], origin: 'conversation' },
        source,
        confidence,
        { conversationId }
      )
    );
  return out;
}
