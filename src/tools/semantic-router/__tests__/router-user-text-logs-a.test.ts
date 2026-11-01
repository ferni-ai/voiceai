/**
 * What the caller says must not reach a log line. The router, its voice entry
 * point, the learning loop, the feedback store and the intelligent orchestrator
 * used to log the first 30-50 characters of the utterance; they log its length.
 *
 * Each row drives one entry point with a sentinel in the user text and asserts
 * the sentinel appears in nothing the logger was handed, and that the length
 * field that replaced the text is there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture, child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) };
  return {
    ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
    createLogger: () => logger,
    getLogger: () => logger,
  };
});

// A fixed Gemini boost, so the router's boost branch runs without the config's own logging.
vi.mock('../integration/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../integration/config.js')>()),
  isUsingGemini: () => true,
  getGeminiConfidenceBoost: () => 1.5,
}));

// The locale detector reports a non-English language for any input.
vi.mock('../i18n/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../i18n/index.js')>()),
  autoDetectAndLoadLocale: async () => 'es',
}));

// Voice start-up embeds every tool: use a local provider so the test never reaches the network.
vi.mock('../embedding-providers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../embedding-providers.js')>()),
  createEmbeddingProvider: () => ({
    modelName: 'test',
    dimensions: 4,
    embed: async () => [0.1, 0.2, 0.3, 0.4],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3, 0.4]),
  }),
}));

import { updateContextWithToolResult } from '../advanced/deep-context.js';
import { SemanticRouter } from '../router.js';
import { SemanticToolRegistry } from '../registry.js';
import {
  routeVoiceInput,
  recordToolExecutionOutcome,
  recordUserCorrection,
} from '../voice-integration.js';
import { handleExplicitCorrection, recordOutcome } from '../advanced/learning-loop.js';
import { recordCorrection } from '../advanced/feedback-store.js';
import { IntelligentRouterOrchestrator } from '../advanced/intelligent/orchestrator.js';

const TEXT = `play some music for ${SENTINEL}`;

/** The log as text, errors included: JSON drops an Error's message unless asked. */
const dump = () =>
  JSON.stringify(logged, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v
  );

/** What replaced the text in each row's log field: the length, or for a tool call the arg names. */
const REPLACEMENT: Record<string, unknown> = {
  argKeys: ['query', 'city'],
  error: 'Error',
  errorMessageLength: SENTINEL.length,
};

/** Every logged call that carries the row's replacement field. */
const replacementFields = (field: string) =>
  logged.filter(
    ([fields]) =>
      JSON.stringify((fields as Record<string, unknown> | undefined)?.[field]) ===
      JSON.stringify(REPLACEMENT[field] ?? TEXT.length)
  );

const match = { toolId: 'play_music', confidence: 0.6 };

/** A router whose one tool matches TEXT below 1.0, so the Gemini boost changes the confidence. */
function boostedRouter(
  execute: () => Promise<unknown> = async () => ({}),
  config: Record<string, unknown> = {}
): SemanticRouter {
  const registry = new SemanticToolRegistry();
  registry.register({
    id: 'play_music',
    name: 'Play music',
    description: 'play music',
    shortDescription: 'music',
    category: 'media',
    triggers: { patterns: [], keywords: ['play', 'music', 'song'] },
    examples: ['play some music'],
    arguments: [],
    execute,
  } as never);
  return new SemanticRouter(
    { enabledLayers: ['pattern', 'keyword'], ...config } as never,
    registry
  );
}
const routingResult = {
  matches: [match],
  action: { type: 'execute' },
} as never;

/** A tool that fails with a message quoting its arguments, as a validation error does. */
const failingTool = async () => {
  throw new Error(`invalid argument: ${SENTINEL}`);
};

const entryPoints: Array<[string, string, () => Promise<unknown>]> = [
  ['SemanticRouter.route (Gemini boost)', 'inputLength', () => boostedRouter().route(TEXT)],
  [
    'routeVoiceInput (locale auto-detect)',
    'inputLength',
    () => routeVoiceInput(TEXT, { userId: 'u1', sessionId: 's1' } as never),
  ],
  [
    'recordUserCorrection',
    'inputLength',
    () => recordUserCorrection('u1', TEXT, 'check_calendar', 'play_music'),
  ],
  [
    'recordOutcome (implicit correction)',
    'inputLength',
    () =>
      recordOutcome(
        {
          userId: 'u1',
          sessionId: 's1',
          inputText: TEXT,
          routingResult,
          conversationHistory: [],
          recentTools: [],
        } as never,
        { actualToolUsed: 'play_music', wasCorrection: true, wasSuccess: true } as never
      ),
  ],
  [
    'handleExplicitCorrection',
    'phraseLength',
    () => handleExplicitCorrection('u1', TEXT, 'check_calendar', 'play_music'),
  ],
  [
    'recordCorrection',
    'inputLength',
    () =>
      recordCorrection({
        userId: 'u1',
        inputText: TEXT,
        predictedTool: 'check_calendar',
        predictedConfidence: 0.8,
        correctTool: 'play_music',
        signalStrength: 1,
      } as never),
  ],
  [
    'SemanticRouter.execute (tool failure)',
    'argKeys',
    () =>
      boostedRouter(failingTool).execute('play_music', { query: TEXT, city: SENTINEL }, {
        userId: 'u1',
        sessionId: 's1',
      } as never),
  ],
  [
    'SemanticRouter.route (debug routing result)',
    'inputLength',
    () => boostedRouter(undefined, { debug: true }).route(TEXT),
  ],
  [
    'SemanticRouter.route (embedding failure)',
    'error',
    async () => {
      const router = boostedRouter(undefined, {
        enabledLayers: ['pattern', 'keyword', 'embedding'],
      });
      await router.initialize({
        modelName: 'test',
        dimensions: 4,
        embed: async () => {
          throw new Error(`embedding refused: ${SENTINEL}`);
        },
        embedBatch: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3, 0.4]),
      });
      return router.route(TEXT);
    },
  ],
  [
    'routeVoiceInput (auto-execute)',
    'argKeys',
    async () => {
      vi.spyOn(SemanticRouter.prototype, 'route').mockResolvedValue({
        matches: [{ toolId: 'play_music', confidence: 0.99 }],
        action: {
          type: 'execute',
          toolId: 'play_music',
          args: { query: TEXT, city: SENTINEL },
          confidence: 0.99,
        },
      } as never);
      return routeVoiceInput(TEXT, {
        userId: 'u1',
        sessionId: 's1',
        conversationHistory: [],
        recentTools: [],
      } as never);
    },
  ],
  [
    'recordToolExecutionOutcome (failure)',
    'errorMessageLength',
    () =>
      recordToolExecutionOutcome('s1', {
        toolId: 'play_music',
        success: false,
        wasCorrection: false,
        executionTimeMs: 5,
        routingConfidence: 0.9,
        errorMessage: SENTINEL,
      }),
  ],
  [
    'orchestrator.route (decision logs)',
    'inputLength',
    () => new IntelligentRouterOrchestrator({ logMetrics: true }).route(TEXT),
  ],
  [
    'orchestrator.route (failure)',
    'inputLength',
    () => {
      const orchestrator = new IntelligentRouterOrchestrator({ logMetrics: true });
      (orchestrator as unknown as { intentClassifier: unknown }).intentClassifier = {
        classify: () => {
          throw new Error(`classifier choked on: ${SENTINEL}`);
        },
      };
      return orchestrator.route(TEXT);
    },
  ],
];

describe('router user-text logs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    logged.length = 0;
  });

  it.each(entryPoints)(
    '%s logs the length (or arg names), never the words',
    async (_name, field, call) => {
      await call().catch(() => undefined); // a failing downstream must not hide a leak
      expect(logged.length).toBeGreaterThan(0);
      expect(dump()).not.toContain(SENTINEL);
      expect(dump()).not.toContain('play some music');
      expect(replacementFields(field).length).toBeGreaterThan(0);
    }
  );
  it('execute() with missing args still returns a failure result, not a rejection', async () => {
    for (const args of [undefined, null]) {
      const result = await boostedRouter(failingTool).execute(
        'play_music',
        args as never,
        { userId: 'u1', sessionId: 's1' } as never
      );
      expect(result.success).toBe(false);
    }
    expect(dump()).not.toContain(SENTINEL);
  });

  // The row above only proves a length field exists somewhere in the flow: pin each
  // message to the real length so a wrong value (not just the text) turns it red.
  it.each([
    ['Learned from correction', 'inputLength'],
    ['Explicit correction processed', 'phraseLength'],
    ['User correction recorded', 'inputLength'],
    ['Correction recorded', 'inputLength'],
  ])('%s logs %s equal to the real length', async (message, field) => {
    await recordOutcome(
      {
        userId: 'u1',
        sessionId: 's1',
        inputText: TEXT,
        routingResult,
        conversationHistory: [],
        recentTools: [],
      } as never,
      { actualToolUsed: 'play_music', wasCorrection: true, wasSuccess: true } as never
    );
    await recordUserCorrection('u1', TEXT, 'check_calendar', 'play_music');
    await handleExplicitCorrection('u1', TEXT, 'check_calendar', 'play_music');
    const lines = logged.filter(([, msg]) => msg === message);
    expect(lines.length).toBeGreaterThan(0);
    for (const [fields] of lines) {
      expect((fields as Record<string, unknown>)[field]).toBe(TEXT.length);
    }
  });
  describe('"Pronouns resolved" (two turns in one session)', () => {
    const NAME = 'Zebedeekins';
    const calendarRoute = {
      matches: [{ toolId: 'calendar_create_event', confidence: 0.5 }],
      action: { type: 'conversation', reason: 'test' },
    } as never;
    const turn = (sessionId: string, text: string) =>
      routeVoiceInput(text, {
        userId: 'u1',
        sessionId,
        conversationHistory: [],
        recentTools: [],
      } as never);
    const lowered = () => dump().toLowerCase();
    const pronounLines = () => logged.filter(([, msg]) => msg === 'Pronouns resolved');

    it('logs which pronoun resolved, never the name it resolved to', async () => {
      vi.spyOn(SemanticRouter.prototype, 'route').mockResolvedValue(calendarRoute);
      await turn('pn1', `I need to talk to ${NAME} about my sister ${NAME} and her diagnosis`);
      await turn('pn1', 'remind me to call her tomorrow');
      expect(pronounLines().length).toBeGreaterThan(0); // not vacuous: the pronoun path ran
      expect((pronounLines()[0][0] as { pronouns: string[] }).pronouns).toContain('her');
      expect(lowered()).not.toContain(NAME.toLowerCase());
    });

    it('logs the length of "the result", never its output', async () => {
      vi.spyOn(SemanticRouter.prototype, 'route').mockResolvedValue(calendarRoute);
      const output = { events: [`dinner with ${NAME}`] };
      await turn('pn2', 'what is on my calendar');
      updateContextWithToolResult(
        'pn2',
        'calendar_list_events',
        { success: true, data: output } as never,
        1
      );
      await turn('pn2', 'remind me to share the result');
      const line = pronounLines().find(([f]) =>
        (f as { pronouns: string[] }).pronouns.includes('result')
      );
      expect(line).toBeDefined();
      expect((line![0] as { resultLength: number }).resultLength).toBeGreaterThan(0);
      expect(lowered()).not.toContain(NAME.toLowerCase());
    });
  });
});
