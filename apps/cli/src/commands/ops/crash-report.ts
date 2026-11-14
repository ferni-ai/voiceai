/**
 * The crash analytics part of `pnpm ops:diagnose` (diagnose-disconnects.ts).
 *
 * The worker's /api/crash-analytics answers only an admin (#3738): no token or a
 * bad one is 401, a non-admin 403. The report says so and the command exits
 * non-zero, instead of printing "No crash data available" as for a worker it
 * can't reach. The summary is under data.sessionCrashes, where activeSessions
 * is the list of live session snapshots.
 *
 * @module apps/cli/commands/ops/crash-report
 */

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

export interface CrashSummary {
  totalCrashes: number;
  lastCrashTime: string | null;
  activeSessions: number;
  recentCrashes: Array<{
    type: string;
    error: { message: string };
    timestamp: string;
    severity: string;
  }>;
}

export type CrashFetch =
  | { kind: 'ok'; summary: CrashSummary }
  | { kind: 'denied'; status: number }
  | { kind: 'unavailable' };

/** The summary in a /api/crash-analytics body, or null when it has none. */
export function crashSummaryFrom(body: unknown): CrashSummary | null {
  const s = (body as { data?: { sessionCrashes?: Record<string, unknown> | null } } | null)?.data
    ?.sessionCrashes;
  if (!s || typeof s.totalCrashes !== 'number') return null;
  const sessions = s.activeSessions;
  return {
    totalCrashes: s.totalCrashes,
    lastCrashTime: typeof s.lastCrashTime === 'string' ? s.lastCrashTime : null,
    activeSessions: Array.isArray(sessions) ? sessions.length : Number(sessions) || 0,
    recentCrashes: Array.isArray(s.recentCrashes)
      ? (s.recentCrashes as CrashSummary['recentCrashes'])
      : [],
  };
}

/** GET {obsUrl}/api/crash-analytics with the admin token, if any. */
export async function fetchCrashSummary(obsUrl: string, token?: string): Promise<CrashFetch> {
  try {
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${obsUrl}/api/crash-analytics`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 401 || res.status === 403) return { kind: 'denied', status: res.status };
    if (!res.ok) return { kind: 'unavailable' };
    const summary = crashSummaryFrom(await res.json());
    return summary ? { kind: 'ok', summary } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** The CRASH ANALYTICS lines, and the exit code they call for (1 when access was refused). */
export function crashSection(
  crash: CrashFetch,
  now = Date.now()
): { lines: string[]; exitCode: 0 | 1 } {
  if (crash.kind === 'denied') {
    return {
      lines: [
        `${RED}✗ Crash data needs AGENT_OBS_TOKEN, an admin's Firebase ID token (got ${crash.status})${RESET}`,
      ],
      exitCode: 1,
    };
  }
  if (crash.kind === 'unavailable') {
    return { lines: [`${YELLOW}No crash data available${RESET}`], exitCode: 0 };
  }
  const { summary } = crash;
  const lines = [
    `Total Crashes: ${summary.totalCrashes === 0 ? GREEN : RED}${summary.totalCrashes}${RESET}`,
    `Active Sessions: ${summary.activeSessions}`,
  ];
  if (summary.lastCrashTime) {
    const minsAgo = Math.round((now - new Date(summary.lastCrashTime).getTime()) / 60_000);
    lines.push(`Last Crash: ${minsAgo} minutes ago`);
  }
  if (summary.recentCrashes.length > 0) {
    lines.push(`\n${YELLOW}Recent Crashes:${RESET}`);
    for (const c of summary.recentCrashes.slice(0, 5)) {
      const time = new Date(c.timestamp).toLocaleTimeString();
      const color = c.severity === 'critical' ? RED : YELLOW;
      lines.push(
        `  ${color}[${c.severity}]${RESET} ${time} - ${c.type}: ${c.error.message.slice(0, 60)}`
      );
    }
  }
  return { lines, exitCode: 0 };
}
