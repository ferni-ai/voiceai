/**
 * Peter's Big Brain - Global Research Knowledge Base
 *
 * This is where Peter stores everything he learns from research.
 * Unlike user-specific data, this knowledge is shared and benefits everyone.
 *
 * Think of it as Peter's institutional memory - he never forgets a good insight.
 *
 * @module tools/domains/research/global-intelligence/big-brain
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import type {
  ResearchEntry,
  ResearchType,
  CompanyKnowledge,
  SectorKnowledge,
  MarketWisdom,
} from './types.js';

const log = getLogger();

// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================

let db: FirebaseFirestore.Firestore | null = null;

async function getFirestore(): Promise<FirebaseFirestore.Firestore> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
    });
    log.info('Big Brain Firestore initialized');
    return db;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Big Brain Firestore');
    throw error;
  }
}

const COLLECTIONS = {
  RESEARCH: 'peter_research',
  COMPANIES: 'peter_companies',
  SECTORS: 'peter_sectors',
  WISDOM: 'peter_wisdom',
  EXPLANATIONS: 'peter_explanations',
  PATTERNS: 'peter_patterns',
};

// ============================================================================
// RESEARCH ENTRIES
// ============================================================================

/**
 * Store a new research finding
 */
export async function storeResearch(entry: ResearchEntry): Promise<void> {
  try {
    const firestore = await getFirestore();
    const docRef = firestore.collection(COLLECTIONS.RESEARCH).doc(entry.id);

    await docRef.set({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      quality: {
        ...entry.quality,
        verifiedAt: entry.quality.verifiedAt?.toISOString(),
        expiresAt: entry.quality.expiresAt?.toISOString(),
      },
      usage: {
        ...entry.usage,
        lastUsed: entry.usage.lastUsed?.toISOString(),
      },
    });

    log.debug({ id: entry.id, type: entry.type, title: entry.title }, 'Research stored in Big Brain');
  } catch (error) {
    log.error({ error: String(error), id: entry.id }, 'Failed to store research');
  }
}

/**
 * Search research by topic or keyword
 */
export async function searchResearch(
  query: string,
  options: {
    type?: ResearchType;
    symbols?: string[];
    limit?: number;
    minConfidence?: number;
  } = {}
): Promise<ResearchEntry[]> {
  try {
    const firestore = await getFirestore();
    let queryRef = firestore.collection(COLLECTIONS.RESEARCH) as FirebaseFirestore.Query;

    if (options.type) {
      queryRef = queryRef.where('type', '==', options.type);
    }

    if (options.minConfidence) {
      queryRef = queryRef.where('quality.confidenceScore', '>=', options.minConfidence);
    }

    // Get all matching documents and filter by relevance
    const snapshot = await queryRef.limit(options.limit || 20).get();

    const results: ResearchEntry[] = [];
    const queryLower = query.toLowerCase();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Check relevance
      const isRelevant =
        data.title?.toLowerCase().includes(queryLower) ||
        data.content?.summary?.toLowerCase().includes(queryLower) ||
        data.categories?.topics?.some((t: string) => t.toLowerCase().includes(queryLower)) ||
        (options.symbols && data.categories?.symbols?.some((s: string) => options.symbols!.includes(s)));

      if (isRelevant) {
        results.push(deserializeResearch(data));
      }
    }

    // Sort by usage and confidence
    results.sort((a, b) => {
      const scoreA = a.usage.helpfulnessScore * 0.6 + a.quality.confidenceScore * 0.4;
      const scoreB = b.usage.helpfulnessScore * 0.6 + b.quality.confidenceScore * 0.4;
      return scoreB - scoreA;
    });

    return results.slice(0, options.limit || 10);
  } catch (error) {
    log.error({ error: String(error), query }, 'Failed to search research');
    return [];
  }
}

/**
 * Get research for specific symbols
 */
export async function getResearchForSymbols(symbols: string[]): Promise<ResearchEntry[]> {
  try {
    const firestore = await getFirestore();
    const snapshot = await firestore
      .collection(COLLECTIONS.RESEARCH)
      .where('categories.symbols', 'array-contains-any', symbols.map(s => s.toUpperCase()))
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc) => deserializeResearch(doc.data()));
  } catch (error) {
    log.error({ error: String(error), symbols }, 'Failed to get research for symbols');
    return [];
  }
}

/**
 * Record that research was used (for learning what's helpful)
 */
export async function recordResearchUsage(
  researchId: string,
  wasHelpful: boolean
): Promise<void> {
  try {
    const firestore = await getFirestore();
    const docRef = firestore.collection(COLLECTIONS.RESEARCH).doc(researchId);

    const doc = await docRef.get();
    if (!doc.exists) return;

    const data = doc.data()!;
    const currentUsage = data.usage || { timesUsed: 0, helpfulnessScore: 0.5 };

    // Update usage stats with exponential moving average
    const newTimesUsed = currentUsage.timesUsed + 1;
    const alpha = 0.1; // Weight for new data
    const newHelpfulnessScore =
      currentUsage.helpfulnessScore * (1 - alpha) + (wasHelpful ? 1 : 0) * alpha;

    await docRef.update({
      'usage.timesUsed': newTimesUsed,
      'usage.helpfulnessScore': newHelpfulnessScore,
      'usage.lastUsed': new Date().toISOString(),
    });

    log.debug({ researchId, wasHelpful, newScore: newHelpfulnessScore }, 'Research usage recorded');
  } catch (error) {
    log.error({ error: String(error), researchId }, 'Failed to record research usage');
  }
}

function deserializeResearch(data: Record<string, unknown>): ResearchEntry {
  const quality = data.quality as Record<string, unknown>;
  const usage = data.usage as Record<string, unknown>;

  return {
    ...data,
    quality: {
      confidenceScore: quality?.confidenceScore as number || 0.5,
      timeSensitive: quality?.timeSensitive as boolean || false,
      verifiedAt: quality?.verifiedAt ? new Date(quality.verifiedAt as string) : undefined,
      verificationSource: quality?.verificationSource as string | undefined,
      expiresAt: quality?.expiresAt ? new Date(quality.expiresAt as string) : undefined,
    },
    usage: {
      timesUsed: usage?.timesUsed as number || 0,
      helpfulnessScore: usage?.helpfulnessScore as number || 0.5,
      lastUsed: usage?.lastUsed ? new Date(usage.lastUsed as string) : undefined,
    },
    createdAt: new Date(data.createdAt as string),
    updatedAt: new Date(data.updatedAt as string),
  } as ResearchEntry;
}

// ============================================================================
// COMPANY KNOWLEDGE
// ============================================================================

/**
 * Store or update company knowledge
 */
export async function storeCompanyKnowledge(company: CompanyKnowledge): Promise<void> {
  try {
    const firestore = await getFirestore();
    const docRef = firestore.collection(COLLECTIONS.COMPANIES).doc(company.symbol.toUpperCase());

    await docRef.set({
      ...company,
      history: {
        ...company.history,
        significantEvents: company.history.significantEvents.map((e) => ({
          ...e,
          date: e.date.toISOString(),
        })),
      },
      lastUpdated: new Date().toISOString(),
    }, { merge: true });

    log.debug({ symbol: company.symbol }, 'Company knowledge stored');
  } catch (error) {
    log.error({ error: String(error), symbol: company.symbol }, 'Failed to store company knowledge');
  }
}

/**
 * Get Peter's knowledge about a company
 */
export async function getCompanyKnowledge(symbol: string): Promise<CompanyKnowledge | null> {
  try {
    const firestore = await getFirestore();
    const docRef = firestore.collection(COLLECTIONS.COMPANIES).doc(symbol.toUpperCase());

    const doc = await docRef.get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    return {
      ...data,
      history: {
        ...data.history,
        significantEvents: (data.history?.significantEvents || []).map((e: Record<string, unknown>) => ({
          ...e,
          date: new Date(e.date as string),
        })),
      },
      lastUpdated: new Date(data.lastUpdated),
    } as CompanyKnowledge;
  } catch (error) {
    log.error({ error: String(error), symbol }, 'Failed to get company knowledge');
    return null;
  }
}

/**
 * Record that a user asked about a company
 */
export async function recordCompanyInterest(
  symbol: string,
  question?: string
): Promise<void> {
  try {
    const firestore = await getFirestore();
    const docRef = firestore.collection(COLLECTIONS.COMPANIES).doc(symbol.toUpperCase());

    const doc = await docRef.get();
    const data = doc.exists ? doc.data()! : {};

    const currentInterest = data.userInterest || { timesAskedAbout: 0, commonQuestions: [] };

    await docRef.set({
      symbol: symbol.toUpperCase(),
      userInterest: {
        timesAskedAbout: currentInterest.timesAskedAbout + 1,
        commonQuestions: question
          ? [...new Set([...currentInterest.commonQuestions, question])].slice(-20)
          : currentInterest.commonQuestions,
      },
      lastUpdated: new Date().toISOString(),
    }, { merge: true });

    log.debug({ symbol }, 'Company interest recorded');
  } catch (error) {
    log.error({ error: String(error), symbol }, 'Failed to record company interest');
  }
}

/**
 * Get most asked about companies
 */
export async function getPopularCompanies(limit = 20): Promise<Array<{ symbol: string; timesAsked: number }>> {
  try {
    const firestore = await getFirestore();
    const snapshot = await firestore
      .collection(COLLECTIONS.COMPANIES)
      .orderBy('userInterest.timesAskedAbout', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      symbol: doc.id,
      timesAsked: doc.data().userInterest?.timesAskedAbout || 0,
    }));
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get popular companies');
    return [];
  }
}

// ============================================================================
// SECTOR KNOWLEDGE
// ============================================================================

/**
 * Store or update sector knowledge
 */
export async function storeSectorKnowledge(sector: SectorKnowledge): Promise<void> {
  try {
    const firestore = await getFirestore();
    const docRef = firestore.collection(COLLECTIONS.SECTORS).doc(sector.sectorId);

    await docRef.set({
      ...sector,
      lastUpdated: new Date().toISOString(),
    });

    log.debug({ sectorId: sector.sectorId }, 'Sector knowledge stored');
  } catch (error) {
    log.error({ error: String(error), sectorId: sector.sectorId }, 'Failed to store sector knowledge');
  }
}

/**
 * Get Peter's knowledge about a sector
 */
export async function getSectorKnowledge(sectorId: string): Promise<SectorKnowledge | null> {
  try {
    const firestore = await getFirestore();
    const docRef = firestore.collection(COLLECTIONS.SECTORS).doc(sectorId);

    const doc = await docRef.get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    return {
      ...data,
      lastUpdated: new Date(data.lastUpdated),
    } as SectorKnowledge;
  } catch (error) {
    log.error({ error: String(error), sectorId }, 'Failed to get sector knowledge');
    return null;
  }
}

/**
 * Get all sectors
 */
export async function getAllSectors(): Promise<SectorKnowledge[]> {
  try {
    const firestore = await getFirestore();
    const snapshot = await firestore.collection(COLLECTIONS.SECTORS).get();

    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      lastUpdated: new Date(doc.data().lastUpdated),
    } as SectorKnowledge));
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get all sectors');
    return [];
  }
}

// ============================================================================
// MARKET WISDOM
// ============================================================================

/**
 * Store market wisdom
 */
export async function storeWisdom(wisdom: MarketWisdom): Promise<void> {
  try {
    const firestore = await getFirestore();
    const docRef = firestore.collection(COLLECTIONS.WISDOM).doc(wisdom.id);

    await docRef.set({
      ...wisdom,
      createdAt: wisdom.createdAt.toISOString(),
    });

    log.debug({ id: wisdom.id, category: wisdom.category }, 'Wisdom stored');
  } catch (error) {
    log.error({ error: String(error), id: wisdom.id }, 'Failed to store wisdom');
  }
}

/**
 * Get relevant wisdom for current market conditions
 */
export async function getRelevantWisdom(
  conditions: string[],
  category?: MarketWisdom['category']
): Promise<MarketWisdom[]> {
  try {
    const firestore = await getFirestore();
    let queryRef = firestore.collection(COLLECTIONS.WISDOM) as FirebaseFirestore.Query;

    if (category) {
      queryRef = queryRef.where('category', '==', category);
    }

    const snapshot = await queryRef.limit(50).get();

    // Filter by relevance to conditions
    const results: MarketWisdom[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const applicableConditions = data.applicability?.marketConditions || [];
      const matchCount = conditions.filter((c) =>
        applicableConditions.some((ac: string) => ac.toLowerCase().includes(c.toLowerCase()))
      ).length;

      if (matchCount > 0 || conditions.length === 0) {
        results.push({
          ...data,
          createdAt: new Date(data.createdAt),
        } as MarketWisdom);
      }
    }

    // Sort by effectiveness
    results.sort((a, b) => b.effectiveness.helpfulnessScore - a.effectiveness.helpfulnessScore);

    return results.slice(0, 10);
  } catch (error) {
    log.error({ error: String(error), conditions }, 'Failed to get relevant wisdom');
    return [];
  }
}

/**
 * Get wisdom for user situations
 */
export async function getWisdomForSituation(situation: string): Promise<MarketWisdom[]> {
  try {
    const firestore = await getFirestore();
    const snapshot = await firestore.collection(COLLECTIONS.WISDOM).limit(100).get();

    const results: MarketWisdom[] = [];
    const situationLower = situation.toLowerCase();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const situations = data.applicability?.userSituations || [];
      const triggers = data.applicability?.triggerPhrases || [];

      const isRelevant =
        situations.some((s: string) => situationLower.includes(s.toLowerCase())) ||
        triggers.some((t: string) => situationLower.includes(t.toLowerCase()));

      if (isRelevant) {
        results.push({
          ...data,
          createdAt: new Date(data.createdAt),
        } as MarketWisdom);
      }
    }

    return results.slice(0, 5);
  } catch (error) {
    log.error({ error: String(error), situation }, 'Failed to get wisdom for situation');
    return [];
  }
}

/**
 * Record wisdom usage
 */
export async function recordWisdomUsage(wisdomId: string, wasHelpful: boolean): Promise<void> {
  try {
    const firestore = await getFirestore();
    const docRef = firestore.collection(COLLECTIONS.WISDOM).doc(wisdomId);

    const doc = await docRef.get();
    if (!doc.exists) return;

    const data = doc.data()!;
    const effectiveness = data.effectiveness || { timesShared: 0, helpfulnessScore: 0.5 };

    const alpha = 0.1;
    const newScore = effectiveness.helpfulnessScore * (1 - alpha) + (wasHelpful ? 1 : 0) * alpha;

    await docRef.update({
      'effectiveness.timesShared': effectiveness.timesShared + 1,
      'effectiveness.helpfulnessScore': newScore,
    });

    log.debug({ wisdomId, wasHelpful }, 'Wisdom usage recorded');
  } catch (error) {
    log.error({ error: String(error), wisdomId }, 'Failed to record wisdom usage');
  }
}

// ============================================================================
// LEARNING FROM RESEARCH
// ============================================================================

/**
 * When Peter does research, store the findings in Big Brain
 */
export async function learnFromResearch(params: {
  topic: string;
  type: ResearchType;
  findings: {
    summary: string;
    keyPoints: string[];
    fullAnalysis?: string;
  };
  symbols?: string[];
  sectors?: string[];
  confidence: number;
  source: string;
}): Promise<ResearchEntry> {
  const entry: ResearchEntry = {
    id: `research_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: params.type,
    title: params.topic,
    content: {
      summary: params.findings.summary,
      keyPoints: params.findings.keyPoints,
      fullAnalysis: params.findings.fullAnalysis || params.findings.summary,
      sources: [params.source],
    },
    categories: {
      symbols: params.symbols,
      sectors: params.sectors,
      topics: extractTopics(params.topic, params.findings.summary),
      concepts: extractConcepts(params.findings.keyPoints),
    },
    quality: {
      confidenceScore: params.confidence,
      timeSensitive: params.type === 'market_pattern' || params.type === 'economic_insight',
      expiresAt: params.type === 'market_pattern' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : undefined,
    },
    usage: {
      timesUsed: 0,
      helpfulnessScore: 0.5,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdFrom: params.source,
  };

  await storeResearch(entry);
  return entry;
}

function extractTopics(title: string, summary: string): string[] {
  const text = `${title} ${summary}`.toLowerCase();
  const topicKeywords = [
    'valuation', 'growth', 'dividend', 'risk', 'momentum', 'value',
    'tech', 'healthcare', 'finance', 'energy', 'consumer',
    'inflation', 'interest rate', 'recession', 'bull', 'bear',
    'etf', 'index', 'bond', 'stock', 'portfolio',
    'retirement', 'fire', 'savings', 'budget', 'tax',
  ];

  return topicKeywords.filter((keyword) => text.includes(keyword));
}

function extractConcepts(keyPoints: string[]): string[] {
  const text = keyPoints.join(' ').toLowerCase();
  const conceptKeywords = [
    'p/e ratio', 'peg ratio', 'dividend yield', 'market cap',
    'beta', 'alpha', 'sharpe ratio', 'volatility',
    'compound interest', 'dollar cost averaging', 'diversification',
    'asset allocation', 'rebalancing', 'tax loss harvesting',
  ];

  return conceptKeywords.filter((concept) => text.includes(concept));
}

// ============================================================================
// PATTERN LEARNING
// ============================================================================

/**
 * Store a market pattern Peter has observed
 */
export async function storeMarketPattern(pattern: {
  name: string;
  description: string;
  conditions: string[];
  typicalOutcome: string;
  confidence: number;
  historicalExamples: Array<{ date: string; description: string }>;
}): Promise<void> {
  try {
    const firestore = await getFirestore();
    const docRef = firestore.collection(COLLECTIONS.PATTERNS).doc(`pattern_${Date.now()}`);

    await docRef.set({
      ...pattern,
      createdAt: new Date().toISOString(),
      timesObserved: 1,
      accuracy: pattern.confidence,
    });

    log.debug({ name: pattern.name }, 'Market pattern stored');
  } catch (error) {
    log.error({ error: String(error), name: pattern.name }, 'Failed to store market pattern');
  }
}

/**
 * Check if current conditions match known patterns
 */
export async function checkForPatterns(
  currentConditions: string[]
): Promise<Array<{ pattern: string; confidence: number; typicalOutcome: string }>> {
  try {
    const firestore = await getFirestore();
    const snapshot = await firestore.collection(COLLECTIONS.PATTERNS).get();

    const matches: Array<{ pattern: string; confidence: number; typicalOutcome: string }> = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const patternConditions = data.conditions || [];

      // Calculate match score
      const matchCount = currentConditions.filter((c) =>
        patternConditions.some((pc: string) => pc.toLowerCase().includes(c.toLowerCase()))
      ).length;

      const matchScore = patternConditions.length > 0 ? matchCount / patternConditions.length : 0;

      if (matchScore >= 0.5) {
        matches.push({
          pattern: data.name,
          confidence: data.accuracy * matchScore,
          typicalOutcome: data.typicalOutcome,
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    log.error({ error: String(error), currentConditions }, 'Failed to check for patterns');
    return [];
  }
}

// ============================================================================
// BRAIN STATS
// ============================================================================

/**
 * Get statistics about Peter's Big Brain
 */
export async function getBrainStats(): Promise<{
  totalResearch: number;
  companiesKnown: number;
  sectorsAnalyzed: number;
  wisdomEntries: number;
  patternsLearned: number;
  avgHelpfulness: number;
}> {
  try {
    const firestore = await getFirestore();

    const [research, companies, sectors, wisdom, patterns] = await Promise.all([
      firestore.collection(COLLECTIONS.RESEARCH).count().get(),
      firestore.collection(COLLECTIONS.COMPANIES).count().get(),
      firestore.collection(COLLECTIONS.SECTORS).count().get(),
      firestore.collection(COLLECTIONS.WISDOM).count().get(),
      firestore.collection(COLLECTIONS.PATTERNS).count().get(),
    ]);

    // Calculate average helpfulness
    const researchDocs = await firestore
      .collection(COLLECTIONS.RESEARCH)
      .orderBy('usage.helpfulnessScore', 'desc')
      .limit(100)
      .get();

    let totalHelpfulness = 0;
    researchDocs.forEach((doc) => {
      totalHelpfulness += doc.data().usage?.helpfulnessScore || 0.5;
    });
    const avgHelpfulness = researchDocs.size > 0 ? totalHelpfulness / researchDocs.size : 0.5;

    return {
      totalResearch: research.data().count,
      companiesKnown: companies.data().count,
      sectorsAnalyzed: sectors.data().count,
      wisdomEntries: wisdom.data().count,
      patternsLearned: patterns.data().count,
      avgHelpfulness,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get brain stats');
    return {
      totalResearch: 0,
      companiesKnown: 0,
      sectorsAnalyzed: 0,
      wisdomEntries: 0,
      patternsLearned: 0,
      avgHelpfulness: 0.5,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const BigBrain = {
  // Research
  storeResearch,
  searchResearch,
  getResearchForSymbols,
  recordResearchUsage,
  learnFromResearch,

  // Companies
  storeCompanyKnowledge,
  getCompanyKnowledge,
  recordCompanyInterest,
  getPopularCompanies,

  // Sectors
  storeSectorKnowledge,
  getSectorKnowledge,
  getAllSectors,

  // Wisdom
  storeWisdom,
  getRelevantWisdom,
  getWisdomForSituation,
  recordWisdomUsage,

  // Patterns
  storeMarketPattern,
  checkForPatterns,

  // Stats
  getBrainStats,
};

export default BigBrain;

