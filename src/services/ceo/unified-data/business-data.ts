/**
 * Business data fetchers for Unified Data Service
 *
 * @module services/ceo/unified-data/business-data
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { toSafeDate, recordDegradation } from '../../../utils/firestore-utils.js';
import { dataCache, CACHE_TTL } from './cache.js';
import { getPeriodStartDate, getGlobalCollection } from './helpers.js';
import type { Period, Incident, ExperimentSummary, TechDebtItem } from './types.js';

const log = createLogger({ module: 'ceo-unified-data-business' });

// ============================================================================
// EXPERIMENTS
// ============================================================================

export async function getExperiments(): Promise<ExperimentSummary[]> {
  const cacheKey = 'experiments';
  const cached = dataCache.get<ExperimentSummary[]>(cacheKey);
  if (cached !== null) return cached;

  const collection = getGlobalCollection('experiments');
  if (!collection) {
    recordDegradation('unified-data', 'db_unavailable');
    return [];
  }

  try {
    const snapshot = await collection.orderBy('startDate', 'desc').limit(50).get();

    const experiments: ExperimentSummary[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: String(data.name || ''),
        status: (data.status as ExperimentSummary['status']) || 'draft',
        hypothesis: String(data.hypothesis || ''),
        startDate: data.startDate ? toSafeDate(data.startDate) : undefined,
        endDate: data.endDate ? toSafeDate(data.endDate) : undefined,
        participantCount: Number(data.participantCount) || 0,
        conversionRateControl: Number(data.conversionRateControl) || 0,
        conversionRateTreatment: Number(data.conversionRateTreatment) || 0,
        statisticalSignificance: data.statisticalSignificance
          ? Number(data.statisticalSignificance)
          : undefined,
        winner: data.winner as ExperimentSummary['winner'],
      };
    });

    dataCache.set(cacheKey, experiments, CACHE_TTL.BUSINESS_DATA);
    log.debug({ count: experiments.length }, 'Experiments fetched');
    return experiments;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get experiments');
    return [];
  }
}

// ============================================================================
// INCIDENTS
// ============================================================================

export async function getIncidents(period: Period): Promise<Incident[]> {
  const cacheKey = `incidents_${period}`;
  const cached = dataCache.get<Incident[]>(cacheKey);
  if (cached !== null) return cached;

  const collection = getGlobalCollection('incidents');
  if (!collection) {
    recordDegradation('unified-data', 'db_unavailable');
    return [];
  }

  try {
    const startDate = getPeriodStartDate(period);
    const snapshot = await collection
      .where('startedAt', '>=', startDate.toISOString())
      .orderBy('startedAt', 'desc')
      .get();

    const incidents: Incident[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: String(data.title || ''),
        severity: (data.severity as Incident['severity']) || 'minor',
        status: (data.status as Incident['status']) || 'open',
        affectedServices: Array.isArray(data.affectedServices)
          ? data.affectedServices.map(String)
          : [],
        description: data.description ? String(data.description) : undefined,
        startedAt: toSafeDate(data.startedAt),
        resolvedAt: data.resolvedAt ? toSafeDate(data.resolvedAt) : undefined,
        rootCause: data.rootCause ? String(data.rootCause) : undefined,
        actionsTaken: Array.isArray(data.actionsTaken) ? data.actionsTaken.map(String) : undefined,
      };
    });

    dataCache.set(cacheKey, incidents, CACHE_TTL.BUSINESS_DATA);
    log.debug({ period, count: incidents.length }, 'Incidents fetched');
    return incidents;
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes('FAILED_PRECONDITION') && errorStr.includes('index')) {
      log.debug('Firestore index still building for incidents - returning empty');
      return [];
    }
    log.error({ error: errorStr, period }, 'Failed to get incidents');
    return [];
  }
}

// ============================================================================
// TECH DEBT
// ============================================================================

export async function getTechDebt(): Promise<TechDebtItem[]> {
  const cacheKey = 'tech_debt';
  const cached = dataCache.get<TechDebtItem[]>(cacheKey);
  if (cached !== null) return cached;

  const collection = getGlobalCollection('tech_debt');
  if (!collection) {
    recordDegradation('unified-data', 'db_unavailable');
    return [];
  }

  try {
    const snapshot = await collection
      .where('status', 'in', ['identified', 'planned', 'in-progress'])
      .orderBy('severity', 'desc')
      .limit(100)
      .get();

    const items: TechDebtItem[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: String(data.title || ''),
        description: String(data.description || ''),
        severity: (data.severity as TechDebtItem['severity']) || 'medium',
        estimatedEffort: (data.estimatedEffort as TechDebtItem['estimatedEffort']) || 'days',
        affectedAreas: Array.isArray(data.affectedAreas) ? data.affectedAreas.map(String) : [],
        createdAt: toSafeDate(data.createdAt),
        updatedAt: toSafeDate(data.updatedAt),
        assignee: data.assignee ? String(data.assignee) : undefined,
        status: (data.status as TechDebtItem['status']) || 'identified',
      };
    });

    dataCache.set(cacheKey, items, CACHE_TTL.BUSINESS_DATA);
    log.debug({ count: items.length }, 'Tech debt fetched');
    return items;
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes('FAILED_PRECONDITION') && errorStr.includes('index')) {
      log.debug('Firestore index still building for tech debt - returning empty');
      return [];
    }
    log.error({ error: errorStr }, 'Failed to get tech debt');
    return [];
  }
}
