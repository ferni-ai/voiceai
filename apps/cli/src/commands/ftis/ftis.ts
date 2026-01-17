/**
 * FTIS CLI Commands
 *
 * Manage the Ferni Tool Intelligence System.
 *
 * Commands:
 *   ferni ftis train     - Generate data and train router model
 *   ferni ftis status    - Show FTIS metrics and status
 *   ferni ftis experiment - Manage A/B experiments
 *
 * @module cli/commands/ftis/ftis
 */

import { Command } from 'commander';
import { generateFTISTrainingData } from './generate-training-data.js';
import path from 'path';
import { promises as fs } from 'fs';

const program = new Command();

// ============================================================================
// FTIS TRAIN
// ============================================================================

program
  .command('train')
  .description('Generate training data and train the router model')
  .option('-o, --output <dir>', 'Output directory for training data', './data/ftis-training')
  .option('-n, --examples <number>', 'Examples per tool', '50')
  .option('--skip-generate', 'Skip data generation, use existing data')
  .option('--skip-train', 'Skip model training, only generate data')
  .action(async (options) => {
    console.log('🧠 FTIS Training Pipeline');
    console.log('========================\n');

    // Step 1: Generate training data
    if (!options.skipGenerate) {
      console.log('Step 1: Generating synthetic training data...\n');
      await generateFTISTrainingData({
        outputDir: options.output,
        examplesPerTool: parseInt(options.examples, 10),
        includeTypos: true,
        includeMultiTool: true,
      });
    } else {
      console.log('Step 1: Skipping data generation (--skip-generate)\n');
    }

    // Step 2: Train model (if not skipping)
    if (!options.skipTrain) {
      console.log('\nStep 2: Training router model...\n');
      console.log('⚠️  Model training requires Python environment with GPU.');
      console.log('Run the following commands manually:\n');
      console.log(`  cd apps/ml-training/router`);
      console.log(`  python train.py --data ${path.resolve(options.output)} --output ./models/router-v1`);
      console.log(`  python export_onnx.py --model ./models/router-v1 --output ./models/router-v1/model.onnx\n`);
      console.log('Then upload to GCS:');
      console.log(`  gsutil -m cp -r ./models/router-v1 gs://ferni-models/router/v1/\n`);
    } else {
      console.log('Step 2: Skipping model training (--skip-train)\n');
    }

    console.log('✅ FTIS training pipeline complete!');
  });

// ============================================================================
// FTIS STATUS
// ============================================================================

program
  .command('status')
  .description('Show FTIS system status and metrics')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    console.log('📊 FTIS System Status');
    console.log('====================\n');

    // Check training data
    const dataDir = './data/ftis-training';
    let dataStatus = '❌ Not found';
    try {
      const metadata = JSON.parse(
        await fs.readFile(path.join(dataDir, 'metadata.json'), 'utf-8')
      );
      dataStatus = `✅ ${metadata.totalExamples} examples (${metadata.uniqueTools} tools)`;
    } catch {
      // Data not found
    }

    // Check model status
    const modelDir = './apps/ml-training/router/models/router-v1';
    let modelStatus = '❌ Not trained';
    try {
      await fs.access(path.join(modelDir, 'model.onnx'));
      modelStatus = '✅ ONNX model available';
    } catch {
      // Model not found
    }

    // Check config flags
    let learningStatus = '❌ Disabled';
    try {
      const pipelineCode = await fs.readFile(
        './src/tools/intelligence/learning/learning-pipeline.ts',
        'utf-8'
      );
      if (pipelineCode.includes('autoRetrain: true')) {
        learningStatus = '✅ Enabled';
      }
    } catch {
      // File not found
    }

    // Check A/B experiment
    let experimentStatus = '❌ No active experiment';
    try {
      const abCode = await fs.readFile(
        './src/tools/intelligence/learning/ab-testing.ts',
        'utf-8'
      );
      if (abCode.includes('ftis-v1-rollout')) {
        experimentStatus = '✅ ftis-v1-rollout active';
      }
    } catch {
      // File not found
    }

    if (options.json) {
      console.log(JSON.stringify({
        trainingData: dataStatus.includes('✅'),
        model: modelStatus.includes('✅'),
        learning: learningStatus.includes('✅'),
        experiment: experimentStatus.includes('✅'),
      }, null, 2));
    } else {
      console.log(`Training Data:     ${dataStatus}`);
      console.log(`Router Model:      ${modelStatus}`);
      console.log(`Auto-Learning:     ${learningStatus}`);
      console.log(`A/B Experiment:    ${experimentStatus}`);
      console.log('');
      console.log('Run `ferni ftis train` to generate data and train the model.');
    }
  });

// ============================================================================
// FTIS EXPERIMENT
// ============================================================================

program
  .command('experiment')
  .description('Manage FTIS A/B experiments')
  .argument('<action>', 'Action: create, pause, resume, results')
  .option('--traffic <percent>', 'Traffic percentage for FTIS variant', '50')
  .action(async (action, options) => {
    console.log('🧪 FTIS Experiment Manager');
    console.log('=========================\n');

    switch (action) {
      case 'create':
        console.log(`Creating ftis-v1-rollout experiment with ${options.traffic}% FTIS traffic...`);
        console.log('⚠️  This requires code changes. See the deployment plan.');
        break;

      case 'pause':
        console.log('Pausing FTIS experiment (setting FTIS traffic to 0%)...');
        console.log('⚠️  Update ab-testing.ts to set FTIS variant weight to 0.');
        break;

      case 'resume':
        console.log(`Resuming FTIS experiment with ${options.traffic}% traffic...`);
        console.log('⚠️  Update ab-testing.ts to set FTIS variant weight.');
        break;

      case 'results':
        console.log('Fetching experiment results...');
        console.log('⚠️  Check /api/observability/ftis for live metrics.');
        break;

      default:
        console.log(`Unknown action: ${action}`);
        console.log('Valid actions: create, pause, resume, results');
    }
  });

// ============================================================================
// MAIN
// ============================================================================

export { program as ftisCommand };

// Direct execution
if (process.argv[1]?.includes('ftis.ts') || process.argv[1]?.includes('ftis.js')) {
  program.parse(process.argv);
}
