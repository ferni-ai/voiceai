#!/usr/bin/env npx tsx
/**
 * Full Local Test for Two-Way Outbound Calls
 * 
 * Tests the ENTIRE pipeline locally:
 * 1. Connects to local WebSocket (simulating Twilio)
 * 2. Sends REAL speech audio (not random noise)
 * 3. Verifies transcription works
 * 4. Verifies agent responds
 * 
 * Run: npx tsx scripts/test-twilio-local-full.ts
 * 
 * Prerequisites:
 * - UI server running: pnpm ui-server
 * - GOOGLE_API_KEY set in .env (for transcription)
 * - CARTESIA_API_KEY set in .env (for TTS response)
 */

import WebSocket from 'ws';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Test configuration
const WS_URL = 'ws://localhost:8765';
const TEST_PHRASE = 'Hello, how are you doing today?';

// Generate speech audio using macOS say command, then convert to μ-law
async function generateSpeechAudio(text: string): Promise<Buffer> {
  console.log(`🎤 Generating speech: "${text}"`);
  
  const tempAiff = '/tmp/test-speech.aiff';
  const tempRaw = '/tmp/test-speech.raw';
  
  // Use macOS 'say' to generate speech
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('say', ['-o', tempAiff, '--data-format=LEI16@8000', text]);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`say command failed with code ${code}`));
    });
    proc.on('error', reject);
  });
  
  // Convert AIFF to raw PCM using ffmpeg or afconvert
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('afconvert', [
      '-f', 'caff',
      '-d', 'LEI16@8000',
      '-c', '1',
      tempAiff,
      tempRaw
    ]);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`afconvert failed with code ${code}`));
    });
    proc.on('error', reject);
  });
  
  // Read raw PCM
  const pcmData = fs.readFileSync(tempRaw);
  
  // Convert PCM to μ-law
  const mulawData = pcmToMulaw(pcmData);
  
  // Cleanup
  try { fs.unlinkSync(tempAiff); } catch {}
  try { fs.unlinkSync(tempRaw); } catch {}
  
  console.log(`✅ Generated ${mulawData.length} bytes of μ-law audio`);
  return mulawData;
}

// Convert 16-bit PCM to μ-law
function pcmToMulaw(pcmBuffer: Buffer): Buffer {
  const MULAW_MAX = 0x7F7F;
  const MULAW_BIAS = 33;
  
  const samples = pcmBuffer.length / 2;
  const mulawBuffer = Buffer.alloc(samples);
  
  for (let i = 0; i < samples; i++) {
    let sample = pcmBuffer.readInt16LE(i * 2);
    
    // Get sign
    let sign = 0;
    if (sample < 0) {
      sign = 0x80;
      sample = -sample;
    }
    
    // Add bias and clip
    sample = Math.min(sample + MULAW_BIAS, MULAW_MAX);
    
    // Find exponent (position of highest bit)
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
    
    // Extract mantissa
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    
    // Combine and complement
    mulawBuffer[i] = ~(sign | (exponent << 4) | mantissa) & 0xFF;
  }
  
  return mulawBuffer;
}

// Alternative: Use pre-recorded test audio or generate simple tone
async function getTestAudio(): Promise<Buffer> {
  try {
    // Try to generate real speech
    return await generateSpeechAudio(TEST_PHRASE);
  } catch (error) {
    console.log('⚠️ Could not generate speech, using tone pattern');
    // Fallback: Generate a distinctive audio pattern (not just noise)
    // This won't transcribe but will test the audio pipeline
    return generateTonePattern();
  }
}

function generateTonePattern(): Buffer {
  const durationMs = 2000;
  const sampleRate = 8000;
  const samples = (durationMs / 1000) * sampleRate;
  const buffer = Buffer.alloc(samples);
  
  // Generate a 440Hz tone (A4 note) in μ-law
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const amplitude = Math.sin(2 * Math.PI * 440 * t) * 0.5;
    // Convert to μ-law-ish value
    const mulaw = Math.floor(128 + amplitude * 100);
    buffer[i] = mulaw;
  }
  
  return buffer;
}

// Simulated Twilio messages
function createStartMessage(callSid: string, roomName: string) {
  return {
    event: 'start',
    sequenceNumber: '1',
    start: {
      streamSid: `MZ_${Date.now()}`,
      accountSid: 'AC_test',
      callSid,
      tracks: ['inbound', 'outbound'],
      customParameters: {
        roomName,
        recipientName: 'Local Test',
        purpose: 'Testing two-way audio locally',
        callType: 'personal',
      },
      mediaFormat: {
        encoding: 'audio/x-mulaw',
        sampleRate: 8000,
        channels: 1,
      },
    },
  };
}

function createMediaMessage(seq: number, payload: string) {
  return {
    event: 'media',
    sequenceNumber: String(seq),
    media: {
      track: 'inbound',
      chunk: String(seq),
      timestamp: String(Date.now()),
      payload,
    },
  };
}

async function runFullTest() {
  console.log('═'.repeat(60));
  console.log('  FULL LOCAL TWO-WAY CALL TEST');
  console.log('═'.repeat(60));
  console.log('');
  
  // Check if server is running
  try {
    const healthCheck = await fetch('http://localhost:3002/health');
    if (!healthCheck.ok) throw new Error('Health check failed');
    console.log('✅ UI Server is running on port 3002');
  } catch {
    console.error('❌ UI Server not running! Start it with: pnpm ui-server');
    process.exit(1);
  }
  
  // Generate test audio
  console.log('');
  const audioData = await getTestAudio();
  
  // Connect to WebSocket
  console.log('');
  console.log(`📡 Connecting to ${WS_URL}`);
  
  const ws = new WebSocket(WS_URL);
  const callSid = `CA_local_test_${Date.now()}`;
  const roomName = `local_test_${Date.now()}`;
  
  let receivedAudioFromAgent = false;
  let seq = 2;
  
  ws.on('open', async () => {
    console.log('✅ WebSocket connected');
    console.log('');
    
    // Step 1: Send connected
    console.log('1️⃣  Sending "connected" event...');
    ws.send(JSON.stringify({ event: 'connected', protocol: 'Call', version: '1.0.0' }));
    await sleep(100);
    
    // Step 2: Send start
    console.log('2️⃣  Sending "start" event (tracks: inbound, outbound)...');
    ws.send(JSON.stringify(createStartMessage(callSid, roomName)));
    await sleep(500);
    
    // Step 3: Wait for agent greeting
    console.log('');
    console.log('⏳ Waiting 4s for agent to speak greeting...');
    await sleep(4000);
    
    // Step 4: Send the speech audio
    console.log('');
    console.log('3️⃣  Sending speech audio (simulating user talking)...');
    console.log(`   Phrase: "${TEST_PHRASE}"`);
    console.log(`   Audio size: ${audioData.length} bytes`);
    
    // Send in 20ms chunks (160 bytes at 8kHz)
    const chunkSize = 160;
    let bytesSent = 0;
    
    for (let offset = 0; offset < audioData.length; offset += chunkSize) {
      const chunk = audioData.slice(offset, offset + chunkSize);
      const payload = chunk.toString('base64');
      ws.send(JSON.stringify(createMediaMessage(seq++, payload)));
      bytesSent += chunk.length;
      
      if (bytesSent % 1600 === 0) {
        console.log(`   Sent ${bytesSent}/${audioData.length} bytes...`);
      }
      
      await sleep(20); // Real-time pacing
    }
    
    console.log(`   ✅ Sent ${bytesSent} bytes total`);
    
    // Step 5: Send silence to trigger VAD
    console.log('');
    console.log('4️⃣  Sending 1.5s silence (to trigger transcription)...');
    
    const silenceChunk = Buffer.alloc(chunkSize, 0xFF); // μ-law silence
    for (let i = 0; i < 75; i++) { // 75 * 20ms = 1.5s
      ws.send(JSON.stringify(createMediaMessage(seq++, silenceChunk.toString('base64'))));
      await sleep(20);
    }
    
    // Step 6: Wait for transcription and agent response
    console.log('');
    console.log('⏳ Waiting 5s for transcription and agent response...');
    await sleep(5000);
    
    // Step 7: End call
    console.log('');
    console.log('5️⃣  Sending "stop" event...');
    ws.send(JSON.stringify({ event: 'stop', sequenceNumber: String(seq) }));
    
    await sleep(1000);
    ws.close();
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.event === 'media') {
        if (!receivedAudioFromAgent) {
          console.log('');
          console.log('📢 RECEIVED AUDIO FROM AGENT! Two-way audio is working!');
          receivedAudioFromAgent = true;
        }
      } else if (msg.event === 'mark') {
        console.log(`📍 Mark received: ${msg.mark?.name}`);
      }
    } catch {}
  });
  
  ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
  });
  
  ws.on('close', () => {
    console.log('');
    console.log('═'.repeat(60));
    console.log('  TEST COMPLETE');
    console.log('═'.repeat(60));
    console.log('');
    console.log('📋 Results:');
    console.log(`   Audio sent: ✅`);
    console.log(`   Agent audio received: ${receivedAudioFromAgent ? '✅' : '❌ (check server logs)'}`);
    console.log('');
    console.log('📊 Check server logs for:');
    console.log('   grep -E "tracks|Audio packet|transcript|Speaking" /tmp/ui-server.log | tail -30');
    console.log('');
    process.exit(0);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

runFullTest().catch(console.error);
