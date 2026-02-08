/**
 * Voice Cloning Pipeline for Qwen3-TTS
 *
 * Generates reference audio from Cartesia for each persona,
 * then clones the voice using Qwen3-TTS's 3-second cloning.
 *
 * Usage:
 *   npx tsx scripts/qwen3-omni/clone-voices.ts
 *   npx tsx scripts/qwen3-omni/clone-voices.ts --persona ferni
 *   npx tsx scripts/qwen3-omni/clone-voices.ts --design-only
 */

import fs from 'fs';
import path from 'path';

// Inline logger to avoid import complexity in scripts
const log = {
  info: (msg: string, data?: unknown) => {
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    process.stdout.write(`[INFO] ${msg}${dataStr}\n`);
  },
  error: (msg: string, data?: unknown) => {
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    process.stderr.write(`[ERROR] ${msg}${dataStr}\n`);
  },
  success: (msg: string) => {
    process.stdout.write(`[OK] ${msg}\n`);
  },
};

// =============================================================================
// CONFIGURATION
// =============================================================================

interface VoiceCloneTask {
  personaId: string;
  cartesiaVoiceId: string;
  referenceText: string;
  voiceDesignDescription: string;
}

const VOICE_CLONE_TASKS: VoiceCloneTask[] = [
  {
    personaId: 'ferni',
    cartesiaVoiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    referenceText:
      "Hello, it's wonderful to connect with you today. I've been thinking about how meaningful our conversations are, and I want you to know that I'm here to support you.",
    voiceDesignDescription:
      'Male, 30 years old, warm baritone, friendly and grounded, like a caring life coach who genuinely listens',
  },
  {
    personaId: 'maya-santos',
    cartesiaVoiceId: '11175483-5332-496c-8c01-ca527ce04e4a',
    referenceText:
      "Hey there! I'm so glad we're connecting. Let's make today count. What small win can we celebrate together?",
    voiceDesignDescription:
      'Female, 28 years old, alto range, encouraging and energetic, like a personal trainer who motivates with warmth',
  },
  {
    personaId: 'alex-chen',
    cartesiaVoiceId: '81c164d9-7baa-419d-9f9a-6b18100a01ee',
    referenceText:
      "Good to see you. I've been reviewing some things and I think we can approach this strategically. Let me walk you through what I'm thinking.",
    voiceDesignDescription:
      'Female, 32 years old, clear and articulate mezzo-soprano, professional yet warm, like a trusted communications advisor',
  },
  {
    personaId: 'peter-john',
    cartesiaVoiceId: '3f04e815-3260-4f50-8fd9-af9c657be4c2',
    referenceText:
      'Interesting question. Let me think about that for a moment. You know, the data actually tells a fascinating story when you look at it from this angle.',
    voiceDesignDescription:
      'Male, 45 years old, deep tenor, thoughtful and measured, like an Ivy League professor explaining complex topics simply',
  },
  {
    personaId: 'jordan-taylor',
    cartesiaVoiceId: 'b2d14370-c56b-4bdd-a6a3-71abe1b6e345',
    referenceText:
      'Oh my gosh, this is going to be amazing! I have so many ideas already. Let me pull up my planning board and we can brainstorm together!',
    voiceDesignDescription:
      'Female, 26 years old, bright soprano, enthusiastic and organized, like a creative wedding planner full of ideas',
  },
  {
    personaId: 'nayan-patel',
    cartesiaVoiceId: '52f0a563-2a2a-4c4a-ab4f-000eaaed32b3',
    referenceText:
      'There is wisdom in stillness, my friend. Sometimes the answer reveals itself when we stop looking for it. Let us sit with this question together.',
    voiceDesignDescription:
      'Male, 60 years old, deep bass-baritone, wise and serene, like an Indian philosopher sharing ancient wisdom with modern relevance',
  },
];

// =============================================================================
// STEP 1: Generate Reference Audio from Cartesia
// =============================================================================

async function generateCartesiaReference(task: VoiceCloneTask, outputDir: string): Promise<string> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    throw new Error('CARTESIA_API_KEY not set');
  }

  log.info(`Generating Cartesia reference for ${task.personaId}...`);

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2024-06-10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-3-latest',
      transcript: task.referenceText,
      voice: {
        mode: 'id',
        id: task.cartesiaVoiceId,
      },
      output_format: {
        container: 'wav',
        encoding: 'pcm_f32le',
        sample_rate: 24000,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cartesia API error ${response.status}: ${errorText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const outputPath = path.join(outputDir, `${task.personaId}-ref.wav`);
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

  log.success(
    `Reference audio saved: ${outputPath} (${(audioBuffer.byteLength / 1024).toFixed(1)}KB)`
  );
  return outputPath;
}

// =============================================================================
// STEP 2: Clone Voice with Qwen3-TTS
// =============================================================================

async function cloneWithQwen3TTS(
  task: VoiceCloneTask,
  referenceAudioPath: string,
  ttsServerUrl: string
): Promise<void> {
  log.info(`Cloning voice for ${task.personaId} via Qwen3-TTS...`);

  const response = await fetch(`${ttsServerUrl}/v1/voice/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      persona_id: task.personaId,
      ref_audio: referenceAudioPath,
      ref_text: task.referenceText,
      language: 'English',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Clone failed ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as {
    quality_score: number;
    ref_duration_sec: number;
  };

  log.success(
    `Voice cloned for ${task.personaId} (quality: ${result.quality_score}, ref: ${result.ref_duration_sec}s)`
  );
}

// =============================================================================
// STEP 3: Design Voice from Description (Fallback)
// =============================================================================

async function designWithQwen3TTS(task: VoiceCloneTask, ttsServerUrl: string): Promise<void> {
  log.info(`Designing voice for ${task.personaId} from description...`);

  const response = await fetch(`${ttsServerUrl}/v1/voice/design`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      persona_id: task.personaId,
      description: task.voiceDesignDescription,
      language: 'English',
      sample_text: task.referenceText,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Design failed ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as { quality_score: number };
  log.success(`Voice designed for ${task.personaId} (quality: ${result.quality_score})`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const designOnly = args.includes('--design-only');
  const personaFilter = args
    .find((a) => a.startsWith('--persona=') || a === '--persona')
    ?.split('=')?.[1];
  const personaArg =
    personaFilter || (args.includes('--persona') ? args[args.indexOf('--persona') + 1] : undefined);

  const ttsServerUrl = process.env.QWEN3_TTS_URL || 'http://localhost:8001';

  log.info(`Qwen3-TTS Server: ${ttsServerUrl}`);
  log.info(
    `Mode: ${designOnly ? 'Voice Design (from text descriptions)' : 'Voice Clone (from Cartesia reference audio)'}`
  );

  // Filter tasks
  const tasks = personaArg
    ? VOICE_CLONE_TASKS.filter((t) => t.personaId.includes(personaArg.toLowerCase()))
    : VOICE_CLONE_TASKS;

  if (tasks.length === 0) {
    log.error('No matching personas found');
    process.exit(1);
  }

  log.info(`Processing ${tasks.length} personas...`);

  // Create output directory
  const outputDir = path.join(process.cwd(), 'voice-clones', 'references');
  if (!designOnly) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results: Array<{
    personaId: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const task of tasks) {
    try {
      if (designOnly) {
        // Voice design mode - no reference audio needed
        await designWithQwen3TTS(task, ttsServerUrl);
      } else {
        // Full pipeline: Cartesia -> reference audio -> Qwen3-TTS clone
        const refPath = await generateCartesiaReference(task, outputDir);
        await cloneWithQwen3TTS(task, refPath, ttsServerUrl);
      }
      results.push({ personaId: task.personaId, success: true });
    } catch (error) {
      log.error(`Failed for ${task.personaId}: ${error}`);
      results.push({
        personaId: task.personaId,
        success: false,
        error: String(error),
      });
    }
  }

  // Summary
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  log.info('');
  log.info('=== Voice Cloning Summary ===');
  log.info(`Succeeded: ${succeeded}/${results.length}`);
  if (failed > 0) {
    log.error(`Failed: ${failed}/${results.length}`);
    for (const r of results.filter((x) => !x.success)) {
      log.error(`  ${r.personaId}: ${r.error}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  log.error(`Fatal error: ${e}`);
  process.exit(1);
});
