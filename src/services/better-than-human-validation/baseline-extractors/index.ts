/**
 * Human Baseline Data Extractors
 *
 * Utilities for extracting baseline conversation data from public datasets.
 * Used for A/B testing Ferni against human conversation patterns.
 *
 * @module better-than-human-validation/baseline-extractors
 */

// DailyDialog - Commitment detection, emotional examples
export {
  extractCommitments,
  extractEmotionalExamples,
  getStrongCommitmentsOnly,
  getExamplesByEmotion,
  toCommitmentTestCases,
  toEmotionalTestCases,
  runSampleExtraction,
  SAMPLE_CONVERSATIONS,
  type DailyDialogConversation,
  type DailyDialogUtterance,
  type CommitmentExample,
  type EmotionalExample,
} from './dailydialog-extractor.js';

// Dataset Downloader - HuggingFace integration
export {
  downloadDailyDialog,
  downloadEmpatheticDialogues,
  processDailyDialogForCommitments,
  processEmpatheticDialoguesForEmotion,
  type DownloadedDataset,
  type DailyDialogRecord,
  type EmpatheticDialogRecord,
} from './dataset-downloader.js';

// Future extractors:
// export * from './reddit-aita-extractor.js';
// export * from './crisis-textline-extractor.js';
