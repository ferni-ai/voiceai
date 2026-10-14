/**
 * Voice journal transcription through Gemini on Vertex.
 *
 * The Vertex SDK is mocked: no test reaches Google Cloud.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  generateContent: vi.fn(),
  getGenerativeModel: vi.fn(),
  constructed: vi.fn(),
}));

const logged = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: class {
    constructor(options: unknown) {
      sdk.constructed(options);
    }
    getGenerativeModel(params: unknown, options: unknown) {
      sdk.getGenerativeModel(params, options);
      return { generateContent: sdk.generateContent };
    }
  },
}));

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const record =
    (level: string) =>
    (...args: unknown[]) => {
      logged.calls.push([level, ...args]);
    };
  return {
    ...actual,
    createLogger: () => ({
      debug: record('debug'),
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
    }),
  };
});

const PRIVATE_WORDS = 'I finally told my sister about the diagnosis';
const PLACEHOLDER = '[Transcription unavailable]';

function reply(text: string | null) {
  return {
    response: { candidates: [{ content: { parts: text === null ? [] : [{ text }] } }] },
  };
}

function sentRequest() {
  const [params] = sdk.generateContent.mock.calls[0] as [
    {
      contents: Array<{
        parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }>;
      }>;
    },
  ];
  return params.contents[0]?.parts ?? [];
}

function audio(bytes = 2048): Buffer {
  return Buffer.alloc(bytes, 7);
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function loadTranscriber() {
  return import('../vertex-transcribe.js');
}

async function loadCapture() {
  return import('../memory-capture-service.js');
}

beforeEach(() => {
  vi.resetModules();
  sdk.generateContent.mockReset();
  sdk.getGenerativeModel.mockReset();
  sdk.constructed.mockReset();
  logged.calls = [];
  vi.stubEnv('DEEPGRAM_API_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('JOURNAL_TRANSCRIBE_VERTEX', 'on');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('transcribeAudioBuffer with JOURNAL_TRANSCRIBE_VERTEX', () => {
  it('uses Vertex and returns its words when no other speech key is set', async () => {
    sdk.generateContent.mockResolvedValue(reply(`  ${PRIVATE_WORDS}  `));
    const { transcribeAudioBuffer } = await loadCapture();

    const transcript = await transcribeAudioBuffer(toArrayBuffer(audio()), 'audio/webm');

    expect(transcript).toBe(PRIVATE_WORDS);
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
    expect(sentRequest()[0]?.inlineData?.data).toBe(audio().toString('base64'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns an empty transcript, never the placeholder, when Vertex hears no speech', async () => {
    sdk.generateContent.mockResolvedValue(reply(null));
    const { transcribeAudioBuffer } = await loadCapture();

    const transcript = await transcribeAudioBuffer(toArrayBuffer(audio()), 'audio/webm');

    expect(transcript).toBe('');
    expect(transcript).not.toBe(PLACEHOLDER);
  });

  it('keeps the placeholder as the failure signal when Vertex errors', async () => {
    sdk.generateContent.mockRejectedValue(new Error('PERMISSION_DENIED'));
    const { transcribeAudioBuffer } = await loadCapture();

    expect(await transcribeAudioBuffer(toArrayBuffer(audio()), 'audio/webm')).toBe(PLACEHOLDER);
  });

  it('is unchanged with the flag off and never calls Vertex', async () => {
    vi.stubEnv('JOURNAL_TRANSCRIBE_VERTEX', 'off');
    sdk.generateContent.mockResolvedValue(reply(PRIVATE_WORDS));
    const { transcribeAudioBuffer } = await loadCapture();

    expect(await transcribeAudioBuffer(toArrayBuffer(audio()), 'audio/webm')).toBe(PLACEHOLDER);
    expect(sdk.constructed).not.toHaveBeenCalled();
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });

  it('is off when the flag is unset', async () => {
    vi.stubEnv('JOURNAL_TRANSCRIBE_VERTEX', '');
    const { vertexJournalFallback } = await loadTranscriber();

    expect(await vertexJournalFallback(toArrayBuffer(audio()), 'audio/webm')).toBeNull();
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });
});

describe('transcribeWithVertex', () => {
  it('rejects oversize audio without calling Vertex', async () => {
    const { transcribeWithVertex, MAX_TRANSCRIBE_BYTES } = await loadTranscriber();

    expect(await transcribeWithVertex(audio(MAX_TRANSCRIBE_BYTES + 1), 'audio/webm')).toBeNull();
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });

  it('accepts audio right at the size cap', async () => {
    sdk.generateContent.mockResolvedValue(reply(PRIVATE_WORDS));
    const { transcribeWithVertex, MAX_TRANSCRIBE_BYTES } = await loadTranscriber();

    expect(await transcribeWithVertex(audio(MAX_TRANSCRIBE_BYTES), 'audio/webm')).toBe(
      PRIVATE_WORDS
    );
  });

  it.each([
    ['audio/webm;codecs=opus', 'audio/webm'],
    ['audio/mp4', 'audio/mp4'],
    ['audio/aac', 'audio/aac'],
    ['audio/wav', 'audio/wav'],
    ['audio/x-wav', 'audio/wav'],
    ['audio/ogg; codecs=opus', 'audio/ogg'],
  ])('passes %s through to Vertex as %s', async (given, sent) => {
    sdk.generateContent.mockResolvedValue(reply(PRIVATE_WORDS));
    const { transcribeWithVertex } = await loadTranscriber();

    await transcribeWithVertex(audio(), given);

    expect(sentRequest()[0]?.inlineData?.mimeType).toBe(sent);
  });

  it('refuses an audio type Vertex cannot read without calling it', async () => {
    const { transcribeWithVertex } = await loadTranscriber();

    expect(await transcribeWithVertex(audio(), 'application/pdf')).toBeNull();
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });

  it('asks for a verbatim transcript only', async () => {
    sdk.generateContent.mockResolvedValue(reply(PRIVATE_WORDS));
    const { transcribeWithVertex } = await loadTranscriber();

    await transcribeWithVertex(audio(), 'audio/webm');

    const instruction = sentRequest()[1]?.text ?? '';
    expect(instruction).toMatch(/verbatim/i);
    expect(instruction).toMatch(/no speech, reply with nothing/i);
  });

  it('treats a lone bracketed note such as [silence] as no speech', async () => {
    sdk.generateContent.mockResolvedValue(reply('[silence]'));
    const { transcribeWithVertex } = await loadTranscriber();

    expect(await transcribeWithVertex(audio(), 'audio/webm')).toBe('');
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    sdk.generateContent.mockReturnValue(new Promise(() => {}));
    const { transcribeWithVertex, TRANSCRIBE_TIMEOUT_MS } = await loadTranscriber();

    const pending = transcribeWithVertex(audio(), 'audio/webm');
    await vi.advanceTimersByTimeAsync(TRANSCRIBE_TIMEOUT_MS);

    expect(await pending).toBeNull();
    expect(sdk.getGenerativeModel).toHaveBeenCalledWith(expect.anything(), {
      timeout: TRANSCRIBE_TIMEOUT_MS,
    });
  });

  it('never logs the transcript', async () => {
    sdk.generateContent.mockResolvedValue(reply(PRIVATE_WORDS));
    const { transcribeWithVertex } = await loadTranscriber();

    expect(await transcribeWithVertex(audio(), 'audio/webm')).toBe(PRIVATE_WORDS);

    expect(logged.calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged.calls)).not.toContain('diagnosis');
  });

  it('logs a failure with its context', async () => {
    sdk.generateContent.mockRejectedValue(new Error('PERMISSION_DENIED'));
    const { transcribeWithVertex } = await loadTranscriber();

    expect(await transcribeWithVertex(audio(), 'audio/mp4')).toBeNull();

    const failure = logged.calls.find((c) => c[0] === 'error');
    expect(failure?.[1]).toMatchObject({
      error: expect.stringContaining('PERMISSION_DENIED'),
      mimeType: 'audio/mp4',
      bytes: 2048,
    });
  });
});
