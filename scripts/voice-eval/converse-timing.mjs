// converse.mjs's timing rules, kept out of that script so they can be tested without a room.

/** How long the caller waits for the greeting. It matches the agent's own startup limit
 *  (READY_TIMEOUT_MS in src/agents/gce/job-runner.ts): a cold server can take that long to join,
 *  and a caller who speaks first talks to an empty room. */
export const GREETING_WAIT_MS = 90000;

/** A caller line's audio length in ms: 48 kHz mono s16le, so 96 bytes per ms. */
export const audioMsOf = (pcm) => Math.round(pcm.length / 96);

/** One userSpeech entry, [start, end, audioMs]. Wall time far past audioMs means the harness
 *  stalled mid-line (predicates/index.mjs callerStalled), not that the agent was slow. */
export const callerLine = (start, end, pcm) => [start, end, audioMsOf(pcm)];
