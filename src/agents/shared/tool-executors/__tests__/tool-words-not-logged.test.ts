/**
 * #4322 round 2: the voice and chat tools log a length, a count or a yes/no for the free text a
 * caller gives (titles, labels, subjects, messages, names, recipients), never the text itself.
 * Each row drives a real tool with an invented line in every free-text field, captures every log
 * call, and asserts that no captured field holds that line and that the tool's own line carries
 * its shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../../../../tools/registry/types.js';

const cap = vi.hoisted(() => {
  const calls: Array<{ level: string; fields: unknown; msg: unknown }> = [];
  const logger: Record<string, unknown> = {};
  for (const level of ['info', 'warn', 'error', 'debug', 'trace', 'fatal']) {
    logger[level] = (fields: unknown, msg?: unknown) => calls.push({ level, fields, msg });
  }
  logger.child = () => logger;
  // A Firestore that takes every write and reads back nothing.
  const empty = { docs: [], empty: true, size: 0, exists: false, data: () => undefined };
  const node = (): unknown =>
    new Proxy(() => {}, {
      get: (_t, key) => {
        if (key === 'then') return undefined;
        if (key === 'get') return async () => ({ ...empty, forEach: () => {} });
        if (key === 'set' || key === 'update' || key === 'add' || key === 'delete') {
          return async () => node();
        }
        return () => node();
      },
    });
  // TMDB answers nothing by default; a row can make it throw.
  const tmdb = { get: async (): Promise<unknown> => null };
  return { calls, logger, db: node(), tmdb };
});

/** Invented caller words: if any log field holds this, the words reached the logger. */
const WORDS = 'riley test dentist with dr oat on fifth';
/** An invented third party, named the way a caller would name them. */
const CONTACT = 'riley neighbour at riley.neighbour@example.test';

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLogger: () => cap.logger,
  safeLog: () => cap.logger,
  createLogger: () => cap.logger,
}));
vi.mock('../../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => cap.db }));
vi.mock('../../../../utils/shared-firestore.js', () => ({ sharedFirestore: () => cap.db }));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));
vi.mock('../../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isConnected: vi.fn(async () => false),
}));

vi.mock('../../../../tools/domains/entertainment/tmdb-client.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  tmdbGet: async () => cap.tmdb.get(),
}));
vi.mock('../../../../services/user-events/index.js', () => ({ broadcastUserEvent: vi.fn() }));
vi.mock(
  '../../../../services/contacts/contact-relationship-service.js',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    searchContacts: vi.fn(async () => [
      { name: 'Riley Neighbour', phone: '+15555550123', email: 'riley.neighbour@example.test' },
    ]),
  })
);
vi.mock('../../../../services/outreach/voice-synthesis.js', () => ({
  isVoiceSynthesisAvailable: () => true,
  generateVoiceMessage: vi.fn(async () => ({ audioUrl: 'https://media.example.test/v.mp3' })),
}));
vi.mock('../../../../services/communication-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  directSendHeld: vi.fn(async () => false),
  // The real sendEmail answers with the masked address and the subject.
  sendEmail: vi.fn(
    async (_to: string, subject: string) => `Email sent to ri***@example.test: "${subject}"`
  ),
}));

const { executeLegacyFallback } = await import('../legacy-fallback-executor.js');
const { openclawExecutor } = await import('../openclaw-executor.js');
const { createCommunicationCoachingTools } =
  await import('../../../../tools/domains/communication/communication-coaching.js');
const { createCommunicationTools } =
  await import('../../../../tools/domains/communication/communication-tools.js');
const communication = await import('../../../../tools/domains/communication/index.js');
const { createConversationTools } =
  await import('../../../../tools/domains/conversation/conversation-tools.js');
const learning = await import('../../../../tools/domains/learning/index.js');
const scheduling = await import('../../../../tools/domains/scheduling/index.js');
const { shortcutsToolDefinitions } =
  await import('../../../../tools/domains/simple-utilities/shortcuts-tools.js');
const { saveVoiceMemoDef } =
  await import('../../../../tools/domains/simple-utilities/voice-memos-tools.js');
const smartHome = await import('../../../../tools/domains/smart-home/index.js');
const stories = await import('../../../../tools/domains/stories/index.js');
const { createSharedGoal } = await import('../../../../tools/handoff/team-coordination/core.js');
const { createMovieTools } = await import('../../../../tools/domains/entertainment/movies.js');
const { navigationToolDefinitions } =
  await import('../../../../tools/domains/ui-navigation/navigation-tools.js');

const USER = 'riley-test-1';
const ctx = { userId: USER };
const opts = { ctx: { userData: { userId: USER } } };

interface Runnable {
  execute: (args: unknown, o: unknown) => unknown;
}

beforeEach(() => {
  cap.calls.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  cap.tmdb.get = async () => null;
});

const quietly = async (run: () => unknown): Promise<void> => {
  try {
    await run();
  } catch {
    // Some tools fail later against the stubs; the log line under test came first.
  }
};

/** No captured call holds the words or the contact; line `msg` has every field in `shape`. */
function nothingNamed(msg: string, shape: Record<string, unknown> = {}): void {
  for (const c of cap.calls) {
    const text = JSON.stringify(c.fields) ?? '';
    expect(text).not.toContain(WORDS);
    expect(text).not.toContain(CONTACT);
  }
  const line = cap.calls.find((c) => c.msg === msg);
  expect(line, `no "${msg}" line`).toBeDefined();
  expect(line?.fields).toMatchObject(shape);
}

/** Runs tool `id` from a list of definitions, the way the voice agent does. */
async function tool(
  defs: readonly ToolDefinition[],
  id: string,
  args: Record<string, unknown>
): Promise<void> {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  const made = (def.create as (c: unknown) => Runnable)({ userId: USER, agentId: 'ferni' });
  await quietly(() => made.execute(args, opts));
}

/** Runs a tool from a name-keyed tool map (the older communication and conversation tools). */
async function legacyTool(
  map: Record<string, unknown>,
  name: string,
  args: unknown,
  o: unknown = opts
) {
  await quietly(() => (map[name] as Runnable).execute(args, o));
}

/** A gateway that answers each send with `reply`. */
const gateway = (reply: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(reply));

describe('chat fallback and messaging executors log no caller words (#4322)', () => {
  it('a voice scheduleEvent: the title as a length', async () => {
    await quietly(() => executeLegacyFallback('scheduleEvent', { title: WORDS, when: WORDS }, ctx));
    nothingNamed('📅 Scheduling event', { titleLength: WORDS.length, duration: 60 });
  });

  it('the createCalendarEvent alias: whether a title and date came, nothing more', async () => {
    const args = { title: WORDS, startTime: WORDS, date: WORDS };
    await quietly(() => executeLegacyFallback('createCalendarEvent', args, ctx));
    nothingNamed('📅 Creating event via alias', { hasTitle: true, hasDate: true });
  });

  it('an OpenClaw send: whether there was a recipient, the message as a length', async () => {
    gateway(async () => new Response(JSON.stringify({ success: true, channel: 'whatsapp' })));
    await openclawExecutor.execute('sendWhatsApp', { recipient: CONTACT, message: WORDS }, ctx);
    nothingNamed('📨 OpenClaw message requested via WhatsApp', {
      hasRecipient: true,
      messageLength: WORDS.length,
    });
    nothingNamed('📨 Message sent via OpenClaw', { channel: 'whatsapp' });
  });

  it('an OpenClaw send the gateway refuses: the channel, no recipient', async () => {
    gateway(async () => new Response(JSON.stringify({ success: false, error: 'refused' })));
    await openclawExecutor.execute('sendTelegram', { recipient: CONTACT, message: WORDS }, ctx);
    nothingNamed('📨 OpenClaw send failed', { channel: 'telegram' });
  });

  it('an OpenClaw gateway that throws: the channel, no recipient', async () => {
    gateway(async () => Promise.reject(new Error('fetch failed')));
    await openclawExecutor.execute('sendSlack', { recipient: CONTACT, message: WORDS }, ctx);
    nothingNamed('📨 OpenClaw executor error', { channel: 'slack' });
  });
});

describe('communication and identity tools log no caller words (#4322)', () => {
  it('coaching a difficult message: whether there was a recipient', async () => {
    await legacyTool(createCommunicationCoachingTools(), 'draftDifficultMessage', {
      conversationType: 'other',
      recipient: CONTACT,
      context: WORDS,
      keyPoints: WORDS,
      desiredOutcome: WORDS,
      format: 'email',
      tone: 'warm',
    });
    nothingNamed('💬 Alex: Coaching on difficult message', { hasRecipient: true });
  });

  it("Alex's scheduleEvent: the title as a length", async () => {
    await legacyTool(createCommunicationTools(), 'scheduleEvent', {
      title: WORDS,
      when: 'tomorrow at 3pm',
    });
    nothingNamed('📅 Calendar event created', { titleLength: WORDS.length });
  });

  it('scheduleReminder for an event: the title as a length', async () => {
    const args = { type: 'event', title: WORDS, when: 'tomorrow at 3pm' };
    await tool(communication.definitions, 'scheduleReminder', args);
    nothingNamed('⏰ Schedule tool called', { type: 'event', titleLength: WORDS.length });
  });

  it('a borrowed-phone caller: whether a name and relationship came, never them', async () => {
    await legacyTool(
      createConversationTools(),
      'confirmCallerIdentity',
      {
        confirmedName: WORDS,
        isSamePerson: false,
        createNewProfile: true,
        relationship: WORDS,
      },
      { ctx: { userData: { userId: USER, services: { sessionId: 'session-1' } } } }
    );
    const shape = { hasName: true, hasRelationship: true };
    nothingNamed('🔐 Caller identity confirmation', { ...shape, isSamePerson: false });
    nothingNamed('📱 Creating context for borrowed phone caller', shape);
  });
});

describe('learning, scheduling and shortcut tools log no caller words (#4322)', () => {
  it('a learning goal: whether a subject came', async () => {
    await tool(learning.definitions, 'setLearningGoal', {
      subject: WORDS,
      currentLevel: 'beginner',
    });
    nothingNamed('Setting learning goal', { hasSubject: true });
  });

  it('learning progress: whether a subject came', async () => {
    await tool(learning.definitions, 'trackLearningProgress', { subject: WORDS, update: WORDS });
    nothingNamed('Learning progress', { hasSubject: true });
  });

  it('a study session: the subject as a length', async () => {
    await tool(learning.definitions, 'planStudySession', { subject: WORDS, timeAvailable: 30 });
    nothingNamed('Planning study session', { subjectLength: WORDS.length, timeAvailable: 30 });
  });

  it('a learning block: whether a subject came', async () => {
    const args = { block: 'plateau', subject: WORDS };
    await tool(learning.definitions, 'overcomeLearningBlock', args);
    nothingNamed('Learning block', { block: 'plateau', hasSubject: true });
  });

  it('a scheduled text and call: the time as a length, whether there was a recipient', async () => {
    const args = { recipient: CONTACT, message: WORDS, when: WORDS };
    await tool(scheduling.definitions, 'scheduleMessage', args);
    nothingNamed('📱 Scheduling text message', { whenLength: WORDS.length, hasRecipient: true });
    cap.calls.length = 0;
    await tool(scheduling.definitions, 'scheduleCall', args);
    nothingNamed('📞 Scheduling phone call', { whenLength: WORDS.length });
  });

  it('a scheduled email: the subject as a length', async () => {
    const args = { recipient: CONTACT, subject: WORDS, message: WORDS, when: WORDS };
    await tool(scheduling.definitions, 'scheduleEmail', args);
    nothingNamed('📧 Scheduling email', { subjectLength: WORDS.length });
  });

  it('a quick alarm and timer: whether a label came', async () => {
    await tool(shortcutsToolDefinitions, 'quickAlarm', { time: '7am', label: WORDS });
    nothingNamed('Quick alarm shortcut', { hasLabel: true });
    cap.calls.length = 0;
    await tool(shortcutsToolDefinitions, 'quickTimer', { duration: '5 minutes', label: WORDS });
    nothingNamed('Quick timer shortcut', { hasLabel: true });
  });

  it('a quick call: no contact, the message as a length', async () => {
    await tool(shortcutsToolDefinitions, 'quickCall', { contact: CONTACT, message: WORDS });
    nothingNamed('Quick call shortcut', { messageLength: WORDS.length });
  });

  it('a quick email: no recipient, the subject as a length', async () => {
    const args = { recipient: CONTACT, subject: WORDS, body: WORDS };
    await tool(shortcutsToolDefinitions, 'quickEmail', args);
    nothingNamed('Quick email shortcut', { subjectLength: WORDS.length });
  });
});

describe('memo, home, story and team tools log no caller words (#4322)', () => {
  it('a voice memo: the title as a length', async () => {
    await tool([saveVoiceMemoDef], 'saveVoiceMemo', { title: WORDS, transcript: WORDS });
    nothingNamed('🎤 Saving voice memo', { titleLength: WORDS.length });
  });

  it('a house broadcast and a dinner call: the message as a length', async () => {
    await tool(smartHome.definitions, 'broadcastMessage', { message: WORDS });
    nothingNamed('📢 Broadcasting message', { messageLength: WORDS.length });
    cap.calls.length = 0;
    await tool(smartHome.definitions, 'announceDinner', { customMessage: WORDS });
    nothingNamed('🍽️ Announcing dinner', { messageLength: WORDS.length });
  });

  it('a time capsule: no recipient, how far ahead as a length', async () => {
    await tool(stories.definitions, 'createTimeCapsule', {
      recipient: 'children',
      yearsAhead: WORDS,
    });
    nothingNamed('Time capsule', { aheadLength: WORDS.length });
    const line = cap.calls.find((c) => c.msg === 'Time capsule');
    expect(line?.fields).not.toHaveProperty('recipient');
  });

  it('an oral history: no subject (the person whose story it is)', async () => {
    const args = { subject: CONTACT, purpose: 'family-archive' };
    await tool(stories.definitions, 'recordOralHistory', args);
    nothingNamed('Recording oral history', { purpose: 'family-archive' });
  });

  it('a shared team goal: the id and the title as a length', async () => {
    const title = 'riley test lake house';
    await quietly(() => createSharedGoal(USER, title, 'home'));
    const line = cap.calls.find((c) => c.msg === '🤝 Shared goal created (persisted)');
    expect(JSON.stringify(line?.fields)).not.toContain(title);
    expect(line?.fields).toMatchObject({ titleLength: title.length });
  });
});

/** No captured call holds the contact's phone or address, masked or not. */
function noContactDetails(): void {
  for (const c of cap.calls) {
    const text = JSON.stringify(c.fields) ?? '';
    expect(text).not.toContain('0123');
    expect(text).not.toContain('example.test');
  }
}

describe('contact, panel, catalog and send lines log no caller words (#4322 round 3)', () => {
  it('saving contact info: whether a phone and an email came, never a masked copy', async () => {
    const args = { phone: '+15555550123', email: 'riley.neighbour@example.test' };
    const withProfile = { ctx: { userData: { userId: USER, userProfile: {} } } };
    await legacyTool(createCommunicationTools(), 'saveContactInfo', args, withProfile);
    nothingNamed('📇 Contact info saved', { hasPhone: true, hasEmail: true });
    noContactDetails();
  });

  it('a panel the app does not know: the phrase as a length', async () => {
    await tool(navigationToolDefinitions, 'openPanel', { panel: WORDS });
    nothingNamed('🧭 Unknown panel requested', { requestedLength: WORDS.length });
  });

  it('a panel it opens: the panel id, the phrase as a length', async () => {
    const panel = `${WORDS} memory lane`;
    await tool(navigationToolDefinitions, 'openPanel', { panel });
    nothingNamed('🧭 Opening panel via voice', { requestedLength: panel.length });
  });

  it.each([
    ['getMovieInfo', '🎬 Movie info tool called'],
    ['getMovieInfo', '🎬 Looking up movie'],
    ['getMovieShowtimes', '🎬 Showtimes tool called'],
    ['getMovieShowtimes', '🎬 Getting showtimes'],
    ['getWhereToWatch', '🎬 Where to watch tool called'],
  ])('%s, line %s: the asked-for title as a length, before any lookup', async (name, msg) => {
    await legacyTool(createMovieTools(), name, { title: WORDS, location: 'riley test town' });
    nothingNamed(msg, { titleLength: WORDS.length });
  });

  it('a TMDB search that throws: the query as a length', async () => {
    cap.tmdb.get = async () => Promise.reject(new Error('tmdb down'));
    await legacyTool(createMovieTools(), 'getMovieInfo', {
      title: WORDS,
    });
    nothingNamed('🎬 TMDB exception', { queryLength: WORDS.length });
  });

  it('logging a book: the title as a length', async () => {
    await tool(learning.definitions, 'trackBooksRead', { action: 'log', title: WORDS });
    nothingNamed('Book log', { action: 'log', titleLength: WORDS.length });
  });

  it('a chat logMood: the mood as a length', async () => {
    await quietly(() => executeLegacyFallback('logMood', { mood: WORDS, intensity: 3 }, ctx));
    nothingNamed('😊 Mood noted', { moodLength: WORDS.length, intensity: 3 });
  });
});

describe('chat fallback sends log no contact (#4322 round 3)', () => {
  beforeEach(() => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC-riley-test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'riley-test-token');
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+15555550100');
  });

  it('a text: no contact name on the request, a recipient flag on the send', async () => {
    gateway(async () => new Response(JSON.stringify({ sid: 'SM-riley-test' })));
    await executeLegacyFallback('sendSMS', { contactName: CONTACT, message: WORDS }, ctx);
    nothingNamed('📱 Text message requested', { userId: USER });
    nothingNamed('📱 SMS sent', { sid: 'SM-riley-test', hasRecipient: true });
    noContactDetails();
  });

  it('a voice message: no contact name on the request, a recipient flag on the send', async () => {
    gateway(async () => new Response(JSON.stringify({ sid: 'MM-riley-test' })));
    await executeLegacyFallback('sendVoiceMessage', { contactName: CONTACT, message: WORDS }, ctx);
    nothingNamed('🎤 Voice message requested', { userId: USER });
    nothingNamed('📱 Voice message sent via MMS', { sid: 'MM-riley-test', hasRecipient: true });
    noContactDetails();
  });

  it("a refused text or voice message: Twilio's status, never its body", async () => {
    const body = 'The To number +15555550123 is not a valid mobile number';
    gateway(async () => new Response(body, { status: 400 }));
    await executeLegacyFallback('sendSMS', { contactName: CONTACT, message: WORDS }, ctx);
    nothingNamed('📱 SMS send failed', { status: 400 });
    await executeLegacyFallback('sendVoiceMessage', { contactName: CONTACT, message: WORDS }, ctx);
    nothingNamed('📱 MMS send failed', { status: 400 });
    noContactDetails();
  });

  it('an email: no contact name, no address, the send result as a length', async () => {
    const args = { contactName: CONTACT, subject: WORDS, message: WORDS };
    await executeLegacyFallback('sendEmail', args, ctx);
    nothingNamed('📧 Email requested', { userId: USER });
    const result = `Email sent to ri***@example.test: "${WORDS}"`;
    nothingNamed('📧 Email sent', { hasRecipient: true, resultLength: result.length });
    noContactDetails();
  });
});
