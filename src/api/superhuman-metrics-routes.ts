/**
 * Superhuman Metrics Routes
 *
 * API endpoints for the "Better Than Human" dashboard.
 * Aggregates insights from various superhuman services.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';

const log = createLogger({ module: 'SuperhumanMetricsRoutes' });

/**
 * Extract user ID from request headers or query params
 */
function extractUserIdFromRequest(req: IncomingMessage, parsedUrl?: URL): string | undefined {
  // Check header first
  const headerUserId = req.headers['x-user-id'] as string | undefined;
  if (headerUserId) return headerUserId;
  
  // Check query params
  if (parsedUrl) {
    const urlUserId = parsedUrl.searchParams.get('userId');
    if (urlUserId) return urlUserId;
  }
  
  return undefined;
}

// ============================================================================
// TYPES
// ============================================================================

interface SuperhumanMetrics {
  commitments: {
    total: number;
    completed: number;
    pending: number;
    upcoming: string[];
  };
  capacity: {
    score: number;
    trend: 'improving' | 'stable' | 'declining';
    riskFactors: string[];
  };
  values: {
    alignmentScore: number;
    alignedAreas: string[];
    misalignedAreas: string[];
  };
  narrative: {
    currentChapter: string;
    recentThemes: string[];
    growthAreas: string[];
  };
  predictions: {
    upcomingChallenges: string[];
    opportunities: string[];
  };
  dreams: {
    active: string[];
    progress: number;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function getCommitmentsForUser(userId: string): Promise<SuperhumanMetrics['commitments']> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { total: 0, completed: 0, pending: 0, upcoming: [] };
    }
    const commitmentsRef = db.collection('users').doc(userId).collection('commitments');
    const snapshot = await commitmentsRef.orderBy('createdAt', 'desc').limit(20).get();
    
    const commitments = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data());
    const completed = commitments.filter((c: any) => c.status === 'completed').length;
    const pending = commitments.filter((c: any) => c.status === 'pending');
    
    return {
      total: commitments.length,
      completed,
      pending: pending.length,
      upcoming: pending.slice(0, 3).map((c: any) => c.description || c.text || 'Unnamed commitment'),
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch commitments');
    return {
      total: 0,
      completed: 0,
      pending: 0,
      upcoming: [],
    };
  }
}

async function getCapacityForUser(userId: string): Promise<SuperhumanMetrics['capacity']> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { score: 70, trend: 'stable', riskFactors: [] };
    }
    const wellbeingRef = db.collection('users').doc(userId).collection('wellbeing');
    const snapshot = await wellbeingRef.orderBy('timestamp', 'desc').limit(7).get();
    
    if (snapshot.empty) {
      return {
        score: 70,
        trend: 'stable',
        riskFactors: [],
      };
    }
    
    const records = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data());
    const latestScore = records[0]?.energyLevel || 70;
    const earlierScore = records[records.length - 1]?.energyLevel || latestScore;
    
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (latestScore - earlierScore > 10) trend = 'improving';
    else if (earlierScore - latestScore > 10) trend = 'declining';
    
    const riskFactors: string[] = [];
    if (latestScore < 50) riskFactors.push('Energy levels are low');
    if (trend === 'declining') riskFactors.push('Declining trend this week');
    
    return {
      score: Math.round(latestScore),
      trend,
      riskFactors,
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch capacity');
    return {
      score: 70,
      trend: 'stable',
      riskFactors: [],
    };
  }
}

async function getValuesForUser(userId: string): Promise<SuperhumanMetrics['values']> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { alignmentScore: 80, alignedAreas: ['Family time', 'Health habits'], misalignedAreas: [] };
    }
    const valuesRef = db.collection('users').doc(userId).collection('values');
    const snapshot = await valuesRef.limit(1).get();
    
    if (snapshot.empty) {
      return {
        alignmentScore: 80,
        alignedAreas: ['Family time', 'Health habits'],
        misalignedAreas: [],
      };
    }
    
    const data = snapshot.docs[0].data();
    return {
      alignmentScore: data.alignmentScore || 80,
      alignedAreas: data.alignedAreas || ['Family time', 'Health habits'],
      misalignedAreas: data.misalignedAreas || [],
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch values');
    return {
      alignmentScore: 80,
      alignedAreas: ['Family time', 'Health habits'],
      misalignedAreas: [],
    };
  }
}

async function getNarrativeForUser(userId: string): Promise<SuperhumanMetrics['narrative']> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { currentChapter: 'Your story is being written', recentThemes: [], growthAreas: [] };
    }
    const narrativeRef = db.collection('users').doc(userId).collection('narrative');
    const snapshot = await narrativeRef.orderBy('createdAt', 'desc').limit(1).get();
    
    if (snapshot.empty) {
      return {
        currentChapter: 'Your story is being written',
        recentThemes: [],
        growthAreas: [],
      };
    }
    
    const data = snapshot.docs[0].data();
    return {
      currentChapter: data.currentChapter || 'Your story is being written',
      recentThemes: data.recentThemes || [],
      growthAreas: data.growthAreas || [],
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch narrative');
    return {
      currentChapter: 'Your story is being written',
      recentThemes: [],
      growthAreas: [],
    };
  }
}

async function getDreamsForUser(userId: string): Promise<SuperhumanMetrics['dreams']> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { active: [], progress: 0 };
    }
    const dreamsRef = db.collection('users').doc(userId).collection('dreams');
    const snapshot = await dreamsRef.where('status', '==', 'active').limit(10).get();
    
    const dreams = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data());
    const completedCount = dreams.filter((d: any) => d.progress === 100).length;
    const avgProgress = dreams.length > 0 
      ? dreams.reduce((sum: number, d: any) => sum + (d.progress || 0), 0) / dreams.length
      : 0;
    
    return {
      active: dreams.slice(0, 5).map((d: any) => d.description || d.title || 'Unnamed dream'),
      progress: Math.round(avgProgress),
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch dreams');
    return {
      active: [],
      progress: 0,
    };
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleSuperhumanMetricsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // GET /api/superhuman/metrics
  if (pathname === '/api/superhuman/metrics' && req.method === 'GET') {
    try {
      const userId = extractUserIdFromRequest(req, parsedUrl);
      
      if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return true;
      }
      
      // Fetch all metrics in parallel
      const [commitments, capacity, values, narrative, dreams] = await Promise.all([
        getCommitmentsForUser(userId),
        getCapacityForUser(userId),
        getValuesForUser(userId),
        getNarrativeForUser(userId),
        getDreamsForUser(userId),
      ]);
      
      // Generate predictions based on available data
      const predictions: SuperhumanMetrics['predictions'] = {
        upcomingChallenges: [],
        opportunities: [],
      };
      
      if (capacity.score < 60) {
        predictions.upcomingChallenges.push('Your energy is low - consider resting');
      }
      if (commitments.pending > 5) {
        predictions.upcomingChallenges.push(`${commitments.pending} commitments pending`);
      }
      if (capacity.trend === 'improving') {
        predictions.opportunities.push('Your energy is trending up - great time for big tasks');
      }
      
      const metrics: SuperhumanMetrics = {
        commitments,
        capacity,
        values,
        narrative,
        predictions,
        dreams,
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metrics));
      return true;
    } catch (error) {
      log.error({ error }, 'Failed to fetch superhuman metrics');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return true;
    }
  }
  
  return false;
}
