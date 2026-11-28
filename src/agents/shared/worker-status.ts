/**
 * The answer to `GET /worker`, the worker status route of the LiveKit agents SDK.
 *
 * Our worker does not run the SDK's own worker (`gce-voice-worker.ts` registers over the worker
 * protocol itself), so nothing here served the route the platform polls on the health port
 * (`PORT=8081`, livekit.toml). Prod logged one `GET /worker` per pod about every 5 minutes, first
 * a 404 and since #3763 a 401 (#4292).
 *
 * The body carries exactly what `@livekit/agents` http_server.js and worker.js carry: eight keys
 * about the worker, none about a call. No user id, no room name, no job id.
 *
 * Unlike the SDK's `GET /` (503 until the worker is connected), ours answers 200 as before. This
 * route does not change that.
 *
 * @module agents/shared/worker-status
 */
import type { ServerResponse } from 'node:http';

/** `@livekit/agents` version the call sessions run on; a test pins it to package.json. */
const SDK_VERSION = '1.9.3';

/** worker.js `WORKER_PROTOCOL_VERSION`. */
const PROTOCOL_VERSION = 1;

interface WorkerStatus {
  agent_name: string;
  agent_name_is_env: boolean;
  deployment: string;
  /** `JobType[JT_ROOM]`: the worker takes room jobs. */
  worker_type: 'JT_ROOM';
  active_jobs: number;
  sdk_version: string;
  project_type: 'nodejs';
  protocol_version: number;
}

let countActiveJobs: () => number = () => 0;

/** The worker registers how it counts the calls running now; until it does, none. */
export function setActiveJobsSource(source: () => number): void {
  countActiveJobs = source;
}

function buildWorkerStatus(): WorkerStatus {
  const agentName = process.env['AGENT_NAME'];
  return {
    agent_name: agentName || 'voice-agent',
    agent_name_is_env: Boolean(agentName),
    deployment: process.env['LIVEKIT_AGENT_DEPLOYMENT'] || '',
    worker_type: 'JT_ROOM',
    active_jobs: countActiveJobs(),
    sdk_version: SDK_VERSION,
    project_type: 'nodejs',
    protocol_version: PROTOCOL_VERSION,
  };
}

export function sendWorkerStatus(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(buildWorkerStatus()));
}
