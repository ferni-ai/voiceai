/** Dynamic Tool Loader - topic keys for sleep questions; they load wellness, where getSleepSummary lives. */
import type { ToolDomain } from '../registry/types.js';

const W: ToolDomain[] = ['wellness'];

export const SLEEP_TOPICS: Record<string, ToolDomain[]> = {
  slept: W,
  rested: W,
  readiness: W,
  oura: W,
};
