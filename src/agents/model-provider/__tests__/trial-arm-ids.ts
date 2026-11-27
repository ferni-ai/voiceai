/**
 * Session ids by the arm their call draws in the dev model trial (trial-lane.ts), found by which
 * model answers a request that is clear of crisis handling, so no test copies the arm's hash.
 * Fill the pools in a beforeAll (fillArmPools), then take ids with idIn. Shared by
 * trial-lane.test.ts and personas/__tests__/crisis-trial-lane.test.ts.
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

/** A model that says nothing and counts the requests it got. */
class Quiet extends llm.LLM {
  got = 0;
  label(): string {
    return 'quiet';
  }
  chat(opts: ChatOptions): llm.LLMStream {
    this.got++;
    return new QuietStream(this, opts);
  }
}
class QuietStream extends llm.LLMStream {
  constructor(owner: llm.LLM, opts: ChatOptions) {
    super(owner, { chatCtx: opts.chatCtx, toolCtx: opts.toolCtx, connOptions: CONN });
  }
  protected async run(): Promise<void> {
    await Promise.resolve();
  }
}

/** The arm a call with this session id draws: where a clear request on it goes. */
export async function armOf(sessionId: string): Promise<Arm> {
  const trial = new Quiet();
  const lane = withTrialLane(new Quiet(), () => trial, DEV);
  const request = withLane(llm.ChatContext.empty(), {
    mainLane: false,
    trial: openClearance(sessionId),
  });
  for await (const chunk of lane.chat({ chatCtx: request, connOptions: CONN })) void chunk;
  return trial.got === 1 ? 'trial' : 'control';
}

const pools: Record<Arm, string[]> = { trial: [], control: [] };

/**
 * Draw ids named `<prefix>-<n>` until each arm has `count`. Throws when that takes more than
 * 2 * count + 200 draws (a fair split misses that by chance far below 1e-12), so a broken split
 * fails the suite instead of hanging it.
 */
export async function fillArmPools(prefix: string, count: number): Promise<void> {
  const budget = 2 * count + 200;
  for (let n = 1; n <= budget; n++) {
    const id = `${prefix}-${n}`;
    pools[await armOf(id)].push(id);
    if (pools.trial.length >= count && pools.control.length >= count) return;
  }
  const short = pools.trial.length < count ? 'trial' : 'control';
  throw new Error(
    `no ${short} call often enough in ${budget} session ids: the arm split is broken`
  );
}

/** A fresh session id whose call draws `arm`, from the pools fillArmPools filled. */
export function idIn(arm: Arm): string {
  const id = pools[arm].shift();
  if (id === undefined) throw new Error(`the ${arm} id pool is empty: fill more in beforeAll`);
  return id;
}
