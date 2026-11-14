/**
 * The guard in src/tests/setup.ts that keeps tests off real model and auth
 * clients (src/tests/outbound-guard.ts).
 *
 * Production swallows a refused constructor and falls back, so a refusal alone
 * turns no test red. These rows hold the three parts that do: the refusal is
 * recorded, the record fails the file, and background generation is off.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROJECT_ID_VARS } from '../gcp-test-guard.js';
import {
  MODEL_KEY_VARS,
  RealOutboundInTestError,
  allowOutbound,
  assertNoOutboundAttempts,
  clearModelSettings,
  outboundAttempts,
  resetOutboundGuard,
} from '../outbound-guard.js';

const THIS_FILE = expect.getState().testPath;
const SWITCH = 'LLM_DYNAMIC_CONTENT_ENABLED';

// Every row here builds clients on purpose. None of it may be left for the
// setup file's afterAll, which would fail this file as it fails any other.
afterEach(() => {
  vi.unstubAllEnvs();
  resetOutboundGuard(THIS_FILE);
});

type Build = () => Promise<unknown>;

/** Each client class, imported the way production imports it. */
const CLIENTS: Array<[kind: string, what: string, build: Build]> = [
  [
    'vertex',
    'new VertexAI()',
    async () => {
      const { VertexAI } = await import('@google-cloud/vertexai');
      return new VertexAI({ project: 'a-project', location: 'a-location' });
    },
  ],
  [
    'openai',
    'new OpenAI()',
    async () => {
      const OpenAI = (await import('openai')).default;
      return new OpenAI({ apiKey: 'k' });
    },
  ],
  [
    'openai',
    'new OpenAI()',
    async () => {
      const { OpenAI } = await import('openai');
      return new OpenAI({ apiKey: 'k' });
    },
  ],
  [
    'gemini',
    'new GoogleGenAI()',
    async () => {
      const { GoogleGenAI } = await import('@google/genai');
      return new GoogleGenAI({ apiKey: 'k' });
    },
  ],
  [
    'auth',
    'new GoogleAuth()',
    async () => {
      const { GoogleAuth } = await import('google-auth-library');
      return new GoogleAuth();
    },
  ],
];

describe('a real client class in a test', () => {
  it.each(CLIENTS)('%s: %s is refused and recorded', async (kind, what, build) => {
    await expect(build()).rejects.toBeInstanceOf(RealOutboundInTestError);

    expect(outboundAttempts()).toEqual([
      { kind, what, caller: expect.stringContaining('outbound-guard.test.ts') },
    ]);
  });

  it('leaves the rest of each package real', async () => {
    const openai = await import('openai');
    const genai = await import('@google/genai');
    const auth = await import('google-auth-library');

    expect(new openai.default.APIError(500, undefined, 'x', undefined)).toBeInstanceOf(Error);
    expect(genai.Modality.AUDIO).toBe('AUDIO');
    // Not guarded: building one sends nothing, and scheduler-auth.ts builds one at import.
    expect(new auth.OAuth2Client()).toBeInstanceOf(auth.OAuth2Client);
    expect(outboundAttempts()).toEqual([]);
  });
});

describe("production's own path to a client", () => {
  it('Vertex: the refusal is swallowed, and only the record shows it', async () => {
    const { warmVertexClient } = await import('../../services/llm-utils.js');

    await expect(warmVertexClient()).resolves.toBe(false);

    expect(outboundAttempts()).toEqual([
      { kind: 'vertex', what: 'new VertexAI()', caller: expect.stringContaining('llm-utils') },
    ]);
  });

  it('Gemini: a configured client is refused', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'a-project');
    vi.resetModules();
    const { getGeminiClient } = await import('../../config/gemini-config.js');

    await expect(getGeminiClient()).resolves.toBeNull();

    expect(outboundAttempts()).toEqual([
      {
        kind: 'gemini',
        what: 'new GoogleGenAI()',
        caller: expect.stringContaining('gemini-config'),
      },
    ]);
  });
});

describe('model settings from the shell', () => {
  const shell = (): Record<string, string | undefined> => ({
    ...Object.fromEntries([...MODEL_KEY_VARS, ...PROJECT_ID_VARS].map((name) => [name, 'set'])),
    LIVEKIT_URL: 'wss://kept',
  });

  it('are removed: provider keys and project ids, nothing else', () => {
    const env = shell();

    clearModelSettings(env);

    expect(env).toEqual({ LIVEKIT_URL: 'wss://kept' });
  });

  it('the emulator suite keeps its project ids and loses the keys', () => {
    const env = { ...shell(), FIRESTORE_EMULATOR_HOST: 'localhost:8080' };

    clearModelSettings(env);

    expect(Object.keys(env).sort()).toEqual(
      ['FIRESTORE_EMULATOR_HOST', 'LIVEKIT_URL', ...PROJECT_ID_VARS].sort()
    );
  });

  it('the on-demand external suite keeps everything', () => {
    const env = { ...shell(), EXTERNAL_TEST_SUITE: '1' };

    clearModelSettings(env);

    expect(env).toEqual({ ...shell(), EXTERNAL_TEST_SUITE: '1' });
  });
});

describe('background reply generation', () => {
  it('is off for every test', () => {
    expect(process.env[SWITCH]).toBe('false');
  });

  it("stays off after a file's vi.unstubAllEnvs()", () => {
    vi.unstubAllEnvs();
    expect(process.env[SWITCH]).toBe('false');

    vi.stubEnv(SWITCH, 'true');
    expect(process.env[SWITCH]).toBe('true');
    vi.unstubAllEnvs();
    expect(process.env[SWITCH]).toBe('false');
  });

  it('off: asks no model', async () => {
    const { generateContent } = await import('../../services/llm/llm-dynamic-content.js');

    await expect(generateContent({ contentType: 'thinking_phrase' })).resolves.toBeNull();

    expect(outboundAttempts()).toEqual([]);
  });

  it('on: reaches the Vertex constructor, which is why it is off', async () => {
    vi.stubEnv(SWITCH, 'true');
    const { generateContent } = await import('../../services/llm/llm-dynamic-content.js');

    await generateContent({ contentType: 'thinking_phrase', userMessage: 'a line of its own' });

    expect(outboundAttempts().map((a) => a.what)).toContain('new VertexAI()');
    // The frames behind the constructor name the code that asked for a model.
    expect(outboundAttempts()[0]?.caller).toContain('llm-dynamic-content');
  });
});

describe('the record', () => {
  it('fails a file that built a client, naming the count and each attempt', async () => {
    await expect(CLIENTS[1][2]()).rejects.toBeInstanceOf(RealOutboundInTestError);

    expect(() => assertNoOutboundAttempts()).toThrow(
      /tried to build 1 real model or auth client\(s\)[\s\S]*openai: new OpenAI\(\)/
    );
  });

  it('passes a file that built none', () => {
    expect(() => assertNoOutboundAttempts()).not.toThrow();
  });

  it('is one record for every copy of the module', async () => {
    await expect(CLIENTS[1][2]()).rejects.toBeInstanceOf(RealOutboundInTestError);

    vi.resetModules();
    const secondCopy = await import('../outbound-guard.js');

    expect(secondCopy.outboundAttempts).not.toBe(outboundAttempts);
    expect(secondCopy.outboundAttempts()).toEqual(outboundAttempts());
    expect(secondCopy.outboundAttempts()).not.toEqual([]);
  });
});

describe('a file that says why it needs a real client', () => {
  it('builds one, and nothing is recorded', async () => {
    allowOutbound('this row builds a client and sends nothing');

    await expect(CLIENTS[1][2]()).resolves.toBeInstanceOf((await import('openai')).OpenAI);

    expect(outboundAttempts()).toEqual([]);
  });

  it('can say it through a second copy of the module', async () => {
    vi.resetModules();
    const secondCopy = await import('../outbound-guard.js');
    secondCopy.allowOutbound('this row builds a client and sends nothing');

    await expect(CLIENTS[3][2]()).resolves.toBeDefined();
  });

  it('must give a reason', () => {
    expect(() => allowOutbound('  ')).toThrow('allowOutbound needs a reason');
  });

  it('does not carry over to the next file', async () => {
    allowOutbound('this row builds a client and sends nothing');
    resetOutboundGuard(THIS_FILE);

    await expect(CLIENTS[1][2]()).rejects.toBeInstanceOf(RealOutboundInTestError);
  });

  it('the on-demand external suite builds real clients', async () => {
    vi.stubEnv('EXTERNAL_TEST_SUITE', '1');

    await expect(CLIENTS[1][2]()).resolves.toBeDefined();

    expect(outboundAttempts()).toEqual([]);
  });
});

interface FileResult {
  name: string;
  status: string;
  message: string;
  assertionResults: Array<{ status: string }>;
}

/**
 * The three probe files, in a vitest of their own with this suite's config and
 * setup file. They skip everywhere else (OUTBOUND_GUARD_PROBE).
 */
function runProbes(): { exit: number | null; files: Map<string, FileResult> } {
  const report = join(mkdtempSync(join(tmpdir(), 'outbound-probes-')), 'report.json');
  // A shell that holds a provider key and a project id: the setup file must clear both.
  const env: Record<string, string | undefined> = {
    ...process.env,
    OUTBOUND_GUARD_PROBE: '1',
    OPENAI_API_KEY: 'from-the-shell',
    GOOGLE_CLOUD_PROJECT: 'from-the-shell',
  };
  for (const name of Object.keys(env)) if (name.startsWith('VITEST')) delete env[name];
  const run = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.config.integration.ts',
      'src/tests/__tests__/outbound-probes/',
      '--reporter=json',
      `--outputFile=${report}`,
    ],
    { cwd: process.cwd(), env, encoding: 'utf8', timeout: 150_000 }
  );
  const parsed = JSON.parse(readFileSync(report, 'utf8')) as { testResults: FileResult[] };
  const files = new Map(
    parsed.testResults.map((f) => [f.name.replace(/^.*\/outbound-probes\//, ''), f])
  );
  return { exit: run.status, files };
}

describe("the setup file's afterAll, in a test run of its own", () => {
  const probes = runProbes();
  const rowsOf = (file: string): string[] =>
    probes.files.get(file)?.assertionResults.map((r) => r.status) ?? [];

  it('ran the three probe files', () => {
    expect([...probes.files.keys()].sort()).toEqual([
      'builds-a-client.test.ts',
      'builds-none.test.ts',
      'says-why.test.ts',
    ]);
  });

  it('fails a file whose rows all pass, when it built a real client', () => {
    const file = probes.files.get('builds-a-client.test.ts');

    expect(rowsOf('builds-a-client.test.ts')).toEqual(['passed']);
    expect(file?.status).toBe('failed');
    expect(file?.message).toMatch(/tried to build \d+ real model or auth client\(s\)/);
    expect(file?.message).toContain('vertex: new VertexAI()');
    expect(probes.exit).toBe(1);
  });

  it('passes a file that built none, and that file saw no model setting from the shell', () => {
    expect(rowsOf('builds-none.test.ts')).toEqual(['passed', 'passed']);
    expect(probes.files.get('builds-none.test.ts')?.status).toBe('passed');
  });

  it('passes a file that said why it builds one', () => {
    expect(rowsOf('says-why.test.ts')).toEqual(['passed']);
    expect(probes.files.get('says-why.test.ts')?.status).toBe('passed');
  });
});
