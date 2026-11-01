/**
 * Vertex hosts per location (config/vertex-endpoint.ts), and a source scan that
 * every Vertex client in src/ takes its host from there.
 *
 * `us` is the multi-region that keeps caller data's ML processing in the US; its
 * host is aiplatform.us.rep.googleapis.com, not `us-aiplatform.googleapis.com`,
 * which @google/genai 1.34 builds when left to itself.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
  geminiEmbeddingLocation,
  geminiLocation,
  isVertexHost,
  vertexBaseUrl,
  vertexGenAIOptions,
  vertexHost,
} from '../vertex-endpoint.js';
import { buildCascadeLLMOptions } from '../../agents/model-provider/cartesia-cascade.js';

describe('vertexHost', () => {
  it('maps global, the multi-regions and a region to their hosts', () => {
    expect(vertexHost('global')).toBe('aiplatform.googleapis.com');
    expect(vertexHost('us')).toBe('aiplatform.us.rep.googleapis.com');
    expect(vertexHost('eu')).toBe('aiplatform.eu.rep.googleapis.com');
    expect(vertexHost('us-central1')).toBe('us-central1-aiplatform.googleapis.com');
    expect(vertexBaseUrl('us')).toBe('https://aiplatform.us.rep.googleapis.com/');
  });

  it('recognises every host it returns, and nothing else', () => {
    for (const loc of ['global', 'us', 'eu', 'us-central1', 'us-east4']) {
      expect(isVertexHost(vertexHost(loc))).toBe(true);
    }
    expect(isVertexHost('aiplatform.evil.rep.googleapis.com')).toBe(false);
    expect(isVertexHost('generativelanguage.googleapis.com')).toBe(false);
    expect(isVertexHost('aiplatform.googleapis.com.evil.example')).toBe(false);
  });
});

describe('locations', () => {
  it('GEMINI_LOCATION defaults to global and flips to us', () => {
    expect(geminiLocation({})).toBe('global');
    expect(geminiLocation({ GEMINI_LOCATION: 'us' })).toBe('us');
  });

  it('embeddings follow GEMINI_LOCATION unless GEMINI_EMBEDDING_LOCATION is set', () => {
    expect(geminiEmbeddingLocation({ GEMINI_LOCATION: 'us' })).toBe('us');
    expect(
      geminiEmbeddingLocation({ GEMINI_LOCATION: 'us', GEMINI_EMBEDDING_LOCATION: 'us-central1' })
    ).toBe('us-central1');
  });

  it('the cascade LLM follows GEMINI_LOCATION; CASCADE_LLM_LOCATION still wins', () => {
    expect(buildCascadeLLMOptions({}).location).toBe('global');
    expect(buildCascadeLLMOptions({ GEMINI_LOCATION: 'us' }).location).toBe('us');
    expect(
      buildCascadeLLMOptions({ GEMINI_LOCATION: 'us', CASCADE_LLM_LOCATION: 'us-central1' })
        .location
    ).toBe('us-central1');
  });
});

describe('@google/genai client host', () => {
  /** The base URL the SDK will send to (internal, but it is the thing under test). */
  const baseUrl = (ai: GoogleGenAI): string =>
    (ai as unknown as { apiClient: { getBaseUrl: () => string } }).apiClient.getBaseUrl();

  it('a client built from vertexGenAIOptions("us") sends to the multi-region host', () => {
    expect(baseUrl(new GoogleGenAI(vertexGenAIOptions('proj', 'us')))).toBe(
      'https://aiplatform.us.rep.googleapis.com/'
    );
    expect(baseUrl(new GoogleGenAI(vertexGenAIOptions('proj', 'global')))).toBe(
      'https://aiplatform.googleapis.com/'
    );
  });

  it('the SDK alone does not, which is why the host is pinned', () => {
    const bare = baseUrl(new GoogleGenAI({ vertexai: true, project: 'proj', location: 'us' }));
    // @google/genai 1.34 builds a host that is not the multi-region's. If an upgrade
    // changes this, the SDK derives `us` itself and the pin is belt and braces.
    expect(bare).toBe('https://us-aiplatform.googleapis.com/');
  });
});

// ---------------------------------------------------------------------------
// Source scan: no Vertex client or Developer API caller bypasses the rules.
// ---------------------------------------------------------------------------

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(path);
    }
    return /\.(ts|mts|js|mjs)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/** Code only: comment lines quote SDK examples. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n');
}

const files = sourceFiles(SRC)
  .map((p) => ({ rel: relative(ROOT, p), text: code(p) }))
  .filter((f) => !f.rel.startsWith('src/tests/')); // e2e/eval harnesses, not the app

const VERTEX_CLIENT =
  /vertexai\s*[:=]\s*true|new GoogleGenAI\((?!\s*\{\s*apiKey)|aiplatform\.|new VertexAI\(/;
const USES_HELPER = /config\/vertex-endpoint\.js|\.\/vertex-endpoint\.js|vertexOptions\(/;

/** Vertex clients that do not take the host from the helper, and why that is safe. */
const VERTEX_EXEMPT: Record<string, string> = {
  'src/config/vertex-endpoint.ts': 'the helper itself',
  'src/agents/model-provider/gemini-native-audio.ts':
    'Live API RealtimeModel; NATIVE_AUDIO_LOCATION, default us-central1 (a US region)',
  'src/agents/model-provider/gemini-live.ts':
    'Live API RealtimeModel; GOOGLE_CLOUD_LOCATION, default us-central1 (a US region)',
};

const DEVELOPER_API =
  /generativelanguage\.googleapis\.com|new GoogleGenerativeAI\(|new GoogleGenAI\(\s*\{\s*apiKey/;

/**
 * Gemini Developer API (API key) callers. Their processing location cannot be
 * chosen, so none may be added; each existing one is listed in the PR that pinned
 * Vertex to the US, with what it sends.
 */
const DEVELOPER_API_KNOWN = new Set([
  'src/api/chat-routes.ts',
  'src/cli/commands/synthetic-e2e.ts',
  'src/cli/commands/test-agents.ts',
  'src/config/gemini-config.ts',
  'src/memory/vectors/embeddings.ts',
  'src/services/gtm/content-generator.ts',
  'src/services/outreach/call-transcript-intelligence.ts',
  'src/services/self-healing/health-monitors.ts',
  'src/services/voice/outbound-call-agent.ts',
]);

describe('source scan', () => {
  it('finds the Vertex clients it is meant to police', () => {
    const found = files.filter((f) => VERTEX_CLIENT.test(f.text)).map((f) => f.rel);
    expect(found).toEqual(
      expect.arrayContaining([
        'src/config/gemini-config.ts',
        'src/agents/model-provider/cartesia-cascade.ts',
        'src/tools/retrieval/dense-index.ts',
      ])
    );
  });

  it('every Vertex client takes its host from config/vertex-endpoint.ts', () => {
    const bypass = files
      .filter((f) => VERTEX_CLIENT.test(f.text) && !USES_HELPER.test(f.text))
      .map((f) => f.rel)
      .filter((rel) => !(rel in VERTEX_EXEMPT));
    expect(bypass).toEqual([]);
  });

  it('no new Gemini Developer API caller', () => {
    const found = files.filter((f) => DEVELOPER_API.test(f.text)).map((f) => f.rel);
    expect(found.filter((rel) => !DEVELOPER_API_KNOWN.has(rel))).toEqual([]);
  });
});
