/**
 * Semantic Confidence Tracker
 *
 * Tracks detection confidence over time to identify pattern gaps.
 * Helps improve semantic matching by learning from failures.
 *
 * Key features:
 * - Tracks confidence scores for each detection type
 * - Identifies low-confidence patterns that need improvement
 * - Surfaces most common unmatched phrases
 * - Provides analytics for pattern tuning
 *
 * @module SemanticConfidenceTracker
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SemanticConfidenceTracker' });

// ============================================================================
// TYPES
// ============================================================================

export type DetectionDomain = 'handoff' | 'calendar' | 'trust' | 'music' | 'contact' | 'habit';

export interface DetectionRecord {
  domain: DetectionDomain;
  timestamp: Date;
  userMessage: string;
  detectedType: string;
  confidence: number;
  wasCorrect?: boolean; // Set after user feedback/validation
  matchedPatterns: string[];
}

export interface DomainStats {
  domain: DetectionDomain;
  totalDetections: number;
  averageConfidence: number;
  lowConfidenceCount: number; // < 0.5
  highConfidenceCount: number; // >= 0.7
  missedDetections: number; // confidence 0
  commonMisses: Array<{
    phrase: string;
    count: number;
    expectedType?: string;
  }>;
  confidenceDistribution: {
    '0-0.3': number;
    '0.3-0.5': number;
    '0.5-0.7': number;
    '0.7-1.0': number;
  };
}

export interface PatternGap {
  domain: DetectionDomain;
  phrase: string;
  frequency: number;
  suggestedType?: string;
  suggestedPattern?: string;
}

// ============================================================================
// IN-MEMORY STORAGE (Would be Firestore in production)
// ============================================================================

const detectionHistory: Map<DetectionDomain, DetectionRecord[]> = new Map();
const MAX_HISTORY_PER_DOMAIN = 1000;

// ============================================================================
// TRACKING
// ============================================================================

/**
 * Record a detection attempt
 */
export function recordDetection(
  domain: DetectionDomain,
  userMessage: string,
  detectedType: string,
  confidence: number,
  matchedPatterns: string[] = []
): void {
  const record: DetectionRecord = {
    domain,
    timestamp: new Date(),
    userMessage: userMessage.slice(0, 500), // Truncate for storage
    detectedType,
    confidence,
    matchedPatterns,
  };

  if (!detectionHistory.has(domain)) {
    detectionHistory.set(domain, []);
  }

  const history = detectionHistory.get(domain)!;
  history.push(record);

  // Trim old records
  if (history.length > MAX_HISTORY_PER_DOMAIN) {
    history.splice(0, history.length - MAX_HISTORY_PER_DOMAIN);
  }

  // Log low confidence detections for debugging
  if (confidence > 0 && confidence < 0.5) {
    log.debug(
      { domain, type: detectedType, confidence, message: userMessage.slice(0, 100) },
      '⚠️ Low confidence detection'
    );
  }
}

/**
 * Mark a detection as correct or incorrect (for learning)
 */
export function recordFeedback(
  domain: DetectionDomain,
  userMessage: string,
  wasCorrect: boolean
): void {
  const history = detectionHistory.get(domain);
  if (!history) return;

  // Find the most recent matching record
  const record = history
    .slice()
    .reverse()
    .find((r) => r.userMessage === userMessage);

  if (record) {
    record.wasCorrect = wasCorrect;

    if (!wasCorrect) {
      log.info(
        { domain, type: record.detectedType, message: userMessage.slice(0, 100) },
        '❌ Detection marked incorrect - pattern gap identified'
      );
    }
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get statistics for a domain
 */
export function getDomainStats(domain: DetectionDomain): DomainStats {
  const history = detectionHistory.get(domain) || [];

  const stats: DomainStats = {
    domain,
    totalDetections: history.length,
    averageConfidence: 0,
    lowConfidenceCount: 0,
    highConfidenceCount: 0,
    missedDetections: 0,
    commonMisses: [],
    confidenceDistribution: {
      '0-0.3': 0,
      '0.3-0.5': 0,
      '0.5-0.7': 0,
      '0.7-1.0': 0,
    },
  };

  if (history.length === 0) return stats;

  // Calculate statistics
  let totalConfidence = 0;
  const missedPhrases: Map<string, number> = new Map();

  for (const record of history) {
    totalConfidence += record.confidence;

    // Count by confidence level
    if (record.confidence === 0) {
      stats.missedDetections++;
      // Track missed phrase (normalized)
      const normalized = record.userMessage.toLowerCase().slice(0, 100);
      missedPhrases.set(normalized, (missedPhrases.get(normalized) || 0) + 1);
    } else if (record.confidence < 0.3) {
      stats.confidenceDistribution['0-0.3']++;
    } else if (record.confidence < 0.5) {
      stats.confidenceDistribution['0.3-0.5']++;
      stats.lowConfidenceCount++;
    } else if (record.confidence < 0.7) {
      stats.confidenceDistribution['0.5-0.7']++;
    } else {
      stats.confidenceDistribution['0.7-1.0']++;
      stats.highConfidenceCount++;
    }
  }

  stats.averageConfidence = totalConfidence / history.length;

  // Find common misses
  stats.commonMisses = Array.from(missedPhrases.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  return stats;
}

/**
 * Get all domain statistics
 */
export function getAllStats(): DomainStats[] {
  const domains: DetectionDomain[] = ['handoff', 'calendar', 'trust', 'music', 'contact', 'habit'];
  return domains.map(getDomainStats);
}

/**
 * Identify pattern gaps that need improvement
 */
export function identifyPatternGaps(): PatternGap[] {
  const gaps: PatternGap[] = [];

  for (const [domain, history] of detectionHistory) {
    // Find low-confidence or missed detections
    const lowConfidence = history.filter((r) => r.confidence > 0 && r.confidence < 0.5);
    const missed = history.filter((r) => r.confidence === 0);

    // Group similar phrases
    const phraseGroups: Map<string, { count: number; types: string[] }> = new Map();

    for (const record of [...lowConfidence, ...missed]) {
      // Normalize phrase for grouping
      const normalized = record.userMessage.toLowerCase().replace(/[^\w\s]/g, '').slice(0, 80);

      if (!phraseGroups.has(normalized)) {
        phraseGroups.set(normalized, { count: 0, types: [] });
      }

      const group = phraseGroups.get(normalized)!;
      group.count++;
      if (record.detectedType && !group.types.includes(record.detectedType)) {
        group.types.push(record.detectedType);
      }
    }

    // Convert to gaps
    for (const [phrase, data] of phraseGroups) {
      if (data.count >= 2) {
        // Only if seen multiple times
        gaps.push({
          domain,
          phrase,
          frequency: data.count,
          suggestedType: data.types[0],
        });
      }
    }
  }

  // Sort by frequency
  gaps.sort((a, b) => b.frequency - a.frequency);

  return gaps.slice(0, 50); // Top 50 gaps
}

/**
 * Generate a report for pattern improvement
 */
export function generateImprovementReport(): string {
  const allStats = getAllStats();
  const gaps = identifyPatternGaps();

  const lines: string[] = [
    '# Semantic Detection Improvement Report',
    '',
    '## Domain Statistics',
    '',
  ];

  for (const stats of allStats) {
    if (stats.totalDetections > 0) {
      lines.push(`### ${stats.domain.charAt(0).toUpperCase() + stats.domain.slice(1)}`);
      lines.push(`- Total detections: ${stats.totalDetections}`);
      lines.push(`- Average confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
      lines.push(`- High confidence (≥70%): ${stats.highConfidenceCount}`);
      lines.push(`- Low confidence (<50%): ${stats.lowConfidenceCount}`);
      lines.push(`- Missed: ${stats.missedDetections}`);
      lines.push('');
    }
  }

  if (gaps.length > 0) {
    lines.push('## Top Pattern Gaps (Needs Improvement)');
    lines.push('');

    for (const gap of gaps.slice(0, 20)) {
      lines.push(`- **${gap.domain}**: "${gap.phrase.slice(0, 60)}..." (${gap.frequency}x)`);
      if (gap.suggestedType) {
        lines.push(`  - Detected as: ${gap.suggestedType}`);
      }
    }
  }

  return lines.join('\n');
}

// ============================================================================
// CLEAR/RESET
// ============================================================================

/**
 * Clear tracking data (for testing)
 */
export function clearTrackingData(domain?: DetectionDomain): void {
  if (domain) {
    detectionHistory.delete(domain);
  } else {
    detectionHistory.clear();
  }
}

// ============================================================================
// Note: All functions are exported at their definitions above.
// ============================================================================
