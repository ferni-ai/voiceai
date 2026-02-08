#!/usr/bin/env npx tsx
/**
 * Export Ferni conversation transcripts from Firestore to MS-Swift SFT JSONL.
 *
 * Reads from bogle_users/{userId}/conversations/{conversationId}/turns,
 * filters for conversations with at least 3 turns, and outputs one training
 * example per user/assistant pair in MS-Swift format.
 *
 * Usage:
 *   npx tsx scripts/qwen3-omni/extract-training-data.ts [--limit N] [--out path]
 *
 * Environment:
 *   GOOGLE_APPLICATION_CREDENTIALS or default GCP project for Firestore
 */

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { getFirestoreDb } from '../../src/utils/firestore-utils.js';
import { createLogger } from '../../src/utils/safe-logger.js';

const log = createLogger({ module: 'qwen3-omni-extract-training-data' });

const DEFAULT_SYSTEM_PROMPT =
  'You are Ferni, a warm and caring AI life coach. You listen deeply, reflect back what you hear, and offer support without judgment. Your tone is grounded, present, and human.';

const MIN_TURNS_PER_CONVERSATION = 3;
const MIN_USER_CONTENT_LENGTH = 5;
const MIN_ASSISTANT_CONTENT_LENGTH = 10;
const DEFAULT_LIMIT = 10_000;
const DEFAULT_OUTPUT = 'scripts/qwen3-omni/data/ferni-coaching-sft.jsonl';

interface TurnRow {
  role: 'user' | 'assistant';
  content: string;
  timestamp: unknown;
}

interface SFTExample {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

function parseArgs(): { limit: number; output: string } {
  const args = process.argv.slice(2);
  let limit = DEFAULT_LIMIT;
  let output = DEFAULT_OUTPUT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1]!, 10) || DEFAULT_LIMIT;
      i++;
    } else if ((args[i] === '--out' || args[i] === '-o') && args[i + 1]) {
      output = args[i + 1]!;
      i++;
    }
  }

  return { limit, output };
}

async function main(): Promise<void> {
  const { limit, output } = parseArgs();

  const db = getFirestoreDb();
  if (!db) {
    log.error('Firestore not available. Set GOOGLE_APPLICATION_CREDENTIALS or run in GCP.');
    process.exit(1);
  }

  await mkdir(dirname(output), { recursive: true });
  const stream = createWriteStream(output, { flags: 'w' });

  let totalExamples = 0;
  let totalConversations = 0;
  let skippedShort = 0;
  let skippedQuality = 0;

  try {
    const conversationsSnapshot = await db
      .collectionGroup('conversations')
      .where('turnCount', '>=', MIN_TURNS_PER_CONVERSATION)
      .limit(limit)
      .get();

    for (const convDoc of conversationsSnapshot.docs) {
      // Extract userId from path: bogle_users/{userId}/conversations/{conversationId}
      const pathParts = convDoc.ref.path.split('/');
      const userIdx = pathParts.indexOf('bogle_users');
      const userId = userIdx >= 0 && userIdx + 1 < pathParts.length ? pathParts[userIdx + 1] : null;
      if (!userId) continue;

      const conversationId = convDoc.id;
      const turnsSnapshot = await convDoc.ref.collection('turns').orderBy('timestamp', 'asc').get();

      const turns: TurnRow[] = turnsSnapshot.docs.map((d) => {
        const data = d.data();
        return {
          role: data.role as 'user' | 'assistant',
          content: (data.content as string)?.trim() ?? '',
          timestamp: data.timestamp,
        };
      });

      if (turns.length < 2) {
        skippedShort++;
        continue;
      }

      totalConversations++;

      for (let i = 0; i < turns.length - 1; i++) {
        const userTurn = turns[i];
        const assistantTurn = turns[i + 1];
        if (userTurn?.role !== 'user' || assistantTurn?.role !== 'assistant') continue;
        if (
          userTurn.content.length < MIN_USER_CONTENT_LENGTH ||
          assistantTurn.content.length < MIN_ASSISTANT_CONTENT_LENGTH
        ) {
          skippedQuality++;
          continue;
        }

        const example: SFTExample = {
          messages: [
            { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
            { role: 'user', content: userTurn.content },
            { role: 'assistant', content: assistantTurn.content },
          ],
        };

        stream.write(JSON.stringify(example) + '\n');
        totalExamples++;
      }
    }

    stream.end();
  } catch (err) {
    log.error({ error: String(err) }, 'Export failed');
    stream.destroy();
    process.exit(1);
  }

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  log.info(
    {
      totalExamples,
      totalConversations,
      skippedShort,
      skippedQuality,
      output,
    },
    'Export complete'
  );
}

main().catch((err) => {
  log.error({ error: String(err) }, 'Fatal');
  process.exit(1);
});
