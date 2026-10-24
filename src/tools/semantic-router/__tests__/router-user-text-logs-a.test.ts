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
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
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

import { SemanticRouter } from '../router.js';
import { SemanticToolRegistry } from '../registry.js';
import { routeVoiceInput, recordUserCorrection } from '../voice-integration.js';
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
const REPLACEMENT: Record<string, unknown> = { argKeys: ['query', 'city'] };

/** Every logged call that carries the row's replacement field. */
const replacementFields = (field: string) =>
  logged.filter(
    ([fields]) =>
      JSON.stringify((fields as Record<string, unknown> | undefined)?.[field]) ===
      JSON.stringify(REPLACEMENT[field] ?? TEXT.length)
  );

const match = { toolId: 'play_music', confidence: 0.6 };

/** A router whose one tool matches TEXT below 1.0, so the Gemini boost changes the confidence. */
function boostedRouter(execute: () => Promise<unknown> = async () => ({})): SemanticRouter {
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
  return new SemanticRouter({ enabledLayers: ['pattern', 'keyword'] }, registry);
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
});
