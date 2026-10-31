/**
 * The turn reading (schema v0.1, understanding/) in the TURN_UNDERSTANDING
 * record, whenever that flag is on: each caller turn's final words are read by
 * the LLM teacher on the understander's client and timeout (turn-understanding.ts),
 * and the record Ferni logs when he starts replying gains a `reading` block: the
 * labels, today's rules (understanding-rules.ts) and where they disagree. The
 * record waits for that read (at most TIMEOUT_MS); nothing else reads it, so
 * replies are unchanged. No words of the call: time phrases and the name become
 * flags; the turn a keyed hash (TURN_UNDERSTANDING_HASH_SALT, else per process).
 *
 * The teacher and its call mode: turn-reading-teacher.ts.
 *
 * @module agents/personas/turn-reading-shadow
 */
import { voice } from '@livekit/agents';
import { createHmac, randomBytes } from 'node:crypto';
import { disagreements, readingForLog, readTurn } from '../../understanding/index.js';
import type { TimedRead, TurnInput, TurnReader } from '../../understanding/index.js';
import { callerZoneOf } from '../shared/world-now.js';
import { ferniOpened, lastFerniLine } from './answer-turn.js';
import { turnReadingTeacher } from './turn-reading-teacher.js';
import { TIMEOUT_MS } from './turn-understanding.js';
import { rulesRead } from './understanding-rules.js';

type Env = Record<string, string | undefined>;
interface Item {
  type: 'message';
  role: string;
  textContent: string;
}
interface Session {
  userData?: unknown;
  on(event: string, fn: (ev: unknown) => void): unknown;
  off(event: string, fn: (ev: unknown) => void): unknown;
}

/** One call's reads: started on each final, joined to the record when Ferni replies. */
export class TurnReadingShadow {
  private readonly items: Item[] = [];
  private callerTurns: string[] = [];
  private pending: {
    text: string;
    input: TurnInput;
    read: Promise<TimedRead>;
    stop: AbortController;
  } | null = null;

  constructor(
    private readonly reader: TurnReader,
    private readonly call: () => { timezone?: string; name?: string },
    private readonly key: string,
    private readonly timeoutMs = TIMEOUT_MS,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** A committed chat item (ConversationItemAdded): Ferni's lines are the reader's context. */
  onItem(role: string | undefined, text: string | undefined): void {
    if (text && (role === 'user' || role === 'assistant'))
      this.items.push({ type: 'message', role, textContent: text });
  }

  /** The caller's turn so far, at a final transcript: read it, dropping an older read. */
  onFinal(turn: string): void {
    const text = turn.trim();
    if (!text || this.pending?.text === text) return;
    this.pending?.stop.abort();
    const { timezone, name } = this.call();
    const ferni = lastFerniLine(this.items).replace(/<[^>]+>/g, ' ');
    const input: TurnInput = {
      ferniLast: ferni.trim(),
      callerTurn: text,
      priorCallerTurns: this.callerTurns.slice(-2),
      callTimestamp: this.now().toISOString(),
      callerTimezone: timezone,
      callerName: name,
    };
    const stop = new AbortController();
    const read = readTurn(this.reader, input, this.timeoutMs, { signal: stop.signal });
    this.pending = { text, input, read, stop };
  }

  /**
   * Write `record` with the reading of the turn's words (its last final) once
   * that read settles; the turn then becomes context for the next one.
   */
  emit(record: Record<string, unknown>, write: (o: Record<string, unknown>) => void): void {
    const { pending } = this;
    this.pending = null;
    const opener = ferniOpened(this.items);
    if (!pending) return write({ ...record, reading: { outcome: 'not_started' } });
    const text = pending.text;
    this.callerTurns = [...this.callerTurns, text].slice(-2);
    void pending.read.then(({ result, outcome, latencyMs }) => {
      const r = result?.reading ?? null;
      const rules = rulesRead(pending.input, { opener });
      const name = r?.name_given?.trim().toLowerCase();
      write({
        ...record,
        reading: {
          backend: this.reader.id,
          outcome,
          latency_ms: latencyMs,
          turn_hash: createHmac('sha256', this.key).update(text).digest('hex').slice(0, 16),
          labels: r ? readingForLog(r) : null,
          name_matches_known: name ? name === pending.input.callerName?.trim().toLowerCase() : null,
          rules,
          disagree: r ? disagreements(r, rules) : null,
        },
      });
    });
  }
}

/** The shadow for this call; its item listener is removed at cleanup. */
export function installTurnReading(
  session: Session,
  cleanupFunctions: Array<() => void>,
  env: Env = process.env,
  reader: TurnReader = turnReadingTeacher(env)
): TurnReadingShadow {
  const shadow = new TurnReadingShadow(
    reader,
    () => ({
      timezone: callerZoneOf(session),
      name: (session.userData as { userName?: string })?.userName,
    }),
    env.TURN_UNDERSTANDING_HASH_SALT || randomBytes(16).toString('hex')
  );
  const onItem = (ev: unknown): void => {
    const item = (ev as { item?: { role?: string; textContent?: string } }).item;
    shadow.onItem(item?.role, item?.textContent);
  };
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, onItem);
  cleanupFunctions.push(() =>
    session.off(voice.AgentSessionEventTypes.ConversationItemAdded, onItem)
  );
  return shadow;
}
