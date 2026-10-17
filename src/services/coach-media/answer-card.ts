/**
 * The card a sent pick carries: its sources and Google Search suggestions,
 * which Google's grounding terms ask be shown to the user; voice can't, so
 * they travel with the card, never in the model's text.
 *
 * Sending a pick saves it to `answer_cards` (approvals/answer-cards.ts); the
 * text and the in-app message (proactive-messages.ui.ts) link its page,
 * /a/:id (answer-card-page.ui.ts). That page and its API are behind
 * APPROVALS_PAGE, and pick-delivery.ts sends nothing without a saved card, so
 * COACH_MEDIA needs APPROVALS_PAGE=on to send anything: set on BOTH the voice
 * agent (which writes the card and texts the link) and the UI server (which
 * serves it), with APP_URL pointing at that environment's app, or the link
 * reads as "couldn't find that one".
 *
 * Shape agreed with approvals-page: answerText is plain text (400 chars),
 * sources are https only, searchSuggestionsHtml is Google's renderedContent
 * verbatim (that page sanitizes and sandboxes it).
 *
 * @module services/coach-media/answer-card
 */

import { callerText } from '../outreach/caller-text.js';
import type { Candidate } from './checked-pick.js';
import { safeHttpsUrl } from './grounded-search.js';

export interface AnswerCard {
  kind: 'answer' | 'recommendation';
  answerText: string;
  sources: Array<{ title: string; url: string }>;
  searchSuggestionsHtml?: string;
  webSearchQueries?: string[];
  query?: string;
  personaId?: string;
  pick?: {
    kind: Candidate['kind'];
    title: string;
    by: string;
    url: string;
    length?: string;
    why?: string;
  };
}

const MAX_CARD_SOURCES = 5;

/** The recommendation card for a sent pick. */
export function pickCard(
  topic: string,
  candidate: Candidate,
  why: string | undefined,
  personaId: string
): AnswerCard {
  const title = callerText(candidate.title, 120);
  const by = callerText(candidate.by, 80);
  const reason = callerText(why, 240);
  const seen = new Set<string>();
  const sources = [{ title, url: candidate.url }, ...(candidate.grounding?.sources ?? [])]
    .flatMap((s) => {
      const url = safeHttpsUrl(s.url);
      if (!url || seen.has(url)) return [];
      seen.add(url);
      return [{ title: callerText(s.title, 120) || new URL(url).hostname, url }];
    })
    .slice(0, MAX_CARD_SOURCES);
  return {
    kind: 'recommendation',
    answerText: callerText(
      `${title} by ${by}${candidate.length ? `, ${candidate.length}` : ''}. ${reason}`,
      400
    ),
    sources,
    searchSuggestionsHtml: candidate.grounding?.searchSuggestionsHtml,
    webSearchQueries: candidate.grounding?.webSearchQueries,
    query: callerText(topic, 120),
    personaId,
    pick: {
      kind: candidate.kind,
      title,
      by,
      url: candidate.url,
      length: candidate.length,
      why: reason || undefined,
    },
  };
}
