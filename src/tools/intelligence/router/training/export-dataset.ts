/**
 * Dataset Export
 *
 * Exports training data to various formats for model training.
 *
 * @module tools/intelligence/router/training/export-dataset
 */

import { promises as fs } from 'fs';
import { createLogger } from '../../../../utils/safe-logger.js';
import type {
  TrainingExample,
  ExportOptions,
  DatasetMetadata,
  DEFAULT_EXPORT_OPTIONS,
} from './types.js';

const log = createLogger({ module: 'ftis:export-dataset' });

// ============================================================================
// DATASET EXPORTER
// ============================================================================

export class DatasetExporter {
  private options: ExportOptions;

  constructor(options: Partial<ExportOptions> = {}) {
    this.options = {
      format: 'jsonl',
      includeEmbeddings: false,
      splits: {
        train: 0.8,
        validation: 0.1,
        test: 0.1,
      },
      shuffle: true,
      seed: 42,
      ...options,
    };
  }

  // ==========================================================================
  // EXPORT
  // ==========================================================================

  /**
   * Export dataset to files
   */
  async export(
    examples: TrainingExample[],
    outputDir: string,
    metadata?: DatasetMetadata
  ): Promise<{
    trainPath: string;
    validationPath: string;
    testPath: string;
    metadataPath: string;
    stats: { train: number; validation: number; test: number };
  }> {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Apply max examples limit
    let dataset = this.options.maxExamples ? examples.slice(0, this.options.maxExamples) : examples;

    // Shuffle if requested
    if (this.options.shuffle) {
      dataset = this.shuffleWithSeed(dataset, this.options.seed);
    }

    // Split dataset
    const splits = this.splitDataset(dataset);

    // Export each split
    const trainPath = `${outputDir}/train.${this.getExtension()}`;
    const validationPath = `${outputDir}/validation.${this.getExtension()}`;
    const testPath = `${outputDir}/test.${this.getExtension()}`;
    const metadataPath = `${outputDir}/metadata.json`;

    await this.writeExamples(splits.train, trainPath);
    await this.writeExamples(splits.validation, validationPath);
    await this.writeExamples(splits.test, testPath);

    // Write metadata
    const fullMetadata = {
      ...metadata,
      exportOptions: this.options,
      splits: {
        train: splits.train.length,
        validation: splits.validation.length,
        test: splits.test.length,
      },
      exportedAt: new Date().toISOString(),
    };
    await fs.writeFile(metadataPath, JSON.stringify(fullMetadata, null, 2));

    log.info(
      {
        train: splits.train.length,
        validation: splits.validation.length,
        test: splits.test.length,
        format: this.options.format,
      },
      'Dataset exported'
    );

    return {
      trainPath,
      validationPath,
      testPath,
      metadataPath,
      stats: {
        train: splits.train.length,
        validation: splits.validation.length,
        test: splits.test.length,
      },
    };
  }

  /**
   * Export for HuggingFace datasets format
   */
  async exportHuggingFace(examples: TrainingExample[], outputDir: string): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    // Shuffle and split
    const dataset = this.options.shuffle
      ? this.shuffleWithSeed(examples, this.options.seed)
      : examples;
    const splits = this.splitDataset(dataset);

    // Convert to HuggingFace format
    const hfFormat = (ex: TrainingExample) => ({
      id: ex.id,
      text: ex.query,
      label: ex.selectedTools.join(','),
      persona: ex.personaId,
      emotion: ex.emotion,
      time_of_day: ex.timeOfDay,
      successful: ex.wasSuccessful,
    });

    // Write arrow-compatible JSON
    await fs.writeFile(
      `${outputDir}/train.json`,
      JSON.stringify(splits.train.map(hfFormat), null, 2)
    );
    await fs.writeFile(
      `${outputDir}/validation.json`,
      JSON.stringify(splits.validation.map(hfFormat), null, 2)
    );
    await fs.writeFile(
      `${outputDir}/test.json`,
      JSON.stringify(splits.test.map(hfFormat), null, 2)
    );

    // Write dataset card
    const datasetCard = `---
license: apache-2.0
task_categories:
  - text-classification
language:
  - en
size_categories:
  - 1K<n<10K
---

# Ferni Router Training Dataset

Training data for the Ferni Router Model (tool selection).

## Dataset Structure

- **train**: ${splits.train.length} examples
- **validation**: ${splits.validation.length} examples
- **test**: ${splits.test.length} examples

## Features

- \`text\`: User query
- \`label\`: Selected tool(s), comma-separated
- \`persona\`: Active persona ID
- \`emotion\`: Detected emotion
- \`time_of_day\`: Time category
- \`successful\`: Whether tool call was successful
`;

    await fs.writeFile(`${outputDir}/README.md`, datasetCard);

    log.info({ outputDir }, 'Exported in HuggingFace format');
  }

  // ==========================================================================
  // FORMAT-SPECIFIC WRITERS
  // ==========================================================================

  /**
   * Write examples to file in configured format
   */
  private async writeExamples(examples: TrainingExample[], path: string): Promise<void> {
    switch (this.options.format) {
      case 'jsonl':
        await this.writeJsonl(examples, path);
        break;
      case 'csv':
        await this.writeCsv(examples, path);
        break;
      default:
        await this.writeJsonl(examples, path);
    }
  }

  /**
   * Write as JSON Lines
   */
  private async writeJsonl(examples: TrainingExample[], path: string): Promise<void> {
    const lines = examples.map((ex) => {
      const record = this.prepareForExport(ex);
      return JSON.stringify(record);
    });
    await fs.writeFile(path, lines.join('\n'));
  }

  /**
   * Write as CSV
   */
  private async writeCsv(examples: TrainingExample[], path: string): Promise<void> {
    const headers = [
      'id',
      'query',
      'selected_tools',
      'persona_id',
      'emotion',
      'time_of_day',
      'was_successful',
      'source',
    ];

    const rows = examples.map((ex) => {
      return [
        ex.id,
        this.escapeCsv(ex.query),
        ex.selectedTools.join(';'),
        ex.personaId,
        ex.emotion,
        ex.timeOfDay,
        ex.wasSuccessful ? '1' : '0',
        ex.source,
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    await fs.writeFile(path, csv);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Prepare example for export (remove unwanted fields)
   */
  private prepareForExport(example: TrainingExample): Record<string, unknown> {
    const record: Record<string, unknown> = {
      id: example.id,
      query: example.query,
      selected_tools: example.selectedTools,
      persona_id: example.personaId,
      emotion: example.emotion,
      time_of_day: example.timeOfDay,
      recent_tools: example.recentTools,
      was_successful: example.wasSuccessful,
      source: example.source,
    };

    if (this.options.includeEmbeddings && example.queryEmbedding) {
      record.query_embedding = example.queryEmbedding;
    }

    if (example.userSatisfaction !== undefined) {
      record.user_satisfaction = example.userSatisfaction;
    }

    return record;
  }

  /**
   * Split dataset into train/validation/test
   */
  private splitDataset(examples: TrainingExample[]): {
    train: TrainingExample[];
    validation: TrainingExample[];
    test: TrainingExample[];
  } {
    const trainEnd = Math.floor(examples.length * this.options.splits.train);
    const validationEnd = trainEnd + Math.floor(examples.length * this.options.splits.validation);

    return {
      train: examples.slice(0, trainEnd),
      validation: examples.slice(trainEnd, validationEnd),
      test: examples.slice(validationEnd),
    };
  }

  /**
   * Shuffle array with seed for reproducibility
   */
  private shuffleWithSeed<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    let currentSeed = seed;

    // Simple seeded random
    const random = () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Get file extension for format
   */
  private getExtension(): string {
    switch (this.options.format) {
      case 'jsonl':
        return 'jsonl';
      case 'csv':
        return 'csv';
      case 'parquet':
        return 'parquet';
      case 'tfrecord':
        return 'tfrecord';
      default:
        return 'jsonl';
    }
  }

  /**
   * Escape CSV value
   */
  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick export to JSONL format
 */
export async function exportToJsonl(
  examples: TrainingExample[],
  outputDir: string,
  options?: Partial<ExportOptions>
): Promise<void> {
  const exporter = new DatasetExporter({ ...options, format: 'jsonl' });
  await exporter.export(examples, outputDir);
}

/**
 * Quick export to HuggingFace format
 */
export async function exportToHuggingFace(
  examples: TrainingExample[],
  outputDir: string,
  options?: Partial<ExportOptions>
): Promise<void> {
  const exporter = new DatasetExporter(options);
  await exporter.exportHuggingFace(examples, outputDir);
}
