/**
 * Prod voice session proof for SOTA Wave 0/1.
 *
 * Usage:
 *   export LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
 *   node scripts/ops/verify-prod-voice-session.mjs
 *
 * GCP secrets example:
 *   export LIVEKIT_API_SECRET="$(gcloud secrets versions access latest --secret=LIVEKIT_API_SECRET --project=johnb-2025)"
 *
 * Optional:
 *   OBS_URL=http://34.134.186.63:8080/api/observability
 *   AGENT_NAME=voice-agent
 *   PROOF_TIMEOUT_MS=40000
 *
 * Exit 0 iff after a join→hear→leave cycle:
 *   connectionSuccesses increased during this run,
 *   avgFirstResponseTimeMs > 0,
 *   activeCalls === 0,
 *   disconnectCount increased, or totalCalls increased when disconnectCount did not.
 */

import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { Room, RoomEvent } from '@livekit/rtc-node';

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const OBS_URL = process.env.OBS_URL || 'http://34.134.186.63:8080/api/observability';
const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';
const PROOF_TIMEOUT_MS = Number(process.env.PROOF_TIMEOUT_MS || 40_000);

function requireEnv() {
  const missing = [
    ['LIVEKIT_URL', LIVEKIT_URL],
    ['LIVEKIT_API_KEY', LIVEKIT_API_KEY],
    ['LIVEKIT_API_SECRET', LIVEKIT_API_SECRET],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    printProof(false, null, {
      _meta: {
        error: `Missing ${missing.join(', ')}`,
      },
    });
    process.exit(1);
  }
}

async function fetchObservability() {
  const res = await fetch(OBS_URL);
  if (!res.ok) {
    throw new Error(`Observability HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.callQuality || body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fetchObservability();
    if (predicate(last)) {
      return last;
    }
    await sleep(1500);
  }
  throw new Error(`Timeout waiting for ${label}: ${JSON.stringify(last)}`);
}

function metricValue(metrics, key) {
  return Number(metrics?.[key] || 0);
}

function getSessionDeltas(before, after) {
  return {
    connectionSuccesses: metricValue(after, 'connectionSuccesses') - metricValue(before, 'connectionSuccesses'),
    disconnectCount: metricValue(after, 'disconnectCount') - metricValue(before, 'disconnectCount'),
    totalCalls: metricValue(after, 'totalCalls') - metricValue(before, 'totalCalls'),
  };
}

function hasEndMetricDelta(deltas) {
  if (deltas.disconnectCount >= 1) {
    return true;
  }

  // Some production paths finalize totalCalls without moving disconnectCount;
  // allow that only when disconnectCount stayed flat for this run.
  return deltas.disconnectCount === 0 && deltas.totalCalls >= 1;
}

function hasConnectionAndFirstResponse(before, after) {
  const deltas = getSessionDeltas(before, after);
  return deltas.connectionSuccesses >= 1 && metricValue(after, 'avgFirstResponseTimeMs') > 0;
}

function isClosedWithEndMetrics(before, after) {
  const deltas = getSessionDeltas(before, after);
  return metricValue(after, 'activeCalls') === 0 && hasEndMetricDelta(deltas);
}

function buildAfter(after, meta) {
  return {
    ...after,
    _meta: meta,
  };
}

function printProof(proven, before, after) {
  console.log(
    JSON.stringify(
      {
        proven,
        before,
        after,
      },
      null,
      2
    )
  );
}

async function main() {
  requireEnv();

  const roomName = `sota-verify-${Date.now()}`;
  const identity = `verifier-${Date.now()}`;
  let before = null;

  const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  const dispatchClient = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  const room = new Room();
  let heardRemoteAudio = false;
  let roomCreated = false;

  room.on(RoomEvent.TrackSubscribed, (_track, publication, participant) => {
    if (participant?.identity && publication?.kind === 'audio') {
      heardRemoteAudio = true;
    }
  });

  try {
    before = await fetchObservability();

    try {
      await roomService.createRoom({
        name: roomName,
        emptyTimeout: 120,
        metadata: JSON.stringify({ purpose: 'sota-wave0-verify' }),
      });
      roomCreated = true;

      await dispatchClient.createDispatch(roomName, AGENT_NAME, {
        metadata: JSON.stringify({ verify: true }),
      });

      const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        name: 'SOTA Verifier',
      });
      token.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      const jwt = await token.toJwt();

      await room.connect(LIVEKIT_URL, jwt, { autoSubscribe: true });

      await waitUntil(
        (m) => hasConnectionAndFirstResponse(before, m),
        PROOF_TIMEOUT_MS,
        'connection success and first response metrics'
      );
    } finally {
      try {
        await room.disconnect();
      } catch {
        // Continue to room deletion even if the local RTC disconnect path fails.
      }
      if (roomCreated) {
        await roomService.deleteRoom(roomName).catch(() => undefined);
      }
    }

    const after = await waitUntil(
      (m) => isClosedWithEndMetrics(before, m),
      PROOF_TIMEOUT_MS,
      'activeCalls === 0 and call end metrics'
    );
    const deltas = getSessionDeltas(before, after);

    const proven =
      deltas.connectionSuccesses >= 1 &&
      metricValue(after, 'avgFirstResponseTimeMs') > 0 &&
      metricValue(after, 'activeCalls') === 0 &&
      hasEndMetricDelta(deltas);

    printProof(
      proven,
      before,
      buildAfter(after, {
        roomName,
        heardRemoteAudio,
        deltas,
      })
    );
    process.exit(proven ? 0 : 1);
  } catch (error) {
    let after = {};
    try {
      after = await fetchObservability();
    } catch {
      after = {};
    }
    printProof(
      false,
      before,
      buildAfter(after, {
        error: String(error?.message || error),
        roomName,
        heardRemoteAudio,
      })
    );
    process.exit(1);
  }
}

main();
