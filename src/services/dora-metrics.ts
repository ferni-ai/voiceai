/**
 * DORA Metrics Service
 * 
 * Tracks DevOps Research and Assessment (DORA) metrics:
 * 1. Deployment Frequency - How often code is deployed to production
 * 2. Lead Time for Changes - Time from commit to production
 * 3. Mean Time to Recovery (MTTR) - Time to restore service after an incident
 * 4. Change Failure Rate - Percentage of deployments causing failures
 * 
 * Data is persisted to disk and can be populated via:
 * - Webhook from GitHub Actions / Cloud Build
 * - Manual API calls
 * - CLI commands
 */

import fs from 'fs';
import path from 'path';
import { getLogger } from '../utils/safe-logger.js';

const logger = getLogger().child({ service: 'dora-metrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface Deployment {
  id: string;
  timestamp: string;
  commitSha: string;
  commitMessage?: string;
  branch: string;
  environment: 'production' | 'staging' | 'development';
  duration: number; // seconds from commit to deploy
  success: boolean;
  triggeredBy: string; // user or 'ci'
  buildId?: string;
  rollback?: boolean;
  metadata?: Record<string, unknown>;
}

export interface Incident {
  id: string;
  title: string;
  severity: 'critical' | 'major' | 'minor';
  startedAt: string;
  resolvedAt?: string;
  duration?: number; // minutes
  deploymentId?: string; // linked deployment that caused it
  rootCause?: string;
  resolution?: string;
  affectedServices: string[];
}

export interface DORASnapshot {
  // Deployment Frequency
  deploymentsLast24h: number;
  deploymentsLast7d: number;
  deploymentsLast30d: number;
  avgDeploymentsPerWeek: number;
  deploymentFrequencyRating: 'elite' | 'high' | 'medium' | 'low';

  // Lead Time for Changes
  avgLeadTimeHours: number;
  p50LeadTimeHours: number;
  p95LeadTimeHours: number;
  leadTimeRating: 'elite' | 'high' | 'medium' | 'low';

  // Mean Time to Recovery
  avgMttrMinutes: number;
  p50MttrMinutes: number;
  p95MttrMinutes: number;
  mttrRating: 'elite' | 'high' | 'medium' | 'low';

  // Change Failure Rate
  changeFailureRate: number; // percentage
  failedDeploymentsLast30d: number;
  totalDeploymentsLast30d: number;
  cfrRating: 'elite' | 'high' | 'medium' | 'low';

  // Overall
  overallRating: 'elite' | 'high' | 'medium' | 'low';
  lastUpdated: string;

  // Trends (vs previous period)
  trends: {
    deploymentFrequency: number; // percentage change
    leadTime: number;
    mttr: number;
    changeFailureRate: number;
  };
}

interface DORAData {
  deployments: Deployment[];
  incidents: Incident[];
  lastUpdated: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data');
const DORA_FILE = path.join(DATA_DIR, 'dora-metrics.json');

// DORA performance thresholds (based on State of DevOps Report)
const THRESHOLDS = {
  deploymentFrequency: {
    elite: 7, // 7+ per week (daily+)
    high: 1,  // 1-6 per week
    medium: 0.25, // 1-4 per month
    // low: less than monthly
  },
  leadTimeHours: {
    elite: 1,    // < 1 hour
    high: 24,    // < 1 day
    medium: 168, // < 1 week
    // low: > 1 week
  },
  mttrMinutes: {
    elite: 60,    // < 1 hour
    high: 1440,   // < 1 day
    medium: 10080, // < 1 week
    // low: > 1 week
  },
  changeFailureRate: {
    elite: 15, // < 15%
    high: 30,  // 16-30%
    medium: 45, // 31-45%
    // low: > 45%
  },
};

// ============================================================================
// DATA PERSISTENCE
// ============================================================================

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadData(): DORAData {
  ensureDataDir();
  
  if (fs.existsSync(DORA_FILE)) {
    try {
      const content = fs.readFileSync(DORA_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn({ error }, 'Failed to load DORA data, starting fresh');
    }
  }
  
  return {
    deployments: [],
    incidents: [],
    lastUpdated: new Date().toISOString(),
  };
}

function saveData(data: DORAData): void {
  ensureDataDir();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DORA_FILE, JSON.stringify(data, null, 2));
}

// ============================================================================
// METRICS CALCULATION
// ============================================================================

function getRating(
  value: number,
  thresholds: { elite: number; high: number; medium: number },
  lowerIsBetter = true
): 'elite' | 'high' | 'medium' | 'low' {
  if (lowerIsBetter) {
    if (value <= thresholds.elite) return 'elite';
    if (value <= thresholds.high) return 'high';
    if (value <= thresholds.medium) return 'medium';
    return 'low';
  } else {
    if (value >= thresholds.elite) return 'elite';
    if (value >= thresholds.high) return 'high';
    if (value >= thresholds.medium) return 'medium';
    return 'low';
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function calculateMetrics(data: DORAData): DORASnapshot {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Filter deployments by time
  const prodDeployments = data.deployments.filter(d => d.environment === 'production');
  const deploymentsLast24h = prodDeployments.filter(d => new Date(d.timestamp) > oneDayAgo);
  const deploymentsLast7d = prodDeployments.filter(d => new Date(d.timestamp) > sevenDaysAgo);
  const deploymentsLast30d = prodDeployments.filter(d => new Date(d.timestamp) > thirtyDaysAgo);
  const deploymentsPrevious30d = prodDeployments.filter(
    d => new Date(d.timestamp) > sixtyDaysAgo && new Date(d.timestamp) <= thirtyDaysAgo
  );

  // Deployment Frequency
  const avgDeploymentsPerWeek = deploymentsLast30d.length / 4.3;
  const deploymentFrequencyRating = getRating(
    avgDeploymentsPerWeek,
    THRESHOLDS.deploymentFrequency,
    false // higher is better
  );

  // Lead Time for Changes
  const leadTimes = deploymentsLast30d
    .filter(d => d.duration > 0)
    .map(d => d.duration / 3600); // convert to hours
  const avgLeadTimeHours = leadTimes.length > 0
    ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
    : 0;
  const p50LeadTimeHours = percentile(leadTimes, 50);
  const p95LeadTimeHours = percentile(leadTimes, 95);
  const leadTimeRating = getRating(avgLeadTimeHours, THRESHOLDS.leadTimeHours, true);

  // Mean Time to Recovery
  const resolvedIncidents = data.incidents.filter(
    i => i.resolvedAt && new Date(i.startedAt) > thirtyDaysAgo
  );
  const mttrValues = resolvedIncidents
    .filter(i => i.duration !== undefined)
    .map(i => i.duration!);
  const avgMttrMinutes = mttrValues.length > 0
    ? mttrValues.reduce((a, b) => a + b, 0) / mttrValues.length
    : 0;
  const p50MttrMinutes = percentile(mttrValues, 50);
  const p95MttrMinutes = percentile(mttrValues, 95);
  const mttrRating = getRating(avgMttrMinutes, THRESHOLDS.mttrMinutes, true);

  // Change Failure Rate
  const failedDeployments = deploymentsLast30d.filter(d => !d.success || d.rollback);
  const changeFailureRate = deploymentsLast30d.length > 0
    ? (failedDeployments.length / deploymentsLast30d.length) * 100
    : 0;
  const cfrRating = getRating(changeFailureRate, THRESHOLDS.changeFailureRate, true);

  // Overall Rating (average of all ratings)
  const ratingScores = { elite: 4, high: 3, medium: 2, low: 1 };
  const avgScore = (
    ratingScores[deploymentFrequencyRating] +
    ratingScores[leadTimeRating] +
    ratingScores[mttrRating] +
    ratingScores[cfrRating]
  ) / 4;
  const overallRating: 'elite' | 'high' | 'medium' | 'low' =
    avgScore >= 3.5 ? 'elite' :
    avgScore >= 2.5 ? 'high' :
    avgScore >= 1.5 ? 'medium' : 'low';

  // Trends (vs previous 30 days)
  const prevAvgDeploymentsPerWeek = deploymentsPrevious30d.length / 4.3;
  const prevLeadTimes = deploymentsPrevious30d
    .filter(d => d.duration > 0)
    .map(d => d.duration / 3600);
  const prevAvgLeadTime = prevLeadTimes.length > 0
    ? prevLeadTimes.reduce((a, b) => a + b, 0) / prevLeadTimes.length
    : avgLeadTimeHours;
  
  const prevResolvedIncidents = data.incidents.filter(
    i => i.resolvedAt && 
    new Date(i.startedAt) > sixtyDaysAgo && 
    new Date(i.startedAt) <= thirtyDaysAgo
  );
  const prevMttrValues = prevResolvedIncidents
    .filter(i => i.duration !== undefined)
    .map(i => i.duration!);
  const prevAvgMttr = prevMttrValues.length > 0
    ? prevMttrValues.reduce((a, b) => a + b, 0) / prevMttrValues.length
    : avgMttrMinutes;

  const prevFailedDeployments = deploymentsPrevious30d.filter(d => !d.success || d.rollback);
  const prevCfr = deploymentsPrevious30d.length > 0
    ? (prevFailedDeployments.length / deploymentsPrevious30d.length) * 100
    : changeFailureRate;

  const calculateTrend = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  return {
    deploymentsLast24h: deploymentsLast24h.length,
    deploymentsLast7d: deploymentsLast7d.length,
    deploymentsLast30d: deploymentsLast30d.length,
    avgDeploymentsPerWeek: Math.round(avgDeploymentsPerWeek * 10) / 10,
    deploymentFrequencyRating,

    avgLeadTimeHours: Math.round(avgLeadTimeHours * 10) / 10,
    p50LeadTimeHours: Math.round(p50LeadTimeHours * 10) / 10,
    p95LeadTimeHours: Math.round(p95LeadTimeHours * 10) / 10,
    leadTimeRating,

    avgMttrMinutes: Math.round(avgMttrMinutes),
    p50MttrMinutes: Math.round(p50MttrMinutes),
    p95MttrMinutes: Math.round(p95MttrMinutes),
    mttrRating,

    changeFailureRate: Math.round(changeFailureRate * 10) / 10,
    failedDeploymentsLast30d: failedDeployments.length,
    totalDeploymentsLast30d: deploymentsLast30d.length,
    cfrRating,

    overallRating,
    lastUpdated: new Date().toISOString(),

    trends: {
      deploymentFrequency: Math.round(calculateTrend(avgDeploymentsPerWeek, prevAvgDeploymentsPerWeek)),
      leadTime: Math.round(calculateTrend(avgLeadTimeHours, prevAvgLeadTime)),
      mttr: Math.round(calculateTrend(avgMttrMinutes, prevAvgMttr)),
      changeFailureRate: Math.round(calculateTrend(changeFailureRate, prevCfr)),
    },
  };
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class DORAMetricsService {
  private data: DORAData;

  constructor() {
    this.data = loadData();
    logger.info({ 
      deployments: this.data.deployments.length,
      incidents: this.data.incidents.length,
    }, 'DORA metrics service initialized');
  }

  /**
   * Record a new deployment
   */
  recordDeployment(deployment: Omit<Deployment, 'id'>): Deployment {
    const id = `deploy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newDeployment: Deployment = { id, ...deployment };
    
    this.data.deployments.push(newDeployment);
    saveData(this.data);
    
    logger.info({
      id,
      environment: deployment.environment,
      success: deployment.success,
      duration: deployment.duration,
    }, 'Deployment recorded');
    
    return newDeployment;
  }

  /**
   * Record a new incident
   */
  recordIncident(incident: Omit<Incident, 'id'>): Incident {
    const id = `incident_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newIncident: Incident = { id, ...incident };
    
    this.data.incidents.push(newIncident);
    saveData(this.data);
    
    logger.info({
      id,
      title: incident.title,
      severity: incident.severity,
    }, 'Incident recorded');
    
    return newIncident;
  }

  /**
   * Resolve an incident
   */
  resolveIncident(
    incidentId: string, 
    resolution: { resolvedAt: string; resolution?: string; rootCause?: string }
  ): Incident | null {
    const incident = this.data.incidents.find(i => i.id === incidentId);
    if (!incident) return null;

    incident.resolvedAt = resolution.resolvedAt;
    incident.resolution = resolution.resolution;
    incident.rootCause = resolution.rootCause;
    
    // Calculate duration
    const start = new Date(incident.startedAt).getTime();
    const end = new Date(resolution.resolvedAt).getTime();
    incident.duration = Math.round((end - start) / 60000); // minutes

    saveData(this.data);
    
    logger.info({
      id: incidentId,
      duration: incident.duration,
    }, 'Incident resolved');
    
    return incident;
  }

  /**
   * Mark a deployment as failed/rolled back
   */
  markDeploymentFailed(deploymentId: string, rollback = true): Deployment | null {
    const deployment = this.data.deployments.find(d => d.id === deploymentId);
    if (!deployment) return null;

    deployment.success = false;
    deployment.rollback = rollback;
    saveData(this.data);
    
    logger.info({ id: deploymentId, rollback }, 'Deployment marked as failed');
    
    return deployment;
  }

  /**
   * Get current DORA metrics snapshot
   */
  getMetrics(): DORASnapshot {
    return calculateMetrics(this.data);
  }

  /**
   * Get recent deployments
   */
  getDeployments(limit = 20): Deployment[] {
    return this.data.deployments
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get recent incidents
   */
  getIncidents(limit = 20): Incident[] {
    return this.data.incidents
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get active (unresolved) incidents
   */
  getActiveIncidents(): Incident[] {
    return this.data.incidents
      .filter(i => !i.resolvedAt)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * Delete all data (for testing)
   */
  reset(): void {
    this.data = {
      deployments: [],
      incidents: [],
      lastUpdated: new Date().toISOString(),
    };
    saveData(this.data);
    logger.info('DORA metrics data reset');
  }

  /**
   * Seed with sample data (for demo/testing)
   */
  seedSampleData(): void {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const hour = 60 * 60 * 1000;

    // Generate 30 days of deployments
    for (let i = 0; i < 45; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const timestamp = new Date(now - daysAgo * day - Math.random() * day);
      const success = Math.random() > 0.1; // 90% success rate
      
      this.data.deployments.push({
        id: `deploy_seed_${i}`,
        timestamp: timestamp.toISOString(),
        commitSha: Math.random().toString(36).slice(2, 10),
        commitMessage: `feat: improvement ${i}`,
        branch: 'main',
        environment: 'production',
        duration: Math.floor(Math.random() * 4 * 3600) + 1800, // 30min to 4.5hrs
        success,
        triggeredBy: 'ci',
        rollback: !success && Math.random() > 0.5,
      });
    }

    // Generate some incidents
    const incidentTitles = [
      'API latency spike',
      'Database connection timeout',
      'Voice agent disconnections',
      'Memory leak detected',
      'Rate limit exceeded',
    ];

    for (let i = 0; i < 5; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const startedAt = new Date(now - daysAgo * day - Math.random() * day);
      const duration = Math.floor(Math.random() * 120) + 5; // 5 to 125 minutes
      const resolvedAt = new Date(startedAt.getTime() + duration * 60000);
      
      this.data.incidents.push({
        id: `incident_seed_${i}`,
        title: incidentTitles[i % incidentTitles.length] ?? 'Unknown incident',
        severity: ['critical', 'major', 'minor'][Math.floor(Math.random() * 3)] as Incident['severity'],
        startedAt: startedAt.toISOString(),
        resolvedAt: resolvedAt.toISOString(),
        duration,
        affectedServices: ['voice-agent', 'ui-server'].slice(0, Math.floor(Math.random() * 2) + 1),
        rootCause: 'Identified and fixed',
        resolution: 'Deployed hotfix',
      });
    }

    saveData(this.data);
    logger.info({
      deployments: this.data.deployments.length,
      incidents: this.data.incidents.length,
    }, 'Sample DORA data seeded');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: DORAMetricsService | null = null;

export function getDORAMetricsService(): DORAMetricsService {
  if (!instance) {
    instance = new DORAMetricsService();
  }
  return instance;
}

export type { DORAMetricsService };

