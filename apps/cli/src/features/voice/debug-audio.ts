import * as lk from '@livekit/rtc-node';

const TOKEN_SERVER = process.env.CLI_TOKEN_SERVER || 'https://app.ferni.ai';

async function main() {
  const roomName = `debug-test-${Date.now()}`;
  const userName = `debug-user-${Math.random().toString(36).substr(2, 4)}`;
  
  // Get token with correct params
  console.log('Fetching token from:', TOKEN_SERVER);
  const params = new URLSearchParams({
    room: roomName,
    username: userName,
    persona: 'ferni'
  });
  
  const resp = await fetch(`${TOKEN_SERVER}/token?${params}`);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token fetch failed: ${resp.status} - ${err}`);
  }
  const { token, url } = await resp.json();
  
  console.log('Creating room...');
  const room = new lk.Room();
  
  // Log ALL events
  room.on(lk.RoomEvent.TrackSubscribed, async (track, pub, participant) => {
    console.log('🎵 TrackSubscribed:', {
      kind: track.kind,
      kindName: track.kind === lk.TrackKind.KIND_AUDIO ? 'AUDIO' : 'OTHER',
      participant: participant.identity,
      trackSid: track.sid,
    });
    
    if (track.kind === lk.TrackKind.KIND_AUDIO) {
      console.log('  → Got audio track! Starting audio stream...');
      try {
        const audioStream = new lk.AudioStream(track);
        let frameCount = 0;
        for await (const frame of audioStream) {
          frameCount++;
          if (frameCount === 1) {
            console.log('  → First audio frame received! Size:', frame.data.byteLength);
          }
          if (frameCount % 100 === 0) {
            console.log('  → Audio frames:', frameCount);
          }
        }
        console.log('  → Audio stream ended. Total frames:', frameCount);
      } catch (e) {
        console.log('  → Audio stream error:', e);
      }
    }
  });
  
  room.on(lk.RoomEvent.TrackPublished, (pub, participant) => {
    console.log('📢 TrackPublished:', {
      kind: pub.kind,
      kindName: pub.kind === lk.TrackKind.KIND_AUDIO ? 'AUDIO' : 'VIDEO',
      participant: participant.identity,
    });
  });
  
  room.on(lk.RoomEvent.ParticipantConnected, (p) => {
    console.log('👤 ParticipantConnected:', p.identity);
  });
  
  console.log('Connecting...');
  await room.connect(url, token, { autoSubscribe: true });
  console.log('✅ Connected! Room:', room.name);
  console.log('Waiting 15s for agent...');
  
  // Keep alive
  await new Promise(r => setTimeout(r, 15000));
  console.log('Done.');
  process.exit(0);
}

main().catch(console.error);
