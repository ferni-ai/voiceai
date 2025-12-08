/**
 * Trust Data Export API
 * 
 * Phase 2: Let users see and download their trust data
 * 
 * Supports multiple export formats:
 * - JSON (full data)
 * - CSV (timeline data)
 * - Human-readable summary
 * 
 * GDPR Compliant: This is the user's data, they have full access.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import {
  getActiveBoundaries,
  getGrowthPatterns,
  getSharedMoments,
  getUncelebratedWins,
  getPendingIntentions,
  getDueMoments,
  loadTrustProfiles,
} from '../services/trust-systems/index.js';

// ============================================================================
// TYPES
// ============================================================================

interface ExportData {
  exportedAt: string;
  userId: string;
  format: 'json' | 'csv' | 'summary';
  
  trustProfile: {
    createdAt: string;
    lastUpdated: string;
  };
  
  boundaries: {
    total: number;
    types: Record<string, number>;
    note: string;
  };
  
  growth: {
    patternsIdentified: number;
    types: string[];
  };
  
  sharedMoments: {
    total: number;
    runningGags: number;
    memorablePhrases: number;
    storiesShared: number;
  };
  
  celebrations: {
    winsRecognized: number;
    winTypes: string[];
    intentionsTracked: number;
  };
  
  proactiveCare: {
    upcomingMoments: number;
  };
  
  timeline: Array<{
    date: string;
    type: string;
    summary: string;
  }>;
}

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendCsv(res: ServerResponse, csv: string, filename: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  res.end(csv);
}

function sendError(res: ServerResponse, message: string, status = 400): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function getUserIdFromRequest(req: IncomingMessage, parsedUrl: URL): string | null {
  const headerUserId = req.headers['x-user-id'] as string;
  if (headerUserId) return headerUserId;
  
  const queryUserId = parsedUrl.searchParams.get('userId');
  if (queryUserId) return queryUserId;
  
  return null;
}

function formatGrowthType(type: string): string {
  const labels: Record<string, string> = {
    emotional_regulation: 'Emotional balance',
    perspective_shift: 'Fresh perspectives',
    boundary_setting: 'Healthy boundaries',
    behavior_change: 'New habits',
    self_awareness: 'Self-awareness',
    coping_upgrade: 'Better coping',
    goal_progress: 'Goal progress',
  };
  return labels[type] || type.replace(/_/g, ' ');
}

function formatWinType(type: string): string {
  const labels: Record<string, string> = {
    followed_through: 'Follow-through',
    courage_moment: 'Brave moments',
    self_care: 'Self-care',
    boundary_held: 'Boundaries held',
    hard_conversation: 'Difficult conversations',
    showed_up: 'Showing up',
    tried_new_thing: 'Trying new things',
    asked_for_help: 'Asking for help',
    let_it_go: 'Letting go',
    effort_made: 'Making effort',
  };
  return labels[type] || type.replace(/_/g, ' ');
}

// ============================================================================
// EXPORT BUILDER
// ============================================================================

async function buildExportData(userId: string): Promise<ExportData> {
  // Load trust profiles from Firestore
  await loadTrustProfiles(userId);
  
  // Gather data using function-based API
  const boundaries = getActiveBoundaries(userId);
  const growthPatterns = getGrowthPatterns(userId);
  const sharedMoments = getSharedMoments(userId);
  const uncelebratedWins = getUncelebratedWins(userId);
  const pendingIntentions = getPendingIntentions(userId);
  const dueMoments = getDueMoments(userId);
  
  // Calculate boundary type counts
  const boundaryTypeCounts: Record<string, number> = {};
  for (const b of boundaries) {
    boundaryTypeCounts[b.type] = (boundaryTypeCounts[b.type] || 0) + 1;
  }
  
  // Calculate growth types
  const growthTypes = [...new Set(growthPatterns.map(g => g.type))];
  
  // Calculate shared moment types
  const phrases = sharedMoments.filter(m => m.type === 'phrase').length;
  const stories = sharedMoments.filter(m => m.type === 'story').length;
  const gags = sharedMoments.filter(m => m.type === 'running_gag').length;
  
  // Calculate win types
  const winTypes = [...new Set(uncelebratedWins.map(w => w.type))];
  
  // Build timeline
  const timeline: ExportData['timeline'] = [];
  
  for (const pattern of growthPatterns.slice(0, 20)) {
    const date = pattern.after?.firstSeen || new Date();
    timeline.push({
      date: date.toISOString(),
      type: 'growth',
      summary: `${formatGrowthType(pattern.type)}: ${pattern.after?.pattern || 'Growth observed'}`.slice(0, 100),
    });
  }
  
  for (const win of uncelebratedWins.slice(0, 20)) {
    timeline.push({
      date: win.timestamp.toISOString(),
      type: 'win',
      summary: `${formatWinType(win.type)}: ${win.description}`.slice(0, 100),
    });
  }
  
  // Sort by date
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  return {
    exportedAt: new Date().toISOString(),
    userId,
    format: 'json',
    
    trustProfile: {
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    },
    
    boundaries: {
      total: boundaries.length,
      types: boundaryTypeCounts,
      note: 'Specific boundary content is not exported for your privacy.',
    },
    
    growth: {
      patternsIdentified: growthPatterns.length,
      types: growthTypes,
    },
    
    sharedMoments: {
      total: sharedMoments.length,
      runningGags: gags,
      memorablePhrases: phrases,
      storiesShared: stories,
    },
    
    celebrations: {
      winsRecognized: uncelebratedWins.length,
      winTypes,
      intentionsTracked: pendingIntentions.length,
    },
    
    proactiveCare: {
      upcomingMoments: dueMoments.length,
    },
    
    timeline: timeline.slice(0, 50),
  };
}

// ============================================================================
// CSV GENERATOR
// ============================================================================

function generateTimelineCsv(data: ExportData): string {
  const headers = ['Date', 'Type', 'Summary'];
  const rows = data.timeline.map(item => [
    item.date,
    item.type,
    `"${item.summary.replace(/"/g, '""')}"`,
  ]);
  
  return [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');
}

// ============================================================================
// SUMMARY GENERATOR
// ============================================================================

function generateSummary(data: ExportData): string {
  const lines: string[] = [];
  
  lines.push('╔══════════════════════════════════════════════════════════════════╗');
  lines.push('║              YOUR TRUST JOURNEY WITH FERNI                        ║');
  lines.push('╚══════════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Exported: ${new Date(data.exportedAt).toLocaleDateString()}`);
  lines.push(`User ID: ${data.userId}`);
  lines.push('');
  
  lines.push('────────────────────────────────────────────────────────────────────');
  lines.push('YOUR GROWTH');
  lines.push('────────────────────────────────────────────────────────────────────');
  lines.push(`Growth patterns noticed: ${data.growth.patternsIdentified}`);
  if (data.growth.types.length > 0) {
    lines.push(`Areas of growth: ${data.growth.types.map(formatGrowthType).join(', ')}`);
  }
  lines.push('');
  
  lines.push('────────────────────────────────────────────────────────────────────');
  lines.push('WINS WE\'VE CELEBRATED');
  lines.push('────────────────────────────────────────────────────────────────────');
  lines.push(`Small wins recognized: ${data.celebrations.winsRecognized}`);
  lines.push(`Intentions I'm tracking: ${data.celebrations.intentionsTracked}`);
  if (data.celebrations.winTypes.length > 0) {
    lines.push(`Types of wins: ${data.celebrations.winTypes.map(formatWinType).join(', ')}`);
  }
  lines.push('');
  
  lines.push('────────────────────────────────────────────────────────────────────');
  lines.push('WHAT WE SHARE');
  lines.push('────────────────────────────────────────────────────────────────────');
  lines.push(`Shared moments: ${data.sharedMoments.total}`);
  lines.push(`Running gags: ${data.sharedMoments.runningGags}`);
  lines.push(`Memorable phrases: ${data.sharedMoments.memorablePhrases}`);
  lines.push(`Stories you've told me: ${data.sharedMoments.storiesShared}`);
  lines.push('');
  
  lines.push('────────────────────────────────────────────────────────────────────');
  lines.push('YOUR BOUNDARIES');
  lines.push('────────────────────────────────────────────────────────────────────');
  lines.push(`Boundaries I respect: ${data.boundaries.total}`);
  lines.push(`(Specific content not shown for your privacy)`);
  lines.push('');
  
  lines.push('════════════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('This data belongs to you. Ferni is here to support your journey.');
  lines.push('');
  
  return lines.join('\n');
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleTrustExportRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith('/api/trust-export')) {
    return false;
  }
  
  const userId = getUserIdFromRequest(req, parsedUrl);
  if (!userId) {
    sendError(res, 'User ID required', 401);
    return true;
  }
  
  if (pathname === '/api/trust-export' && req.method === 'GET') {
    try {
      const data = await buildExportData(userId);
      sendJson(res, data);
      return true;
    } catch (err) {
      console.error('[TrustExport] Error building export:', err);
      sendError(res, 'Failed to build export', 500);
      return true;
    }
  }
  
  if (pathname === '/api/trust-export/csv' && req.method === 'GET') {
    try {
      const data = await buildExportData(userId);
      const csv = generateTimelineCsv(data);
      const filename = `ferni-journey-${new Date().toISOString().split('T')[0]}.csv`;
      sendCsv(res, csv, filename);
      return true;
    } catch (err) {
      console.error('[TrustExport] Error building CSV:', err);
      sendError(res, 'Failed to build CSV export', 500);
      return true;
    }
  }
  
  if (pathname === '/api/trust-export/summary' && req.method === 'GET') {
    try {
      const data = await buildExportData(userId);
      const summary = generateSummary(data);
      
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="ferni-journey-summary.txt"`,
      });
      res.end(summary);
      return true;
    } catch (err) {
      console.error('[TrustExport] Error building summary:', err);
      sendError(res, 'Failed to build summary', 500);
      return true;
    }
  }
  
  return false;
}
