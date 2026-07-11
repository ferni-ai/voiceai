/**
 * Prod voice session proof for SOTA Wave 0/1.
 *
 * Usage:
 *   export LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
 *   node scripts/ops/verify-prod-voice-session.mjs
 *
 * Optional:
 *   OBS_URL=http://34.134.186.63:8080/api/observability
 *   AGENT_NAME=voice-agent
 *   PROOF_TIMEOUT_MS=40000
 *
 * Exit 0 iff after a join→hear→leave cycle:
 *   connectionSuccesses increased (or >= 1),
 *   avgFirstResponseTimeMs > 0,
 *   activeCalls === 0,
 *   disconnectCount increased (or natural/error end counted).
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
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error(
      JSON.stringify({
        proven: false,
        error: 'Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET',
      })
    );
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

async function main() {
  requireEnv();

  const before = await fetchObservability();
  const roomName = `sota-verify-${Date.now()}`;
  const identity = `verifier-${Date.now()}`;

  const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  const dispatchClient = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  await roomService.createRoom({
    name: roomName,
    emptyTimeout: 120,
    metadata: JSON.stringify({ purpose: 'sota-wave0-verify' }),
  });

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

  const room = new Room();
  let heardRemoteAudio = false;

  room.on(RoomEvent.TrackSubscribed, (_track, publication, participant) => {
    if (participant?.identity && publication?.kind === 'audio') {
      heardRemoteAudio = true;
    }
  });

  try {
    await room.connect(LIVEKIT_URL, jwt, { autoSubscribe: true });

    const afterFirstAudio = await waitUntil(
      (m) =>
        (m.avgFirstResponseTimeMs || 0) > 0 ||
        (m.connectionSuccesses || 0) > (before.connectionSuccesses || 0) ||
        heardRemoteAudio,
      PROOF_TIMEOUT_MS,
      'first audio / connection success'
    );

    await room.disconnect();
    await roomService.deleteRoom(roomName).catch(() => undefined);

    const after = await waitUntil(
      (m) => (m.activeCalls || 0) === 0,
      PROOF_TIMEOUT_MS,
      'activeCalls === 0'
    );

    const proven =
      (after.avgFirstResponseTimeMs || 0) > 0 &&
      (after.activeCalls || 0) === 0 &&
      ((after.connectionSuccesses || 0) >= 1 ||
        (after.connectionSuccesses || 0) > (before.connectionSuccesses || 0)) &&
      ((after.disconnectCount || 0) > (before.disconnectCount || 0) ||
        (after.naturalEndCount || 0) > (before.naturalEndCount || 0) ||
        (after.errorCount || 0) > (before.errorCount || 0) ||
        heardRemoteAudio);

    const payload = {
      proven,
      heardRemoteAudio,
      roomName,
      before,
      afterFirstAudio,
      after,
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(proven ? 0 : 1);
  } catch (error) {
    try {
      await room.disconnect();
    } catch {
      // ignore
    }
    try {
      await roomService.deleteRoom(roomName);
    } catch {
      // ignore
    }
    console.error(
      JSON.stringify({
        proven: false,
        error: String(error?.message || error),
        before,
      })
    );
    process.exit(1);
  }
}

main();
