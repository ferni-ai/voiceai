/**
 * getNews topic search without a NewsData or GNews key.
 *
 * With no key the only topic "source" left was DuckDuckGo's instant answer, an
 * encyclopedia abstract, read out as "Here's what's happening with ...". The
 * honest answer is that topic search is unavailable, plus the day's headlines,
 * which come keyless over RSS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RSS = `<rss><channel>
  <item><title>City council approves new park downtown</title></item>
  <item><title><![CDATA[Storm season ends quieter than forecast]]></title></item>
  <item><title>Local library extends weekend hours</title></item>
  <item><title>Researchers map a new deep-sea vent</title></item>
</channel></rss>`;

type FetchMock = ReturnType<typeof vi.fn>;

async function searchWith(fetchImpl: FetchMock, topic: string): Promise<string> {
  vi.stubGlobal('fetch', fetchImpl);
  vi.resetModules(); // fresh tool cache, and NEWSDATA/GNEWS keys read as unset
  const { searchNewsByTopic } = await import('../news.js');
  return searchNewsByTopic(topic);
}

const feedsUp = (): FetchMock =>
  vi.fn(async (url: string) => {
    if (String(url).includes('duckduckgo')) {
      return new Response(JSON.stringify({ AbstractText: 'An encyclopedia entry. '.repeat(5) }));
    }
    return new Response(RSS, { status: 200 });
  });

describe('searchNewsByTopic without a topic news key', () => {
  beforeEach(() => {
    vi.stubEnv('NEWSDATA_API_KEY', '');
    vi.stubEnv('GNEWS_API_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('says topic search is unavailable and gives the RSS headlines', async () => {
    const fetchMock = feedsUp();
    const answer = await searchWith(fetchMock, 'elections');

    expect(answer).toContain(`I can't search the news for "elections" right now`);
    expect(answer).toContain('top headlines');
    expect(answer).toContain('City council approves new park downtown');
    expect(answer).not.toContain('encyclopedia');
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('duckduckgo'))).toBe(false);
  });

  it('says so plainly when the headlines are down too', async () => {
    const answer = await searchWith(
      vi.fn(async () => new Response('', { status: 503 })),
      'elections'
    );
    expect(answer).toBe(
      `I can't look up news about "elections" right now, and the headlines aren't loading either. Try again in a bit?`
    );
  });

  it('NEWS_HEADLINES_FALLBACK=off goes back to the DuckDuckGo answer', async () => {
    vi.stubEnv('NEWS_HEADLINES_FALLBACK', 'off');
    const fetchMock = feedsUp();
    const answer = await searchWith(fetchMock, 'elections');
    expect(answer).not.toContain("I can't search the news");
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('duckduckgo'))).toBe(true);
  });
});
