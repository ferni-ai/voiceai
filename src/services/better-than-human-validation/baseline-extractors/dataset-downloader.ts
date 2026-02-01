/**
 * Dataset Downloader for BTH Baselines
 *
 * Downloads and processes conversation datasets from HuggingFace
 * for use in BTH capability benchmarking.
 *
 * Supported datasets:
 * - DailyDialog: Multi-turn conversations with emotion/act labels
 * - EmpatheticDialogues: Empathetic response dataset
 *
 * Usage:
 *   npx tsx src/services/better-than-human-validation/baseline-extractors/dataset-downloader.ts
 *
 * @module better-than-human-validation/baseline-extractors
 */

import { createLogger } from '../../../utils/safe-logger.js';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger({ module: 'DatasetDownloader' });

// ============================================================================
// TYPES
// ============================================================================

export interface DownloadedDataset {
  name: string;
  version: string;
  downloadedAt: string;
  recordCount: number;
  filePath: string;
}

export interface DailyDialogRecord {
  dialog: string[];
  act: number[];
  emotion: number[];
}

export interface EmpatheticDialogRecord {
  conv_id: string;
  utterance_idx: number;
  context: string;
  prompt: string;
  speaker_idx: number;
  utterance: string;
  selfeval: string;
  tags: string;
}

// ============================================================================
// HUGGINGFACE API
// ============================================================================

const HUGGINGFACE_API = 'https://datasets-server.huggingface.co';

/**
 * Fetch dataset info from HuggingFace
 */
async function fetchDatasetInfo(datasetId: string): Promise<{
  splits: string[];
  features: Record<string, unknown>;
}> {
  const url = `${HUGGINGFACE_API}/info?dataset=${encodeURIComponent(datasetId)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset info: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    splits: Object.keys(data.dataset_info?.default?.splits || {}),
    features: data.dataset_info?.default?.features || {},
  };
}

/**
 * Fetch dataset rows from HuggingFace
 */
async function fetchDatasetRows<T>(
  datasetId: string,
  split: string,
  offset: number = 0,
  length: number = 100
): Promise<{ rows: T[]; total: number }> {
  const url = `${HUGGINGFACE_API}/rows?dataset=${encodeURIComponent(datasetId)}&config=default&split=${split}&offset=${offset}&length=${length}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset rows: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    rows: data.rows?.map((r: { row: T }) => r.row) || [],
    total: data.num_rows_total || 0,
  };
}

// ============================================================================
// DATASET DOWNLOADERS
// ============================================================================

/**
 * Download DailyDialog dataset
 */
export async function downloadDailyDialog(
  outputDir: string,
  maxRecords: number = 1000
): Promise<DownloadedDataset> {
  const datasetId = 'li2017dailydialog/daily_dialog';
  log.info({ datasetId, maxRecords }, 'Downloading DailyDialog dataset');

  const records: DailyDialogRecord[] = [];
  let offset = 0;
  const batchSize = 100;

  while (records.length < maxRecords) {
    const remaining = maxRecords - records.length;
    const fetchSize = Math.min(batchSize, remaining);

    const { rows, total } = await fetchDatasetRows<DailyDialogRecord>(
      datasetId,
      'train',
      offset,
      fetchSize
    );

    if (rows.length === 0) break;

    records.push(...rows);
    offset += rows.length;

    log.debug({ fetched: records.length, total }, 'Progress');

    if (offset >= total) break;

    // Rate limiting
    await new Promise((r) => setTimeout(r, 100));
  }

  // Save to file
  const outputPath = path.join(outputDir, 'dailydialog.json');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));

  log.info({ recordCount: records.length, outputPath }, 'DailyDialog download complete');

  return {
    name: 'DailyDialog',
    version: '1.0',
    downloadedAt: new Date().toISOString(),
    recordCount: records.length,
    filePath: outputPath,
  };
}

/**
 * Download EmpatheticDialogues dataset
 */
export async function downloadEmpatheticDialogues(
  outputDir: string,
  maxRecords: number = 1000
): Promise<DownloadedDataset> {
  const datasetId = 'facebook/empathetic_dialogues';
  log.info({ datasetId, maxRecords }, 'Downloading EmpatheticDialogues dataset');

  const records: EmpatheticDialogRecord[] = [];
  let offset = 0;
  const batchSize = 100;

  while (records.length < maxRecords) {
    const remaining = maxRecords - records.length;
    const fetchSize = Math.min(batchSize, remaining);

    try {
      const { rows, total } = await fetchDatasetRows<EmpatheticDialogRecord>(
        datasetId,
        'train',
        offset,
        fetchSize
      );

      if (rows.length === 0) break;

      records.push(...rows);
      offset += rows.length;

      log.debug({ fetched: records.length, total }, 'Progress');

      if (offset >= total) break;
    } catch (error) {
      log.warn({ error: String(error), offset }, 'Fetch error, retrying...');
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 100));
  }

  // Save to file
  const outputPath = path.join(outputDir, 'empathetic_dialogues.json');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));

  log.info({ recordCount: records.length, outputPath }, 'EmpatheticDialogues download complete');

  return {
    name: 'EmpatheticDialogues',
    version: '1.0',
    downloadedAt: new Date().toISOString(),
    recordCount: records.length,
    filePath: outputPath,
  };
}

// ============================================================================
// PROCESSING FUNCTIONS
// ============================================================================

/**
 * Process DailyDialog into commitment test cases
 */
export function processDailyDialogForCommitments(records: DailyDialogRecord[]): Array<{
  id: string;
  input: string;
  context: string[];
  expectedCommitment: boolean;
  utterance: string;
  emotion: number;
}> {
  const testCases: Array<{
    id: string;
    input: string;
    context: string[];
    expectedCommitment: boolean;
    utterance: string;
    emotion: number;
  }> = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    for (let j = 0; j < record.dialog.length; j++) {
      // Dialog act 4 = commissive (commitment)
      const isCommitment = record.act[j] === 4;

      // Only include some non-commitments for balance
      if (!isCommitment && Math.random() > 0.1) continue;

      const context = record.dialog.slice(Math.max(0, j - 3), j);
      const utterance = record.dialog[j];

      testCases.push({
        id: `dd_${i}_${j}`,
        input: [...context, utterance].join(' '),
        context,
        expectedCommitment: isCommitment,
        utterance,
        emotion: record.emotion[j],
      });
    }
  }

  return testCases;
}

/**
 * Process EmpatheticDialogues for emotional understanding
 */
export function processEmpatheticDialoguesForEmotion(records: EmpatheticDialogRecord[]): Array<{
  id: string;
  context: string;
  prompt: string;
  response: string;
  emotion: string;
}> {
  // Group by conversation
  const conversations = new Map<string, EmpatheticDialogRecord[]>();

  for (const record of records) {
    const existing = conversations.get(record.conv_id) || [];
    existing.push(record);
    conversations.set(record.conv_id, existing);
  }

  const testCases: Array<{
    id: string;
    context: string;
    prompt: string;
    response: string;
    emotion: string;
  }> = [];

  for (const [convId, turns] of conversations) {
    // Sort by utterance index
    turns.sort((a, b) => a.utterance_idx - b.utterance_idx);

    // Extract user prompt and empathetic response pairs
    for (let i = 0; i < turns.length - 1; i++) {
      const userTurn = turns[i];
      const responseTurn = turns[i + 1];

      if (userTurn.speaker_idx === 0 && responseTurn.speaker_idx === 1) {
        testCases.push({
          id: `ed_${convId}_${i}`,
          context: userTurn.context || '',
          prompt: userTurn.utterance,
          response: responseTurn.utterance,
          emotion: userTurn.tags || 'neutral',
        });
      }
    }
  }

  return testCases;
}

// ============================================================================
// CLI RUNNER
// ============================================================================

async function main() {
  const outputDir = path.join(process.cwd(), 'data', 'bth-baselines');

  log.info('🔄 Downloading BTH baseline datasets...');

  try {
    // Download DailyDialog
    log.info('📥 Downloading DailyDialog (500 records)...');
    const dailyDialog = await downloadDailyDialog(outputDir, 500);
    log.info({ recordCount: dailyDialog.recordCount }, '✅ Downloaded DailyDialog');

    // Download EmpatheticDialogues
    log.info('📥 Downloading EmpatheticDialogues (500 records)...');
    const empathetic = await downloadEmpatheticDialogues(outputDir, 500);
    log.info({ recordCount: empathetic.recordCount }, '✅ Downloaded EmpatheticDialogues');

    // Process into test cases
    log.info('🔧 Processing datasets into test cases...');

    const dailyDialogData = JSON.parse(
      fs.readFileSync(dailyDialog.filePath, 'utf-8')
    ) as DailyDialogRecord[];
    const commitmentCases = processDailyDialogForCommitments(dailyDialogData);

    const empatheticData = JSON.parse(
      fs.readFileSync(empathetic.filePath, 'utf-8')
    ) as EmpatheticDialogRecord[];
    const emotionCases = processEmpatheticDialoguesForEmotion(empatheticData);

    // Save processed test cases
    fs.writeFileSync(
      path.join(outputDir, 'commitment-test-cases.json'),
      JSON.stringify(commitmentCases, null, 2)
    );
    fs.writeFileSync(
      path.join(outputDir, 'emotion-test-cases.json'),
      JSON.stringify(emotionCases, null, 2)
    );

    log.info({ commitmentCount: commitmentCases.length }, '✅ Generated commitment test cases');
    log.info({ emotionCount: emotionCases.length }, '✅ Generated emotion test cases');

    // Summary
    log.info(
      {
        outputDir,
        files: [
          'dailydialog.json',
          'empathetic_dialogues.json',
          'commitment-test-cases.json',
          'emotion-test-cases.json',
        ],
      },
      '📊 Summary - BTH baseline download complete'
    );
    log.info('✨ Done!');
  } catch (error) {
    log.error({ error: String(error) }, '❌ Download failed');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  downloadDailyDialog,
  downloadEmpatheticDialogues,
  processDailyDialogForCommitments,
  processEmpatheticDialoguesForEmotion,
  fetchDatasetInfo,
};
