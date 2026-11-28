/**
 * Session ids by the arm their call draws in the dev model trial (trial-lane.ts), found by
 * whether the lane asks a clearance on that call (it asks only on a trial-arm call), so no test
 * copies the arm's hash. Each row takes its own id with idIn; a broken split fails that row with
 * a named error instead of hanging the suite or skipping it. Shared by trial-lane.test.ts and
 * personas/__tests__/crisis-trial-lane.test.ts.
 */
import { DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';
import { withLane, type TrialClearance } from '../lane-request.js';
import { withTrialLane } from '../trial-lane.js';

type Arm = 'trial' | 'control';
type ChatOptions = Parameters<llm.LLM['chat']>[0];

const DEV = { FIRESTORE_DATABASE: 'ferni-dev', CASCADE_TRIAL_MODEL: 'gemini-4-hydrogen' };
const CONN = { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 };

/** A clearance that is always clear, on a call with this session id; `asked` counts clear(). */
export function openClearance(sessionId: string): TrialClearance & { asked: number } {
  return {
    asked: 0,
    callId: () => sessionId,
    clear(): boolean {
      this.asked++;
      return true;
    },
    noteTrialWrote: () => undefined,
  };
}

/** A model that says nothing: armOf reads the lane's choice, made before any model runs. */
class Idle extends llm.LLM {
  label(): string {
    return 'idle';
  }
  chat(opts: ChatOptions): llm.LLMStream {
    return new IdleStream(this, opts);
  }
}
class IdleStream extends llm.LLMStream {
  constructor(owner: llm.LLM, opts: ChatOptions) {
    super(owner, { chatCtx: opts.chatCtx, toolCtx: opts.toolCtx, connOptions: CONN });
  }
  protected async run(): Promise<void> {
    await Promise.resolve();
  }
}

let lane: llm.LLM | undefined;

/** The arm a call with this session id draws: the lane asks the clearance only on a trial call. */
export function armOf(sessionId: string): Arm {
  lane ??= withTrialLane(new Idle(), () => new Idle(), DEV);
  const gate = openClearance(sessionId);
  const request = withLane(llm.ChatContext.empty(), { mainLane: false, trial: gate });
  lane.chat({ chatCtx: request, connOptions: CONN }).close();
  return gate.asked > 0 ? 'trial' : 'control';
}

let drawn = 0;

/**
 * A fresh session id whose call draws `arm`. Throws after 200 draws without one (a fair split
 * misses that by chance at 2^-200), so a broken split fails the row that asked.
 */
export function idIn(arm: Arm): string {
  for (let tries = 0; tries < 200; tries++) {
    const id = `trial-arm-${++drawn}`;
    if (armOf(id) === arm) return id;
  }
  throw new Error(
    `no ${arm} call in 200 session ids: the arm split is broken, or the gate's clearance never reaches the lane`
  );
}
