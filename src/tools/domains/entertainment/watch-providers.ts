/**
 * "Where can I watch X?" / "Is X on Netflix?": which services stream, rent or
 * sell a movie or TV show in the caller's country, from TMDB's watch providers.
 *
 * TMDB's provider data comes from JustWatch, and TMDB's terms require crediting
 * JustWatch wherever it is shown, so every answer that uses it says so.
 */

import { spokenList, tmdbGet } from './tmdb-client.js';

type Media = 'movie' | 'tv';
interface Hit {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
}
interface Provider {
  provider_name: string;
  display_priority?: number;
}
interface CountryProviders {
  flatrate?: Provider[];
  free?: Provider[];
  ads?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
}
interface ProvidersResponse {
  results?: Record<string, CountryProviders>;
}

const CREDIT = 'according to JustWatch';
const UNREACHABLE = "I can't reach the movie database right now.";

/** The best movie or show match: search/tv or search/movie when the type is known, else search/multi. */
async function findTitle(
  title: string,
  type?: Media
): Promise<{ type: Media; hit: Hit } | 'none' | null> {
  const path = type ? `/search/${type}` : '/search/multi';
  const data = await tmdbGet<{ results?: Hit[] }>(path, {
    query: title,
    include_adult: false,
    language: 'en-US',
  });
  if (!data) return null;
  for (const hit of data.results ?? []) {
    const media = type ?? hit.media_type;
    if (media === 'movie' || media === 'tv') return { type: media, hit };
  }
  return 'none';
}

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]/g, '');

/**
 * Provider names in TMDB's order, a variant folded into its service at the
 * variant's place: "HBO Max Amazon Channel" (priority 11) beside "HBO Max" (151)
 * is HBO Max, listed first, not fifth behind TNT and TBS.
 */
function names(...lists: Array<Provider[] | undefined>): string[] {
  const all = lists.flatMap((l) => l ?? []).map((p) => p.provider_name);
  const base = (n: string) => all.find((o) => o !== n && n.startsWith(`${o} `)) ?? n;
  const sorted = lists
    .flatMap((l) => l ?? [])
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999));
  return [...new Set(sorted.map((p) => base(p.provider_name)))];
}

function regionName(region: string): string {
  const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(region) ?? region;
  return name.startsWith('United') ? `the ${name}` : name;
}

export async function whereToWatch(
  title: string,
  region: string,
  options: { type?: Media; service?: string } = {}
): Promise<string> {
  const found = await findTitle(title, options.type);
  if (!found) return UNREACHABLE;
  if (found === 'none') return `I couldn't find a movie or show called "${title}".`;
  const name = found.hit.title ?? found.hit.name ?? title;
  const data = await tmdbGet<ProvidersResponse>(`/${found.type}/${found.hit.id}/watch/providers`);
  if (!data) return UNREACHABLE;
  const here = data.results?.[region] ?? {};
  const ways: Array<[string, string[]]> = [
    ['streaming on', names(here.flatrate)],
    ['free with ads on', names(here.free, here.ads)],
    ['for rent or sale on', names(here.rent, here.buy)], // mostly the same stores
  ];
  const offered = ways.filter(([, n]) => n.length > 0);
  if (offered.length === 0) {
    return `${name} isn't streaming, for rent or for sale in ${regionName(region)} right now, ${CREDIT}.`;
  }

  const service = options.service?.trim();
  if (service) {
    // Either way round: "Max" is in "HBO Max", and "Apple TV+" is TMDB's "Apple TV".
    const same = (p: string) => key(p).includes(key(service)) || key(service).includes(key(p));
    const match = offered.find(([, n]) => n.some(same));
    if (match?.[0] === 'streaming on' || match?.[0] === 'free with ads on') {
      return `Yes, ${name} is ${match[0]} ${service} in ${regionName(region)}, ${CREDIT}.`;
    }
    const [how, where] = offered[0];
    const rest = match
      ? 'You can rent or buy it there.'
      : `It's ${how} ${spokenList(where.slice(0, 3))}.`;
    return `No, ${name} isn't streaming on ${service} in ${regionName(region)}, ${CREDIT}. ${rest}`;
  }

  const [first, ...more] = offered.map(([how, n]) => `${how} ${spokenList(n.slice(0, 3))}`);
  const also = more.length ? ` It's also ${spokenList(more)}.` : '';
  return `${name} is ${first} in ${regionName(region)}, ${CREDIT}.${also}`;
}
