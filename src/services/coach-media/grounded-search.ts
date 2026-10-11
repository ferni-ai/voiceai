/**
 * A short answer from the web with the pages it came from, using Gemini's
 * Google Search grounding through the shared client (Vertex on the agent, so
 * no new key). The DuckDuckGo instant-answer API behind searchWeb returns
 * nothing for most coaching asks ("beginner shin splint stretches"); grounding
 * returns an answer and its sources.
 *
 * On Vertex the source links are redirects (vertexaisearch.cloud.google.com);
 * each is resolved to the page it points to with one request that does not
 * follow the redirect, so the user gets a link they can keep.
 *
 * Everything returned came from web pages: it is data for the conversation
 * model, never instructions (see result-text.ts).
 *
 * @module services/coach-media/grounded-search
 */

import { getGeminiClient } from '../../config/gemini-config.js';
import { getLogger } from '../../utils/safe-logger.js';

export interface WebSource {
  title: string;
  url: string;
}

export interface GroundedAnswer {
  answer: string;
  sources: WebSource[];
}

/** Sources kept per answer. */
export const MAX_SOURCES = 4;
const TIMEOUT_MS = 9000;
const REDIRECT_TIMEOUT_MS = 2500;
const REDIRECT_HOST = 'vertexaisearch.cloud.google.com';

const coachMediaModel = (): string => process.env.COACH_MEDIA_MODEL || 'gemini-3.5-flash';

interface GroundingResponse {
  text?: string;
  candidates?: Array<{
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  }>;
}

interface SearchClient {
  models: {
    generateContent(req: {
      model: string;
      contents: string;
      config: Record<string, unknown>;
    }): Promise<GroundingResponse>;
  };
}

const PROMPT = (query: string): string =>
  `Find the most useful, trustworthy resources on: ${query}\n` +
  'In at most 3 short sentences, say what the evidence-based advice is and name the best ' +
  'resource or two (a video, book or article) and who made it. Say plainly when the evidence ' +
  'is weak or a claim is hype.';

/** An https link, or null for anything else (javascript:, data:, http:, garbage). */
export function safeHttpsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The page a grounding redirect points to, or the link unchanged when it is not one. */
export async function resolveSourceUrl(url: string): Promise<string | null> {
  const safe = safeHttpsUrl(url);
  if (!safe || new URL(safe).hostname !== REDIRECT_HOST) return safe;
  try {
    const res = await fetch(safe, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
    });
    return safeHttpsUrl(res.headers.get('location') ?? undefined) ?? safe;
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'coach-media: redirect not resolved');
    return safe;
  }
}

/**
 * A grounded answer for a topic-only query (see topic-query.ts), or null when
 * Gemini is not configured, the search failed or timed out, or nothing came back.
 */
export async function groundedAnswer(query: string): Promise<GroundedAnswer | null> {
  const client = (await getGeminiClient()) as SearchClient | null;
  if (!client) return null;
  const log = getLogger();
  try {
    const response = await client.models.generateContent({
      model: coachMediaModel(),
      contents: PROMPT(query),
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
        maxOutputTokens: 400,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });
    const answer = (response.text ?? '').trim();
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const raw = chunks
      .map((c) => c.web)
      .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
      .filter((w) => !seen.has(w.uri) && Boolean(seen.add(w.uri)))
      .slice(0, MAX_SOURCES);
    const resolved = await Promise.all(raw.map(async (w) => resolveSourceUrl(w.uri)));
    const sources = raw
      .map((w, i) => ({ title: (w.title ?? '').trim(), url: resolved[i] }))
      .filter((s): s is WebSource => Boolean(s.url));
    if (!answer && sources.length === 0) return null;
    log.info({ sources: sources.length, chars: answer.length }, 'coach-media: grounded answer');
    return { answer, sources };
  } catch (error) {
    log.warn({ error: String(error) }, 'coach-media: grounded search failed');
    return null;
  }
}
