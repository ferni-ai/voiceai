/**
 * The read-only probes behind `test-all-integrations.ts --nightly`
 * (integration-nightly.ts), ported from the integration audit's harness
 * (~/Documents/voiceai-evidence/integrations-2026-10-29/harness/probe.ts).
 *
 * Kept: GETs, searches, the Spotify token endpoint, and bogus-grant client
 * checks (a fake grant to a provider's token endpoint: "invalid_grant" means the
 * client id and secret were accepted). Dropped as not read-only: the one-word
 * TTS and one-token LLM generations, the Workspace mail token mint, live-mode
 * Stripe, and the token file the repo's Spotify client writes to disk.
 *
 * Detail strings hold status codes and provider error codes, never a secret.
 *
 * @module commands/test/integration-probes
 */
import type { Env, Probe } from './integration-nightly.js';

const basic = (user: string, pass: string): string =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const form = (fields: Record<string, string>, authorization?: string): RequestInit => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(authorization ? { Authorization: authorization } : {}),
  },
  body: new URLSearchParams(fields).toString(),
});
const q = (e: Env, name: string): string => encodeURIComponent(e[name]!);
const text = (json: unknown, ...path: string[]): string =>
  String(path.reduce<unknown>((o, k) => (o as Record<string, unknown> | null)?.[k], json) ?? '');

async function call(url: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** A request that must answer 200, with a body `healthy` accepts. */
const http = (
  id: string,
  needs: string[],
  request: (e: Env) => [url: string, init?: RequestInit],
  healthy: (json: unknown) => boolean = () => true
): Probe => ({
  id,
  needs,
  run: async (e) => {
    const { status, json } = await call(...request(e));
    return { ok: status === 200 && healthy(json), detail: `http ${status}` };
  },
});

const CLIENT_REJECTED =
  /invalid_client|unauthorized_client|client authentication failed|client id was invalid/;
const GRANT_REJECTED =
  /invalid_grant|invalid_request|bad_verification|authorization code|expired|invalid_token/;

/** Bogus grant: the client is fine when the provider objects to the grant, not to the client. */
const clientCheck = (
  id: string,
  prefix: string,
  url: string,
  grant: Record<string, string>,
  basicAuth = false
): Probe => ({
  id,
  needs: [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`],
  run: async (e) => {
    const [clientId, secret] = [e[`${prefix}_CLIENT_ID`]!, e[`${prefix}_CLIENT_SECRET`]!];
    const init = basicAuth
      ? form({ ...grant, client_id: clientId }, basic(clientId, secret))
      : form({ ...grant, client_id: clientId, client_secret: secret });
    const { status, json } = await call(url, init);
    const said = `${text(json, 'error')} ${text(json, 'error_description')}`.toLowerCase();
    return {
      ok: !CLIENT_REJECTED.test(said) && GRANT_REJECTED.test(said),
      detail: `http ${status} ${text(json, 'error') || 'no error code'}`,
    };
  },
});
const BOGUS_REFRESH = { grant_type: 'refresh_token', refresh_token: 'bogus' };

/** The house refresh token, as the agent uses it. Mints an access token and keeps nothing. */
const spotifyRefresh: Probe = {
  id: 'spotify.refresh',
  needs: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REFRESH_TOKEN'],
  run: async (e) => {
    const grant = { grant_type: 'refresh_token', refresh_token: e.SPOTIFY_REFRESH_TOKEN! };
    const { status, json } = await call(
      'https://accounts.spotify.com/api/token',
      form(grant, basic(e.SPOTIFY_CLIENT_ID!, e.SPOTIFY_CLIENT_SECRET!))
    );
    if (status !== 200) return { ok: false, detail: `http ${status} ${text(json, 'error')}` };
    const missing = ['user-modify-playback-state', 'user-read-playback-state'].filter(
      (scope) => !text(json, 'scope').split(' ').includes(scope)
    );
    return {
      ok: missing.length === 0,
      detail: missing.length ? `missing scope ${missing}` : 'http 200',
    };
  },
};

/** A repo tool, run for real: proves the code path as well as the provider. */
const repoTool = (
  id: string,
  needs: string[],
  load: () => Promise<unknown>,
  healthy: (reply: unknown) => boolean
): Probe => ({
  id,
  needs,
  run: async () => {
    const reply = await load();
    return {
      ok: healthy(reply),
      detail: typeof reply === 'string' ? `${reply.length} chars` : 'object',
    };
  },
});

export const NIGHTLY_PROBES: readonly Probe[] = [
  spotifyRefresh,
  clientCheck(
    'oauth.spotify_client',
    'SPOTIFY',
    'https://accounts.spotify.com/api/token',
    BOGUS_REFRESH,
    true
  ),
  clientCheck(
    'oauth.google_calendar_client',
    'GOOGLE_CALENDAR',
    'https://oauth2.googleapis.com/token',
    BOGUS_REFRESH
  ),
  clientCheck(
    'oauth.linkedin_client',
    'LINKEDIN',
    'https://www.linkedin.com/oauth/v2/accessToken',
    {
      grant_type: 'authorization_code',
      code: 'bogus',
      redirect_uri: 'https://app.ferni.ai/api/marketing/linkedin/callback',
    }
  ),
  clientCheck(
    'oauth.x_client',
    'TWITTER',
    'https://api.twitter.com/2/oauth2/token',
    BOGUS_REFRESH,
    true
  ),
  http(
    'twilio.account',
    ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    (e) => [
      `https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}.json`,
      { headers: { Authorization: basic(e.TWILIO_ACCOUNT_SID!, e.TWILIO_AUTH_TOKEN!) } },
    ],
    (json) => text(json, 'status') === 'active'
  ),
  http(
    'twilio.sip_trunk',
    ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    (e) => [
      'https://trunking.twilio.com/v1/Trunks?PageSize=20',
      { headers: { Authorization: basic(e.TWILIO_ACCOUNT_SID!, e.TWILIO_AUTH_TOKEN!) } },
    ],
    (json) => ((json as { trunks?: unknown[] } | null)?.trunks?.length ?? 0) > 0
  ),
  http('anthropic.models', ['ANTHROPIC_API_KEY'], (e) => [
    'https://api.anthropic.com/v1/models?limit=100',
    {
      headers: {
        'x-api-key': e.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        ...(e.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': e.ANTHROPIC_WORKSPACE_ID } : {}),
      },
    },
  ]),
  http('cartesia.voices', ['CARTESIA_API_KEY'], (e) => [
    'https://api.cartesia.ai/voices?limit=1',
    { headers: { 'X-API-Key': e.CARTESIA_API_KEY!, 'Cartesia-Version': '2026-08-14' } },
  ]),
  http(
    'google.places',
    ['GOOGLE_PLACES_API_KEY'],
    (e) => [
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': e.GOOGLE_PLACES_API_KEY!,
          'X-Goog-FieldMask': 'places.id',
        },
        body: JSON.stringify({ textQuery: 'coffee in Tampa', pageSize: 1 }),
      },
    ],
    (json) => ((json as { places?: unknown[] } | null)?.places?.length ?? 0) > 0
  ),
  http(
    'google.geocode',
    ['GOOGLE_API_KEY'],
    (e) => [
      `https://maps.googleapis.com/maps/api/geocode/json?address=Tampa&key=${q(e, 'GOOGLE_API_KEY')}`,
    ],
    (json) => text(json, 'status') === 'OK'
  ),
  http(
    'newsdata.latest',
    ['NEWSDATA_API_KEY'],
    (e) => [
      `https://newsdata.io/api/1/latest?apikey=${q(e, 'NEWSDATA_API_KEY')}&q=weather&language=en&size=1`,
    ],
    (json) => text(json, 'status') === 'success'
  ),
  http(
    'finnhub.quote',
    ['FINNHUB_API_KEY'],
    (e) => [`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${q(e, 'FINNHUB_API_KEY')}`],
    (json) => Number(text(json, 'c')) > 0
  ),
  http(
    'itunes.search',
    [],
    () => ['https://itunes.apple.com/search?term=jazz&limit=1&media=music'],
    (json) => Number(text(json, 'resultCount')) > 0
  ),
  repoTool(
    'tmdb.configuration',
    ['TMDB_API_KEY'],
    async () =>
      (await import('../../../../../src/tools/domains/entertainment/tmdb-client.js')).tmdbGet(
        '/configuration'
      ),
    (reply) => !!reply
  ),
  repoTool(
    'weather.open_meteo',
    [],
    async () =>
      (await import('../../../../../src/tools/domains/information/weather.js')).getCurrentWeather(
        'Tampa'
      ),
    (reply) => String(reply).startsWith('Right now in ')
  ),
  repoTool(
    'news.rss',
    [],
    async () =>
      (await import('../../../../../src/tools/domains/information/news.js')).getGeneralNews(),
    (reply) =>
      String(reply).length > 60 && !/couldn't|unable|trouble/i.test(String(reply).slice(0, 80))
  ),
];
