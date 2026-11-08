/**
 * GMAIL_SEND_AS_USER: reachOut's email goes from the caller's own Gmail when
 * they granted "send email as me", only after their spoken yes to a read-back
 * that names that mailbox. Flag off or no grant: Ferni's mailbox, as before.
 *
 * Drives the production tool list (getOutreachToolDefinitions, the gated
 * reachOut) and the REAL gmail-send-as-user sender and token encryption.
 * Mocked: contacts, Ferni's mailbox (email-delivery), the grant's Firestore
 * store (in memory) and Google's token and send endpoints (fetch). Addresses
 * and names are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(process.env, {
  GOOGLE_CALENDAR_CLIENT_ID: 'g-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'g-secret',
  OAUTH_ENCRYPTION_KEY: 'test-key',
});

const grants = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../../../../../services/persistence/index.js', async (orig) => {
  const real = await orig<typeof import('../../../../../services/persistence/index.js')>();
  const fake = {
    load: async (uid: string) => grants.get(uid) ?? null,
    setImmediate: async (uid: string, data: unknown) => void grants.set(uid, data),
    delete: async (uid: string) => void grants.delete(uid),
  };
  return {
    ...real,
    createPersistenceStore: ((opts: { collection: string }) =>
      opts.collection === 'gmail_send_tokens'
        ? fake
        : real.createPersistenceStore(opts as never)) as typeof real.createPersistenceStore,
  };
});
vi.mock('../../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(),
  recordInteraction: vi.fn(async () => undefined),
}));
vi.mock('../../../../../services/outreach/delivery/email-delivery.js', () => ({
  sendEmail: vi.fn(async () => ({ success: true, messageId: 'ferni-1' })),
}));
vi.mock('../message-crafting.js', () => ({ craftPersonalizedMessage: vi.fn(async () => 'x') }));

const { searchContacts } =
  await import('../../../../../services/contacts/contact-relationship-service.js');
const { sendEmail } = await import('../../../../../services/outreach/delivery/email-delivery.js');
const { encryptData } = await import('../../../../../utils/token-encryption.js');
const { getOutreachToolDefinitions, getUnifiedOutreachDefinition } = await import('../index.js');
const { outreachConfirmListeners } = await import('../outreach-confirm.js');
const { gateOutboundTool } = await import('../../../../registry/outbound-gate.js');
const { usePersonFlagLookup } = await import('../../../../../config/person-flag.js');
type ToolDefinition = import('../../../../registry/types.js').ToolDefinition;

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PAT = { id: 'c-pat', name: 'Pat Rivera', email: 'pat.rivera@example.com' };
const TO_PAT = {
  contact: 'Pat',
  purpose: 'lunch on friday',
  preferredChannel: 'email',
  customMessage: 'Lunch Friday at noon?',
};

function grant(uid: string, over: Record<string, unknown> = {}): void {
  const tokens = {
    access_token: `access-${uid}`,
    refresh_token: `refresh-${uid}`,
    expires_at: Date.now() + 3_600_000,
    scope: 'openid email https://www.googleapis.com/auth/gmail.send',
    email: `${uid}@example.com`,
    ...over,
  };
  grants.set(uid, { encrypted: encryptData(tokens), updated_at: Date.now() });
}

let google: { url: string; auth?: string; body: string }[];
let sendReply: () => Response;
let tokenReply: () => Response;
const gmailSends = () => google.filter((c) => c.url === SEND_URL);
const ferniSends = () => vi.mocked(sendEmail).mock.calls.map(([m]) => m);
const mime = (n = 0) =>
  Buffer.from(JSON.parse(gmailSends()[n].body).raw as string, 'base64url').toString('utf8');

/** What the server told the model (OUTREACH_SERVER_CONFIRM notes), in order. */
let notes: string[] = [];

function liveCall(userId = 'user-a', owner: boolean | null = true, def?: ToolDefinition) {
  const session = { agentState: 'listening' };
  const isOwner = owner === null ? undefined : () => owner;
  const listeners = outreachConfirmListeners(session, isOwner, (n) => void notes.push(n));
  const reachOut = def ?? getOutreachToolDefinitions().find((d) => d.id === 'reachOut')!;
  const tool = reachOut.create({ userId, agentId: 'ferni', agentDisplayName: 'Ferni' });
  return {
    call: async (args: Record<string, unknown>, callId: string) => {
      const out = await tool.execute(args, { ctx: { session }, toolCallId: callId } as never);
      listeners.onToolsExecuted({ functionCalls: [{ callId }], functionCallOutputs: [] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}

beforeEach(() => {
  grants.clear();
  notes = [];
  google = [];
  vi.stubEnv('GMAIL_SEND_AS_USER', 'on');
  vi.mocked(searchContacts).mockResolvedValue([PAT as never]);
  sendReply = () => new Response(JSON.stringify({ id: 'gmail-1' }));
  tokenReply = () => new Response(JSON.stringify({ access_token: 'access-new', expires_in: 3600 }));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    google.push({ url, auth: headers.Authorization, body: String(init?.body ?? '') });
    return url === SEND_URL ? sendReply() : tokenReply();
  });
});

afterEach(() => {
  usePersonFlagLookup(async () => undefined);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('reachOut email from the caller’s own Gmail', () => {
  it('flag on + grant + spoken yes: exactly one Gmail send, with their token and a correct MIME', async () => {
    grant('user-a');
    const call = liveCall();

    const preview = await call.call(TO_PAT, 'c1');
    expect(gmailSends()).toHaveLength(0);
    expect(preview).toContain('NOT SENT YET');
    expect(preview).toContain(
      'an email to Pat Rivera at pat.rivera@example.com from your Gmail, user-a@example.com, saying "Lunch Friday at noon?"'
    );

    call.caller('Yes, send it.');
    const sent = await call.call(TO_PAT, 'c2');
    await call.call(TO_PAT, 'c3'); // the model calling again previews; it never re-sends

    expect(gmailSends()).toHaveLength(1);
    expect(gmailSends()[0].auth).toBe('Bearer access-user-a');
    const [head, body] = mime().split('\r\n\r\n');
    expect(head).toContain('To: pat.rivera@example.com\r\n');
    expect(head).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(head).toMatch(/\r\nSubject: [^\r\n]+\r\n/);
    expect(Buffer.from(body, 'base64').toString('utf8')).toBe('Lunch Friday at noon?');
    expect(sent).toContain('from your Gmail');
    expect(ferniSends()).toHaveLength(0);
  });

  it('says the mailbox but not the address while the speaker is not proven to be the owner', async () => {
    grant('user-a');
    const preview = await liveCall('user-a', null).call(TO_PAT, 'c1');
    expect(preview).toContain('from your Gmail, saying');
    expect(preview).not.toContain('user-a@example.com');
  });

  it('no yes: nothing is sent from either mailbox', async () => {
    grant('user-a');
    for (const answer of [undefined, 'no', 'wait, change it first']) {
      const call = liveCall();
      await call.call(TO_PAT, 'c1');
      if (answer) call.caller(answer);
      await call.call(TO_PAT, 'c2');
    }
    expect(gmailSends()).toHaveLength(0);
    expect(ferniSends()).toHaveLength(0);
  });

  it("the registry's gate wraps the same send: the raw definition previews first", async () => {
    grant('user-a');
    const call = liveCall('user-a', true, gateOutboundTool(getUnifiedOutreachDefinition()));
    expect(await call.call(TO_PAT, 'c1')).toContain('NOT SENT YET');
    expect(gmailSends()).toHaveLength(0);
    call.caller('yes');
    await call.call(TO_PAT, 'c2');
    expect(gmailSends()).toHaveLength(1);
  });

  it("env off: the caller whose own flag is on sends from Gmail; caller B gets Ferni's mailbox", async () => {
    vi.stubEnv('GMAIL_SEND_AS_USER', '');
    usePersonFlagLookup(async (uid) => (uid === 'user-a' ? 'on' : undefined));
    grant('user-a');
    grant('user-b');

    const b = liveCall('user-b');
    expect(await b.call(TO_PAT, 'c1')).toContain('pat.rivera@example.com, saying');
    b.caller('yes');
    await b.call(TO_PAT, 'c2');
    expect(gmailSends()).toHaveLength(0);
    expect(ferniSends()).toEqual([expect.objectContaining({ userId: 'user-b' })]);

    const a = liveCall('user-a');
    expect(await a.call(TO_PAT, 'c1')).toContain('from your Gmail, user-a@example.com');
    a.caller('yes');
    await a.call(TO_PAT, 'c2');
    expect(gmailSends().map((g) => g.auth)).toEqual(['Bearer access-user-a']);
    expect(ferniSends()).toHaveLength(1);
  });

  it("flag off (or no grant): Ferni's mailbox exactly as before, and Google is never called", async () => {
    for (const setup of [() => vi.stubEnv('GMAIL_SEND_AS_USER', ''), () => undefined]) {
      vi.mocked(sendEmail).mockClear();
      grants.clear();
      setup();
      if (process.env.GMAIL_SEND_AS_USER !== 'on') grant('user-a'); // granted, but the flag is off
      const call = liveCall();

      const preview = await call.call(TO_PAT, 'c1');
      expect(preview).toContain(
        'an email to Pat Rivera at pat.rivera@example.com, saying "Lunch Friday at noon?"'
      );
      call.caller('yes');
      const sent = await call.call(TO_PAT, 'c2');

      expect(sent).toBe('📧 Emailed Pat Rivera: "Lunch Friday at noon?"');
      expect(ferniSends()).toEqual([
        expect.objectContaining({
          to: 'pat.rivera@example.com',
          body: 'Lunch Friday at noon?',
          personaId: 'ferni',
          userId: 'user-a',
        }),
      ]);
    }
    expect(google).toHaveLength(0);
  });

  it("an invalid_grant refresh: says so, offers Ferni's address, and never uses it on its own", async () => {
    grant('user-a', { expires_at: 0 });
    tokenReply = () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    const call = liveCall();
    await call.call(TO_PAT, 'c1');
    call.caller('yes');

    const reply = await call.call(TO_PAT, 'c2');

    expect(reply).toContain('Google says your Gmail connection needs renewing');
    expect(reply.startsWith('Nothing was sent:')).toBe(true);
    expect(reply).toContain("Ferni's address");
    expect(gmailSends()).toHaveLength(0);
    expect(ferniSends()).toHaveLength(0);
  });

  it('a 5xx from Gmail: unreachable, said honestly, nothing sent from Ferni', async () => {
    grant('user-a');
    sendReply = () => new Response('', { status: 503 });
    const call = liveCall();
    await call.call(TO_PAT, 'c1');
    call.caller('yes');

    const reply = await call.call(TO_PAT, 'c2');

    expect(reply).toContain("couldn't reach Gmail");
    expect(gmailSends()).toHaveLength(1);
    expect(ferniSends()).toHaveLength(0);
  });

  it("Ferni's address only when the caller picks it: a new read-back naming it, and a new yes", async () => {
    grant('user-a');
    const call = liveCall();

    const preview = await call.call({ ...TO_PAT, fromFerni: true }, 'c1');
    expect(preview).toContain("pat.rivera@example.com from Ferni's address, saying");
    expect(ferniSends()).toHaveLength(0);
    call.caller('yes');
    await call.call({ ...TO_PAT, fromFerni: true }, 'c2');

    expect(ferniSends()).toHaveLength(1);
    expect(gmailSends()).toHaveLength(0);
  });

  it('OUTREACH_SERVER_CONFIRM: the yes itself sends the read-back from Gmail, once', async () => {
    vi.stubEnv('OUTREACH_SERVER_CONFIRM', 'on');
    grant('user-a');
    const call = liveCall();
    expect(await call.call(TO_PAT, 'c1')).toContain('from your Gmail, user-a@example.com');
    expect(gmailSends()).toHaveLength(0);

    call.caller('Yes, go ahead.');

    await vi.waitFor(() => expect(gmailSends()).toHaveLength(1), { timeout: 4000 });
    expect(gmailSends()[0].auth).toBe('Bearer access-user-a');
    expect(ferniSends()).toHaveLength(0);
  });

  // Each failure, under the server-sent yes: recorded as not placed (the model hears it failed,
  // never "sent"), and Ferni's address, once picked, gets its own read-back and yes and sends once.
  const failures: Array<[string, () => void, string]> = [
    ['needs_reauth', () => grant('user-a', { expires_at: 0 }), 'needs renewing'],
    ['unreachable', () => (sendReply = () => new Response('', { status: 503 })), 'reach Gmail'],
    ['not_permitted', () => (sendReply = () => new Response('', { status: 403 })), "didn't let"],
    ['rejected', () => (sendReply = () => new Response('', { status: 400 })), 'turned that'],
    ['not_connected', () => undefined, "isn't connected"],
  ];
  it.each(failures)(
    'OUTREACH_SERVER_CONFIRM, %s: not placed, the model hears it failed, Ferni only on a new yes',
    async (status, setup, said) => {
      vi.stubEnv('OUTREACH_SERVER_CONFIRM', 'on');
      grant('user-a');
      setup();
      tokenReply = () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      const call = liveCall();
      expect(await call.call(TO_PAT, 'c1')).toContain('from your Gmail');
      if (status === 'not_connected') grants.clear(); // disconnected after the read-back

      call.caller('Yes, go ahead.');
      await vi.waitFor(() => expect(notes.join('\n')).toContain('did not go through'), {
        timeout: 4000,
      });
      expect(notes.join('\n')).toContain(said);
      expect(notes.join('\n')).not.toContain("sent on the caller's yes");
      expect(ferniSends()).toHaveLength(0);

      const retry = await call.call({ ...TO_PAT, fromFerni: true }, 'c2');
      expect(retry).not.toContain('Already placed');
      expect(retry).toContain("pat.rivera@example.com from Ferni's address, saying");
      expect(ferniSends()).toHaveLength(0);
      call.caller('Yes, go ahead.');
      await vi.waitFor(() => expect(notes.join('\n')).toContain("sent on the caller's yes"), {
        timeout: 4000,
      });
      expect(await call.call({ ...TO_PAT, fromFerni: true }, 'c3')).toContain('Already placed');
      expect(ferniSends()).toEqual([expect.objectContaining({ to: 'pat.rivera@example.com' })]);
    },
    15_000
  );

  it("user B never sends with user A's token", async () => {
    grant('user-a');
    const call = liveCall('user-b');

    const preview = await call.call(TO_PAT, 'c1');
    call.caller('yes');
    await call.call(TO_PAT, 'c2');

    expect(preview).not.toContain('Gmail');
    expect(preview).not.toContain('user-a@example.com');
    expect(google).toHaveLength(0);
    expect(ferniSends()).toEqual([expect.objectContaining({ userId: 'user-b' })]);
  });

  it('a read-back that named their Gmail sends from Gmail even if they connect or disconnect after', async () => {
    const call = liveCall();
    await call.call(TO_PAT, 'c1'); // no grant yet: read back as Ferni's mailbox
    grant('user-a');
    call.caller('yes');
    await call.call(TO_PAT, 'c2');
    expect(gmailSends()).toHaveLength(0);
    expect(ferniSends()).toHaveLength(1);

    const again = liveCall();
    await again.call(TO_PAT, 'c3'); // read back as their Gmail
    grants.clear();
    again.caller('yes');
    const reply = await again.call(TO_PAT, 'c4');
    expect(reply).toContain("isn't connected");
    expect(ferniSends()).toHaveLength(1);
  });
});
