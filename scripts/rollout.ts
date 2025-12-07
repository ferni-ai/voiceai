#!/usr/bin/env npx tsx
/**
 * Feature Rollout CLI
 * 
 * Manage feature rollouts from the command line.
 * 
 * Usage:
 *   npx tsx scripts/rollout.ts start new-voice-model --preset=standard
 *   npx tsx scripts/rollout.ts status new-voice-model
 *   npx tsx scripts/rollout.ts advance new-voice-model
 *   npx tsx scripts/rollout.ts rollback new-voice-model --reason="High error rate"
 *   npx tsx scripts/rollout.ts list
 */

const API_URL = process.env.API_URL || 'http://localhost:3002';
const API_KEY = process.env.ADMIN_API_KEY || process.env.API_KEY || '';

interface RolloutState {
  config: {
    featureId: string;
    stages: number[];
    autoAdvance: boolean;
    autoRollback: boolean;
  };
  stage: string;
  currentPercentage: number;
  startedAt: string;
  metrics: {
    requestCount: number;
    errorRate: number;
    p99LatencyMs: number;
  };
  rollbackReason?: string;
}

// ============================================================================
// API HELPERS
// ============================================================================

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }
  
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }
  
  return response.json() as T;
}

// ============================================================================
// COMMANDS
// ============================================================================

async function startRollout(
  featureId: string,
  preset: string = 'standard',
  options: { autoAdvance?: boolean; autoRollback?: boolean } = {}
): Promise<void> {
  console.log(`\n🚀 Starting rollout for: ${featureId}`);
  console.log(`   Preset: ${preset}`);
  
  const result = await apiRequest<{ rollout: RolloutState }>('POST', '/api/rollouts', {
    featureId,
    preset,
    autoAdvance: options.autoAdvance ?? true,
    autoRollback: options.autoRollback ?? true,
  });
  
  console.log('\n✅ Rollout started!');
  printRolloutStatus(result.rollout);
}

async function getRolloutStatus(featureId: string): Promise<void> {
  const result = await apiRequest<{ rollout: RolloutState }>(
    'GET',
    `/api/rollouts/${encodeURIComponent(featureId)}`
  );
  
  printRolloutStatus(result.rollout);
}

async function advanceRollout(featureId: string): Promise<void> {
  console.log(`\n⏩ Advancing rollout: ${featureId}`);
  
  const result = await apiRequest<{ rollout: RolloutState }>(
    'POST',
    `/api/rollouts/${encodeURIComponent(featureId)}/advance`
  );
  
  console.log('\n✅ Advanced to next stage!');
  printRolloutStatus(result.rollout);
}

async function rollbackRollout(featureId: string, reason: string): Promise<void> {
  console.log(`\n⚠️ Rolling back: ${featureId}`);
  console.log(`   Reason: ${reason}`);
  
  const result = await apiRequest<{ rollout: RolloutState }>(
    'POST',
    `/api/rollouts/${encodeURIComponent(featureId)}/rollback`,
    { reason }
  );
  
  console.log('\n✅ Rollback complete!');
  printRolloutStatus(result.rollout);
}

async function listRollouts(): Promise<void> {
  const result = await apiRequest<{ rollouts: RolloutState[]; count: number }>(
    'GET',
    '/api/rollouts'
  );
  
  console.log(`\n📋 Active Rollouts (${result.count})`);
  console.log('─'.repeat(60));
  
  if (result.rollouts.length === 0) {
    console.log('No active rollouts');
    return;
  }
  
  for (const rollout of result.rollouts) {
    const emoji = getStageEmoji(rollout.stage);
    console.log(`\n${emoji} ${rollout.config.featureId}`);
    console.log(`   Stage: ${rollout.stage} | ${rollout.currentPercentage}%`);
    console.log(`   Started: ${new Date(rollout.startedAt).toLocaleString()}`);
  }
}

async function listPresets(): Promise<void> {
  const result = await apiRequest<{ presets: Array<{ name: string; stages: number[]; stageMinDurationMs: number }> }>(
    'GET',
    '/api/rollouts/presets'
  );
  
  console.log('\n📦 Available Rollout Presets');
  console.log('─'.repeat(60));
  
  for (const preset of result.presets) {
    console.log(`\n🎯 ${preset.name}`);
    console.log(`   Stages: ${preset.stages.join('% → ')}%`);
    console.log(`   Min duration per stage: ${preset.stageMinDurationMs / 60000} minutes`);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function printRolloutStatus(rollout: RolloutState): void {
  const emoji = getStageEmoji(rollout.stage);
  
  console.log('\n' + '─'.repeat(60));
  console.log(`${emoji} Rollout: ${rollout.config.featureId}`);
  console.log('─'.repeat(60));
  console.log(`   Stage:      ${rollout.stage}`);
  console.log(`   Percentage: ${rollout.currentPercentage}%`);
  console.log(`   Stages:     ${rollout.config.stages.join('% → ')}%`);
  console.log(`   Started:    ${new Date(rollout.startedAt).toLocaleString()}`);
  
  if (rollout.metrics) {
    console.log('\n   📊 Metrics:');
    console.log(`      Requests:    ${rollout.metrics.requestCount}`);
    console.log(`      Error Rate:  ${(rollout.metrics.errorRate * 100).toFixed(2)}%`);
    console.log(`      P99 Latency: ${rollout.metrics.p99LatencyMs}ms`);
  }
  
  if (rollout.rollbackReason) {
    console.log(`\n   ⚠️ Rollback Reason: ${rollout.rollbackReason}`);
  }
  
  console.log('─'.repeat(60));
}

function getStageEmoji(stage: string): string {
  switch (stage) {
    case 'pending': return '⏳';
    case 'validating': return '🔍';
    case 'rolling_out': return '🚀';
    case 'stable': return '✅';
    case 'rolled_back': return '⚠️';
    case 'failed': return '❌';
    default: return '❓';
  }
}

function printUsage(): void {
  console.log(`
Feature Rollout CLI

Usage:
  npx tsx scripts/rollout.ts <command> [options]

Commands:
  start <feature_id> [--preset=<preset>]    Start a new rollout
  status <feature_id>                        Get rollout status
  advance <feature_id>                       Manually advance to next stage
  rollback <feature_id> --reason="<reason>" Rollback a feature
  list                                       List all active rollouts
  presets                                    Show available presets

Presets:
  conservative  - Slow and careful (1%→5%→10%→25%→50%→75%→100%, 30min each)
  standard      - Balanced (5%→25%→50%→100%, 15min each)
  aggressive    - Fast (10%→50%→100%, 5min each)
  canary        - Low traffic only (1%→5%, manual advance)

Environment:
  API_URL         - API base URL (default: http://localhost:3002)
  ADMIN_API_KEY   - Admin API key for authentication

Examples:
  npx tsx scripts/rollout.ts start new-voice-model --preset=standard
  npx tsx scripts/rollout.ts status new-voice-model
  npx tsx scripts/rollout.ts advance new-voice-model
  npx tsx scripts/rollout.ts rollback new-voice-model --reason="High error rate"
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return;
  }
  
  try {
    switch (command) {
      case 'start': {
        const featureId = args[1];
        if (!featureId) {
          console.error('Error: Feature ID required');
          process.exit(1);
        }
        
        const presetArg = args.find(a => a.startsWith('--preset='));
        const preset = presetArg?.split('=')[1] || 'standard';
        
        await startRollout(featureId, preset);
        break;
      }
      
      case 'status': {
        const featureId = args[1];
        if (!featureId) {
          console.error('Error: Feature ID required');
          process.exit(1);
        }
        
        await getRolloutStatus(featureId);
        break;
      }
      
      case 'advance': {
        const featureId = args[1];
        if (!featureId) {
          console.error('Error: Feature ID required');
          process.exit(1);
        }
        
        await advanceRollout(featureId);
        break;
      }
      
      case 'rollback': {
        const featureId = args[1];
        if (!featureId) {
          console.error('Error: Feature ID required');
          process.exit(1);
        }
        
        const reasonArg = args.find(a => a.startsWith('--reason='));
        const reason = reasonArg?.split('=')[1] || 'Manual rollback';
        
        await rollbackRollout(featureId, reason);
        break;
      }
      
      case 'list':
        await listRollouts();
        break;
      
      case 'presets':
        await listPresets();
        break;
      
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

main();

