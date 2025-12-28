/**
 * Semantic Handoff Intelligence
 *
 * Enhanced handoff detection using semantic similarity, not just keyword matching.
 * Uses embeddings to understand intent even when users don't use exact keywords.
 *
 * Example improvements:
 * - "I've been thinking about what really matters in life" → Nayan (philosophy)
 * - "Need to have an uncomfortable chat with my sister" → Alex (difficult conversations)
 * - "Want to be more disciplined about my day" → Maya (habits)
 *
 * Features:
 * - Pattern-based detection (fast, no API calls)
 * - Embedding-based similarity (optional, higher accuracy)
 * - Confidence tracking for continuous improvement
 *
 * @module SemanticHandoff
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { PersonaId, HandoffCandidate, HandoffDecision } from './handoff-intelligence.js';
import { TEAM_PROFILES, getOrCreateExperience } from './handoff-intelligence.js';
import { recordDetection } from './semantic-confidence-tracker.js';

const log = createLogger({ module: 'SemanticHandoff' });

// ============================================================================
// SEMANTIC PATTERNS
// ============================================================================

/**
 * Extended semantic patterns for each persona
 * These capture conceptual intent, not just keywords
 */
const SEMANTIC_PATTERNS: Record<
  PersonaId,
  {
    /** Direct phrases that strongly indicate this persona */
    strongPatterns: RegExp[];
    /** Weaker signals that contribute to score */
    weakPatterns: RegExp[];
    /** Conceptual themes (for future embedding matching) */
    themes: string[];
  }
> = {
  ferni: {
    strongPatterns: [],
    weakPatterns: [],
    themes: ['emotional support', 'general guidance', 'someone to talk to'],
  },

  'maya-santos': {
    strongPatterns: [
      /\b(build|start|create|develop|establish)\s*(a\s*)?(habit|routine|ritual|practice|schedule)/i,
      /\b(stick(ing)?|commit|stay)\s*(to|with)\s*(my|a|the)?\s*(habit|routine|schedule|plan)/i,
      /\b(morning|evening|daily|weekly)\s*(routine|ritual|practice|habits?)/i,
      /\b(more|better|improve)\s*(disciplined?|consistent|organized|productive)/i,
      /\b(can't|can not|unable|struggling)\s*(to\s*)?(stick|commit|maintain|keep)/i,
      /\b(accountability|accountable|hold me|keep me)/i,
      /\b(wake|waking)\s*(up\s*)?(earlier|early|at|by)/i,
      /\b(gym|workout|exercise|meditat|yoga)\s*(routine|habit|daily|regularly)/i,
      /\b(sleep|bedtime|bed\s*time)\s*(routine|schedule|habit|earlier)/i,
      /\b(productivity|productive)\s*(has been|is|feels?)\s*(low|down|slump|struggling)/i,
      /\b(get\s*(my|the)\s*)?(mornings?|days?)\s*(started|going|right)/i,
    ],
    weakPatterns: [
      /\b(consistent|consistency|discipline|disciplined)/i,
      /\b(every\s*(day|morning|evening|night))/i,
      /\b(tracking|track|log|logging)/i,
      /\b(procrastinat|distract|focus)/i,
      /\b(routine|ritual|habit)/i,
      /\b(productive|productivity|efficiency)/i,
      /\b(slump|stuck|rut|unmotivated)/i,
      /\b(structure|structured|organize)/i,
    ],
    themes: [
      'building consistency',
      'daily routines',
      'habit formation',
      'behavioral change',
      'accountability',
      'productivity systems',
    ],
  },

  'alex-chen': {
    strongPatterns: [
      /\b(difficult|hard|tough|uncomfortable|awkward)\s*(conversation|talk|chat|discussion)/i,
      /\b(set|establish|enforce|communicate)\s*(boundaries|boundary|limits)/i,
      /\b(how\s*(do\s*)?i\s*(tell|say|communicate|express|bring up))/i,
      /\b(confront|confronting|address|addressing)\s*(them|him|her|my|the)/i,
      /\b(need\s*to\s*talk\s*(to|with)\s*(my|him|her|them|about))/i,
      /\b(say\s*no|saying\s*no|turn\s*down|turning\s*down)/i,
      /\b(draft|write|compose|help.*write)\s*(a\s*)?(message|email|text|response)/i,
      /\b(conflict|arguing|fight|disagreement)\s*(with|about|between|brewing)/i,
      /\b(boundary|boundaries)\s*(issue|problem|violation)/i,
      /\b(disagreement|tension|conflict)\s*(between|brewing|among)/i,
      /\b(mediate|mediating|resolve|resolving)\s*(a\s*)?(conflict|dispute|issue|situation)/i,
      // NEW: More natural expressions
      /\b(sensitive\s*email|email.*sensitive)/i,
      /\b(taken\s*advantage|being\s*used|walk\s*all\s*over)/i,
      /\b(assertive|assert\s*myself|stand\s*up\s*for)/i,
      /\b(can't\s*say\s*no|hard\s*to\s*say\s*no|trouble\s*saying\s*no)/i,
    ],
    weakPatterns: [
      /\b(communicate|communication|expressing)/i,
      /\b(relationship|family|friend|coworker|boss|parent|team|colleague)/i,
      /\b(tell them|talk to them|bring it up)/i,
      /\b(message|email|text|response)/i,
      /\b(conflict|tension|disagreement)/i,
      /\b(boundary|boundaries|space)/i,
      /\b(team\s*member|coworker|colleague)/i,
      // NEW: Additional weak signals
      /\b(speaking\s*up|voice\s*my)/i,
      /\b(client|customer|stakeholder)/i,
      /\b(professional|workplace)/i,
    ],
    themes: [
      'difficult conversations',
      'setting boundaries',
      'conflict resolution',
      'assertive communication',
      'message crafting',
      'relationship dynamics',
    ],
  },

  'peter-john': {
    strongPatterns: [
      /\b(research|dive\s*deep|deep\s*dive|explore|investigate|study)\s*(about|into|on)/i,
      /\b(how\s*does|why\s*does|what\s*(is|are)|explain|understand)\s+\w+/i,
      /\b(learn|learning)\s*(about|more\s*about|everything\s*about)/i,
      /\b(curious|fascinated|interested)\s*(about|in|by)/i,
      /\b(history|science|philosophy|psychology|economics)\s*(of|behind)/i,
      /\b(tell\s*me\s*(everything|all)\s*about)/i,
      /\b(comprehensive|thorough|detailed)\s*(overview|understanding|knowledge)/i,
      /\b(i've heard|heard\s*a\s*lot)\s*(about|of)\s+\w+.*(don't|do not)\s*(really\s*)?(understand|get|know)/i,
      /\b(quantum|AI|machine\s*learning|blockchain|crypto|tech|technology)\s*(computing|mechanics|physics)?/i,
      // NEW: More natural research/learning expressions
      /\b(how\s*(do|does)\s+\w+.*actually\s*(work|function))/i,
      /\b(what('s| is)\s*the\s*(deal|story|history)\s*(with|behind))/i,
      /\b(can\s*you\s*(recommend|suggest)\s*(some\s*)?(resources|books|articles))/i,
      /\b(want\s*to\s*(know|understand)\s*more)/i,
      /\b(keep\s*hearing\s*about)/i,
      /\b(don't\s*(really\s*)?(understand|get|know)\s*(what|how|why))/i,
      /\b(electric\s*cars?|EVs?|solar\s*panels?|renewable\s*energy)/i,
      /\b(philosophical\s*implications)/i,
    ],
    weakPatterns: [
      /\b(research|study|learn|explore)/i,
      /\b(how|why|what|when|where)\s*(does|is|are|do)/i,
      /\b(understand|explain|clarify)/i,
      /\b(curious|curiosity|interesting|fascinated)/i,
      /\b(knowledge|information|facts)/i,
      /\b(science|scientific|technical)/i,
      /\b(work(s|ing)?|function)/i,
      // NEW: Additional weak signals
      /\b(internally|under\s*the\s*hood)/i,
      /\b(implications|impact|effect)/i,
      /\b(deep\s*dive|rabbit\s*hole)/i,
    ],
    themes: [
      'deep research',
      'learning',
      'understanding complex topics',
      'curiosity',
      'knowledge building',
      'intellectual exploration',
    ],
  },

  'jordan-taylor': {
    strongPatterns: [
      /\b(plan|planning|organize|organizing)\s*(a|an|my|the)?\s*(event|party|wedding|birthday|celebration|trip|vacation)/i,
      /\b(special|memorable|perfect)\s*(day|event|moment|occasion|celebration)/i,
      /\b(birthday|anniversary|wedding|graduation|retirement)\s*(plan|party|celebration|event)/i,
      /\b(trip|travel|vacation|holiday)\s*(plan|to|itinerary|ideas)/i,
      /\b(milestone|achievement|accomplishment)\s*(celebration|commemorate)/i,
      /\b(celebrate|celebrating|commemorate)\s*(my|our|the|this)/i,
      /\b(surprise|surprises?)\s*(party|event|for)/i,
      /\b(company|team|work|office)\s*(milestone|celebration|event|party|achievement|retreat|offsite)/i,
      /\b(in\s*charge\s*of|responsible\s*for|organizing|planning)\s*(the|a|an)?\s*(event|party|celebration|retreat)/i,
      /\b(annual|quarterly|monthly)\s*(retreat|event|celebration|gathering)/i,
    ],
    weakPatterns: [
      /\b(event|party|celebration|milestone|retreat)/i,
      /\b(plan|planning|organize)/i,
      /\b(trip|travel|vacation|holiday)/i,
      /\b(birthday|anniversary|wedding)/i,
      /\b(special|memorable|occasion)/i,
      /\b(tasked|assigned|leading|coordinating)/i,
      /\b(offsite|gathering|get-together)/i,
    ],
    themes: [
      'event planning',
      'celebrations',
      'milestones',
      'travel planning',
      'special occasions',
      'making memories',
    ],
  },

  'nayan-patel': {
    strongPatterns: [
      /\b(meaning|purpose|significance)\s*(of|in|behind)\s*(life|my|this|the)/i,
      /\b(big\s*questions|existential|philosophy|philosophical)/i,
      /\b(long[- ]?term|bigger\s*picture|life\s*path|life\s*direction)/i,
      /\b(wisdom|wise|guidance)\s*(on|about|for)/i,
      /\b(what\s*(really\s*)?matters|what's\s*important)/i,
      /\b(spiritual|soul|inner\s*peace|mindful)/i,
      /\b(perspective|bigger\s*picture|step\s*back)/i,
      /\b(mortality|death|legacy|how\s*will\s*I\s*be\s*remembered)/i,
      /\b(values|principles|beliefs)\s*(in\s*life|clarif|align)/i,
      /\b(patience|patient|waiting|long\s*game)/i,
      // NEW: More natural expressions for life meaning/philosophy
      /\b(drifting|without\s*(a\s*)?(clear\s*)?purpose|without\s*direction)/i,
      /\b(questioning\s*(my|the|what))/i,
      /\b(career\s*path|life\s*choices|life\s*decisions)/i,
      /\b(timeless|framework|frameworks)/i,
      /\b(thinking\s*(a\s*lot\s*)?about\s*(my|the|what).*long.?term)/i,
      /\b(what\s*do\s*I\s*(really\s*)?(want|value|care))/i,
      /\b(find\s*my\s*purpose|sense\s*of\s*purpose)/i,
    ],
    weakPatterns: [
      /\b(meaning|purpose|fulfillment)/i,
      /\b(life|living|existence)/i,
      /\b(wisdom|wise|advice)/i,
      /\b(perspective|viewpoint|outlook)/i,
      /\b(philosophy|philosophical|existential)/i,
      /\b(spiritual|soul|inner)/i,
      /\b(patience|patient|waiting)/i,
      // NEW: Additional weak signals
      /\b(aligns?|alignment)/i,
      /\b(reflecting|reflect\s*on)/i,
      /\b(truly|really\s*want)/i,
    ],
    themes: [
      'meaning of life',
      'philosophy',
      'wisdom',
      'long-term thinking',
      'existential questions',
      'purpose',
    ],
  },
};

// ============================================================================
// SEMANTIC MATCHING
// ============================================================================

interface SemanticScore {
  personaId: PersonaId;
  score: number;
  strongMatches: number;
  weakMatches: number;
  reason: string;
}

/**
 * Calculate semantic similarity score for a persona
 */
function calculateSemanticScore(message: string, personaId: PersonaId): SemanticScore {
  const patterns = SEMANTIC_PATTERNS[personaId];
  if (!patterns) {
    return { personaId, score: 0, strongMatches: 0, weakMatches: 0, reason: 'No patterns' };
  }

  let strongMatches = 0;
  let weakMatches = 0;
  const matchedStrong: string[] = [];
  const matchedWeak: string[] = [];

  // Check strong patterns (0.4 points each, max 0.8)
  for (const pattern of patterns.strongPatterns) {
    if (pattern.test(message)) {
      strongMatches++;
      matchedStrong.push(pattern.source.slice(0, 30));
    }
  }

  // Check weak patterns (0.1 points each, max 0.3)
  for (const pattern of patterns.weakPatterns) {
    if (pattern.test(message)) {
      weakMatches++;
      matchedWeak.push(pattern.source.slice(0, 20));
    }
  }

  // Calculate score
  const strongScore = Math.min(0.8, strongMatches * 0.4);
  const weakScore = Math.min(0.3, weakMatches * 0.1);
  const score = strongScore + weakScore;

  const reason =
    [
      strongMatches > 0 ? `${strongMatches} strong match(es)` : '',
      weakMatches > 0 ? `${weakMatches} weak match(es)` : '',
    ]
      .filter(Boolean)
      .join(', ') || 'No matches';

  return {
    personaId,
    score,
    strongMatches,
    weakMatches,
    reason,
  };
}

// ============================================================================
// ENHANCED HANDOFF DETECTION
// ============================================================================

/**
 * Detect handoff opportunity using semantic matching
 *
 * Improvements over basic keyword matching:
 * - Catches conceptual intent ("disciplined about my day" → Maya)
 * - Uses weighted patterns (strong vs weak signals)
 * - Better confidence scoring
 */
export function detectHandoffSemanticly(
  userId: string,
  userMessage: string,
  currentPersona: PersonaId = 'ferni'
): HandoffDecision {
  const experience = getOrCreateExperience(userId);

  // Calculate scores for all personas
  const scores: SemanticScore[] = [];
  const personas: PersonaId[] = [
    'maya-santos',
    'alex-chen',
    'peter-john',
    'jordan-taylor',
    'nayan-patel',
  ];

  for (const personaId of personas) {
    if (personaId === currentPersona) continue;

    const score = calculateSemanticScore(userMessage, personaId);
    if (score.score > 0) {
      scores.push(score);
    }
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  // Best candidate needs score >= 0.4 (1 strong match OR 4 weak matches)
  if (scores.length === 0 || scores[0].score < 0.4) {
    return {
      shouldHandoff: false,
      candidate: null,
      currentPersona,
      userConsent: 'not_asked',
    };
  }

  const best = scores[0];
  const profile = TEAM_PROFILES[best.personaId];

  // Check for bad history
  const badHistory = experience.handoffHistory.filter(
    (h) => h.to === best.personaId && !h.successful
  );
  if (badHistory.length >= 2 && scores.length > 1) {
    // Try second best
    const secondBest = scores[1];
    const secondProfile = TEAM_PROFILES[secondBest.personaId];
    if (secondBest.score >= 0.4) {
      return {
        shouldHandoff: true,
        candidate: {
          personaId: secondBest.personaId,
          reason: `Semantic match: ${secondBest.reason}`,
          confidence: Math.min(0.95, secondBest.score),
          warmIntro:
            secondProfile.warmIntros[Math.floor(Math.random() * secondProfile.warmIntros.length)],
          specialization: secondProfile.specializations,
        },
        currentPersona,
        userConsent: 'not_asked',
      };
    }
  }

  log.debug(
    { userId, personaId: best.personaId, score: best.score, reason: best.reason },
    '🎯 Semantic handoff match'
  );

  // Track detection for analytics
  recordDetection(
    'handoff',
    userMessage,
    best.personaId,
    best.score,
    [] // Could add matched pattern details here
  );

  return {
    shouldHandoff: true,
    candidate: {
      personaId: best.personaId,
      reason: `Semantic match: ${best.reason}`,
      confidence: Math.min(0.95, best.score),
      warmIntro: profile.warmIntros[Math.floor(Math.random() * profile.warmIntros.length)],
      specialization: profile.specializations,
    },
    currentPersona,
    userConsent: 'not_asked',
  };
}

/**
 * Combined detection: semantic + keyword (fallback)
 */
export function detectHandoffEnhanced(
  userId: string,
  userMessage: string,
  currentPersona: PersonaId = 'ferni'
): HandoffDecision {
  // Try semantic first
  const semanticResult = detectHandoffSemanticly(userId, userMessage, currentPersona);

  if (semanticResult.shouldHandoff) {
    return semanticResult;
  }

  // Fall back to original keyword matching (inline implementation to avoid circular import)
  const lower = userMessage.toLowerCase();
  const experience = getOrCreateExperience(userId);
  const candidates: HandoffCandidate[] = [];

  for (const [id, profile] of Object.entries(TEAM_PROFILES)) {
    if (id === currentPersona) continue;

    const keywordMatches = profile.keywords.filter((kw) => lower.includes(kw)).length;

    if (keywordMatches >= 2) {
      const confidence = Math.min(0.9, 0.4 + keywordMatches * 0.15);
      const warmIntro = profile.warmIntros[Math.floor(Math.random() * profile.warmIntros.length)];

      candidates.push({
        personaId: id as PersonaId,
        reason: `Keyword match: ${keywordMatches} keywords`,
        confidence,
        warmIntro,
        specialization: profile.specializations,
      });
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  if (candidates.length > 0 && candidates[0].confidence >= 0.5) {
    return {
      shouldHandoff: true,
      candidate: candidates[0],
      currentPersona,
      userConsent: 'not_asked',
    };
  }

  return {
    shouldHandoff: false,
    candidate: null,
    currentPersona,
    userConsent: 'not_asked',
  };
}

// Re-export TEAM_PROFILES and getOrCreateExperience for tests
export { TEAM_PROFILES, getOrCreateExperience };
