/**
 * APNs: alert pushes straight to Apple for the iPhone app, no Firebase.
 * Token auth (an ES256 JWT signed with the team's .p8 key) over node:http2, to
 * the production or sandbox host per device. Reads APNS_KEY_P8, APNS_KEY_ID,
 * APNS_TEAM_ID and APNS_TOPIC (the bundle id); with any unset nothing is sent
 * (logged once). Apple wants a provider token reused for 20 to 60 minutes: one
 * is kept for 50, replaced early only when Apple says it expired.
 * Never log a device token or the provider JWT.
 *
 * @module services/apns-sender
 */
import http2 from 'node:http2';
import { SignJWT, importPKCS8 } from 'jose';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'apns-sender' });

export type ApnsEnvironment = 'sandbox' | 'production';

export const APNS_ORIGINS: Record<ApnsEnvironment, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

const PROVIDER_TOKEN_TTL_MS = 50 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface ApnsConfig {
  p8: string;
  keyId: string;
  teamId: string;
  topic: string;
}

export interface ApnsDevice {
  token: string;
  environment: ApnsEnvironment;
}

export interface ApnsAlert {
  title: string;
  body: string;
  /** Groups notifications on the lock screen. */
  threadId?: string;
  /** App data, delivered beside `aps`. */
  data?: Record<string, unknown>;
  /** Opaque tag of the person it is for, sent as `r` beside `aps` (ios-push.ts recipientTag). */
  recipient?: string;
}

export interface ApnsResult {
  ok: boolean;
  status: number;
  /** Apple's reason on failure (BadDeviceToken, Unregistered, ...). */
  reason?: string;
  /** The token will never work again: forget it. */
  dead: boolean;
}

/** One HTTP/2 request to Apple; swapped out in tests. */
export type ApnsTransport = (req: {
  origin: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ status: number; body: string }>;

export function apnsConfig(
  env: Record<string, string | undefined> = process.env
): ApnsConfig | null {
  const p8 = env.APNS_KEY_P8?.trim();
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const topic = env.APNS_TOPIC?.trim();
  return p8 && keyId && teamId && topic ? { p8, keyId, teamId, topic } : null;
}

/** Reasons meaning the token is gone for good (410, or a token Apple can't use). */
const DEAD_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic']);
const STALE_PROVIDER_TOKEN = new Set(['ExpiredProviderToken', 'InvalidProviderToken']);

/** A small HTTP/2 client: one session per origin, reopened when it closes. */
export function http2Transport(): ApnsTransport {
  const sessions = new Map<string, http2.ClientHttp2Session>();
  const session = (origin: string) => {
    const open = sessions.get(origin);
    if (open && !open.closed && !open.destroyed) return open;
    const created = http2.connect(origin);
    created.on('error', (error) => log.warn({ error: String(error) }, 'APNs connection error'));
    created.on('close', () => sessions.delete(origin));
    created.unref();
    sessions.set(origin, created);
    return created;
  };
  return async ({ origin, path, headers, body }) =>
    new Promise((resolve, reject) => {
      const stream = session(origin).request({ ':method': 'POST', ':path': path, ...headers });
      stream.setTimeout(REQUEST_TIMEOUT_MS, () => stream.close(http2.constants.NGHTTP2_CANCEL));
      let status = 0;
      let text = '';
      stream.setEncoding('utf8');
      stream.on('response', (h) => {
        status = Number(h[':status']);
      });
      stream.on('data', (chunk: string) => {
        text += chunk;
      });
      let settled = false;
      const settle = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (error === undefined && status) resolve({ status, body: text });
        else reject(error instanceof Error ? error : new Error('APNs stream closed'));
      };
      stream.on('end', () => settle());
      stream.on('close', () => settle());
      stream.on('error', settle);
      stream.end(body);
    });
}

export class ApnsSender {
  private providerToken: { jwt: string; at: number } | null = null;

  constructor(
    private readonly config: ApnsConfig,
    private readonly transport: ApnsTransport = http2Transport(),
    private readonly origins: Record<ApnsEnvironment, string> = APNS_ORIGINS,
    private readonly now: () => number = Date.now
  ) {}

  get topic(): string {
    return this.config.topic;
  }

  private async bearer(): Promise<string> {
    const cached = this.providerToken;
    if (cached && this.now() - cached.at < PROVIDER_TOKEN_TTL_MS) return cached.jwt;
    const at = this.now();
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
      .setIssuer(this.config.teamId)
      .setIssuedAt(Math.floor(at / 1000))
      .sign(await importPKCS8(this.config.p8.replace(/\\n/g, '\n'), 'ES256'));
    this.providerToken = { jwt, at };
    return jwt;
  }

  /** Send one alert to one device. Never throws: a failure is an ApnsResult. */
  async send(device: ApnsDevice, alert: ApnsAlert): Promise<ApnsResult> {
    try {
      const res = await this.transport({
        origin: this.origins[device.environment],
        path: `/3/device/${device.token}`,
        headers: {
          authorization: `bearer ${await this.bearer()}`,
          'apns-topic': this.config.topic,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'apns-expiration': String(Math.floor(this.now() / 1000) + 24 * 3600),
        },
        body: JSON.stringify({
          aps: {
            alert: { title: alert.title, body: alert.body },
            sound: 'default',
            ...(alert.threadId && { 'thread-id': alert.threadId }),
          },
          ...(alert.recipient && { r: alert.recipient }),
          ...(alert.data && { data: alert.data }),
        }),
      });
      if (res.status === 200) return { ok: true, status: 200, dead: false };
      const reason = parseReason(res.body);
      if (reason && STALE_PROVIDER_TOKEN.has(reason)) this.providerToken = null;
      const dead = res.status === 410 || (reason !== undefined && DEAD_REASONS.has(reason));
      log.warn(
        { status: res.status, reason, environment: device.environment },
        'APNs refused a push'
      );
      return { ok: false, status: res.status, reason, dead };
    } catch (error) {
      log.warn({ error: String(error), environment: device.environment }, 'APNs push failed');
      return { ok: false, status: 0, reason: 'NetworkError', dead: false };
    }
  }
}

function parseReason(body: string): string | undefined {
  try {
    const reason = (JSON.parse(body) as { reason?: unknown }).reason;
    return typeof reason === 'string' ? reason : undefined;
  } catch {
    return undefined;
  }
}

let shared: ApnsSender | null | undefined;

/** The process's sender, or null (logged once) while the APNs secrets are unset. */
export function getApnsSender(): ApnsSender | null {
  if (shared !== undefined) return shared;
  const config = apnsConfig();
  if (!config)
    log.info('APNs not configured (APNS_KEY_P8/KEY_ID/TEAM_ID/TOPIC); iOS pushes are off');
  shared = config ? new ApnsSender(config) : null;
  return shared;
}
