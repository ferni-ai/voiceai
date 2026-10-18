/**
 * Builds the shell command `/ferni logs` runs to fetch recent voice-agent logs.
 *
 * The agent runs on LiveKit Cloud (prod CA_GeFvEpsNXLSF). Its logs reach Cloud
 * Logging as logs/cloud-agents in johnb-2025. This replaced an ssh into the GCE
 * VM voiceai-agent-gce, which no longer runs. `lk agent logs` would also work,
 * but it tails forever, so it doesn't fit a one-shot command.
 */
export const AGENT_LOG_PROJECT = 'johnb-2025';
export const PROD_AGENT_ID = 'CA_GeFvEpsNXLSF';
export const MAX_LOG_LINES = 50;

/** Clamps a requested line count to 1..MAX_LOG_LINES; anything unusable gives 20. */
export function clampLogLines(requested: number): number {
  if (!Number.isFinite(requested) || requested < 1) return 20;
  return Math.min(Math.floor(requested), MAX_LOG_LINES);
}

export function buildAgentLogsCommand(requested: number): string {
  const lines = clampLogLines(requested);
  const filter = `logName="projects/${AGENT_LOG_PROJECT}/logs/cloud-agents" AND labels.agent_id="${PROD_AGENT_ID}"`;
  return (
    `gcloud logging read '${filter}' --project=${AGENT_LOG_PROJECT} --freshness=1h ` +
    `--limit=${lines} --format="value(timestamp,textPayload)" 2>&1`
  );
}
