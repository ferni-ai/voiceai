#!/usr/bin/env npx tsx
/**
 * Cost Optimization
 * 
 * AI-powered cloud cost analysis and optimization.
 * 
 * @module @ferni/cli/costs-ai
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));
const GCP_PROJECT = 'johnb-2025';

// Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
};

// Gemini API
async function callGemini(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// OPTIMIZE
// =============================================================================

const OPTIMIZE_PROMPT = `You are a GCP cost optimization expert.

Analyze the resource usage and suggest optimizations:
1. Right-sizing opportunities (over-provisioned resources)
2. Idle resources to shut down
3. Reserved capacity vs on-demand
4. Caching opportunities
5. API call reduction strategies

For each suggestion:
- Estimated monthly savings
- Implementation effort (Easy/Medium/Hard)
- Risk level
- Steps to implement

Prioritize by savings/effort ratio.`;

async function optimize(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}💡 Cost Optimization Suggestions${colors.reset}\n`);

  log.info('Gathering resource usage data...');

  let resourceData = '';

  // Cloud Run services
  try {
    const services = execSync(
      `gcloud run services list --format="table(SERVICE,REGION,URL)" --project=${GCP_PROJECT} 2>/dev/null`,
      { encoding: 'utf8' }
    ).trim();
    resourceData += `\n## Cloud Run Services\n${services}\n`;
  } catch {
    resourceData += '\n## Cloud Run Services\nUnable to fetch\n';
  }

  // Get revision details
  try {
    const revisions = execSync(
      `gcloud run revisions list --service=voiceai-agent --region=us-central1 --format="table(REVISION,ACTIVE,SERVICE_ACCOUNT)" --project=${GCP_PROJECT} 2>/dev/null | head -10`,
      { encoding: 'utf8' }
    ).trim();
    resourceData += `\n## Active Revisions\n${revisions}\n`;
  } catch {
    // Ignore
  }

  // Firestore usage (estimate)
  resourceData += '\n## Firestore\nDatabase in use for user data and trust profiles\n';

  // Storage
  try {
    const buckets = execSync(
      `gsutil ls -L gs://${GCP_PROJECT}.appspot.com 2>/dev/null | head -20`,
      { encoding: 'utf8' }
    ).trim();
    resourceData += `\n## Cloud Storage\n${buckets}\n`;
  } catch {
    resourceData += '\n## Cloud Storage\nUnable to fetch\n';
  }

  // API usage from env
  const apis = [
    { name: 'LiveKit', env: 'LIVEKIT_URL' },
    { name: 'Cartesia TTS', env: 'CARTESIA_API_KEY' },
    { name: 'Gemini', env: 'GOOGLE_API_KEY' },
    { name: 'Deepgram', env: 'DEEPGRAM_API_KEY' },
  ];

  resourceData += '\n## External APIs\n';
  apis.forEach(api => {
    const enabled = !!process.env[api.env];
    resourceData += `${api.name}: ${enabled ? 'Enabled' : 'Disabled'}\n`;
  });

  if (!process.env.GOOGLE_API_KEY) {
    // Show manual analysis without AI
    console.log(`${colors.bold}Resource Overview:${colors.reset}`);
    console.log(resourceData);
    
    console.log(`\n${colors.bold}Quick Wins:${colors.reset}\n`);
    console.log(`  1. ${colors.green}Delete unused Cloud Run revisions${colors.reset}`);
    console.log(`     gcloud run revisions list --service=voiceai-agent --region=us-central1`);
    console.log(`     gcloud run revisions delete <old-revision>`);
    console.log();
    console.log(`  2. ${colors.green}Set min-instances to 0 for dev${colors.reset}`);
    console.log(`     Only keep min-instances for production traffic`);
    console.log();
    console.log(`  3. ${colors.green}Use Firestore TTL for temporary data${colors.reset}`);
    console.log(`     Session data, cache entries`);
    console.log();
    console.log(`  4. ${colors.green}Review API usage${colors.reset}`);
    console.log(`     Batch Gemini calls, cache TTS audio`);
    return;
  }

  try {
    const suggestions = await callGemini(
      `Analyze this GCP resource usage and suggest cost optimizations:\n\n${resourceData}`,
      OPTIMIZE_PROMPT
    );

    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(suggestions);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);
  } catch (error) {
    log.error(`Analysis failed: ${error}`);
  }
}

// =============================================================================
// FORECAST
// =============================================================================

async function forecast(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📈 Cost Forecast${colors.reset}\n`);

  log.info('Estimating costs based on current usage...');

  // Cloud Run pricing (approximate)
  const cloudRunPricing = {
    cpuPerVCPUSecond: 0.00002400,
    memoryPerGBSecond: 0.00000250,
    requestsPer1M: 0.40,
    minInstances: 0.00001800, // per vCPU-second when idle
  };

  // Estimate based on typical usage
  const estimates = {
    cloudRun: {
      voiceAgent: { requests: 50000, avgDuration: 30, instances: 2 },
      uiServer: { requests: 200000, avgDuration: 0.2, instances: 1 },
    },
    firestore: { reads: 500000, writes: 50000, storage: 1 }, // GB
    apis: {
      gemini: { calls: 100000, avgTokens: 1000 },
      cartesia: { calls: 30000, avgChars: 500 },
      livekit: { minutes: 5000 },
    },
  };

  // Calculate estimates
  const monthlyEstimates = {
    cloudRun: 0,
    firestore: 0,
    gemini: 0,
    cartesia: 0,
    livekit: 0,
  };

  // Cloud Run
  monthlyEstimates.cloudRun = 
    (estimates.cloudRun.voiceAgent.requests * estimates.cloudRun.voiceAgent.avgDuration * cloudRunPricing.cpuPerVCPUSecond) +
    (estimates.cloudRun.uiServer.requests * estimates.cloudRun.uiServer.avgDuration * cloudRunPricing.cpuPerVCPUSecond) +
    (estimates.cloudRun.voiceAgent.instances * 30 * 24 * 3600 * cloudRunPricing.minInstances);

  // Firestore ($0.06/100k reads, $0.18/100k writes)
  monthlyEstimates.firestore = 
    (estimates.firestore.reads / 100000) * 0.06 +
    (estimates.firestore.writes / 100000) * 0.18 +
    estimates.firestore.storage * 0.18;

  // Gemini ($0.075 per 1M input tokens for Flash)
  monthlyEstimates.gemini = (estimates.apis.gemini.calls * estimates.apis.gemini.avgTokens / 1000000) * 0.075;

  // Cartesia (estimated $0.015 per 1K characters)
  monthlyEstimates.cartesia = (estimates.apis.cartesia.calls * estimates.apis.cartesia.avgChars / 1000) * 0.015;

  // LiveKit (estimated $0.004 per minute)
  monthlyEstimates.livekit = estimates.apis.livekit.minutes * 0.004;

  const total = Object.values(monthlyEstimates).reduce((a, b) => a + b, 0);

  console.log(`${colors.bold}Estimated Monthly Costs:${colors.reset}\n`);
  console.log(`  Cloud Run:     $${monthlyEstimates.cloudRun.toFixed(2)}`);
  console.log(`  Firestore:     $${monthlyEstimates.firestore.toFixed(2)}`);
  console.log(`  Gemini API:    $${monthlyEstimates.gemini.toFixed(2)}`);
  console.log(`  Cartesia TTS:  $${monthlyEstimates.cartesia.toFixed(2)}`);
  console.log(`  LiveKit:       $${monthlyEstimates.livekit.toFixed(2)}`);
  console.log(`${colors.dim}${'─'.repeat(30)}${colors.reset}`);
  console.log(`  ${colors.bold}Total:          $${total.toFixed(2)}/month${colors.reset}`);
  console.log();

  // Growth projection
  console.log(`${colors.bold}Growth Projections:${colors.reset}\n`);
  console.log(`  Current:   $${total.toFixed(0)}/month`);
  console.log(`  2x users:  $${(total * 1.8).toFixed(0)}/month`);
  console.log(`  5x users:  $${(total * 4).toFixed(0)}/month`);
  console.log(`  10x users: $${(total * 7).toFixed(0)}/month`);
  console.log();

  log.info('Note: These are rough estimates. Check Cloud Console for actual billing.');
}

// =============================================================================
// ALERT
// =============================================================================

async function setupAlert(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔔 Cost Alerts${colors.reset}\n`);

  console.log(`${colors.bold}To set up budget alerts:${colors.reset}\n`);
  
  console.log(`  1. ${colors.green}GCP Console Method:${colors.reset}`);
  console.log(`     → Go to Billing → Budgets & alerts`);
  console.log(`     → Create budget with email notifications`);
  console.log();
  
  console.log(`  2. ${colors.green}CLI Method:${colors.reset}`);
  console.log(`     ${colors.cyan}gcloud billing budgets create \\`);
  console.log(`       --billing-account=BILLING_ACCOUNT_ID \\`);
  console.log(`       --display-name="Ferni Monthly Budget" \\`);
  console.log(`       --budget-amount=100 \\`);
  console.log(`       --threshold-rules-percent=50,80,100${colors.reset}`);
  console.log();

  console.log(`  3. ${colors.green}Recommended Thresholds:${colors.reset}`);
  console.log(`     50% - Early warning`);
  console.log(`     80% - Review usage`);
  console.log(`     100% - Immediate action`);
  console.log();

  console.log(`${colors.dim}Note: You can also set up Slack/PagerDuty alerts via Cloud Monitoring${colors.reset}`);
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleCostsAI(args: string[]): Promise<void> {
  const subcommand = args[0] || 'optimize';

  switch (subcommand) {
    case 'optimize':
      await optimize();
      break;
    
    case 'forecast':
      await forecast();
      break;
    
    case 'alert':
    case 'alerts':
      await setupAlert();
      break;
    
    default:
      console.log(`${colors.bold}Cost Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}optimize${colors.reset}   AI-powered cost optimization suggestions`);
      console.log(`  ${colors.cyan}forecast${colors.reset}   Estimate monthly costs`);
      console.log(`  ${colors.cyan}alert${colors.reset}      Set up cost alerts`);
      console.log();
      console.log(`${colors.dim}Examples:${colors.reset}`);
      console.log(`  ferni costs-ai optimize`);
      console.log(`  ferni costs-ai forecast`);
  }
}

