#!/usr/bin/env npx tsx
/**
 * Kyutai TTS vs Cartesia A/B comparison.
 *
 * Synthesizes a set of test sentences with both Kyutai and Cartesia TTS,
 * saves WAV files, reports latency, and generates an HTML page to listen
 * side-by-side.
 *
 * Usage:
 *   npx tsx scripts/kyutai/compare-tts.ts
 *   npx tsx scripts/kyutai/compare-tts.ts --out-dir ./compare-out
 *
 * Requires: KYUTAI_TTS_URL (or mock/bridge on ws://127.0.0.1:8090),
 *           CARTESIA_API_KEY for Cartesia. Skips Cartesia if key missing.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { KyutaiTTSProvider } from '../../src/speech/tts-gateway/providers/kyutai-tts.js';
import { createCartesiaProvider } from '../../src/speech/tts-gateway/providers/cartesia.js';
import type { ITTSProvider } from '../../src/speech/tts-gateway/types.js';

const TEST_SENTENCES = [
  'Hello from Ferni.',
  'How are you feeling today?',
  'I am here whenever you need to talk.',
];

const SAMPLE_RATE = 24000;

function parseArgs(): { outDir: string } {
  const args = process.argv.slice(2);
  let outDir = join(process.cwd(), 'scripts', 'kyutai', 'compare-out');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out-dir' && args[i + 1]) {
      outDir = args[++i];
    }
  }
  return { outDir };
}

function bufferToWav(pcm: ArrayBuffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const dataSize = pcm.byteLength;
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
  return Buffer.concat([header, Buffer.from(pcm)]);
}

async function synthesize(
  provider: ITTSProvider,
  text: string,
  voiceId: string
): Promise<{ pcm: ArrayBuffer; latencyMs: number }> {
  const start = Date.now();
  const pcm = await provider.synthesize(text, voiceId, {});
  const latencyMs = Date.now() - start;
  return { pcm, latencyMs };
}

async function main(): Promise<void> {
  const { outDir } = parseArgs();
  mkdirSync(outDir, { recursive: true });

  const kyutaiUrl = process.env.KYUTAI_TTS_URL ?? 'ws://127.0.0.1:8090/api/tts_streaming';
  const kyutai = new KyutaiTTSProvider({ ttsUrl: kyutaiUrl });
  let cartesia: ITTSProvider | null = null;
  try {
    cartesia = createCartesiaProvider();
  } catch {
    console.log('Cartesia skipped (no API key or config).');
  }

  const rows: Array<{ sentence: string; kyutaiMs?: number; cartesiaMs?: number; kyutaiFile: string; cartesiaFile: string }> = [];

  for (let i = 0; i < TEST_SENTENCES.length; i++) {
    const sentence = TEST_SENTENCES[i];
    const prefix = String(i + 1).padStart(2, '0');
    const kyutaiFile = `kyutai-${prefix}.wav`;
    const cartesiaFile = `cartesia-${prefix}.wav`;

    let kyutaiMs: number | undefined;
    let cartesiaMs: number | undefined;

    const kyutaiResult = await synthesize(kyutai, sentence, 'ferni');
    kyutaiMs = kyutaiResult.latencyMs;
    writeFileSync(join(outDir, kyutaiFile), bufferToWav(kyutaiResult.pcm, SAMPLE_RATE));

    if (cartesia) {
      try {
        const cartesiaResult = await synthesize(cartesia, sentence, 'ferni');
        cartesiaMs = cartesiaResult.latencyMs;
        writeFileSync(join(outDir, cartesiaFile), bufferToWav(cartesiaResult.pcm, SAMPLE_RATE));
      } catch (e) {
        console.warn('Cartesia failed for:', sentence.slice(0, 30), e);
      }
    }

    rows.push({
      sentence,
      kyutaiMs,
      cartesiaMs,
      kyutaiFile,
      cartesiaFile,
    });
  }

  console.log('\nLatency comparison (ms):');
  console.log('Sentence                      | Kyutai | Cartesia');
  console.log('-'.repeat(55));
  for (const r of rows) {
    const s = r.sentence.slice(0, 28).padEnd(28);
    const k = r.kyutaiMs != null ? String(r.kyutaiMs).padStart(6) : '   -';
    const c = r.cartesiaMs != null ? String(r.cartesiaMs).padStart(8) : '     -';
    console.log(`${s} | ${k} | ${c}`);
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kyutai vs Cartesia TTS</title>
  <style>
    body { font-family: system-ui; padding: 1rem; max-width: 800px; margin: 0 auto; }
    h1 { margin-top: 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #eee; }
    audio { width: 100%; max-width: 320px; display: block; margin: 0.25rem 0; }
    .sentence { font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>Kyutai vs Cartesia TTS</h1>
  <p>Compare outputs side-by-side. Same sentence, same voice (ferni).</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Sentence</th>
        <th>Kyutai</th>
        <th>Cartesia</th>
      </tr>
    </thead>
    <tbody>
${rows
  .map(
    (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="sentence">${escapeHtml(r.sentence)}</td>
        <td><audio controls src="${r.kyutaiFile}"></audio></td>
        <td><audio controls src="${r.cartesiaFile}"></audio></td>
      </tr>`
  )
  .join('')}
    </tbody>
  </table>
</body>
</html>`;

  const htmlPath = join(outDir, 'index.html');
  writeFileSync(htmlPath, html);
  console.log('\nOutput:', outDir);
  console.log('Open:', htmlPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
