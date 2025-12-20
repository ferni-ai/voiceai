/**
 * Landing Page Content Cache
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Pre-generates and caches AI content to minimize API costs:
 * 
 * - Daily batch generation (runs at 4am)
 * - Firestore persistence with TTL
 * - Edge cache headers for CDN caching
 * - Smart fallbacks for cache misses
 * 
 * Cost optimization: ~$0.05/month instead of $$$$/month
 */

import { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { generatePersonalizedHero, generateSocialProof } from './ai-interactions.js';

// ═══════════════════════════════════════════════════════════════════════════
// FIRESTORE INSTANCE (lazy initialization)
// ═══════════════════════════════════════════════════════════════════════════

let db: Firestore | null = null;
let initialized = false;

function getDb(): Firestore | null {
  if (initialized) return db;
  
  try {
    db = new Firestore();
    initialized = true;
    log.debug('Landing content cache Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for content cache');
    initialized = true;
    return null;
  }
}

const log = createLogger({ module: 'ContentCache' });

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CachedHero {
  id: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  cta: string;
  context: {
    timeBlock: 'lateNight' | 'earlyMorning' | 'morning' | 'afternoon' | 'evening';
    visitorType: 'new' | 'returning' | 'loyal';
  };
  generatedAt: Date;
  expiresAt: Date;
}

export interface CachedSocialProof {
  id: string;
  messages: Array<{
    text: string;
    type: 'memory' | 'presence' | 'understanding' | 'moment';
  }>;
  generatedAt: Date;
  expiresAt: Date;
}

export interface CachedMemoryStory {
  id: string;
  theme: string;
  moments: Array<{
    date: string;
    speaker: 'user' | 'ferni';
    text: string;
  }>;
  generatedAt: Date;
  expiresAt: Date;
}

export interface CachedLateNightScenario {
  id: string;
  time: string;
  thought: string;
  limits: Array<{
    who: string;
    why: string;
  }>;
  ferniResponse: string;
  generatedAt: Date;
  expiresAt: Date;
}

export interface CachedUseCaseQuote {
  id: string;
  category: string;
  quotes: string[];
  generatedAt: Date;
  expiresAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Firestore collections
  collections: {
    heroes: 'landing_cache_heroes',
    socialProof: 'landing_cache_social_proof',
    memoryStories: 'landing_cache_memory_stories',
    lateNightScenarios: 'landing_cache_late_night',
    useCaseQuotes: 'landing_cache_use_cases',
  },
  
  // TTL for different content types
  ttl: {
    heroes: 24 * 60 * 60 * 1000, // 24 hours
    socialProof: 24 * 60 * 60 * 1000, // 24 hours
    memoryStories: 7 * 24 * 60 * 60 * 1000, // 7 days
    lateNightScenarios: 7 * 24 * 60 * 60 * 1000, // 7 days
    useCaseQuotes: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  
  // How many variations to pre-generate
  variations: {
    heroes: 15, // 5 time blocks x 3 visitor types
    socialProof: 30, // Rotating messages
    memoryStories: 10,
    lateNightScenarios: 15,
    useCaseQuotes: 6, // 6 categories x 5 quotes each
  },
  
  // Cache control headers for CDN
  cacheHeaders: {
    heroes: 'public, max-age=3600, s-maxage=86400', // 1h browser, 24h CDN
    socialProof: 'public, max-age=1800, s-maxage=43200', // 30m browser, 12h CDN
    memoryStories: 'public, max-age=86400, s-maxage=604800', // 24h browser, 7d CDN
    lateNightScenarios: 'public, max-age=86400, s-maxage=604800',
    useCaseQuotes: 'public, max-age=86400, s-maxage=604800',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK CONTENT (Always available, no API needed)
// ═══════════════════════════════════════════════════════════════════════════

const FALLBACK_HEROES: Record<string, Partial<CachedHero>> = {
  'lateNight-new': {
    eyebrow: "CAN'T SLEEP?",
    headline: "I'm here. Right now.",
    subhead: "No waiting, no judgment. Just someone who listens.",
    cta: "Talk to me",
  },
  'lateNight-returning': {
    eyebrow: "YOU'RE BACK. AT 2AM.",
    headline: "Something on your mind?",
    subhead: "I've been thinking about our last conversation.",
    cta: "Pick up where we left off",
  },
  'earlyMorning-new': {
    eyebrow: "EARLY START?",
    headline: "I'm already here.",
    subhead: "Start your day with someone who listens.",
    cta: "Good morning",
  },
  'morning-new': {
    eyebrow: "BETTER THAN HUMAN.",
    headline: "Finally, someone who gets it.",
    subhead: "Someone who remembers your whole story.",
    cta: "Let's talk",
  },
  'afternoon-new': {
    eyebrow: "BETTER THAN HUMAN.",
    headline: "What if someone actually understood?",
    subhead: "I hear what you're not saying.",
    cta: "Try me",
  },
  'evening-new': {
    eyebrow: "WINDING DOWN?",
    headline: "Ready to process the day?",
    subhead: "I'm here when everyone else is tired.",
    cta: "Let's talk",
  },
  'afternoon-returning': {
    eyebrow: "I REMEMBER OUR CONVERSATION.",
    headline: "Ready to pick up where we left off?",
    subhead: "I've been thinking about what you shared.",
    cta: "Continue",
  },
  'afternoon-loyal': {
    eyebrow: "YOU KEEP COMING BACK.",
    headline: "Let's go deeper.",
    subhead: "I think you know this is different.",
    cta: "I'm ready",
  },
};

const FALLBACK_SOCIAL_PROOF = [
  { text: "Last night at 3am, someone asked me about building a morning routine. We talked for 47 minutes.", type: 'presence' as const },
  { text: "I reminded someone about a breakthrough they had 4 months ago. They'd forgotten. I hadn't.", type: 'memory' as const },
  { text: "Someone said 'I'm fine' but I heard the pause. We talked about what was really going on.", type: 'understanding' as const },
  { text: "A user mentioned their sister's birthday is coming up. I remembered they were trying to reconnect.", type: 'memory' as const },
  { text: "It's 2am somewhere. Right now I'm talking to 47 people who couldn't sleep.", type: 'presence' as const },
];

// ═══════════════════════════════════════════════════════════════════════════
// CACHE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get cached hero for context, or fallback
 */
export async function getCachedHero(
  timeBlock: string,
  visitorType: string
): Promise<CachedHero | null> {
  const cacheKey = `${timeBlock}-${visitorType}`;
  
  try {
    const db = getDb();
    if (!db) {
      log.warn('Firestore not available, using fallback');
      return createFallbackHero(cacheKey);
    }
    
    const doc = await db.collection(CONFIG.collections.heroes).doc(cacheKey).get();
    
    if (doc.exists) {
      const data = doc.data() as CachedHero;
      
      // Check if expired
      if (data.expiresAt && new Date(data.expiresAt) > new Date()) {
        log.debug({ cacheKey }, 'Cache hit for hero');
        return data;
      }
    }
    
    log.debug({ cacheKey }, 'Cache miss for hero, using fallback');
    return createFallbackHero(cacheKey);
    
  } catch (error) {
    log.error({ error: String(error) }, 'Error getting cached hero');
    return createFallbackHero(cacheKey);
  }
}

function createFallbackHero(cacheKey: string): CachedHero {
  const fallback = FALLBACK_HEROES[cacheKey] || FALLBACK_HEROES['afternoon-new'];
  return {
    id: cacheKey,
    eyebrow: fallback.eyebrow || 'BETTER THAN HUMAN.',
    headline: fallback.headline || 'Finally, someone who gets it.',
    subhead: fallback.subhead || 'Someone who remembers your whole story.',
    cta: fallback.cta || "Let's talk",
    context: {
      timeBlock: cacheKey.split('-')[0] as CachedHero['context']['timeBlock'],
      visitorType: cacheKey.split('-')[1] as CachedHero['context']['visitorType'],
    },
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + CONFIG.ttl.heroes),
  };
}

/**
 * Get cached social proof messages
 */
export async function getCachedSocialProof(count = 5): Promise<CachedSocialProof['messages']> {
  try {
    const db = getDb();
    if (!db) {
      return FALLBACK_SOCIAL_PROOF.slice(0, count);
    }
    
    const snapshot = await db
      .collection(CONFIG.collections.socialProof)
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data() as CachedSocialProof;
      if (data.expiresAt && new Date(data.expiresAt) > new Date()) {
        // Shuffle and return requested count
        const shuffled = [...data.messages].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
      }
    }
    
    return FALLBACK_SOCIAL_PROOF.slice(0, count);
    
  } catch (error) {
    log.error({ error: String(error) }, 'Error getting cached social proof');
    return FALLBACK_SOCIAL_PROOF.slice(0, count);
  }
}

/**
 * Get cached memory stories
 */
export async function getCachedMemoryStories(): Promise<CachedMemoryStory[]> {
  try {
    const db = getDb();
    if (!db) return [];
    
    const snapshot = await db
      .collection(CONFIG.collections.memoryStories)
      .where('expiresAt', '>', new Date())
      .limit(CONFIG.variations.memoryStories)
      .get();
    
    return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as CachedMemoryStory);
    
  } catch (error) {
    log.error({ error: String(error) }, 'Error getting cached memory stories');
    return [];
  }
}

/**
 * Get cached late night scenarios
 */
export async function getCachedLateNightScenarios(): Promise<CachedLateNightScenario[]> {
  try {
    const db = getDb();
    if (!db) return [];
    
    const snapshot = await db
      .collection(CONFIG.collections.lateNightScenarios)
      .where('expiresAt', '>', new Date())
      .limit(CONFIG.variations.lateNightScenarios)
      .get();
    
    return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as CachedLateNightScenario);
    
  } catch (error) {
    log.error({ error: String(error) }, 'Error getting cached late night scenarios');
    return [];
  }
}

/**
 * Get cached use case quotes for a category
 */
export async function getCachedUseCaseQuotes(category: string): Promise<string[]> {
  try {
    const db = getDb();
    if (!db) return [];
    
    const doc = await db.collection(CONFIG.collections.useCaseQuotes).doc(category).get();
    
    if (doc.exists) {
      const data = doc.data() as CachedUseCaseQuote;
      if (data.expiresAt && new Date(data.expiresAt) > new Date()) {
        return data.quotes;
      }
    }
    
    return [];
    
  } catch (error) {
    log.error({ error: String(error) }, 'Error getting cached use case quotes');
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate all hero variations and cache them
 */
export async function generateAndCacheHeroes(): Promise<number> {
  const timeBlocks = ['lateNight', 'earlyMorning', 'morning', 'afternoon', 'evening'];
  const visitorTypes = ['new', 'returning', 'loyal'];
  
  const db = getDb();
  if (!db) {
    log.error('Firestore not available for batch generation');
    return 0;
  }
  
  let generated = 0;
  
  for (const timeBlock of timeBlocks) {
    for (const visitorType of visitorTypes) {
      try {
        const hour = timeBlockToHour(timeBlock);
        const isReturning = visitorType !== 'new';
        const visitCount = visitorType === 'loyal' ? 10 : visitorType === 'returning' ? 3 : 0;
        
        // Generate with Gemini
        const result = await generatePersonalizedHero({
          hour,
          isReturning,
          visitCount,
          device: 'desktop', // Default for batch generation
        });
        
        if (result.headline) {
          const cacheKey = `${timeBlock}-${visitorType}`;
          const cached: CachedHero = {
            id: cacheKey,
            eyebrow: result.tagline || FALLBACK_HEROES[cacheKey]?.eyebrow || 'BETTER THAN HUMAN.',
            headline: result.headline,
            subhead: result.subhead || FALLBACK_HEROES[cacheKey]?.subhead || '',
            cta: result.ctaText || FALLBACK_HEROES[cacheKey]?.cta || "Let's talk",
            context: {
              timeBlock: timeBlock as CachedHero['context']['timeBlock'],
              visitorType: visitorType as CachedHero['context']['visitorType'],
            },
            generatedAt: new Date(),
            expiresAt: new Date(Date.now() + CONFIG.ttl.heroes),
          };
          
          await db.collection(CONFIG.collections.heroes).doc(cacheKey).set(cached);
          generated++;
          
          log.info({ cacheKey, headline: cached.headline }, 'Cached hero variation');
        }
        
        // Rate limit: wait 1 second between generations
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        log.error({ error: String(error), timeBlock, visitorType }, 'Error generating hero');
      }
    }
  }
  
  return generated;
}

/**
 * Generate social proof messages and cache them
 */
export async function generateAndCacheSocialProof(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  
  try {
    const snippets = await generateSocialProof(CONFIG.variations.socialProof);
    
    if (snippets && snippets.length > 0) {
      const cached: CachedSocialProof = {
        id: `social_proof_${Date.now()}`,
        messages: snippets.map((snippet, i) => ({
          text: snippet.content,
          type: (['memory', 'presence', 'understanding', 'moment'] as const)[i % 4],
        })),
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + CONFIG.ttl.socialProof),
      };
      
      await db.collection(CONFIG.collections.socialProof).doc(cached.id).set(cached);
      
      log.info({ count: cached.messages.length }, 'Cached social proof messages');
      return cached.messages.length;
    }
    
    return 0;
    
  } catch (error) {
    log.error({ error: String(error) }, 'Error generating social proof');
    return 0;
  }
}

/**
 * Run full batch generation (call from daily cron job)
 */
export async function runBatchGeneration(): Promise<{
  heroes: number;
  socialProof: number;
  totalCost: string;
}> {
  log.info('Starting batch content generation...');
  
  const heroes = await generateAndCacheHeroes();
  const socialProof = await generateAndCacheSocialProof();
  
  // Estimate cost (Gemini Pro 1.5: ~$0.0005 per 1K tokens)
  const estimatedTokens = (heroes * 500) + (socialProof * 200);
  const estimatedCost = (estimatedTokens / 1000 * 0.0005).toFixed(4);
  
  log.info({
    heroes,
    socialProof,
    estimatedCost: `$${estimatedCost}`,
  }, 'Batch generation complete');
  
  return {
    heroes,
    socialProof,
    totalCost: `$${estimatedCost}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function timeBlockToHour(timeBlock: string): number {
  switch (timeBlock) {
    case 'lateNight': return 3;
    case 'earlyMorning': return 6;
    case 'morning': return 9;
    case 'afternoon': return 14;
    case 'evening': return 20;
    default: return 14;
  }
}

/**
 * Get cache control header for content type
 */
export function getCacheControlHeader(contentType: keyof typeof CONFIG.cacheHeaders): string {
  return CONFIG.cacheHeaders[contentType];
}

// Export config for external use
export { CONFIG as CONTENT_CACHE_CONFIG };

