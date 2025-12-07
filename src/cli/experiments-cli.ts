#!/usr/bin/env node
/**
 * Experiment Management CLI
 *
 * View and manage A/B experiments for persona behavior optimization.
 *
 * Usage:
 *   npx ts-node src/cli/experiments-cli.ts              # Show all experiments
 *   npx ts-node src/cli/experiments-cli.ts status       # Detailed status report
 *   npx ts-node src/cli/experiments-cli.ts results      # Show experiment results
 *   npx ts-node src/cli/experiments-cli.ts create       # Interactive experiment creation
 *   npx ts-node src/cli/experiments-cli.ts start <id>   # Start a draft experiment
 *   npx ts-node src/cli/experiments-cli.ts stop <id>    # Stop a running experiment
 *   npx ts-node src/cli/experiments-cli.ts export       # Export data as JSON
 *
 * @module cli/experiments-cli
 */

import {
  getAgentEvolution,
  initializeAgentEvolution,
  saveAgentEvolutionToFirestore,
  type PersonaExperiment,
  type PersonaEvolutionState,
} from '../intelligence/agent-evolution.js';
import {
  startExperiment,
  getRunningExperiments,
  getExperimentResults,
} from '../services/experiments/integration.js';

// ============================================================================
// COLORS FOR CONSOLE OUTPUT
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

function color(text: string, c: keyof typeof colors): string {
  return `${colors[c]}${text}${colors.reset}`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'running':
      return color(status.toUpperCase(), 'green');
    case 'concluded':
      return color(status.toUpperCase(), 'blue');
    case 'draft':
      return color(status.toUpperCase(), 'yellow');
    case 'analyzing':
      return color(status.toUpperCase(), 'magenta');
    default:
      return status;
  }
}

function winnerColor(winner: string | undefined): string {
  if (!winner) return color('Pending', 'dim');
  if (winner === 'treatment') return color('TREATMENT ✓', 'green');
  if (winner === 'control') return color('CONTROL ✓', 'cyan');
  return color('INCONCLUSIVE', 'yellow');
}

// ============================================================================
// REPORT GENERATORS
// ============================================================================

async function showOverview(): Promise<void> {
  console.log(color('\n🧪 EXPERIMENT DASHBOARD\n', 'bright'));
  console.log(color('═'.repeat(70), 'dim'));

  const engine = getAgentEvolution();
  const states = engine.exportState();

  if (states.size === 0) {
    console.log(color('\n  No experiments found. Create one with: experiments-cli create\n', 'dim'));
    return;
  }

  let totalExperiments = 0;
  let running = 0;
  let concluded = 0;
  let draft = 0;

  for (const [personaId, state] of states) {
    totalExperiments += state.experiments.length;
    running += state.experiments.filter((e) => e.status === 'running').length;
    concluded += state.experiments.filter((e) => e.status === 'concluded').length;
    draft += state.experiments.filter((e) => e.status === 'draft').length;
  }

  // Summary stats
  console.log(color('\n📊 SUMMARY', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log(`  Total Experiments:  ${color(String(totalExperiments), 'cyan')}`);
  console.log(`  Running:            ${color(String(running), 'green')}`);
  console.log(`  Concluded:          ${color(String(concluded), 'blue')}`);
  console.log(`  Draft:              ${color(String(draft), 'yellow')}`);
  console.log(`  Personas Involved:  ${color(String(states.size), 'magenta')}`);

  // List experiments by persona
  console.log(color('\n📋 EXPERIMENTS BY PERSONA', 'bright'));
  console.log(color('─'.repeat(70), 'dim'));

  for (const [personaId, state] of states) {
    if (state.experiments.length === 0) continue;

    console.log(color(`\n  ${personaId.toUpperCase()}`, 'bright'));

    for (const exp of state.experiments) {
      const statusStr = statusColor(exp.status);
      const samples =
        exp.metrics.engagement.controlN + exp.metrics.engagement.treatmentN;
      const samplesStr =
        samples > 0 ? `${samples}/${exp.minimumSampleSize} samples` : 'No data yet';

      console.log(`    • ${exp.name}`);
      console.log(`      ID: ${color(exp.id, 'dim')}  Status: ${statusStr}  (${samplesStr})`);

      if (exp.status === 'concluded') {
        console.log(`      Winner: ${winnerColor(exp.winner)}`);
      }
    }
  }

  console.log('\n');
}

async function showDetailedStatus(): Promise<void> {
  console.log(color('\n🔬 DETAILED EXPERIMENT STATUS\n', 'bright'));
  console.log(color('═'.repeat(70), 'dim'));

  const engine = getAgentEvolution();
  const states = engine.exportState();

  for (const [personaId, state] of states) {
    for (const exp of state.experiments) {
      console.log(color(`\n┌${'─'.repeat(68)}┐`, 'dim'));
      console.log(
        color('│', 'dim') +
          ` ${color(exp.name, 'bright')}`.padEnd(77) +
          color('│', 'dim')
      );
      console.log(color(`├${'─'.repeat(68)}┤`, 'dim'));

      // Basic info
      console.log(
        color('│', 'dim') +
          `  ID:          ${exp.id}`.padEnd(69) +
          color('│', 'dim')
      );
      console.log(
        color('│', 'dim') +
          `  Persona:     ${personaId}`.padEnd(69) +
          color('│', 'dim')
      );
      console.log(
        color('│', 'dim') +
          `  Status:      ${exp.status.toUpperCase()}`.padEnd(69) +
          color('│', 'dim')
      );
      console.log(
        color('│', 'dim') +
          `  Hypothesis:  ${exp.hypothesis.slice(0, 50)}${exp.hypothesis.length > 50 ? '...' : ''}`.padEnd(69) +
          color('│', 'dim')
      );

      // Variants
      console.log(color('│', 'dim') + color('  Control:     ', 'cyan') + `${exp.control.description.slice(0, 45)}`.padEnd(54) + color('│', 'dim'));
      console.log(color('│', 'dim') + color('  Treatment:   ', 'green') + `${exp.treatment.description.slice(0, 45)}`.padEnd(54) + color('│', 'dim'));

      // Traffic allocation
      const trafficPct = `${(exp.trafficAllocation * 100).toFixed(0)}%`;
      console.log(
        color('│', 'dim') +
          `  Traffic:     ${trafficPct} to treatment`.padEnd(69) +
          color('│', 'dim')
      );

      // Metrics
      const { engagement, satisfaction, depth } = exp.metrics;
      console.log(color('│', 'dim') + color('  ─ Metrics ─', 'bright').padEnd(78) + color('│', 'dim'));

      console.log(
        color('│', 'dim') +
          `  Engagement:  Control: ${engagement.control.toFixed(3)} (n=${engagement.controlN})  Treatment: ${engagement.treatment.toFixed(3)} (n=${engagement.treatmentN})`.padEnd(69) +
          color('│', 'dim')
      );
      console.log(
        color('│', 'dim') +
          `  Satisfaction: Control: ${satisfaction.control.toFixed(3)} (n=${satisfaction.controlN})  Treatment: ${satisfaction.treatment.toFixed(3)} (n=${satisfaction.treatmentN})`.padEnd(69) +
          color('│', 'dim')
      );
      console.log(
        color('│', 'dim') +
          `  Depth:       Control: ${depth.control.toFixed(3)} (n=${depth.controlN})  Treatment: ${depth.treatment.toFixed(3)} (n=${depth.treatmentN})`.padEnd(69) +
          color('│', 'dim')
      );

      // Progress bar
      const totalSamples = engagement.controlN + engagement.treatmentN;
      const progress = Math.min(100, Math.round((totalSamples / exp.minimumSampleSize) * 100));
      const barFilled = Math.round(progress / 5);
      const bar = '█'.repeat(barFilled) + '░'.repeat(20 - barFilled);
      console.log(
        color('│', 'dim') +
          `  Progress:    [${bar}] ${progress}% (${totalSamples}/${exp.minimumSampleSize})`.padEnd(69) +
          color('│', 'dim')
      );

      // Conclusion
      if (exp.status === 'concluded') {
        console.log(color('│', 'dim') + color('  ─ Result ─', 'bright').padEnd(78) + color('│', 'dim'));
        console.log(
          color('│', 'dim') +
            `  Winner:      ${winnerColor(exp.winner)}`.padEnd(78) +
            color('│', 'dim')
        );
        if (exp.winnerConfidence) {
          console.log(
            color('│', 'dim') +
              `  Confidence:  ${(exp.winnerConfidence * 100).toFixed(1)}%`.padEnd(69) +
              color('│', 'dim')
          );
        }

        // Calculate improvement
        const improvement = exp.metrics.engagement.treatment - exp.metrics.engagement.control;
        const improvementStr =
          improvement > 0
            ? color(`+${(improvement * 100).toFixed(1)}%`, 'green')
            : color(`${(improvement * 100).toFixed(1)}%`, 'red');
        console.log(
          color('│', 'dim') +
            `  Improvement: ${improvementStr}`.padEnd(78) +
            color('│', 'dim')
        );
      }

      console.log(color(`└${'─'.repeat(68)}┘`, 'dim'));
    }
  }

  console.log('\n');
}

async function showResults(): Promise<void> {
  console.log(color('\n📈 EXPERIMENT RESULTS\n', 'bright'));
  console.log(color('═'.repeat(70), 'dim'));

  const engine = getAgentEvolution();
  const states = engine.exportState();

  const concludedExperiments: Array<{ personaId: string; exp: PersonaExperiment }> = [];

  for (const [personaId, state] of states) {
    for (const exp of state.experiments.filter((e) => e.status === 'concluded')) {
      concludedExperiments.push({ personaId, exp });
    }
  }

  if (concludedExperiments.length === 0) {
    console.log(color('\n  No concluded experiments yet.\n', 'dim'));
    return;
  }

  // Summary table
  console.log(color('\n  Experiment                    Winner        Improvement   Confidence', 'dim'));
  console.log(color('  ' + '─'.repeat(66), 'dim'));

  for (const { personaId, exp } of concludedExperiments) {
    const name = exp.name.slice(0, 28).padEnd(28);
    const winner = (exp.winner || 'N/A').padEnd(12);
    const improvement = exp.metrics.engagement.treatment - exp.metrics.engagement.control;
    const improvementStr = (improvement > 0 ? '+' : '') + (improvement * 100).toFixed(1) + '%';
    const confidenceStr = exp.winnerConfidence
      ? (exp.winnerConfidence * 100).toFixed(0) + '%'
      : 'N/A';

    const winnerColored =
      exp.winner === 'treatment' ? color(winner, 'green') : color(winner, 'cyan');
    const improvementColored =
      improvement > 0 ? color(improvementStr.padEnd(12), 'green') : color(improvementStr.padEnd(12), 'red');

    console.log(`  ${name}  ${winnerColored}  ${improvementColored}  ${confidenceStr}`);
  }

  // Recommendations
  console.log(color('\n💡 RECOMMENDATIONS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));

  for (const { personaId, exp } of concludedExperiments) {
    if (exp.winner === 'treatment' && exp.treatment.promptModification) {
      console.log(color(`\n  ${exp.name}`, 'green'));
      console.log(`  Adopt this prompt modification for ${personaId}:`);
      console.log(color(`  "${exp.treatment.promptModification}"`, 'dim'));
    }
  }

  console.log('\n');
}

async function createExperiment(): Promise<void> {
  console.log(color('\n🆕 CREATE NEW EXPERIMENT\n', 'bright'));
  console.log(color('═'.repeat(70), 'dim'));

  // Pre-built experiment templates
  const templates = [
    {
      name: 'Humor Frequency Test',
      personaId: 'ferni',
      hypothesis: 'More frequent light humor improves engagement',
      control: { description: 'Current humor frequency' },
      treatment: {
        description: 'Increased humor frequency',
        promptModification:
          'Add a light touch of humor or playfulness to most responses when appropriate. Keep it warm and natural.',
      },
      trafficAllocation: 0.5,
      minimumSampleSize: 100,
    },
    {
      name: 'Storytelling Frequency Test',
      personaId: 'ferni',
      hypothesis: 'More personal stories increase user engagement',
      control: { description: 'Standard storytelling frequency' },
      treatment: {
        description: 'Increased story sharing',
        promptModification:
          'Share brief, relevant personal anecdotes more frequently when they can illustrate a point.',
      },
      trafficAllocation: 0.5,
      minimumSampleSize: 100,
    },
    {
      name: 'Question Style Test',
      personaId: 'ferni',
      hypothesis: 'Open-ended questions lead to deeper conversations',
      control: { description: 'Mix of question types' },
      treatment: {
        description: 'Prioritize open-ended questions',
        promptModification:
          'Prefer open-ended questions that invite reflection (How/What/Tell me) over yes/no questions.',
      },
      trafficAllocation: 0.5,
      minimumSampleSize: 100,
    },
    {
      name: 'Empathy Expression Test',
      personaId: 'ferni',
      hypothesis: 'Explicit empathy statements increase satisfaction',
      control: { description: 'Natural empathy expression' },
      treatment: {
        description: 'Enhanced explicit empathy',
        promptModification:
          'Begin responses to emotional content with explicit empathy ("I hear how hard that is" or "That sounds really challenging").',
      },
      trafficAllocation: 0.5,
      minimumSampleSize: 100,
    },
    {
      name: 'Pacing Test',
      personaId: 'ferni',
      hypothesis: 'Slower, more deliberate responses feel more thoughtful',
      control: { description: 'Standard response pacing' },
      treatment: {
        description: 'More deliberate pacing',
        promptModification:
          'Take a breath before responding. Use "Let me think about that..." or brief pauses when appropriate.',
      },
      trafficAllocation: 0.5,
      minimumSampleSize: 100,
    },
  ];

  console.log(color('\n  Available Templates:\n', 'bright'));

  templates.forEach((t, i) => {
    console.log(`  ${i + 1}. ${color(t.name, 'cyan')}`);
    console.log(`     ${color(t.hypothesis, 'dim')}`);
  });

  console.log(color('\n  To start an experiment:', 'bright'));
  console.log(`  ${color('npx ts-node src/cli/experiments-cli.ts start-template <number>', 'green')}`);
  console.log(`\n  Example: ${color('npx ts-node src/cli/experiments-cli.ts start-template 1', 'dim')}\n`);
}

async function startTemplate(templateIndex: number): Promise<void> {
  const templates = [
    {
      name: 'Humor Frequency Test',
      personaId: 'ferni',
      hypothesis: 'More frequent light humor improves engagement',
      control: { description: 'Current humor frequency' },
      treatment: {
        description: 'Increased humor frequency',
        promptModification:
          'Add a light touch of humor or playfulness to most responses when appropriate. Keep it warm and natural.',
      },
      trafficAllocation: 0.5,
      minimumSampleSize: 100,
    },
    {
      name: 'Storytelling Frequency Test',
      personaId: 'ferni',
      hypothesis: 'More personal stories increase user engagement',
      control: { description: 'Standard storytelling frequency' },
      treatment: {
        description: 'Increased story sharing',
        promptModification:
          'Share brief, relevant personal anecdotes more frequently when they can illustrate a point.',
      },
      trafficAllocation: 0.5,
      minimumSampleSize: 100,
    },
    {
      name: 'Question Style Test',
      personaId: 'ferni',
      hypothesis: 'Open-ended questions lead to deeper conversations',
      control: { description: 'Mix of question types' },
      treatment: {
        description: 'Prioritize open-ended questions',
        promptModification:
          'Prefer open-ended questions that invite reflection (How/What/Tell me) over yes/no questions.',
      },
      trafficAllocation: 0.5,
      minimumSampleSize: 100,
    },
    {
      name: 'Empathy Expression Test',
      personaId: 'ferni',
      hypothesis: 'Explicit empathy statements increase satisfaction',
      control: { description: 'Natural empathy expression' },
      treatment: {
        description: 'Enhanced explicit empathy',
        promptModification:
          'Begin responses to emotional content with explicit empathy ("I hear how hard that is" or "That sounds really challenging").',
      },
      trafficAllocation: 0.5,
      minimumSampleSize: 100,
    },
    {
      name: 'Pacing Test',
      personaId: 'ferni',
      hypothesis: 'Slower, more deliberate responses feel more thoughtful',
      control: { description: 'Standard response pacing' },
      treatment: {
        description: 'More deliberate pacing',
        promptModification:
          'Take a breath before responding. Use "Let me think about that..." or brief pauses when appropriate.',
      },
      trafficAllocation: 0.5,
      minimumSampleSize: 100,
    },
  ];

  if (templateIndex < 1 || templateIndex > templates.length) {
    console.log(color(`\n  Invalid template number. Choose 1-${templates.length}\n`, 'red'));
    return;
  }

  const template = templates[templateIndex - 1];
  console.log(color(`\n🚀 Starting experiment: ${template.name}\n`, 'bright'));

  const experiment = startExperiment(template);

  console.log(color('  ✓ Experiment created and started!', 'green'));
  console.log(`    ID: ${color(experiment.id, 'cyan')}`);
  console.log(`    Status: ${statusColor(experiment.status)}`);
  console.log(`    Traffic: ${(template.trafficAllocation * 100).toFixed(0)}% to treatment`);
  console.log(`    Required samples: ${template.minimumSampleSize}`);
  console.log(
    color(
      '\n  Users will be automatically assigned to control or treatment groups.\n',
      'dim'
    )
  );

  // Save to Firestore
  await saveAgentEvolutionToFirestore();
  console.log(color('  ✓ Saved to Firestore for persistence\n', 'green'));
}

async function exportData(): Promise<void> {
  const engine = getAgentEvolution();
  const states = engine.exportState();

  const exportObj: Record<string, PersonaEvolutionState> = {};
  for (const [personaId, state] of states) {
    exportObj[personaId] = state;
  }

  console.log(JSON.stringify(exportObj, null, 2));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'overview';

  // Initialize evolution engine (loads from Firestore)
  await initializeAgentEvolution();

  switch (command) {
    case 'overview':
    case 'list':
      await showOverview();
      break;

    case 'status':
    case 'details':
      await showDetailedStatus();
      break;

    case 'results':
      await showResults();
      break;

    case 'create':
      await createExperiment();
      break;

    case 'start-template':
      const templateNum = parseInt(args[1], 10);
      if (isNaN(templateNum)) {
        console.log(color('\n  Usage: experiments-cli start-template <number>\n', 'red'));
        process.exit(1);
      }
      await startTemplate(templateNum);
      break;

    case 'export':
      await exportData();
      break;

    case 'help':
    default:
      console.log(color('\n🧪 EXPERIMENT CLI HELP\n', 'bright'));
      console.log(color('═'.repeat(50), 'dim'));
      console.log(`
  Commands:

    ${color('overview', 'cyan')}        Show experiment summary (default)
    ${color('status', 'cyan')}          Show detailed experiment status
    ${color('results', 'cyan')}         Show concluded experiment results
    ${color('create', 'cyan')}          Show available experiment templates
    ${color('start-template <n>', 'cyan')} Start experiment from template
    ${color('export', 'cyan')}          Export all data as JSON
    ${color('help', 'cyan')}            Show this help message

  Examples:

    npx ts-node src/cli/experiments-cli.ts
    npx ts-node src/cli/experiments-cli.ts status
    npx ts-node src/cli/experiments-cli.ts start-template 1
`);
      break;
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(color(`\n  Error: ${error.message}\n`, 'red'));
  process.exit(1);
});

