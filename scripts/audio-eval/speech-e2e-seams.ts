/**
 * Test seams for the live speech harness (speech-e2e.ts), all in-process and
 * none touching src/: structured-log capture, Stage 2 native call counters,
 * a tap on the Cartesia WebSocket, and lever/gate discovery from the code.
 *
 * @module scripts/audio-eval/speech-e2e-seams
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';

import type { TranscriptWord } from './speech-e2e-scenarios.js';

// ---------------------------------------------------------------- log capture

export interface LogLine {
  level: number;
  msg?: string;
  module?: string;
  [k: string]: unknown;
}

/**
 * Swallow the app's JSON log lines on stderr (still echoed with `verbose`)
 * and hand them to the current sink, so each reply keeps its own logs.
 */
export function captureStructuredStderr(verbose: boolean): {
  setSink(sink: LogLine[] | null): void;
} {
  let sink: LogLine[] | null = null;
  const writeErr = process.stderr.write.bind(process.stderr) as (...a: unknown[]) => boolean;
  process.stderr.write = ((chunk: unknown, ...rest: unknown[]): boolean => {
    const text =
      typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8');
    let structured = false;
    for (const line of text.split('\n')) {
      if (!line.startsWith('{')) continue;
      try {
        const parsed = JSON.parse(line) as LogLine;
        if (typeof parsed.level !== 'number') continue;
        structured = true;
        sink?.push(parsed);
      } catch {
        /* not a log line */
      }
    }
    return structured && !verbose ? true : writeErr(chunk, ...rest);
  }) as typeof process.stderr.write;
  return {
    setSink: (next) => {
      sink = next;
    },
  };
}

// ---------------------------------------------------------------- Stage 2 native counters

export interface Stage2Counters {
  renderNonverbal: number;
  tempoStretchers: number;
  /** True when the ESM namespace the production stage imports sees the counted functions. */
  hooked: boolean;
  note: string;
}

/**
 * Count `@ferni/audio` renderNonverbal calls and NativeTempoStretcher
 * constructions, so a Stage 2 opening or tempo that actually ran is visible.
 * Must run before any production module imports `@ferni/audio`.
 */
export async function hookStage2Native(): Promise<Stage2Counters> {
  const counters: Stage2Counters = {
    renderNonverbal: 0,
    tempoStretchers: 0,
    hooked: false,
    note: '',
  };
  const require = createRequire(import.meta.url);
  try {
    const native = require('@ferni/audio') as Record<string, unknown>;
    const render = native.renderNonverbal as ((...a: unknown[]) => unknown) | undefined;
    const Stretcher = native.NativeTempoStretcher as (new (...a: unknown[]) => object) | undefined;
    if (render) {
      native.renderNonverbal = (...a: unknown[]) => {
        counters.renderNonverbal++;
        return render(...a);
      };
    }
    if (Stretcher) {
      native.NativeTempoStretcher = class extends Stretcher {
        constructor(...a: unknown[]) {
          super(...a);
          counters.tempoStretchers++;
        }
      };
    }
    const ns = (await import('@ferni/audio')) as unknown as Record<string, unknown> & {
      default?: Record<string, unknown>;
    };
    const seen = ns.renderNonverbal ?? ns.default?.renderNonverbal;
    counters.hooked = !!render && seen === native.renderNonverbal;
    if (!render || !Stretcher) {
      counters.note = '@ferni/audio lacks renderNonverbal/NativeTempoStretcher';
    }
  } catch (error) {
    counters.note = `@ferni/audio unavailable: ${String(error)}`;
  }
  return counters;
}

// ---------------------------------------------------------------- Cartesia socket tap

export interface WireSend {
  atMs: number;
  contextId?: string;
  transcript?: string;
  more?: boolean;
  cancel?: boolean;
  model?: string;
  voice?: string;
}

export interface ReplyTrace {
  sends: WireSend[];
  errors: string[];
  firstWireChunkAt: number | null;
  logs: LogLine[];
}

/** The slice of a ws WebSocket the tap wraps. */
export interface TappableSocket {
  send(data: string): void;
  on(event: 'message', listener: (raw: unknown) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
}

/**
 * Records every request sent to Cartesia (exact transcript, model, voice) and
 * every error event, into the reply trace that is current when it happens.
 */
export class CartesiaTap {
  trace: ReplyTrace | null = null;
  readonly orphanErrors: string[] = [];
  readonly contexts = new Set<string>();

  wrap<T extends TappableSocket>(ws: T): T {
    const send = ws.send.bind(ws);
    ws.send = (data: string) => {
      this.recordSend(data);
      send(data);
    };
    ws.on('message', (raw: unknown) => this.recordMessage(raw));
    ws.on('error', (error: Error) => this.errorSink().push(`socket error: ${error.message}`));
    ws.on('close', () => {
      if (this.trace) this.trace.errors.push('socket closed during reply');
    });
    return ws;
  }

  private errorSink(): string[] {
    return this.trace?.errors ?? this.orphanErrors;
  }

  private recordSend(data: string): void {
    try {
      const req = JSON.parse(data) as Record<string, unknown>;
      const ctx = req.context_id as string | undefined;
      if (ctx && !req.cancel) this.contexts.add(ctx);
      this.trace?.sends.push({
        atMs: performance.now(),
        contextId: ctx,
        transcript: req.transcript as string | undefined,
        more: req.continue as boolean | undefined,
        cancel: req.cancel === true,
        model: req.model_id as string | undefined,
        voice: (req.voice as { id?: string } | undefined)?.id,
      });
    } catch {
      /* non-JSON frame */
    }
  }

  private recordMessage(raw: unknown): void {
    let m: Record<string, unknown>;
    try {
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      m = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    if (m.type === 'error' || m.error) {
      const what = String(m.error ?? m.message ?? m.title ?? 'error');
      this.errorSink().push(`cartesia error ${m.status_code ?? ''} ${what}`.replace(/\s+/g, ' '));
    } else if (m.type === 'chunk' && this.trace && this.trace.firstWireChunkAt === null) {
      this.trace.firstWireChunkAt = performance.now();
    }
  }
}

// ---------------------------------------------------------------- lever discovery

type Env = Record<string, string | undefined>;

export interface LeverDiscovery {
  directorLevers: string[];
  stage2Gates: string[];
  /** Requested levers that exist nowhere (neither Director lever nor Stage 2 gate). */
  absentLevers: string[];
  /** Requested as SPEECH_DIRECTOR_* levers but not in the Director. */
  absentDirectorLevers: string[];
  /** src/ files that call setReplyAudioPlan: without one, Stage 2 never has a plan. */
  planProducers: string[];
  /** Every gate env name FULL sets live (BASELINE sets them off). */
  envNames: string[];
  levers: Array<{ lever: string; status: string }>;
}

export const leverEnv = (l: string): string => `SPEECH_DIRECTOR_${l.toUpperCase()}`;
export const stage2Env = (g: string): string => `SPEECH_STAGE2_${g.toUpperCase()}`;

function scanSrc(dir: string, visit: (file: string, text: string) => void): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') scanSrc(path, visit);
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      visit(path, readFileSync(path, 'utf8'));
    }
  }
}

/**
 * Read lever and gate names from the code: the Director's leverModes()
 * keys, the Stage 2 getStage2Gates() keys (each env name verified by asking
 * the gate function), plus any SPEECH_DIRECTOR_* / SPEECH_STAGE2_* name in src/.
 */
export function discoverLevers(opts: {
  leverModes: (env: Env) => object;
  getStage2Gates: (env: Env) => object;
  repo: string;
  requestedLevers: readonly string[];
  requestedStage2: readonly string[];
}): LeverDiscovery {
  const { leverModes, getStage2Gates, repo, requestedLevers, requestedStage2 } = opts;
  const directorLevers = Object.keys(leverModes({ SPEECH_DIRECTOR: 'live' }));
  const leverVerified = (l: string): boolean =>
    (leverModes({ SPEECH_DIRECTOR: 'live', [leverEnv(l)]: 'off' }) as Record<string, string>)[l] ===
    'off';
  const stage2Gates = Object.keys(getStage2Gates({}));
  const gateVerified = (g: string): boolean =>
    (getStage2Gates({ [stage2Env(g)]: 'live' }) as Record<string, boolean>)[g] === true;

  const scanned = new Set<string>();
  const planProducers: string[] = [];
  scanSrc(join(repo, 'src'), (file, text) => {
    for (const m of text.matchAll(/\bSPEECH_(?:DIRECTOR|STAGE2)_[A-Z][A-Z0-9_]*\b/g)) {
      scanned.add(m[0]);
    }
    if (!file.endsWith('reply-audio-plan.ts') && /\bsetReplyAudioPlan\s*\(/.test(text)) {
      planProducers.push(relative(repo, file));
    }
  });

  const envNames = [
    ...new Set([
      ...[...new Set([...directorLevers, ...requestedLevers])].map(leverEnv),
      ...[...new Set([...stage2Gates, ...requestedStage2])].map(stage2Env),
      ...scanned,
    ]),
  ].sort();

  const levers = [...new Set([...requestedLevers, ...directorLevers, ...stage2Gates])].map((l) => {
    const isLever = directorLevers.includes(l);
    const isGate = stage2Gates.includes(l);
    if (!isLever && !isGate) return { lever: l, status: `lever absent (${leverEnv(l)})` };
    const where: string[] = [];
    if (isLever) {
      where.push(
        `director lever ${leverEnv(l)}${leverVerified(l) ? '' : ' (env name UNVERIFIED)'}`
      );
    } else {
      where.push(`no director lever (${leverEnv(l)} absent)`);
    }
    if (isGate) {
      where.push(`stage 2 gate ${stage2Env(l)}${gateVerified(l) ? '' : ' (env name UNVERIFIED)'}`);
    }
    return { lever: l, status: where.join('; ') };
  });

  return {
    directorLevers,
    stage2Gates,
    absentLevers: requestedLevers.filter(
      (l) => !directorLevers.includes(l) && !stage2Gates.includes(l)
    ),
    absentDirectorLevers: requestedLevers.filter((l) => !directorLevers.includes(l)),
    planProducers,
    envNames,
    levers,
  };
}

// ---------------------------------------------------------------- STT

const STT_URL = 'https://api.cartesia.ai/stt';
const STT_VERSION = '2026-08-14';

/** Cartesia ink-whisper batch STT with word timestamps; one retry on 429/5xx. */
export async function transcribeInkWhisper(
  wav: Buffer,
  apiKey: string
): Promise<{ text: string; words: TranscriptWord[] }> {
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'reply.wav');
    form.append('model', 'ink-whisper');
    form.append('language', 'en');
    form.append('timestamp_granularities[]', 'word');
    const res = await fetch(STT_URL, {
      method: 'POST',
      headers: { 'Cartesia-Version': STT_VERSION, 'X-API-Key': apiKey },
      body: form,
    });
    if (res.ok) {
      const body = (await res.json()) as { text?: string; words?: TranscriptWord[] };
      return { text: (body.text ?? '').trim(), words: body.words ?? [] };
    }
    if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    throw new Error(`STT ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}
