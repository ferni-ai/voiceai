/**
 * The dev voice agent on LiveKit Cloud (ports/dev-agent.ts): its flag secrets through the
 * Cloud Agent API, its rooms through the dev project's room service.
 *
 * Bound to dev by construction, by two guards with different jobs. The agent id is a
 * constant, never input: agents.livekit.cloud serves every project and the key picks the
 * project, so a prod key here addresses CA_siTDMHEba4Fg in the prod project, where no agent
 * has that id. That constant is what keeps a prod agent from being changed; do not relax it.
 * LIVEKIT_URL must be the dev project's host exactly: a server whose env names another
 * project cannot build this adapter, so its key and rooms are never used here. Rooms are
 * always listed on the dev host. It checks the URL, not the key. Reads keep only flag names.
 * Listing the rooms gives up after 10 s, so a hung room service cannot hold a request open.
 * Every error thrown is a DevAgentError (domain/dev-agent-error.ts): method, status, Twirp
 * code and error name only, never LiveKit's text.
 *
 * The Cloud Agent API is Twirp on agents.livekit.cloud (not the project host), with an
 * `agent: { admin: true }` grant and an X-LIVEKIT-CLI-VERSION header the server requires.
 * Responses use snake_case names; a secret's `value` is protobuf bytes, so base64 in JSON,
 * and comes back empty: LiveKit never returns secret values.
 *
 * @module config/agent-flags/adapters/livekit-dev-agent
 */
import { SignJWT } from 'jose';
import { RoomServiceClient } from 'livekit-server-sdk';
import type { Env } from '../../env-flag.js';
import { withTimeout } from '../../../utils/async.js';
import { callFailed, DevAgentError, safeWord } from '../domain/dev-agent-error.js';
import { agentFlags } from '../domain/switchable.js';
import type { DevAgent } from '../ports/dev-agent.js';

const DEV_AGENT_ID = 'CA_siTDMHEba4Fg';
const DEV_LIVEKIT_HOST = 'dev-8sm1ba0z.livekit.cloud';

const CLOUD_AGENT_URL = 'https://agents.livekit.cloud/twirp/livekit.CloudAgent/';
/** The server answers 400 malformed without this header; the version lk 2.19 sends. */
const CLI_VERSION = '2.19.0';
const TIMEOUT_MS = 20_000;
const TOKEN_TTL_SECONDS = 5 * 60;
const ROOMS_TIMEOUT_MS = 10_000;

type CloudAgentMethod = 'ListAgentSecrets';
export type Rpc = (method: CloudAgentMethod, body: object) => Promise<unknown>;

const FLAG_NAMES: ReadonlySet<string> = new Set(agentFlags().map((f) => f.name));

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function isDevProjectUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).host === DEV_LIVEKIT_HOST;
  } catch {
    return false; // not a URL, so not the dev project's
  }
}

function devCredentials(env: Env): { apiKey: string; apiSecret: string } {
  if (!env.LIVEKIT_URL)
    throw new DevAgentError(`LIVEKIT_URL is unset; it must be ${DEV_LIVEKIT_HOST}`);
  if (!isDevProjectUrl(env.LIVEKIT_URL)) {
    throw new DevAgentError(`LIVEKIT_URL is not the dev project (${DEV_LIVEKIT_HOST})`);
  }
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  if (!apiKey) throw new DevAgentError('LIVEKIT_API_KEY is unset');
  if (!apiSecret) throw new DevAgentError('LIVEKIT_API_SECRET is unset');
  return { apiKey, apiSecret };
}

/** The Cloud Agent API over fetch: a fresh short-lived token per call. */
function cloudAgentRpc(apiKey: string, apiSecret: string): Rpc {
  const key = new TextEncoder().encode(apiSecret);
  return async (method, body) => {
    const name = `CloudAgent.${method}`;
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ agent: { admin: true } })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(apiKey)
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + TOKEN_TTL_SECONDS)
      .sign(key);
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${CLOUD_AGENT_URL}${method}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-LIVEKIT-CLI-VERSION': CLI_VERSION,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      text = await res.text();
    } catch (error) {
      throw callFailed(name, error);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new DevAgentError('failed, response is not JSON', { method: name, status: res.status });
    }
    if (!res.ok) {
      const code = isRecord(json) ? safeWord(json.code) : undefined;
      throw new DevAgentError('failed', {
        method: name,
        status: res.status,
        ...(code && { code }),
      });
    }
    return json;
  };
}

function secretTimes(response: unknown): Record<string, string> {
  if (!isRecord(response) || !Array.isArray(response.secrets)) {
    throw new DevAgentError('returned no secrets list', { method: 'CloudAgent.ListAgentSecrets' });
  }
  const times: Record<string, string> = {};
  for (const secret of response.secrets as unknown[]) {
    if (!isRecord(secret) || typeof secret.name !== 'string') continue;
    if (!FLAG_NAMES.has(secret.name) || typeof secret.updated_at !== 'string') continue;
    times[secret.name] = secret.updated_at;
  }
  return times;
}

/**
 * The dev agent, with credentials from `env` (LIVEKIT_URL, LIVEKIT_API_KEY,
 * LIVEKIT_API_SECRET). Throws unless they are the dev project's. `rpc` and `rooms` replace
 * the network in tests.
 */
export function liveKitDevAgent(
  env: Env = process.env,
  rpc?: Rpc,
  rooms?: Pick<RoomServiceClient, 'listRooms'>
): DevAgent {
  const { apiKey, apiSecret } = devCredentials(env);
  const call = rpc ?? cloudAgentRpc(apiKey, apiSecret);
  const roomService =
    rooms ?? new RoomServiceClient(`https://${DEV_LIVEKIT_HOST}`, apiKey, apiSecret);

  return {
    async flagSecretTimes() {
      return secretTimes(await call('ListAgentSecrets', { agentId: DEV_AGENT_ID }));
    },

    async occupiedRooms() {
      let list: Awaited<ReturnType<RoomServiceClient['listRooms']>>;
      try {
        list = await withTimeout(
          roomService.listRooms(),
          ROOMS_TIMEOUT_MS,
          'RoomService.ListRooms'
        );
      } catch (error) {
        throw callFailed('RoomService.ListRooms', error);
      }
      return list
        .filter((r) => r.numParticipants > 0)
        .map((r) => ({ name: r.name, participants: r.numParticipants }));
    },
  };
}
