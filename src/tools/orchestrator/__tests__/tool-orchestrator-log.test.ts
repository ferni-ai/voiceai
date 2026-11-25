/**
 * "Tool selection complete" logged the first 50 characters of what the caller said, plus prefixes
 * of the user and session ids, and passed the same object to the observability event (#4438).
 * It now carries the transcript's length, and no string longer than an id reaches either. The
 * real orchestrator; a fictional transcript.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ info: [] as Array<[Record<string, unknown>, string]> }));
const emitted = vi.hoisted(() => ({ events: [] as Array<[string, Record<string, unknown>]> }));

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn((fields: Record<string, unknown>, message: string) => {
      logged.info.push([fields, message]);
    }),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return { getLogger: () => logger, createLogger: () => logger };
});
vi.mock('../../../api/observability-routes.js', () => ({
  emitToolIntelligenceEvent: (type: string, data: Record<string, unknown>) => {
    emitted.events.push([type, data]);
  },
}));
vi.mock('../../registry/index.js', () => {
  const tools = [
    { id: 'getWeather', domain: 'information', description: 'Get weather' },
    { id: 'rememberUser', domain: 'memory', description: 'Remember user info' },
  ];
  return {
    toolRegistry: {
      getAll: () => tools,
      get: (id: string) => tools.find((t) => t.id === id),
      query: ({ domains }: { domains?: string[] }) =>
        tools.filter((t) => !domains || domains.includes(t.domain)),
      isInitialized: () => true,
    },
  };
});
vi.mock('../../registry/loader.js', () => ({
  initializeToolRegistry: vi
    .fn()
    .mockResolvedValue({ loaded: 2, byDomain: {}, errors: [], remainingDomains: [] }),
  loadToolDomainsLazy: vi.fn().mockResolvedValue({ loaded: 0, byDomain: {}, errors: [] }),
}));
vi.mock('../../semantic-router/compat.js', () => ({
  semanticRouter: {
    initialize: vi.fn().mockResolvedValue(undefined),
    findRelevantToolsAsync: vi.fn().mockResolvedValue([]),
    clearCache: vi.fn(),
  },
}));
vi.mock('../../semantic-router/precomputed-embeddings.js', () => ({
  areEmbeddingsLoaded: () => false,
  loadPrecomputedEmbeddings: vi.fn().mockRejectedValue(new Error('not built in tests')),
  semanticSearchTools: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../advanced/tool-lifecycle.js', () => ({
  initializeToolLifecycle: vi.fn().mockResolvedValue(undefined),
  isToolDeprecated: vi.fn().mockReturnValue(false),
  getSuggestedReplacement: vi.fn().mockReturnValue(null),
}));
vi.mock('../../../services/model-config.js', () => ({
  modelConfig: {
    getDefaultToolConfig: () => ({}),
    getPersonaConfig: vi.fn(),
    getDefaults: vi.fn(),
  },
}));
vi.mock('../../builder.js', () => ({ buildEssentialTools: vi.fn().mockResolvedValue({}) }));

import { UnifiedToolOrchestrator } from '../tool-orchestrator.js';

/** The longest an id-like value gets: a persona id, a tool id or a source name. */
const ID_LENGTH = 40;

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

const TRANSCRIPT = 'my sister Marlowe moved to Portland and I want to call her about the move';

describe('"Tool selection complete" carries no caller words', () => {
  beforeEach(() => {
    logged.info.length = 0;
    emitted.events.length = 0;
  });

  async function select() {
    const orchestrator = new UnifiedToolOrchestrator({
      maxTools: 35,
      semanticThreshold: 0.15,
      precomputeEmbeddings: true,
      alwaysDomains: ['memory', 'information'],
      enableContextualTools: false,
      enabledDomains: [],
      excludedTools: [],
      includedTools: [],
      debugMode: false,
      logToolSchemas: false,
      logToolResults: false,
    });
    await orchestrator.initialize();
    await orchestrator.getToolsForIntent({
      transcript: TRANSCRIPT,
      userId: 'user-fictional-123456789',
      agentId: 'ferni',
      context: { sessionId: 'session-fictional-abcdef' },
    } as never);
    await vi.waitFor(() => expect(emitted.events).toHaveLength(1));
  }

  it('the log line has the transcript length, and no string longer than an id', async () => {
    await select();
    const fields = logged.info.find(([, message]) => /Tool selection complete/.test(message))?.[0];
    expect(fields).toMatchObject({ transcriptChars: TRANSCRIPT.length, personaId: 'ferni' });
    expect(stringsIn(fields).filter((s) => s.length > ID_LENGTH)).toEqual([]);
    expect(JSON.stringify(fields)).not.toMatch(/Marlowe|Portland|sister|user-fi|session-f/);
  });

  it('the observability event is the same: lengths and short names only', async () => {
    await select();
    const [type, data] = emitted.events[0] ?? ['', {}];
    expect(type).toBe('tool_selection');
    expect(data).toMatchObject({ transcriptChars: TRANSCRIPT.length });
    expect(stringsIn(data).filter((s) => s.length > ID_LENGTH)).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(/Marlowe|Portland|sister|user-fi|session-f/);
  });
});
