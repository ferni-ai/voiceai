/**
 * When a life chapter is real enough to name, and when it has quietly ended.
 *
 * "Your Current Chapter" used to name a chapter from one regex hit in one
 * conversation ("I lost my keys" opened a loss chapter), and a chapter never
 * ended, so it read "Something beautiful is taking shape" months later. A
 * chapter is now named only after it has come up in at least two separate
 * conversations, and it fades after a stretch with no mention.
 *
 * @module services/superhuman/life-chapter-signals
 */

/** Separate conversations a chapter must come up in before Ferni names it. */
export const MIN_CHAPTER_CONVERSATIONS = 2;
/** Days without a mention after which a chapter is over, whether or not it was closed. */
export const CHAPTER_FADE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A loss worth a chapter: a person or a pet, never an object or an idiom.
 * "I lost my mom" yes; "I lost my keys / phone / wallet / temper / mind" no.
 */
export const LOSS_OF_SOMEONE =
  /\bi (?:just |recently )?lost my (?:mom|mum|mother|dad|father|parents?|husband|wife|partner|fianc[eé]e?|boyfriend|girlfriend|son|daughter|child|baby|brother|sister|sibling|grand(?:ma|pa|mother|father|parent)|aunt|uncle|cousin|best friend|friend|dog|cat|pet)\b(?!['’]s)/i;

/** The minimal chapter shape these rules read. */
export interface ChapterActivity {
  endDate?: number;
  lastUpdated: number;
  startDate: number;
  conversationIds?: string[];
  /** Stored before conversationIds existed: how many conversations touched it. */
  conversationCount?: number;
}

/** A stable key for "this conversation": the session id, or the calendar day without one. */
export function chapterConversationKey(
  conversationId: string | undefined,
  now = Date.now()
): string {
  return conversationId || `day:${new Date(now).toISOString().slice(0, 10)}`;
}

/** Record that a chapter came up in a conversation. Returns true if it was a new one. */
export function recordChapterConversation(
  chapter: ChapterActivity & { conversationCount: number },
  conversationId: string | undefined,
  now = Date.now()
): boolean {
  const key = chapterConversationKey(conversationId, now);
  // A chapter from before conversationIds keeps the count it had: seed the list from it
  const ids = (chapter.conversationIds ??= Array.from(
    { length: Math.max(0, chapter.conversationCount || 0) },
    (_, i) => `legacy:${i}`
  ));
  if (ids.includes(key)) return false;
  ids.push(key);
  chapter.conversationCount = ids.length;
  return true;
}

/**
 * Record the conversation; true when that is what made the chapter nameable. Never for a
 * chapter created before conversations were tracked: its outreach moment has passed.
 */
export function recordAndCheckNameable(
  chapter: ChapterActivity & { conversationCount: number },
  conversationId: string | undefined,
  now = Date.now()
): boolean {
  const legacy = chapter.conversationIds === undefined;
  const isNew = recordChapterConversation(chapter, conversationId, now);
  return !legacy && isNew && chapter.conversationCount === MIN_CHAPTER_CONVERSATIONS;
}

/** Still going: not closed, and mentioned within the fade window. */
export function isChapterCurrent(chapter: ChapterActivity, now = Date.now()): boolean {
  if (chapter.endDate) return false;
  const lastMention = chapter.lastUpdated || chapter.startDate;
  return now - lastMention <= CHAPTER_FADE_DAYS * DAY_MS;
}

/** Enough evidence to say it out loud: separate conversations, not one passing line. */
export function isChapterNameable(chapter: ChapterActivity): boolean {
  const seen = chapter.conversationIds?.length ?? chapter.conversationCount ?? 0;
  return seen >= MIN_CHAPTER_CONVERSATIONS;
}

/** The chapter Ferni may name right now, or undefined when nothing is clear enough yet. */
export function getCurrentChapter<T extends ChapterActivity>(
  chapters: T[],
  now = Date.now()
): T | undefined {
  return chapters.find((c) => isChapterCurrent(c, now) && isChapterNameable(c));
}
