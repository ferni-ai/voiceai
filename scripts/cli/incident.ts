#!/usr/bin/env npx tsx
/**
 * Production Incident Response
 * 
 * Automates incident management, diagnosis, and postmortems.
 * 
 * @module @ferni/cli/incident
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));
const INCIDENTS_DIR = join(PROJECT_ROOT, '.incidents');

// Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
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
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// INCIDENT START
// =============================================================================

interface Incident {
  id: string;
  title: string;
  severity: 'P1' | 'P2' | 'P3';
  startTime: string;
  status: 'active' | 'resolved' | 'postmortem';
  timeline: { time: string; event: string }[];
  logs: string[];
  metrics: Record<string, any>;
}

function generateIncidentId(): string {
  const now = new Date();
  return `INC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

async function startIncident(): Promise<void> {
  console.log(`\n${colors.bold}${colors.red}🚨 Start Incident${colors.reset}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

  const title = await question(`${colors.cyan}Incident title: ${colors.reset}`);
  const severity = await question(`${colors.cyan}Severity (P1/P2/P3): ${colors.reset}`) as 'P1' | 'P2' | 'P3';

  const incident: Incident = {
    id: generateIncidentId(),
    title,
    severity: severity || 'P2',
    startTime: new Date().toISOString(),
    status: 'active',
    timeline: [{ time: new Date().toISOString(), event: 'Incident started' }],
    logs: [],
    metrics: {},
  };

  // Create incidents directory
  if (!existsSync(INCIDENTS_DIR)) {
    mkdirSync(INCIDENTS_DIR, { recursive: true });
  }

  // Capture initial state
  log.info('Capturing system state...');

  // Get recent logs
  try {
    const logs = execSync(
      `gcloud logging read "resource.type=cloud_run_revision AND severity>=WARNING" --limit=50 --format="value(timestamp,textPayload)" 2>/dev/null || echo "No logs available"`,
      { encoding: 'utf8', cwd: PROJECT_ROOT }
    ).trim();
    incident.logs.push(logs);
  } catch {
    incident.logs.push('Failed to fetch logs');
  }

  // Get service status
  try {
    const services = execSync(
      `gcloud run services list --format="table(SERVICE,REGION,URL,LAST_DEPLOYED_BY)" 2>/dev/null || echo "No services"`,
      { encoding: 'utf8', cwd: PROJECT_ROOT }
    ).trim();
    incident.metrics['services'] = services;
  } catch {
    // Ignore
  }

  // Save incident
  const incidentPath = join(INCIDENTS_DIR, `${incident.id}.json`);
  writeFileSync(incidentPath, JSON.stringify(incident, null, 2));

  console.log(`\n${colors.bold}${colors.green}Incident Created: ${incident.id}${colors.reset}\n`);
  console.log(`  Title: ${incident.title}`);
  console.log(`  Severity: ${incident.severity}`);
  console.log(`  Started: ${incident.startTime}`);
  console.log(`\n  File: ${incidentPath}`);

  // Slack notification (placeholder)
  console.log(`\n${colors.bold}Slack Message (copy):${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
  console.log(`🚨 *${incident.severity} Incident Started*: ${incident.title}`);
  console.log(`ID: ${incident.id}`);
  console.log(`Time: ${incident.startTime}`);
  console.log(`Status: Investigating`);
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);

  rl.close();
}

// =============================================================================
// DIAGNOSE
// =============================================================================

const DIAGNOSE_PROMPT = `You are Ferni's SRE AI, diagnosing production incidents.

Analyze the provided logs and metrics to:
1. Identify the root cause
2. Assess impact (users affected, services down)
3. Suggest immediate fixes
4. Recommend preventive measures

Be systematic and thorough. Prioritize actionable insights.
If you see patterns, correlate them across services.`;

async function diagnoseIncident(incidentId?: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔬 AI Incident Diagnosis${colors.reset}\n`);

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  // Find incident
  let incident: Incident | null = null;
  
  if (incidentId) {
    const incidentPath = join(INCIDENTS_DIR, `${incidentId}.json`);
    if (existsSync(incidentPath)) {
      incident = JSON.parse(readFileSync(incidentPath, 'utf8'));
    }
  } else {
    // Get most recent active incident
    if (existsSync(INCIDENTS_DIR)) {
      const files = execSync(`ls -t ${INCIDENTS_DIR}/*.json 2>/dev/null || echo ""`, { encoding: 'utf8' }).trim().split('\n');
      for (const file of files) {
        if (file) {
          const data = JSON.parse(readFileSync(file, 'utf8'));
          if (data.status === 'active') {
            incident = data;
            break;
          }
        }
      }
    }
  }

  // Gather fresh data
  log.info('Gathering diagnostic data...');

  let diagnosticData = '';

  // Recent error logs
  try {
    const errorLogs = execSync(
      `gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=100 --format="value(timestamp,textPayload)" 2>/dev/null`,
      { encoding: 'utf8', cwd: PROJECT_ROOT, timeout: 30000 }
    ).trim();
    diagnosticData += `\n## Recent Error Logs\n${errorLogs}\n`;
  } catch {
    diagnosticData += '\n## Recent Error Logs\nUnable to fetch\n';
  }

  // Service health
  try {
    const health = execSync(
      `curl -s https://app.ferni.ai/health 2>/dev/null || echo '{"status":"unknown"}'`,
      { encoding: 'utf8', timeout: 10000 }
    ).trim();
    diagnosticData += `\n## Health Check\n${health}\n`;
  } catch {
    diagnosticData += '\n## Health Check\nUnable to reach\n';
  }

  // Recent deployments
  try {
    const deployments = execSync(
      `gcloud run revisions list --service=voiceai-agent --region=us-central1 --limit=5 --format="table(REVISION,ACTIVE,DEPLOYED)" 2>/dev/null`,
      { encoding: 'utf8', timeout: 15000 }
    ).trim();
    diagnosticData += `\n## Recent Deployments\n${deployments}\n`;
  } catch {
    diagnosticData += '\n## Recent Deployments\nUnable to fetch\n';
  }

  if (incident) {
    diagnosticData += `\n## Incident Info\nID: ${incident.id}\nTitle: ${incident.title}\nSeverity: ${incident.severity}\n`;
    diagnosticData += `\n## Captured Logs\n${incident.logs.join('\n')}\n`;
  }

  try {
    const diagnosis = await callGemini(
      `Diagnose this production incident:\n\n${diagnosticData}`,
      DIAGNOSE_PROMPT
    );

    console.log(`\n${colors.bold}AI Diagnosis:${colors.reset}\n`);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(diagnosis);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Update incident timeline
    if (incident) {
      incident.timeline.push({
        time: new Date().toISOString(),
        event: 'AI diagnosis completed',
      });
      const incidentPath = join(INCIDENTS_DIR, `${incident.id}.json`);
      writeFileSync(incidentPath, JSON.stringify(incident, null, 2));
    }
  } catch (error) {
    log.error(`Diagnosis failed: ${error}`);
  }
}

// =============================================================================
// POSTMORTEM
// =============================================================================

const POSTMORTEM_PROMPT = `You are Ferni's SRE AI, writing blameless postmortems.

Create a comprehensive postmortem that includes:
1. Executive Summary
2. Timeline of Events
3. Root Cause Analysis (use 5 Whys)
4. Impact Assessment
5. What Went Well
6. What Went Wrong
7. Action Items (with owners and due dates)
8. Lessons Learned

Be thorough but concise. Focus on learning, not blaming.
Use specific times and technical details where available.`;

async function generatePostmortem(incidentId: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📝 Generate Postmortem${colors.reset}\n`);

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  const incidentPath = join(INCIDENTS_DIR, `${incidentId}.json`);
  if (!existsSync(incidentPath)) {
    log.error(`Incident not found: ${incidentId}`);
    return;
  }

  const incident: Incident = JSON.parse(readFileSync(incidentPath, 'utf8'));

  log.info(`Generating postmortem for ${incident.id}: ${incident.title}`);

  try {
    const postmortem = await callGemini(
      `Generate a postmortem for this incident:\n\n${JSON.stringify(incident, null, 2)}`,
      POSTMORTEM_PROMPT
    );

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(postmortem);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Save postmortem
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${colors.cyan}Save postmortem? (y/n): ${colors.reset}`, resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y') {
      const postmortemPath = join(INCIDENTS_DIR, `${incident.id}-postmortem.md`);
      writeFileSync(postmortemPath, postmortem);
      
      // Update incident status
      incident.status = 'postmortem';
      writeFileSync(incidentPath, JSON.stringify(incident, null, 2));
      
      log.success(`Saved to ${postmortemPath}`);
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// LIST INCIDENTS
// =============================================================================

function listIncidents(): void {
  console.log(`\n${colors.bold}${colors.cyan}📋 Incidents${colors.reset}\n`);

  if (!existsSync(INCIDENTS_DIR)) {
    log.info('No incidents recorded');
    return;
  }

  try {
    const files = execSync(`ls -t ${INCIDENTS_DIR}/*.json 2>/dev/null`, { encoding: 'utf8' }).trim().split('\n');
    
    for (const file of files) {
      if (file && !file.includes('postmortem')) {
        const incident: Incident = JSON.parse(readFileSync(file, 'utf8'));
        const statusColor = incident.status === 'active' ? colors.red : colors.green;
        console.log(`  ${statusColor}●${colors.reset} ${incident.id} - ${incident.title} [${incident.severity}] (${incident.status})`);
      }
    }
  } catch {
    log.info('No incidents recorded');
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleIncident(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'start':
    case 'new':
      await startIncident();
      break;
    
    case 'diagnose':
    case 'analyze':
      await diagnoseIncident(args[1]);
      break;
    
    case 'postmortem':
    case 'pm':
      const incidentId = args[1];
      if (!incidentId) {
        log.error('Usage: ferni incident postmortem <incident-id>');
        return;
      }
      await generatePostmortem(incidentId);
      break;
    
    case 'list':
      listIncidents();
      break;
    
    default:
      console.log(`${colors.bold}Incident Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}start${colors.reset}       Start new incident`);
      console.log(`  ${colors.cyan}diagnose${colors.reset}    AI diagnosis of active incident`);
      console.log(`  ${colors.cyan}postmortem${colors.reset}  Generate postmortem report`);
      console.log(`  ${colors.cyan}list${colors.reset}        List all incidents`);
      console.log();
      console.log(`${colors.dim}Examples:${colors.reset}`);
      console.log(`  ferni incident start`);
      console.log(`  ferni incident diagnose`);
      console.log(`  ferni incident postmortem INC-20241213-1430`);
  }
}

