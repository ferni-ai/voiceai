/**
 * Local Test Script for Twilio Stream Bridge
 * 
 * This simulates what Twilio sends to verify our two-way audio handling works.
 * Run with: npx tsx scripts/test-twilio-stream-local.ts
 */

import WebSocket from 'ws';
import { createServer } from 'http';

// Test configuration
// Standalone mode uses port 8765 directly, attached mode uses port 3002 + /stream path
const LOCAL_PORT = 8765;
const WS_PATH = '';

// Simulated Twilio messages
const TWILIO_CONNECTED = { event: 'connected', protocol: 'Call', version: '1.0.0' };

const TWILIO_START = {
  event: 'start',
  sequenceNumber: '1',
  start: {
    streamSid: 'MZ_test_stream_123',
    accountSid: 'AC_test_account',
    callSid: 'CA_test_call_' + Date.now(),
    tracks: ['inbound', 'outbound'],  // Both tracks!
    customParameters: {
      roomName: 'test_room_local',
      recipientName: 'Test User',
      purpose: 'Testing two-way audio',
    },
    mediaFormat: {
      encoding: 'audio/x-mulaw',
      sampleRate: 8000,
      channels: 1,
    },
  },
};

// Generate fake μ-law audio (silence = 0xFF in μ-law)
function generateMulawSilence(durationMs: number): string {
  const samplesPerMs = 8; // 8kHz
  const numSamples = durationMs * samplesPerMs;
  const buffer = Buffer.alloc(numSamples, 0xFF); // μ-law silence
  return buffer.toString('base64');
}

// Generate fake μ-law audio with some "noise" (simulating speech)
function generateMulawNoise(durationMs: number): string {
  const samplesPerMs = 8;
  const numSamples = durationMs * samplesPerMs;
  const buffer = Buffer.alloc(numSamples);
  for (let i = 0; i < numSamples; i++) {
    // Generate random values to simulate audio
    buffer[i] = Math.floor(Math.random() * 255);
  }
  return buffer.toString('base64');
}

function createMediaMessage(sequenceNum: number, payload: string): object {
  return {
    event: 'media',
    sequenceNumber: String(sequenceNum),
    media: {
      track: 'inbound',
      chunk: String(sequenceNum),
      timestamp: String(Date.now()),
      payload,
    },
  };
}

async function runTest() {
  console.log('🧪 Testing Twilio Stream Bridge Locally\n');
  
  // Check if UI server is running
  console.log(`📡 Connecting to ws://localhost:${LOCAL_PORT}${WS_PATH}?roomName=test_room`);
  
  const ws = new WebSocket(`ws://localhost:${LOCAL_PORT}${WS_PATH}?roomName=test_room`);
  
  ws.on('open', async () => {
    console.log('✅ WebSocket connected!\n');
    
    // Step 1: Send connected event
    console.log('1️⃣ Sending "connected" event...');
    ws.send(JSON.stringify(TWILIO_CONNECTED));
    await sleep(100);
    
    // Step 2: Send start event
    console.log('2️⃣ Sending "start" event...');
    console.log(`   tracks: ${TWILIO_START.start.tracks.join(', ')}`);
    ws.send(JSON.stringify(TWILIO_START));
    await sleep(500);
    
    // Step 3: Wait for agent greeting (it should speak through the stream)
    console.log('\n⏳ Waiting 3s for agent to speak greeting...');
    await sleep(3000);
    
    // Step 4: Send simulated user speech (media events)
    console.log('\n3️⃣ Sending simulated user speech (inbound media)...');
    
    let seq = 2;
    // Send 2 seconds of "speech" (160 packets at 20ms each = 3.2 seconds)
    for (let i = 0; i < 100; i++) {
      const payload = generateMulawNoise(20); // 20ms of audio
      ws.send(JSON.stringify(createMediaMessage(seq++, payload)));
      
      if (i % 20 === 0) {
        console.log(`   Sent ${i + 1} packets...`);
      }
      await sleep(20); // Real-time pacing
    }
    
    // Step 5: Send silence to trigger VAD
    console.log('\n4️⃣ Sending 1.5s of silence (to trigger transcription)...');
    for (let i = 0; i < 75; i++) {
      const payload = generateMulawSilence(20);
      ws.send(JSON.stringify(createMediaMessage(seq++, payload)));
      await sleep(20);
    }
    
    console.log('\n⏳ Waiting 3s for transcription and agent response...');
    await sleep(3000);
    
    // Step 6: Send stop
    console.log('\n5️⃣ Sending "stop" event...');
    ws.send(JSON.stringify({ event: 'stop', sequenceNumber: String(seq) }));
    
    await sleep(1000);
    ws.close();
  });
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.event === 'media') {
      console.log('📤 Received OUTBOUND audio from agent!');
    } else if (msg.event === 'mark') {
      console.log(`📍 Mark: ${msg.mark?.name}`);
    } else {
      console.log('📥 Server message:', JSON.stringify(msg).substring(0, 100));
    }
  });
  
  ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
    console.log('\n💡 Make sure the UI server is running: PORT=3002 node ui-server.js');
    process.exit(1);
  });
  
  ws.on('close', () => {
    console.log('\n✅ Test completed!');
    console.log('\n📋 Check the UI server logs for:');
    console.log('   - "🎧 Stream tracks configured" with tracks: ["inbound", "outbound"]');
    console.log('   - "🎵 Audio packet received" messages');
    console.log('   - "📝 Transcript received" after silence');
    console.log('   - "🗣️ Speaking" when agent responds');
    process.exit(0);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

runTest().catch(console.error);
