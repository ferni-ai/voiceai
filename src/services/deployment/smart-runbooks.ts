/**
 * Smart Runbooks - AI-Generated Remediation Steps
 *
 * Uses Gemini to analyze incidents and generate:
 * - Root cause analysis
 * - Step-by-step remediation guides
 * - Prevention recommendations
 * - Similar incident references
 *
 * Goes beyond canned responses with intelligent, context-aware guidance.
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { GoogleGenerativeAI } from '@google/generative-ai';

const log = createLogger({ module: 'SmartRunbooks' });

// ============================================================================
// TYPES
// ============================================================================

export interface IncidentContext {
  type: string;
  severity: 'critical' | 'major' | 'minor';
  title: string;
  description: string;
  metrics?: Record<string, number | string>;
  recentEvents?: string[];
  serviceStatus?: Record<string, boolean>;
  environment?: string;
  timestamp: number;
}

export interface RunbookStep {
  order: number;
  action: string;
  command?: string;
  explanation: string;
  verifyCommand?: string;
  expectedOutcome: string;
  rollbackStep?: string;
  estimatedDurationMinutes?: number;
}

export interface Runbook {
  incidentId: string;
  generatedAt: number;
  incidentType: string;
  severity: string;

  // AI-generated content
  summary: string;
  rootCauseAnalysis: string;
  impactAssessment: string;
  steps: RunbookStep[];
  preventionRecommendations: string[];
  relatedIncidents: string[];
  estimatedResolutionMinutes: number;

  // Metadata
  confidence: number; // 0-1
  model: string;
  promptVersion: string;
}

// ============================================================================
// KNOWN INCIDENT PATTERNS
// ============================================================================

interface IncidentPattern {
  pattern: string | RegExp;
  type: string;
  commonCauses: string[];
  quickFixes: string[];
  commands: Array<{ description: string; command: string }>;
}

const KNOWN_PATTERNS: IncidentPattern[] = [
  {
    pattern: /disk.*full|disk.*space|out of space/i,
    type: 'disk_exhaustion',
    commonCauses: [
      'Docker images accumulating',
      'Log files not rotating',
      'Build cache growth',
      'Temporary files not cleaned',
    ],
    quickFixes: ['Remove unused Docker images', 'Clear build cache', 'Rotate and truncate logs'],
    commands: [
      { description: 'Check disk usage', command: 'df -h' },
      { description: 'Find large files', command: 'du -sh /* 2>/dev/null | sort -rh | head -10' },
      { description: 'Prune Docker', command: 'docker system prune -a --volumes -f' },
      { description: 'Clear build cache', command: 'docker builder prune --keep-storage=2GB -f' },
    ],
  },
  {
    pattern: /memory.*high|oom|out of memory/i,
    type: 'memory_pressure',
    commonCauses: [
      'Memory leak in application',
      'Too many concurrent connections',
      'Large in-memory caches',
      'Unbounded data structures',
    ],
    quickFixes: ['Restart the service', 'Reduce concurrent connections', 'Clear caches'],
    commands: [
      { description: 'Check memory usage', command: 'free -h' },
      { description: 'Find memory-heavy processes', command: 'ps aux --sort=-%mem | head -10' },
      { description: 'Restart container', command: 'docker restart $(docker ps -q)' },
    ],
  },
  {
    pattern: /connection.*failed|timeout|unreachable/i,
    type: 'connectivity_failure',
    commonCauses: [
      'External service outage',
      'Network configuration issue',
      'DNS resolution failure',
      'Rate limiting',
    ],
    quickFixes: [
      'Check external service status',
      'Verify network configuration',
      'Check firewall rules',
    ],
    commands: [
      { description: 'Test DNS', command: 'nslookup api.openai.com' },
      { description: 'Check connectivity', command: 'curl -I https://api.openai.com' },
      { description: 'Check firewall', command: 'iptables -L -n' },
    ],
  },
  {
    pattern: /latency.*high|slow.*response|p99/i,
    type: 'latency_degradation',
    commonCauses: [
      'Database query performance',
      'External API slowdown',
      'Resource contention',
      'Network latency',
    ],
    quickFixes: ['Check database query logs', 'Review recent deployments', 'Scale up resources'],
    commands: [
      { description: 'Check CPU', command: 'top -b -n 1 | head -20' },
      { description: 'Check network', command: 'netstat -an | grep ESTABLISHED | wc -l' },
      { description: 'Check container stats', command: 'docker stats --no-stream' },
    ],
  },
  {
    pattern: /error.*rate|5\d\d.*errors|failures.*spike/i,
    type: 'error_rate_spike',
    commonCauses: [
      'Deployment regression',
      'External dependency failure',
      'Input validation issue',
      'Resource exhaustion',
    ],
    quickFixes: [
      'Roll back recent deployment',
      'Check circuit breaker status',
      'Review error logs',
    ],
    commands: [
      { description: 'Check recent logs', command: 'docker logs --tail 100 $(docker ps -q)' },
      {
        description: 'Check error patterns',
        command: 'docker logs $(docker ps -q) 2>&1 | grep -i error | tail -20',
      },
    ],
  },
];

// ============================================================================
// RUNBOOK GENERATOR
// ============================================================================

let genAI: GoogleGenerativeAI | null = null;

async function initializeGemini(): Promise<void> {
  if (genAI) return;

  // Use centralized Gemini config
  const { getGeminiClient, isGeminiConfigured, getDefaultModel } =
    await import('../../config/gemini-config.js');
  cachedModelName = getDefaultModel(); // Cache the model name

  if (!isGeminiConfigured()) {
    throw new Error('Gemini not configured - check USE_VERTEX_AI and GOOGLE_CLOUD_PROJECT in .env');
  }

  // Cast from unknown to GoogleGenerativeAI (centralized config returns unknown for flexibility)
  const client = await getGeminiClient();
  if (!client) {
    throw new Error('Failed to initialize Gemini client');
  }
  genAI = client as GoogleGenerativeAI;
}

// Cache the model name
let cachedModelName = 'gemini-2.0-flash-exp';

function findMatchingPattern(incident: IncidentContext): IncidentPattern | undefined {
  const searchText = `${incident.title} ${incident.description}`.toLowerCase();

  for (const pattern of KNOWN_PATTERNS) {
    if (pattern.pattern instanceof RegExp) {
      if (pattern.pattern.test(searchText)) return pattern;
    } else {
      if (searchText.includes(pattern.pattern.toLowerCase())) return pattern;
    }
  }

  return undefined;
}

function buildPrompt(incident: IncidentContext, knownPattern?: IncidentPattern): string {
  const contextParts: string[] = [
    `## Incident Details`,
    `- **Type:** ${incident.type}`,
    `- **Severity:** ${incident.severity}`,
    `- **Title:** ${incident.title}`,
    `- **Description:** ${incident.description}`,
    `- **Timestamp:** ${new Date(incident.timestamp).toISOString()}`,
    `- **Environment:** ${incident.environment || 'production'}`,
  ];

  if (incident.metrics && Object.keys(incident.metrics).length > 0) {
    contextParts.push(`\n## Current Metrics`);
    for (const [key, value] of Object.entries(incident.metrics)) {
      contextParts.push(`- ${key}: ${value}`);
    }
  }

  if (incident.serviceStatus && Object.keys(incident.serviceStatus).length > 0) {
    contextParts.push(`\n## Service Status`);
    for (const [service, healthy] of Object.entries(incident.serviceStatus)) {
      contextParts.push(`- ${service}: ${healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    }
  }

  if (incident.recentEvents && incident.recentEvents.length > 0) {
    contextParts.push(`\n## Recent Events`);
    for (const event of incident.recentEvents) {
      contextParts.push(`- ${event}`);
    }
  }

  if (knownPattern) {
    contextParts.push(`\n## Known Pattern Match: ${knownPattern.type}`);
    contextParts.push(`Common causes for this type:`);
    for (const cause of knownPattern.commonCauses) {
      contextParts.push(`- ${cause}`);
    }
    contextParts.push(`\nSuggested commands:`);
    for (const cmd of knownPattern.commands) {
      contextParts.push(`- ${cmd.description}: \`${cmd.command}\``);
    }
  }

  const systemPrompt = `You are an expert SRE/DevOps engineer generating a runbook for an incident.

${contextParts.join('\n')}

Generate a comprehensive runbook in JSON format with the following structure:
{
  "summary": "One-line summary of the incident and resolution approach",
  "rootCauseAnalysis": "Detailed analysis of what likely caused this issue",
  "impactAssessment": "What is affected and how severe is the impact",
  "steps": [
    {
      "order": 1,
      "action": "What to do",
      "command": "shell command if applicable",
      "explanation": "Why this step is necessary",
      "verifyCommand": "How to verify this step worked",
      "expectedOutcome": "What you should see if successful",
      "rollbackStep": "How to undo this step if it fails",
      "estimatedDurationMinutes": 5
    }
  ],
  "preventionRecommendations": ["How to prevent this in the future"],
  "relatedIncidents": ["Similar past incidents or patterns"],
  "estimatedResolutionMinutes": 30,
  "confidence": 0.8
}

Focus on:
1. Safe, reversible steps
2. Clear verification at each step
3. Practical commands that work on GCE/Cloud Run
4. Consideration of the specific metrics and service status provided

Return ONLY valid JSON, no markdown formatting.`;

  return systemPrompt;
}

export async function generateRunbook(
  incident: IncidentContext,
  incidentId?: string
): Promise<Runbook> {
  const id = incidentId || `inc-${Date.now()}`;

  try {
    await initializeGemini();

    if (!genAI) {
      throw new Error('Gemini not initialized');
    }

    const knownPattern = findMatchingPattern(incident);
    const prompt = buildPrompt(incident, knownPattern);

    const model = genAI.getGenerativeModel({
      model: cachedModelName, // From centralized config
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3, // Lower temperature for more consistent output
      },
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON response
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      log.warn({ response: responseText.substring(0, 200) }, 'Failed to parse AI response');
      // Return a basic runbook based on known patterns
      return generateFallbackRunbook(incident, id, knownPattern);
    }

    const runbook: Runbook = {
      incidentId: id,
      generatedAt: Date.now(),
      incidentType: incident.type,
      severity: incident.severity,
      summary: String(parsed.summary || 'No summary available'),
      rootCauseAnalysis: String(parsed.rootCauseAnalysis || 'Analysis not available'),
      impactAssessment: String(parsed.impactAssessment || 'Impact assessment not available'),
      steps: Array.isArray(parsed.steps)
        ? parsed.steps.map((s: Record<string, unknown>, i: number) => ({
            order: Number(s.order) || i + 1,
            action: String(s.action || ''),
            command: s.command ? String(s.command) : undefined,
            explanation: String(s.explanation || ''),
            verifyCommand: s.verifyCommand ? String(s.verifyCommand) : undefined,
            expectedOutcome: String(s.expectedOutcome || ''),
            rollbackStep: s.rollbackStep ? String(s.rollbackStep) : undefined,
            estimatedDurationMinutes: Number(s.estimatedDurationMinutes) || 5,
          }))
        : [],
      preventionRecommendations: Array.isArray(parsed.preventionRecommendations)
        ? parsed.preventionRecommendations.map(String)
        : [],
      relatedIncidents: Array.isArray(parsed.relatedIncidents)
        ? parsed.relatedIncidents.map(String)
        : [],
      estimatedResolutionMinutes: Number(parsed.estimatedResolutionMinutes) || 30,
      confidence: Number(parsed.confidence) || 0.7,
      model: cachedModelName, // From centralized config
      promptVersion: '1.0',
    };

    log.info(
      {
        incidentId: id,
        type: incident.type,
        stepsCount: runbook.steps.length,
        confidence: runbook.confidence,
      },
      '📋 Generated smart runbook'
    );

    return runbook;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to generate AI runbook');
    return generateFallbackRunbook(incident, id, findMatchingPattern(incident));
  }
}

function generateFallbackRunbook(
  incident: IncidentContext,
  incidentId: string,
  pattern?: IncidentPattern
): Runbook {
  const steps: RunbookStep[] = [];

  if (pattern) {
    // Generate steps from known pattern
    pattern.commands.forEach((cmd, i) => {
      steps.push({
        order: i + 1,
        action: cmd.description,
        command: cmd.command,
        explanation: `Standard remediation step for ${pattern.type}`,
        expectedOutcome: 'Command completes successfully',
        estimatedDurationMinutes: 2,
      });
    });
  } else {
    // Generic steps
    steps.push(
      {
        order: 1,
        action: 'Check system status',
        command: 'docker stats --no-stream && df -h && free -h',
        explanation: 'Get current resource usage',
        expectedOutcome: 'Identify resource bottlenecks',
        estimatedDurationMinutes: 1,
      },
      {
        order: 2,
        action: 'Check recent logs',
        command: 'docker logs --tail 100 $(docker ps -q) 2>&1 | grep -i error',
        explanation: 'Look for error patterns',
        expectedOutcome: 'Identify error causes',
        estimatedDurationMinutes: 2,
      },
      {
        order: 3,
        action: 'Restart service if needed',
        command: 'docker restart $(docker ps -q)',
        explanation: 'Quick mitigation attempt',
        expectedOutcome: 'Service recovers',
        rollbackStep: 'Roll back to previous container version',
        estimatedDurationMinutes: 5,
      }
    );
  }

  return {
    incidentId,
    generatedAt: Date.now(),
    incidentType: incident.type,
    severity: incident.severity,
    summary: `Incident: ${incident.title}`,
    rootCauseAnalysis: pattern
      ? `Likely caused by: ${pattern.commonCauses.join(', ')}`
      : 'Root cause analysis requires investigation',
    impactAssessment: `Severity: ${incident.severity}. ${incident.description}`,
    steps,
    preventionRecommendations: pattern?.quickFixes || [
      'Set up monitoring alerts',
      'Review system capacity',
    ],
    relatedIncidents: [],
    estimatedResolutionMinutes: 30,
    confidence: pattern ? 0.6 : 0.4,
    model: 'fallback',
    promptVersion: '1.0',
  };
}

// ============================================================================
// RUNBOOK STORAGE & RETRIEVAL
// ============================================================================

const runbookCache = new Map<string, Runbook>();
const MAX_CACHED_RUNBOOKS = 100;

export function cacheRunbook(runbook: Runbook): void {
  runbookCache.set(runbook.incidentId, runbook);

  // Trim old runbooks
  if (runbookCache.size > MAX_CACHED_RUNBOOKS) {
    const oldest = Array.from(runbookCache.entries())
      .sort((a, b) => a[1].generatedAt - b[1].generatedAt)
      .slice(0, runbookCache.size - MAX_CACHED_RUNBOOKS);

    for (const [id] of oldest) {
      runbookCache.delete(id);
    }
  }
}

export function getRunbook(incidentId: string): Runbook | undefined {
  return runbookCache.get(incidentId);
}

export function getRecentRunbooks(limit = 10): Runbook[] {
  return Array.from(runbookCache.values())
    .sort((a, b) => b.generatedAt - a.generatedAt)
    .slice(0, limit);
}

// ============================================================================
// QUICK RUNBOOK GENERATION
// ============================================================================

/**
 * Generate a quick runbook for common incident types
 */
export async function getQuickRunbook(
  incidentType: string,
  context?: Partial<IncidentContext>
): Promise<Runbook> {
  const incident: IncidentContext = {
    type: incidentType,
    severity: context?.severity || 'major',
    title: context?.title || incidentType.replace(/_/g, ' '),
    description: context?.description || `${incidentType} incident`,
    metrics: context?.metrics,
    serviceStatus: context?.serviceStatus,
    timestamp: Date.now(),
  };

  const runbook = await generateRunbook(incident);
  cacheRunbook(runbook);
  return runbook;
}
