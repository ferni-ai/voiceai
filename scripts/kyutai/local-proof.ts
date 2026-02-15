#!/usr/bin/env npx tsx
/**
 * Kyutai local proof script.
 *
 * Interactive validation: STT (audio -> transcript) then TTS (transcript -> audio)
 * with latency metrics. Uses KYUTAI_STT_URL / KYUTAI_TTS_URL or defaults
 * ws://localhost:8089 and ws://localhost:8090 (e.g. MLX bridge or mock).
 *
 * Usage:
 *   npx tsx scripts/kyutai/local-proof.ts
 *   npx tsx scripts/kyutai/local-proof.ts --input path/to/audio.pcm
 *   npx tsx scripts/kyutai/local-proof.ts --input test.wav --output out.wav
 *
 * Without --input, uses 5 seconds of silence (16kHz mono PCM) so you can run
 * without a microphone. With --input, pass raw PCM (16kHz, 16-bit mono) or
 * a WAV file (16kHz mono).
 */

import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { KyutaiSTTClient } from '../../src/speech/providers/kyutai-stt.js';
import { KyutaiTTSProvider } from '../../src/speech/tts-gateway/providers/kyutai-tts.js';

const STT_URL = process.env.KYUTAI_STT_URL ?? 'ws://127.0.0.1:8089/api/asr-streaming';
const TTS_URL = process.env.KYUTAI_TTS_URL ?? 'ws://127.0.0.1:8090/api/tts_streaming';

const SAMPLE_RATE_STT = 16000;
const SAMPLE_RATE_TTS = 24000;

function parseArgs(): { input?: string; output: string } {
  const args = process.argv.slice(2);
  let input: string | undefined;
  let output = 'kyutai-local-proof-output.wav';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      input = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[++i];
    }
  }
  return { input, output };
}

function loadPcmFromFile(path: string): Buffer {
  const buf = readFileSync(path);
  if (path.toLowerCase().endsWith('.wav')) {
    const dataOffset = buf.readUInt32LE(40);
    return Buffer.from(buf.buffer, buf.byteOffset + dataOffset, buf.length - dataOffset);
  }
  return buf;
}

function generateSilencePcm(seconds: number): Buffer {
  const samples = SAMPLE_RATE_STT * seconds;
  const buf = Buffer.alloc(samples * 2);
  buf.fill(0);
  return buf;
}

function writeWav(path: string, pcm: Buffer, sampleRate: number): void {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  writeFileSync(path, Buffer.concat([header, pcm]));
}

async function runStt(pcm: Buffer): Promise<{ transcript: string; latencyMs: number }> {
  const client = new KyutaiSTTClient({ sttUrl: STT_URL, sampleRate: SAMPLE_RATE_STT });
  const start = Date.now();
  await client.connect();

  return new Promise((resolve) => {
    let transcript = '';
    let resolved = false;
    const done = (t: string) => {
      if (resolved) return;
      resolved = true;
      client.close();
      resolve({ transcript: t, latencyMs: Date.now() - start });
    };

    client.onTranscript((ev) => {
      transcript = ev.text;
      if (ev.isFinal) done(ev.text);
    });
    client.onVAD(() => {});

    const chunkSize = 320 * 2;
    for (let i = 0; i < pcm.length; i += chunkSize) {
      client.sendAudio(pcm.subarray(i, i + chunkSize));
    }

    setTimeout(() => done(transcript || '(no final transcript)'), 5000);
  });
}

async function runTts(text: string): Promise<{ pcm: ArrayBuffer; latencyMs: number }> {
  const start = Date.now();
  const provider = new KyutaiTTSProvider({ ttsUrl: TTS_URL });
  const pcm = await provider.synthesize(text, 'ferni');
  const latencyMs = Date.now() - start;
  return { pcm, latencyMs };
}

async function main(): Promise<void> {
  const { input, output } = parseArgs();

  console.log('Kyutai local proof');
  console.log('  STT:', STT_URL);
  console.log('  TTS:', TTS_URL);
  console.log('');

  const pcm = input ? loadPcmFromFile(input) : generateSilencePcm(5);
  if (pcm.length < 320 * 2) {
    console.error('Need at least 640 bytes of PCM for STT.');
    process.exit(1);
  }

  console.log('Running STT...');
  const sttResult = await runStt(pcm);
  console.log('  Transcript:', sttResult.transcript);
  console.log('  STT latency:', sttResult.latencyMs, 'ms');
  console.log('');

  if (!sttResult.transcript || sttResult.transcript === '(no final transcript)') {
    console.log('No transcript; skipping TTS.');
    process.exit(0);
  }

  console.log('Running TTS...');
  const ttsResult = await runTts(sttResult.transcript);
  console.log('  TTS latency:', ttsResult.latencyMs, 'ms');
  console.log('  Output bytes:', ttsResult.pcm.byteLength);
  console.log('');

  writeWav(output, Buffer.from(ttsResult.pcm), SAMPLE_RATE_TTS);
  console.log('Wrote:', output);
  console.log('');
  console.log('Latency summary:');
  console.log('  STT:        ', sttResult.latencyMs, 'ms');
  console.log('  TTS:        ', ttsResult.latencyMs, 'ms');
  console.log('  Round-trip: ', sttResult.latencyMs + ttsResult.latencyMs, 'ms');
  console.log('');
  console.log('Play output: afplay', output);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
