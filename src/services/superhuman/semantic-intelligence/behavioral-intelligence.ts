/**
 * Behavioral Intelligence - V3.5
 *
 * Detects patterns the user can't see:
 * - Self-sabotage patterns
 * - Emotional baselines
 * - Trigger mapping
 * - Recurring cycles
 *
 * @module services/superhuman/semantic-intelligence/behavioral-intelligence
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';
import { embed, cosineSimilarity } from '../../../memory/embeddings.js';

const log = createLogger({ module: 'behavioral-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export interface SelfSabotagePattern {
  id: string;
  userId: string;
  
  // Pattern description
  trigger: string;           // What triggers the behavior
  behavior: string;          // The self-sabotaging behavior
  consequence: string;       // What typically happens
  
  // Evidence
  instances: Array<{
    timestamp: Date;
    context: string;
  }>;
  
  // Metrics
  confidence: number;
  frequency: number;         // Occurrences per month
  
  // Status
  surfaced: boolean;         // Have we mentioned this?
  surfacedAt?: Date;
  userAcknowledged: boolean;
  
  // Embedding
  embedding?: number[];
}

export interface EmotionalBaseline {
  userId: string;
  
  // Overall baseline
  averageValence: number;    // -1 to 1
  averageEnergy: number;     // 0-1
  emotionVariance: number;   // How much they fluctuate
  
  // Emotion frequencies
  emotionDistribution: Map<string, number>;
  
  // What's "normal" for them
  typicalRange: {
    lowValence: number;
    highValence: number;
    lowEnergy: number;
    highEnergy: number;
  };
  
  // Last updated
  computedAt: Date;
  sampleSize: number;
}

export interface Trigger {
  id: string;
  userId: string;
  
  // What it triggers
  triggerType: 'emotional' | 'behavioral';
  triggerPattern: string;    // "criticism", "rejection", etc.
  
  // What happens
  response: string;          // The typical response
  emotion?: string;          // Emotion triggered
  
  // Evidence
  instances: Array<{
    timestamp: Date;
    context: string;
    intensity: number;
  }>;
  
  // Metrics
  confidence: number;
  sensitivity: number;       // How reactive (0-1)
}

export interface BehavioralCycle {
  id: string;
  userId: string;
  
  // Cycle description
  name: string;              // "Procrastination-guilt cycle"
  stages: string[];          // Ordered stages
  
  // Pattern
  averageDuration: number;   // Days per cycle
  currentStage?: string;
  
  // Evidence
  occurrences: number;
  lastOccurrence?: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_INSTANCES_FOR_PATTERN: 3,
  MAX_PATTERNS: 20,
  MAX_TRIGGERS: 30,
  BASELINE_SAMPLE_SIZE: 50,
  SIMILARITY_THRESHOLD: 0.75,
};

// ============================================================================
// CACHE
// ============================================================================

const patternCache = new Map<string, SelfSabotagePattern[]>();
const baselineCache = new Map<string, EmotionalBaseline>();
const triggerCache = new Map<string, Trigger[]>();

// ============================================================================
// SELF-SABOTAGE DETECTION
// ============================================================================

/**
 * Known self-sabotage pattern templates.
 */
const SABOTAGE_TEMPLATES = [
  {
    name: 'success_avoidance',
    trigger: 'close to a goal or success',
    behavior: 'self-sabotage or create obstacles',
    indicators: [/close to|almost|about to succeed|nearly there/i, /but then i|and then i|so i/i],
  },
  {
    name: 'conflict_avoidance',
    trigger: 'potential conflict or confrontation',
    behavior: 'avoid or withdraw',
    indicators: [/should (have )?said|wanted to say|couldn't say/i, /avoided|didn't bring up|let it go/i],
  },
  {
    name: 'perfectionism_paralysis',
    trigger: 'important task or decision',
    behavior: 'procrastinate or avoid starting',
    indicators: [/not good enough|not ready|need to be perfect/i, /haven't started|keep putting off/i],
  },
  {
    name: 'relationship_sabotage',
    trigger: 'relationship getting closer',
    behavior: 'push away or create distance',
    indicators: [/getting close|things are going well/i, /picked a fight|pushed away|tested them/i],
  },
  {
    name: 'burnout_cycle',
    trigger: 'feeling competent or successful',
    behavior: 'take on too much until burnout',
    indicators: [/said yes to|took on more|couldn't say no/i, /exhausted|burned out|overwhelmed/i],
  },
];

/**
 * Record a potential sabotage instance.
 */
export async function recordPotentialSabotage(
  userId: string,
  instance: {
    context: string;
    trigger?: string;
    behavior?: string;
    consequence?: string;
  }
): Promise<SelfSabotagePattern | null> {
  const patterns = await loadPatterns(userId);
  const now = new Date();
  
  // Check against templates
  for (const template of SABOTAGE_TEMPLATES) {
    const matchesTrigger = template.indicators[0]?.test(instance.context);
    const matchesBehavior = template.indicators[1]?.test(instance.context);
    
    if (matchesTrigger || matchesBehavior) {
      // Find or create pattern
      let pattern = patterns.find(p => p.trigger.includes(template.trigger));
      
      if (pattern) {
        // Update existing
        pattern.instances.push({ timestamp: now, context: instance.context });
        pattern.confidence = Math.min(pattern.confidence + 0.1, 1);
        pattern.frequency = calculateFrequency(pattern.instances);
      } else {
        // Create new
        pattern = {
          id: `sabotage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          trigger: instance.trigger ?? template.trigger,
          behavior: instance.behavior ?? template.behavior,
          consequence: instance.consequence ?? 'negative outcome',
          instances: [{ timestamp: now, context: instance.context }],
          confidence: 0.4,
          frequency: 0,
          surfaced: false,
          userAcknowledged: false,
        };
        
        // Generate embedding
        try {
          pattern.embedding = await embed(`${pattern.trigger} ${pattern.behavior} ${pattern.consequence}`);
        } catch (e) {
          log.debug({ error: String(e) }, 'Failed to embed pattern');
        }
        
        patterns.push(pattern);
      }
      
      await savePattern(userId, pattern);
      patternCache.set(userId, patterns);
      
      // Only log if pattern is emerging
      if (pattern.instances.length >= CONFIG.MIN_INSTANCES_FOR_PATTERN) {
        log.info({ userId, pattern: template.name, instances: pattern.instances.length }, '🔄 Self-sabotage pattern detected');
      }
      
      return pattern;
    }
  }
  
  return null;
}

/**
 * Get significant self-sabotage patterns.
 */
export async function getSabotagePatterns(
  userId: string
): Promise<SelfSabotagePattern[]> {
  const patterns = await loadPatterns(userId);
  return patterns
    .filter(p => p.instances.length >= CONFIG.MIN_INSTANCES_FOR_PATTERN && p.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get unsurfaced patterns to potentially mention.
 */
export async function getUnsurfacedPatterns(userId: string): Promise<SelfSabotagePattern[]> {
  const patterns = await getSabotagePatterns(userId);
  return patterns.filter(p => !p.surfaced && p.confidence >= 0.7);
}

/**
 * Mark a pattern as surfaced.
 */
export async function markPatternSurfaced(
  userId: string,
  patternId: string
): Promise<void> {
  const patterns = await loadPatterns(userId);
  const pattern = patterns.find(p => p.id === patternId);
  if (pattern) {
    pattern.surfaced = true;
    pattern.surfacedAt = new Date();
    await savePattern(userId, pattern);
  }
}

// ============================================================================
// EMOTIONAL BASELINE
// ============================================================================

/**
 * Update emotional baseline with new data.
 */
export async function updateBaseline(
  userId: string,
  data: {
    emotion: string;
    intensity: number;
    valence: number;
  }
): Promise<void> {
  let baseline = baselineCache.get(userId) ?? await loadBaseline(userId);
  
  if (!baseline) {
    baseline = {
      userId,
      averageValence: 0,
      averageEnergy: 0.5,
      emotionVariance: 0.2,
      emotionDistribution: new Map(),
      typicalRange: { lowValence: -0.5, highValence: 0.5, lowEnergy: 0.3, highEnergy: 0.7 },
      computedAt: new Date(),
      sampleSize: 0,
    };
  }
  
  // Update running averages
  const alpha = Math.min(0.1, 1 / (baseline.sampleSize + 1));
  baseline.averageValence = baseline.averageValence * (1 - alpha) + data.valence * alpha;
  baseline.averageEnergy = baseline.averageEnergy * (1 - alpha) + data.intensity * alpha;
  
  // Update emotion distribution
  const currentCount = baseline.emotionDistribution.get(data.emotion) ?? 0;
  baseline.emotionDistribution.set(data.emotion, currentCount + 1);
  
  // Update sample size
  baseline.sampleSize++;
  baseline.computedAt = new Date();
  
  // Recalculate typical range if enough samples
  if (baseline.sampleSize >= CONFIG.BASELINE_SAMPLE_SIZE) {
    const variance = baseline.emotionVariance;
    baseline.typicalRange = {
      lowValence: baseline.averageValence - variance,
      highValence: baseline.averageValence + variance,
      lowEnergy: Math.max(0, baseline.averageEnergy - variance),
      highEnergy: Math.min(1, baseline.averageEnergy + variance),
    };
  }
  
  // Save
  await saveBaseline(userId, baseline);
  baselineCache.set(userId, baseline);
}

/**
 * Get current baseline.
 */
export async function getBaseline(userId: string): Promise<EmotionalBaseline | null> {
  const cached = baselineCache.get(userId);
  if (cached) return cached;
  return loadBaseline(userId);
}

/**
 * Check if current state is outside baseline.
 */
export async function checkBaselineDeviation(
  userId: string,
  current: { valence: number; energy: number }
): Promise<{ isDeviation: boolean; description?: string }> {
  const baseline = await getBaseline(userId);
  if (!baseline || baseline.sampleSize < CONFIG.BASELINE_SAMPLE_SIZE) {
    return { isDeviation: false };
  }
  
  const { typicalRange } = baseline;
  
  if (current.valence < typicalRange.lowValence) {
    return {
      isDeviation: true,
      description: "They're feeling lower than their usual baseline.",
    };
  }
  
  if (current.valence > typicalRange.highValence) {
    return {
      isDeviation: true,
      description: "They're feeling more positive than usual.",
    };
  }
  
  if (current.energy < typicalRange.lowEnergy) {
    return {
      isDeviation: true,
      description: "Their energy is lower than typical.",
    };
  }
  
  if (current.energy > typicalRange.highEnergy) {
    return {
      isDeviation: true,
      description: "They're more energetic than usual.",
    };
  }
  
  return { isDeviation: false };
}

// ============================================================================
// TRIGGER MAPPING
// ============================================================================

/**
 * Record a potential trigger.
 */
export async function recordTrigger(
  userId: string,
  trigger: {
    pattern: string;
    response: string;
    emotion?: string;
    context: string;
    intensity: number;
  }
): Promise<Trigger> {
  const triggers = await loadTriggers(userId);
  const now = new Date();
  
  // Find existing trigger
  let existing = triggers.find(t =>
    t.triggerPattern.toLowerCase() === trigger.pattern.toLowerCase()
  );
  
  if (existing) {
    existing.instances.push({
      timestamp: now,
      context: trigger.context,
      intensity: trigger.intensity,
    });
    existing.confidence = Math.min(existing.confidence + 0.1, 1);
    existing.sensitivity = calculateSensitivity(existing.instances);
  } else {
    existing = {
      id: `trigger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      triggerType: trigger.emotion ? 'emotional' : 'behavioral',
      triggerPattern: trigger.pattern,
      response: trigger.response,
      emotion: trigger.emotion,
      instances: [{
        timestamp: now,
        context: trigger.context,
        intensity: trigger.intensity,
      }],
      confidence: 0.4,
      sensitivity: trigger.intensity,
    };
    triggers.push(existing);
  }
  
  await saveTrigger(userId, existing);
  triggerCache.set(userId, triggers);
  
  return existing;
}

/**
 * Get known triggers.
 */
export async function getTriggers(userId: string): Promise<Trigger[]> {
  const triggers = await loadTriggers(userId);
  return triggers.filter(t => t.instances.length >= CONFIG.MIN_INSTANCES_FOR_PATTERN);
}

/**
 * Check if text contains a known trigger.
 */
export async function checkForTriggers(
  userId: string,
  text: string
): Promise<Trigger[]> {
  const triggers = await getTriggers(userId);
  return triggers.filter(t => {
    const pattern = new RegExp(t.triggerPattern, 'i');
    return pattern.test(text);
  });
}

// ============================================================================
// FORMAT FOR CONTEXT
// ============================================================================

/**
 * Format behavioral intelligence for LLM context.
 */
export async function formatBehavioralContext(
  userId: string,
  currentContext?: { emotion?: string; topic?: string }
): Promise<string> {
  const [patterns, baseline, triggers] = await Promise.all([
    getSabotagePatterns(userId),
    getBaseline(userId),
    getTriggers(userId),
  ]);
  
  if (patterns.length === 0 && !baseline && triggers.length === 0) {
    return '';
  }
  
  const lines = [
    '═══════════════════════════════════════════════════════════',
    'BEHAVIORAL INTELLIGENCE - Patterns they might not see',
    '═══════════════════════════════════════════════════════════',
    '',
  ];
  
  // Self-sabotage patterns (only high confidence, unsurfaced)
  const relevantPatterns = patterns.filter(p => !p.surfaced && p.confidence >= 0.7);
  if (relevantPatterns.length > 0) {
    lines.push('⚠️ POTENTIAL PATTERNS (surface gently if relevant):');
    for (const p of relevantPatterns.slice(0, 2)) {
      lines.push(`  When ${p.trigger}:`);
      lines.push(`    They tend to ${p.behavior}`);
      lines.push(`    (${p.instances.length} instances, ${Math.round(p.confidence * 100)}% confidence)`);
    }
    lines.push('');
  }
  
  // Baseline deviation
  if (baseline && baseline.sampleSize >= CONFIG.BASELINE_SAMPLE_SIZE) {
    lines.push('EMOTIONAL BASELINE:');
    lines.push(`  Typical mood: ${baseline.averageValence > 0.2 ? 'Generally positive' : baseline.averageValence < -0.2 ? 'Often challenged' : 'Balanced'}`);
    lines.push(`  Energy: ${baseline.averageEnergy > 0.6 ? 'High' : baseline.averageEnergy < 0.4 ? 'Lower' : 'Moderate'}`);
    lines.push('');
  }
  
  // Known triggers
  if (triggers.length > 0) {
    const sensitiveTriggers = triggers.filter(t => t.sensitivity > 0.7);
    if (sensitiveTriggers.length > 0) {
      lines.push('KNOWN SENSITIVITIES:');
      for (const t of sensitiveTriggers.slice(0, 3)) {
        lines.push(`  - ${t.triggerPattern}: typically responds with ${t.emotion ?? t.response}`);
      }
      lines.push('');
    }
  }
  
  lines.push('═══════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function calculateFrequency(instances: Array<{ timestamp: Date }>): number {
  if (instances.length < 2) return 0;
  
  const sorted = instances.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const firstDate = sorted[0].timestamp;
  const lastDate = sorted[sorted.length - 1].timestamp;
  const months = (lastDate.getTime() - firstDate.getTime()) / (30 * 24 * 60 * 60 * 1000);
  
  return months > 0 ? instances.length / months : instances.length;
}

function calculateSensitivity(instances: Array<{ intensity: number }>): number {
  if (instances.length === 0) return 0;
  const sum = instances.reduce((acc, i) => acc + i.intensity, 0);
  return sum / instances.length;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadPatterns(userId: string): Promise<SelfSabotagePattern[]> {
  const cached = patternCache.get(userId);
  if (cached) return cached;
  
  const db = getFirestoreDb();
  if (!db) return [];
  
  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('sabotage_patterns')
      .limit(CONFIG.MAX_PATTERNS)
      .get();
    
    const patterns = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        instances: (data.instances ?? []).map((i: { timestamp: unknown; context: string }) => ({
          timestamp: typeof i.timestamp === 'object' && i.timestamp && 'toDate' in i.timestamp 
            ? (i.timestamp as { toDate: () => Date }).toDate() 
            : new Date(i.timestamp as string | number),
          context: i.context,
        })),
        surfacedAt: data.surfacedAt && typeof data.surfacedAt === 'object' && 'toDate' in data.surfacedAt 
          ? data.surfacedAt.toDate() 
          : (data.surfacedAt ? new Date(data.surfacedAt) : undefined),
      } as SelfSabotagePattern;
    });
    
    patternCache.set(userId, patterns);
    return patterns;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load sabotage patterns');
    return [];
  }
}

async function savePattern(userId: string, pattern: SelfSabotagePattern): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  
  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('sabotage_patterns')
      .doc(pattern.id)
      .set(cleanForFirestore(pattern));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save pattern');
  }
}

async function loadBaseline(userId: string): Promise<EmotionalBaseline | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  
  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('behavioral_intelligence')
      .doc('baseline')
      .get();
    
    if (!doc.exists) return null;
    
    const data = doc.data()!;
    return {
      ...data,
      emotionDistribution: new Map(Object.entries(data.emotionDistribution ?? {})),
      computedAt: data.computedAt?.toDate?.() ?? new Date(data.computedAt),
    } as EmotionalBaseline;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load baseline');
    return null;
  }
}

async function saveBaseline(userId: string, baseline: EmotionalBaseline): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  
  try {
    const data = {
      ...baseline,
      emotionDistribution: Object.fromEntries(baseline.emotionDistribution),
    };
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('behavioral_intelligence')
      .doc('baseline')
      .set(cleanForFirestore(data));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save baseline');
  }
}

async function loadTriggers(userId: string): Promise<Trigger[]> {
  const cached = triggerCache.get(userId);
  if (cached) return cached;
  
  const db = getFirestoreDb();
  if (!db) return [];
  
  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('behavioral_triggers')
      .limit(CONFIG.MAX_TRIGGERS)
      .get();
    
    const triggers = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        instances: (data.instances ?? []).map((i: { timestamp: unknown; context: string; intensity: number }) => ({
          timestamp: typeof i.timestamp === 'object' && i.timestamp && 'toDate' in i.timestamp 
            ? (i.timestamp as { toDate: () => Date }).toDate() 
            : new Date(i.timestamp as string | number),
          context: i.context,
          intensity: i.intensity,
        })),
      } as Trigger;
    });
    
    triggerCache.set(userId, triggers);
    return triggers;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load triggers');
    return [];
  }
}

async function saveTrigger(userId: string, trigger: Trigger): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  
  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('behavioral_triggers')
      .doc(trigger.id)
      .set(cleanForFirestore(trigger));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save trigger');
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export function clearBehavioralCache(userId?: string): void {
  if (userId) {
    patternCache.delete(userId);
    baselineCache.delete(userId);
    triggerCache.delete(userId);
  } else {
    patternCache.clear();
    baselineCache.clear();
    triggerCache.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const behavioralIntelligence = {
  // Self-sabotage
  recordSabotage: recordPotentialSabotage,
  getPatterns: getSabotagePatterns,
  getUnsurfaced: getUnsurfacedPatterns,
  markSurfaced: markPatternSurfaced,
  
  // Baseline
  updateBaseline,
  getBaseline,
  checkDeviation: checkBaselineDeviation,
  
  // Triggers
  recordTrigger,
  getTriggers,
  checkTriggers: checkForTriggers,
  
  // Context
  format: formatBehavioralContext,
  
  // Cache
  clearCache: clearBehavioralCache,
};

export default behavioralIntelligence;

