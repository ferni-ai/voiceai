/**
 * Self-Awareness Intelligence - V3.7
 *
 * Helps users see themselves more clearly:
 * - Blind spot identification
 * - Self-perception gaps
 * - Values-behavior alignment
 * - Cognitive distortion tracking
 *
 * @module services/superhuman/semantic-intelligence/self-awareness
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';

const log = createLogger({ module: 'self-awareness' });

// ============================================================================
// TYPES
// ============================================================================

export interface BlindSpot {
  id: string;
  userId: string;
  
  // The blind spot
  pattern: string;           // What we've noticed
  evidence: string[];        // Examples from conversations
  category: 'self_perception' | 'impact_on_others' | 'patterns' | 'avoidance';
  
  // Metrics
  confidence: number;
  occurrences: number;
  
  // Status
  surfaced: boolean;
  surfacedAt?: Date;
  userResponse?: 'acknowledged' | 'dismissed' | 'exploring';
  
  created: Date;
  lastSeen: Date;
}

export interface SelfPerceptionGap {
  id: string;
  userId: string;
  
  // The gap
  selfStatement: string;     // "I'm always there for my friends"
  observedBehavior: string;  // "Canceled on friends 5x this month"
  gapDescription: string;    // "Says they're reliable but often cancels"
  
  // Metrics
  gapSeverity: number;       // 0-1
  evidence: Array<{
    type: 'self_statement' | 'behavior';
    text: string;
    timestamp: Date;
  }>;
  
  // Status
  surfaced: boolean;
  
  created: Date;
  updated: Date;
}

export interface ValuesBehaviorAlignment {
  userId: string;
  
  // Tracked values
  statedValues: Array<{
    value: string;
    statedAt: Date;
    context: string;
  }>;
  
  // Alignment tracking
  alignmentScores: Map<string, {
    value: string;
    alignedBehaviors: number;
    misalignedBehaviors: number;
    score: number;  // 0-1
    examples: string[];
  }>;
  
  // Overall
  overallAlignment: number;
  
  lastUpdated: Date;
}

export interface CognitiveDistortionProfile {
  userId: string;
  
  // Distortion frequencies
  distortions: Map<string, {
    count: number;
    recentExamples: string[];
    lastSeen: Date;
  }>;
  
  // Most common
  primaryDistortion?: string;
  
  // Progress tracking
  reductionTrend: number;  // -1 to 1 (negative = improving)
  
  lastUpdated: Date;
}

// Known cognitive distortions
export type CognitiveDistortion =
  | 'all_or_nothing'      // Black and white thinking
  | 'catastrophizing'      // Assuming the worst
  | 'mind_reading'         // Assuming what others think
  | 'fortune_telling'      // Predicting negative futures
  | 'should_statements'    // Rigid rules for self/others
  | 'personalization'      // Taking things personally
  | 'overgeneralization'   // "Always" and "never"
  | 'mental_filtering'     // Focusing on negatives
  | 'discounting_positives'// Minimizing good things
  | 'emotional_reasoning'; // Feelings = facts

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_EVIDENCE_FOR_BLIND_SPOT: 3,
  MAX_BLIND_SPOTS: 20,
  MIN_GAP_SEVERITY: 0.5,
  VALUE_DECAY_DAYS: 90,  // Values stated more than 90 days ago get less weight
};

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

const DISTORTION_PATTERNS: Array<{
  distortion: CognitiveDistortion;
  patterns: RegExp[];
}> = [
  {
    distortion: 'all_or_nothing',
    patterns: [
      /\b(always|never|completely|totally|nothing|everything|everyone|no one)\b/i,
      /\b(ruined|perfect|disaster|failure)\b/i,
    ],
  },
  {
    distortion: 'catastrophizing',
    patterns: [
      /\bwhat if\b.*\b(terrible|horrible|disaster|worst|awful)\b/i,
      /\bgoing to be (terrible|horrible|a disaster)\b/i,
      /\bcan't handle|won't survive|end of the world\b/i,
    ],
  },
  {
    distortion: 'mind_reading',
    patterns: [
      /\bthey (probably )?(think|believe|feel)\b/i,
      /\bI know (they|he|she) (thinks|believes|feels)\b/i,
      /\bthey must (think|hate|dislike)\b/i,
    ],
  },
  {
    distortion: 'fortune_telling',
    patterns: [
      /\bI know (it will|this will|things will)\b/i,
      /\bit's going to (fail|go wrong|be terrible)\b/i,
      /\bwon't work\b/i,
    ],
  },
  {
    distortion: 'should_statements',
    patterns: [
      /\bi (should|shouldn't|must|have to|need to)\b/i,
      /\bthey (should|shouldn't|must|ought to)\b/i,
    ],
  },
  {
    distortion: 'personalization',
    patterns: [
      /\bmy fault\b/i,
      /\bbecause of me\b/i,
      /\bI made (them|it|this)\b/i,
      /\bif I had(n't)?\b.*\bwouldn't have\b/i,
    ],
  },
  {
    distortion: 'overgeneralization',
    patterns: [
      /\bthis always happens\b/i,
      /\beveryone (does|is|thinks)\b/i,
      /\bnothing ever\b/i,
      /\beverything (is|goes)\b.*\b(wrong|bad)\b/i,
    ],
  },
  {
    distortion: 'emotional_reasoning',
    patterns: [
      /\bI feel (like I'm|stupid|worthless|a failure)\b/i,
      /\bI feel .*, so (I am|it must be|it's true)\b/i,
    ],
  },
];

const VALUE_INDICATORS = [
  { pattern: /\bI (value|believe in|care about|prioritize)\s+(\w+(?:\s+\w+)?)/i, group: 2 },
  { pattern: /\b(\w+(?:\s+\w+)?)\s+is (important|valuable|essential) to me\b/i, group: 1 },
  { pattern: /\bfamily|health|honesty|loyalty|success|freedom|creativity|growth\b/i, group: 0 },
];

const SELF_PERCEPTION_PATTERNS = [
  /\bI('m| am) (always|never|usually|the type of person who|someone who)\s+(\w+(?:\s+\w+){0,5})/i,
  /\bI (consider myself|see myself as|think of myself as)\s+(\w+(?:\s+\w+){0,5})/i,
  /\bpeople (know me as|say I'm|think I'm)\s+(\w+(?:\s+\w+){0,5})/i,
];

// ============================================================================
// CACHE
// ============================================================================

const blindSpotCache = new Map<string, BlindSpot[]>();
const gapCache = new Map<string, SelfPerceptionGap[]>();
const valuesCache = new Map<string, ValuesBehaviorAlignment>();
const distortionCache = new Map<string, CognitiveDistortionProfile>();

// ============================================================================
// BLIND SPOT DETECTION
// ============================================================================

/**
 * Record potential blind spot evidence.
 */
export async function recordBlindSpotEvidence(
  userId: string,
  evidence: {
    pattern: string;
    context: string;
    category: BlindSpot['category'];
  }
): Promise<BlindSpot> {
  const blindSpots = await loadBlindSpots(userId);
  const now = new Date();
  
  // Find or create blind spot
  let blindSpot = blindSpots.find(b =>
    b.pattern.toLowerCase() === evidence.pattern.toLowerCase()
  );
  
  if (blindSpot) {
    blindSpot.evidence.push(evidence.context);
    blindSpot.evidence = blindSpot.evidence.slice(-10);  // Keep last 10
    blindSpot.occurrences++;
    blindSpot.confidence = Math.min(blindSpot.confidence + 0.1, 1);
    blindSpot.lastSeen = now;
  } else {
    blindSpot = {
      id: `blind_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      pattern: evidence.pattern,
      evidence: [evidence.context],
      category: evidence.category,
      confidence: 0.3,
      occurrences: 1,
      surfaced: false,
      created: now,
      lastSeen: now,
    };
    blindSpots.push(blindSpot);
  }
  
  await saveBlindSpot(userId, blindSpot);
  blindSpotCache.set(userId, blindSpots);
  
  return blindSpot;
}

/**
 * Get significant blind spots.
 */
export async function getBlindSpots(userId: string): Promise<BlindSpot[]> {
  const blindSpots = await loadBlindSpots(userId);
  return blindSpots.filter(b =>
    b.occurrences >= CONFIG.MIN_EVIDENCE_FOR_BLIND_SPOT &&
    b.confidence >= 0.5
  );
}

/**
 * Get unsurfaced blind spots to potentially mention.
 */
export async function getUnsurfacedBlindSpots(userId: string): Promise<BlindSpot[]> {
  const blindSpots = await getBlindSpots(userId);
  return blindSpots.filter(b => !b.surfaced && b.confidence >= 0.7);
}

/**
 * Mark blind spot as surfaced.
 */
export async function markBlindSpotSurfaced(
  userId: string,
  blindSpotId: string,
  response?: BlindSpot['userResponse']
): Promise<void> {
  const blindSpots = await loadBlindSpots(userId);
  const blindSpot = blindSpots.find(b => b.id === blindSpotId);
  
  if (blindSpot) {
    blindSpot.surfaced = true;
    blindSpot.surfacedAt = new Date();
    if (response) blindSpot.userResponse = response;
    await saveBlindSpot(userId, blindSpot);
  }
}

// ============================================================================
// SELF-PERCEPTION GAP DETECTION
// ============================================================================

/**
 * Record a self-perception statement.
 */
export async function recordSelfPerception(
  userId: string,
  statement: string,
  context: string
): Promise<void> {
  // Check if it's a self-perception statement
  const isPerception = SELF_PERCEPTION_PATTERNS.some(p => p.test(statement));
  if (!isPerception) return;
  
  const gaps = await loadGaps(userId);
  const now = new Date();
  
  // Create or update gap entry
  // We'll match this with behavior later
  const existing = gaps.find(g =>
    g.selfStatement.toLowerCase().includes(statement.toLowerCase().slice(0, 50))
  );
  
  if (existing) {
    existing.evidence.push({
      type: 'self_statement',
      text: context,
      timestamp: now,
    });
    existing.updated = now;
  } else {
    const gap: SelfPerceptionGap = {
      id: `gap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      selfStatement: statement,
      observedBehavior: '',
      gapDescription: '',
      gapSeverity: 0,
      evidence: [{
        type: 'self_statement',
        text: context,
        timestamp: now,
      }],
      surfaced: false,
      created: now,
      updated: now,
    };
    gaps.push(gap);
    await saveGap(userId, gap);
  }
  
  gapCache.set(userId, gaps);
}

/**
 * Record behavior that might contradict self-perception.
 */
export async function recordBehavior(
  userId: string,
  behavior: string,
  context: string
): Promise<SelfPerceptionGap | null> {
  const gaps = await loadGaps(userId);
  const now = new Date();
  
  // Find contradicting self-perceptions
  for (const gap of gaps) {
    if (gap.gapSeverity > 0) continue;  // Already identified
    
    // Simple contradiction check
    // "I always help" vs "didn't help"
    // "I'm patient" vs "lost my temper"
    const selfClaim = gap.selfStatement.toLowerCase();
    const behaviorLower = behavior.toLowerCase();
    
    // Check for common contradictions
    const contradictions = [
      { claim: /always|never fail|reliable/i, contradict: /didn't|couldn't|failed|canceled/i },
      { claim: /patient|calm/i, contradict: /snapped|yelled|lost.*temper|frustrated/i },
      { claim: /honest|truthful/i, contradict: /lied|didn't tell|hid|omitted/i },
      { claim: /supportive|there for/i, contradict: /wasn't there|didn't (help|support|show)/i },
    ];
    
    for (const { claim, contradict } of contradictions) {
      if (claim.test(selfClaim) && contradict.test(behaviorLower)) {
        gap.observedBehavior = behavior;
        gap.gapDescription = `Claims to be ${selfClaim.match(claim)?.[0]} but ${behaviorLower.match(contradict)?.[0]}`;
        gap.gapSeverity = 0.6;
        gap.evidence.push({
          type: 'behavior',
          text: context,
          timestamp: now,
        });
        gap.updated = now;
        
        await saveGap(userId, gap);
        gapCache.set(userId, gaps);
        
        log.info({ userId, gap: gap.gapDescription }, '🔍 Self-perception gap detected');
        return gap;
      }
    }
  }
  
  return null;
}

/**
 * Get significant self-perception gaps.
 */
export async function getGaps(userId: string): Promise<SelfPerceptionGap[]> {
  const gaps = await loadGaps(userId);
  return gaps.filter(g => g.gapSeverity >= CONFIG.MIN_GAP_SEVERITY);
}

// ============================================================================
// VALUES-BEHAVIOR ALIGNMENT
// ============================================================================

/**
 * Record a stated value.
 */
export async function recordStatedValue(
  userId: string,
  value: string,
  context: string
): Promise<void> {
  let alignment = valuesCache.get(userId) ?? await loadValuesAlignment(userId);
  
  if (!alignment) {
    alignment = {
      userId,
      statedValues: [],
      alignmentScores: new Map(),
      overallAlignment: 0.5,
      lastUpdated: new Date(),
    };
  }
  
  // Add value
  alignment.statedValues.push({
    value: value.toLowerCase(),
    statedAt: new Date(),
    context,
  });
  
  // Initialize alignment tracking if new
  if (!alignment.alignmentScores.has(value.toLowerCase())) {
    alignment.alignmentScores.set(value.toLowerCase(), {
      value: value.toLowerCase(),
      alignedBehaviors: 0,
      misalignedBehaviors: 0,
      score: 0.5,
      examples: [],
    });
  }
  
  alignment.lastUpdated = new Date();
  
  await saveValuesAlignment(userId, alignment);
  valuesCache.set(userId, alignment);
}

/**
 * Record value-aligned or misaligned behavior.
 */
export async function recordValueBehavior(
  userId: string,
  value: string,
  behavior: string,
  aligned: boolean
): Promise<void> {
  let alignment = valuesCache.get(userId) ?? await loadValuesAlignment(userId);
  if (!alignment) return;
  
  const valueData = alignment.alignmentScores.get(value.toLowerCase());
  if (!valueData) return;
  
  if (aligned) {
    valueData.alignedBehaviors++;
  } else {
    valueData.misalignedBehaviors++;
  }
  
  // Recalculate score
  const total = valueData.alignedBehaviors + valueData.misalignedBehaviors;
  valueData.score = total > 0 ? valueData.alignedBehaviors / total : 0.5;
  
  valueData.examples.push(`${aligned ? '✓' : '✗'} ${behavior}`);
  valueData.examples = valueData.examples.slice(-5);
  
  // Update overall alignment
  let totalScore = 0;
  let count = 0;
  for (const v of alignment.alignmentScores.values()) {
    if (v.alignedBehaviors + v.misalignedBehaviors >= 2) {
      totalScore += v.score;
      count++;
    }
  }
  alignment.overallAlignment = count > 0 ? totalScore / count : 0.5;
  
  alignment.lastUpdated = new Date();
  
  await saveValuesAlignment(userId, alignment);
  valuesCache.set(userId, alignment);
}

/**
 * Get values alignment profile.
 */
export async function getValuesAlignment(userId: string): Promise<ValuesBehaviorAlignment | null> {
  const cached = valuesCache.get(userId);
  if (cached) return cached;
  return loadValuesAlignment(userId);
}

/**
 * Get misaligned values.
 */
export async function getMisalignedValues(userId: string): Promise<Array<{ value: string; score: number; examples: string[] }>> {
  const alignment = await getValuesAlignment(userId);
  if (!alignment) return [];
  
  return [...alignment.alignmentScores.values()]
    .filter(v => v.score < 0.4 && v.alignedBehaviors + v.misalignedBehaviors >= 3)
    .map(v => ({ value: v.value, score: v.score, examples: v.examples }));
}

// ============================================================================
// COGNITIVE DISTORTION TRACKING
// ============================================================================

/**
 * Detect cognitive distortions in text.
 */
export function detectDistortions(text: string): CognitiveDistortion[] {
  const detected: CognitiveDistortion[] = [];
  
  for (const { distortion, patterns } of DISTORTION_PATTERNS) {
    if (patterns.some(p => p.test(text))) {
      detected.push(distortion);
    }
  }
  
  return detected;
}

/**
 * Record detected distortions.
 */
export async function recordDistortions(
  userId: string,
  text: string
): Promise<CognitiveDistortion[]> {
  const detected = detectDistortions(text);
  if (detected.length === 0) return [];
  
  let profile = distortionCache.get(userId) ?? await loadDistortionProfile(userId);
  
  if (!profile) {
    profile = {
      userId,
      distortions: new Map(),
      reductionTrend: 0,
      lastUpdated: new Date(),
    };
  }
  
  const now = new Date();
  
  for (const distortion of detected) {
    const existing = profile.distortions.get(distortion) ?? {
      count: 0,
      recentExamples: [],
      lastSeen: now,
    };
    
    existing.count++;
    existing.recentExamples.push(text.slice(0, 100));
    existing.recentExamples = existing.recentExamples.slice(-5);
    existing.lastSeen = now;
    
    profile.distortions.set(distortion, existing);
  }
  
  // Update primary distortion
  let maxCount = 0;
  for (const [distortion, data] of profile.distortions) {
    if (data.count > maxCount) {
      maxCount = data.count;
      profile.primaryDistortion = distortion;
    }
  }
  
  profile.lastUpdated = now;
  
  await saveDistortionProfile(userId, profile);
  distortionCache.set(userId, profile);
  
  return detected;
}

/**
 * Get distortion profile.
 */
export async function getDistortionProfile(userId: string): Promise<CognitiveDistortionProfile | null> {
  const cached = distortionCache.get(userId);
  if (cached) return cached;
  return loadDistortionProfile(userId);
}

// ============================================================================
// FORMAT FOR CONTEXT
// ============================================================================

/**
 * Format self-awareness intelligence for LLM context.
 */
export async function formatSelfAwarenessContext(userId: string): Promise<string> {
  const [blindSpots, gaps, values, distortions] = await Promise.all([
    getUnsurfacedBlindSpots(userId),
    getGaps(userId),
    getValuesAlignment(userId),
    getDistortionProfile(userId),
  ]);
  
  const lines = [
    '═══════════════════════════════════════════════════════════',
    'SELF-AWARENESS INTELLIGENCE - Help them see clearly',
    '═══════════════════════════════════════════════════════════',
    '',
  ];
  
  // Blind spots (surface gently)
  if (blindSpots.length > 0) {
    lines.push('🔍 POTENTIAL BLIND SPOTS (surface very gently if relevant):');
    for (const b of blindSpots.slice(0, 2)) {
      lines.push(`  - ${b.pattern}`);
      lines.push(`    (${b.occurrences} instances, ${Math.round(b.confidence * 100)}% confidence)`);
    }
    lines.push('');
  }
  
  // Self-perception gaps
  if (gaps.length > 0) {
    lines.push('📊 PERCEPTION GAPS:');
    for (const g of gaps.slice(0, 2)) {
      lines.push(`  - ${g.gapDescription}`);
    }
    lines.push('');
  }
  
  // Values alignment
  if (values && values.overallAlignment < 0.5) {
    const misaligned = await getMisalignedValues(userId);
    if (misaligned.length > 0) {
      lines.push('⚖️ VALUES vs BEHAVIOR:');
      for (const v of misaligned.slice(0, 2)) {
        lines.push(`  - States "${v.value}" as important but...`);
        for (const ex of v.examples.slice(0, 2)) {
          lines.push(`    ${ex}`);
        }
      }
      lines.push('');
    }
  }
  
  // Cognitive distortions
  if (distortions && distortions.primaryDistortion) {
    const distortionNames: Record<string, string> = {
      all_or_nothing: 'all-or-nothing thinking',
      catastrophizing: 'catastrophizing',
      mind_reading: 'mind reading',
      fortune_telling: 'fortune telling',
      should_statements: '"should" statements',
      personalization: 'personalization',
      overgeneralization: 'overgeneralization',
      mental_filtering: 'mental filtering',
      discounting_positives: 'discounting positives',
      emotional_reasoning: 'emotional reasoning',
    };
    
    lines.push('🧠 THINKING PATTERNS:');
    const primaryName = distortionNames[distortions.primaryDistortion] ?? distortions.primaryDistortion;
    lines.push(`  Primary pattern: ${primaryName}`);
    
    const data = distortions.distortions.get(distortions.primaryDistortion);
    if (data && data.recentExamples.length > 0) {
      lines.push(`  Recent example: "${data.recentExamples[0]}"`);
    }
    lines.push('');
  }
  
  lines.push('NOTE: Surface these insights with extreme care and empathy.');
  lines.push('═══════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadBlindSpots(userId: string): Promise<BlindSpot[]> {
  const cached = blindSpotCache.get(userId);
  if (cached) return cached;
  
  const db = getFirestoreDb();
  if (!db) return [];
  
  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('blind_spots')
      .limit(CONFIG.MAX_BLIND_SPOTS)
      .get();
    
    const blindSpots = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        created: data.created && typeof data.created === 'object' && 'toDate' in data.created 
          ? data.created.toDate() 
          : new Date(data.created),
        lastSeen: data.lastSeen && typeof data.lastSeen === 'object' && 'toDate' in data.lastSeen 
          ? data.lastSeen.toDate() 
          : new Date(data.lastSeen),
        surfacedAt: data.surfacedAt && typeof data.surfacedAt === 'object' && 'toDate' in data.surfacedAt 
          ? data.surfacedAt.toDate() 
          : (data.surfacedAt ? new Date(data.surfacedAt) : undefined),
      } as BlindSpot;
    });
    
    blindSpotCache.set(userId, blindSpots);
    return blindSpots;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load blind spots');
    return [];
  }
}

async function saveBlindSpot(userId: string, blindSpot: BlindSpot): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  
  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('blind_spots')
      .doc(blindSpot.id)
      .set(cleanForFirestore(blindSpot));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save blind spot');
  }
}

async function loadGaps(userId: string): Promise<SelfPerceptionGap[]> {
  const cached = gapCache.get(userId);
  if (cached) return cached;
  
  const db = getFirestoreDb();
  if (!db) return [];
  
  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('self_perception_gaps')
      .get();
    
    const gaps = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        created: data.created && typeof data.created === 'object' && 'toDate' in data.created 
          ? data.created.toDate() 
          : new Date(data.created),
        updated: data.updated && typeof data.updated === 'object' && 'toDate' in data.updated 
          ? data.updated.toDate() 
          : new Date(data.updated),
        evidence: (data.evidence ?? []).map((e: { type: string; text: string; timestamp: unknown }) => ({
          ...e,
          timestamp: typeof e.timestamp === 'object' && e.timestamp && 'toDate' in e.timestamp 
            ? (e.timestamp as { toDate: () => Date }).toDate() 
            : new Date(e.timestamp as string | number),
        })),
      } as SelfPerceptionGap;
    });
    
    gapCache.set(userId, gaps);
    return gaps;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load gaps');
    return [];
  }
}

async function saveGap(userId: string, gap: SelfPerceptionGap): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  
  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('self_perception_gaps')
      .doc(gap.id)
      .set(cleanForFirestore(gap));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save gap');
  }
}

async function loadValuesAlignment(userId: string): Promise<ValuesBehaviorAlignment | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  
  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('self_awareness')
      .doc('values_alignment')
      .get();
    
    if (!doc.exists) return null;
    
    const data = doc.data()!;
    return {
      ...data,
      statedValues: (data.statedValues ?? []).map((v: { value: string; statedAt: unknown; context: string }) => ({
        ...v,
        statedAt: typeof v.statedAt === 'object' && v.statedAt && 'toDate' in v.statedAt 
          ? (v.statedAt as { toDate: () => Date }).toDate() 
          : new Date(v.statedAt as string | number),
      })),
      alignmentScores: new Map(Object.entries(data.alignmentScores ?? {})),
      lastUpdated: data.lastUpdated && typeof data.lastUpdated === 'object' && 'toDate' in data.lastUpdated 
        ? data.lastUpdated.toDate() 
        : new Date(data.lastUpdated),
    } as ValuesBehaviorAlignment;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load values alignment');
    return null;
  }
}

async function saveValuesAlignment(userId: string, alignment: ValuesBehaviorAlignment): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  
  try {
    const data = {
      ...alignment,
      alignmentScores: Object.fromEntries(alignment.alignmentScores),
    };
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('self_awareness')
      .doc('values_alignment')
      .set(cleanForFirestore(data));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save values alignment');
  }
}

async function loadDistortionProfile(userId: string): Promise<CognitiveDistortionProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  
  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('self_awareness')
      .doc('distortions')
      .get();
    
    if (!doc.exists) return null;
    
    const data = doc.data()!;
    const distortionsMap = new Map<string, { count: number; recentExamples: string[]; lastSeen: Date }>();
    
    for (const [key, value] of Object.entries(data.distortions ?? {})) {
      const v = value as { count: number; recentExamples: string[]; lastSeen: unknown };
      distortionsMap.set(cleanForFirestore(key), {
        count: v.count,
        recentExamples: v.recentExamples,
        lastSeen: typeof v.lastSeen === 'object' && v.lastSeen && 'toDate' in v.lastSeen 
          ? (v.lastSeen as { toDate: () => Date }).toDate() 
          : new Date(v.lastSeen as string | number),
      });
    }
    
    return {
      ...data,
      distortions: distortionsMap,
      lastUpdated: data.lastUpdated && typeof data.lastUpdated === 'object' && 'toDate' in data.lastUpdated 
        ? data.lastUpdated.toDate() 
        : new Date(data.lastUpdated),
    } as CognitiveDistortionProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load distortion profile');
    return null;
  }
}

async function saveDistortionProfile(userId: string, profile: CognitiveDistortionProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  
  try {
    const distortionsObj: Record<string, { count: number; recentExamples: string[]; lastSeen: Date }> = {};
    for (const [key, value] of profile.distortions) {
      distortionsObj[key] = value;
    }
    
    const data = {
      ...profile,
      distortions: distortionsObj,
    };
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('self_awareness')
      .doc('distortions')
      .set(cleanForFirestore(data));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save distortion profile');
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export function clearSelfAwarenessCache(userId?: string): void {
  if (userId) {
    blindSpotCache.delete(userId);
    gapCache.delete(userId);
    valuesCache.delete(userId);
    distortionCache.delete(userId);
  } else {
    blindSpotCache.clear();
    gapCache.clear();
    valuesCache.clear();
    distortionCache.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const selfAwareness = {
  // Blind spots
  recordBlindSpot: recordBlindSpotEvidence,
  getBlindSpots,
  getUnsurfaced: getUnsurfacedBlindSpots,
  markSurfaced: markBlindSpotSurfaced,
  
  // Self-perception gaps
  recordPerception: recordSelfPerception,
  recordBehavior,
  getGaps,
  
  // Values alignment
  recordValue: recordStatedValue,
  recordValueBehavior,
  getAlignment: getValuesAlignment,
  getMisaligned: getMisalignedValues,
  
  // Cognitive distortions
  detectDistortions,
  recordDistortions,
  getDistortions: getDistortionProfile,
  
  // Context
  format: formatSelfAwarenessContext,
  
  // Cache
  clearCache: clearSelfAwarenessCache,
};

export default selfAwareness;

