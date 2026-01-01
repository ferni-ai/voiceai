/**
 * LLM Link Detector
 *
 * Uses LLM to detect sophisticated links between memories that
 * can't be found with simple heuristics:
 * - Causal links ("This led to that")
 * - Narrative links ("Part of the same life chapter")
 * - Contrast links ("Contradicting beliefs/events")
 *
 * This is "Better Than Human" because we can systematically
 * analyze the user's entire memory graph for connections they
 * might never consciously realize.
 *
 * @module memory/llm-link-detector
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLogger } from '../utils/safe-logger.js';
import { getMemoryGraph, type LinkType, type MemoryLink } from './memory-graph.js';

// Map our semantic link types to the MemoryGraph link types
const LINK_TYPE_MAP: Record<string, LinkType> = {
  causal: 'caused_by',
  narrative: 'narrative',
  contrast: 'contradiction',
  person: 'about_person',
  emotional: 'emotion',
  topic: 'topic',
  temporal: 'temporal',
};
import type { MemoryItem } from './interfaces/index.js';

const log = createLogger({ module: 'LLMLinkDetector' });

// ============================================================================
// TYPES
// ============================================================================

export interface DetectedLink {
  sourceId: string;
  targetId: string;
  type: LinkType;
  confidence: number;
  evidence: string;
  bidirectional: boolean;
}

export interface LinkDetectionResult {
  detected: DetectedLink[];
  processedPairs: number;
  llmCalls: number;
  duration: number;
}

export interface LLMLinkDetectorConfig {
  // Model settings
  model: string;
  temperature: number;

  // Batch settings
  maxPairsPerCall: number;
  minConfidenceThreshold: number;

  // Rate limiting
  maxCallsPerMinute: number;
  delayBetweenCalls: number;
}

const DEFAULT_CONFIG: LLMLinkDetectorConfig = {
  model: 'gemini-1.5-flash-latest',
  temperature: 0.1,
  maxPairsPerCall: 10,
  minConfidenceThreshold: 0.6,
  maxCallsPerMinute: 10,
  delayBetweenCalls: 500,
};

// ============================================================================
// LLM LINK DETECTOR
// ============================================================================

export class LLMLinkDetector {
  private genAI: GoogleGenerativeAI | null = null;
  private config: LLMLinkDetectorConfig;
  private lastCallTime = 0;

  constructor(config?: Partial<LLMLinkDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize Gemini
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      log.warn('GOOGLE_API_KEY not set - LLM link detection disabled');
    }
  }

  // ==========================================================================
  // CORE API
  // ==========================================================================

  /**
   * Detect causal links between memories
   * "Memory A led to / caused Memory B"
   */
  async detectCausalLinks(
    memories: MemoryItem[],
    existingLinks: MemoryLink[] = []
  ): Promise<DetectedLink[]> {
    if (!this.genAI || memories.length < 2) return [];

    // Filter out pairs that already have causal links
    const existingPairs = new Set(
      existingLinks
        .filter((l) => l.linkType === 'caused_by')
        .map((l) => `${l.sourceMemoryId}-${l.targetMemoryId}`)
    );

    const pairs = this.generatePairs(memories);
    const newPairs = pairs.filter(
      ([a, b]) =>
        !existingPairs.has(`${a.id}-${b.id}`) &&
        !existingPairs.has(`${b.id}-${a.id}`)
    );

    if (newPairs.length === 0) return [];

    return this.detectLinksWithLLM(newPairs, 'causal');
  }

  /**
   * Detect narrative links between memories
   * "Part of the same life story/chapter"
   */
  async detectNarrativeLinks(
    memories: MemoryItem[],
    existingLinks: MemoryLink[] = []
  ): Promise<DetectedLink[]> {
    if (!this.genAI || memories.length < 2) return [];

    // Filter out pairs that already have narrative links
    const existingPairs = new Set(
      existingLinks
        .filter((l) => l.linkType === 'narrative')
        .map((l) => `${l.sourceMemoryId}-${l.targetMemoryId}`)
    );

    const pairs = this.generatePairs(memories);
    const newPairs = pairs.filter(
      ([a, b]) =>
        !existingPairs.has(`${a.id}-${b.id}`) &&
        !existingPairs.has(`${b.id}-${a.id}`)
    );

    if (newPairs.length === 0) return [];

    return this.detectLinksWithLLM(newPairs, 'narrative');
  }

  /**
   * Detect contrast links between memories
   * "Contradicting beliefs, conflicting events"
   */
  async detectContrastLinks(
    memories: MemoryItem[],
    existingLinks: MemoryLink[] = []
  ): Promise<DetectedLink[]> {
    if (!this.genAI || memories.length < 2) return [];

    // Filter out pairs that already have contrast links
    const existingPairs = new Set(
      existingLinks
        .filter((l) => l.linkType === 'contradiction')
        .map((l) => `${l.sourceMemoryId}-${l.targetMemoryId}`)
    );

    const pairs = this.generatePairs(memories);
    const newPairs = pairs.filter(
      ([a, b]) =>
        !existingPairs.has(`${a.id}-${b.id}`) &&
        !existingPairs.has(`${b.id}-${a.id}`)
    );

    if (newPairs.length === 0) return [];

    return this.detectLinksWithLLM(newPairs, 'contrast');
  }

  /**
   * Detect all link types at once (more efficient)
   */
  async detectAllLinks(
    memories: MemoryItem[],
    existingLinks: MemoryLink[] = []
  ): Promise<LinkDetectionResult> {
    const startTime = Date.now();

    if (!this.genAI || memories.length < 2) {
      return { detected: [], processedPairs: 0, llmCalls: 0, duration: 0 };
    }

    // Generate pairs to check
    const pairs = this.generatePairs(memories);

    // Filter out pairs that already have strong links
    const existingPairMap = new Map<string, LinkType[]>();
    for (const link of existingLinks) {
      const key = `${link.sourceMemoryId}-${link.targetMemoryId}`;
      const reverseKey = `${link.targetMemoryId}-${link.sourceMemoryId}`;
      const types = existingPairMap.get(key) || [];
      types.push(link.linkType);
      existingPairMap.set(key, types);
      existingPairMap.set(reverseKey, types);
    }

    const newPairs = pairs.filter(([a, b]) => {
      const existingTypes = existingPairMap.get(`${a.id}-${b.id}`) || [];
      // Only process if missing causal, narrative, or contrast
      return !existingTypes.includes('caused_by') ||
             !existingTypes.includes('narrative') ||
             !existingTypes.includes('contradiction');
    });

    if (newPairs.length === 0) {
      return { detected: [], processedPairs: 0, llmCalls: 0, duration: Date.now() - startTime };
    }

    // Batch process
    const allDetected: DetectedLink[] = [];
    let llmCalls = 0;

    for (let i = 0; i < newPairs.length; i += this.config.maxPairsPerCall) {
      const batch = newPairs.slice(i, i + this.config.maxPairsPerCall);
      const detected = await this.detectLinksWithLLM(batch, 'all');
      allDetected.push(...detected);
      llmCalls++;

      // Rate limiting
      await this.rateLimit();
    }

    return {
      detected: allDetected,
      processedPairs: newPairs.length,
      llmCalls,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Create links from detected results
   */
  async createDetectedLinks(
    userId: string,
    detected: DetectedLink[]
  ): Promise<MemoryLink[]> {
    const memoryGraph = getMemoryGraph();
    const created: MemoryLink[] = [];

    for (const link of detected) {
      if (link.confidence >= this.config.minConfidenceThreshold) {
        // Map detected type to MemoryGraph LinkType
        const mappedType = LINK_TYPE_MAP[link.type] || 'topic';
        const memoryLink = await memoryGraph.createLink(
          userId,
          link.sourceId,
          link.targetId,
          mappedType,
          {
            narrative: link.evidence,
          }
        );
        created.push(memoryLink);
      }
    }

    log.info(
      { userId, detected: detected.length, created: created.length },
      'Created LLM-detected links'
    );

    return created;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private generatePairs(memories: MemoryItem[]): Array<[MemoryItem, MemoryItem]> {
    const pairs: Array<[MemoryItem, MemoryItem]> = [];

    // Sort by timestamp to consider temporal ordering
    const sorted = [...memories].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        pairs.push([sorted[i], sorted[j]]);
      }
    }

    return pairs;
  }

  private async detectLinksWithLLM(
    pairs: Array<[MemoryItem, MemoryItem]>,
    linkType: 'causal' | 'narrative' | 'contrast' | 'all'
  ): Promise<DetectedLink[]> {
    if (!this.genAI) return [];

    const prompt = this.buildPrompt(pairs, linkType);

    try {
      await this.rateLimit();

      const model = this.genAI.getGenerativeModel({
        model: this.config.model,
        generationConfig: {
          temperature: this.config.temperature,
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      return this.parseResponse(text, pairs);
    } catch (error) {
      log.error({ error: String(error) }, 'LLM link detection failed');
      return [];
    }
  }

  private buildPrompt(
    pairs: Array<[MemoryItem, MemoryItem]>,
    linkType: 'causal' | 'narrative' | 'contrast' | 'all'
  ): string {
    const pairDescriptions = pairs
      .map(([a, b], idx) => {
        return `Pair ${idx + 1}:
  Memory A (${a.id}): "${a.content.slice(0, 200)}" [${a.type}, ${a.timestamp.toISOString().split('T')[0]}]
  Memory B (${b.id}): "${b.content.slice(0, 200)}" [${b.type}, ${b.timestamp.toISOString().split('T')[0]}]`;
      })
      .join('\n\n');

    const typeInstructions = {
      causal: `Detect CAUSAL links: Did Memory A cause, lead to, or result in Memory B?
Examples: "Got promoted" → "Bought new house", "Started exercising" → "Feeling better"`,
      narrative: `Detect NARRATIVE links: Are these memories part of the same life story or chapter?
Examples: Wedding planning memories, Job search journey, Recovery story`,
      contrast: `Detect CONTRAST links: Do these memories contradict or show change?
Examples: "I hate my job" vs "I love my job", Different views on same topic`,
      all: `Detect THREE types of links:
1. CAUSAL: Did A cause/lead to B?
2. NARRATIVE: Part of same life story/chapter?
3. CONTRAST: Contradicting or showing change?`,
    };

    return `Analyze these memory pairs for ${linkType === 'all' ? 'causal, narrative, and contrast' : linkType} relationships.

${typeInstructions[linkType]}

Memory Pairs:
${pairDescriptions}

Return JSON array of detected links (only include confident connections):
{
  "links": [
    {
      "pairIndex": 1,
      "sourceId": "memory_a_id",
      "targetId": "memory_b_id",
      "type": "causal|narrative|contrast",
      "confidence": 0.0-1.0,
      "evidence": "Brief explanation of why this link exists",
      "bidirectional": true/false
    }
  ]
}

Rules:
- Only include links with confidence >= 0.5
- Causal links are directional (A→B), narrative links are bidirectional
- Provide clear evidence for each link
- Return empty array if no meaningful links found`;
  }

  private parseResponse(
    text: string,
    pairs: Array<[MemoryItem, MemoryItem]>
  ): DetectedLink[] {
    try {
      const parsed = JSON.parse(text);
      const links: DetectedLink[] = [];

      for (const link of parsed.links || []) {
        const pairIdx = (link.pairIndex || 1) - 1;
        if (pairIdx < 0 || pairIdx >= pairs.length) continue;

        const [memA, memB] = pairs[pairIdx];

        links.push({
          sourceId: link.sourceId || memA.id,
          targetId: link.targetId || memB.id,
          type: link.type as LinkType,
          confidence: link.confidence || 0.5,
          evidence: link.evidence || '',
          bidirectional: link.bidirectional ?? (link.type === 'narrative'),
        });
      }

      return links;
    } catch (error) {
      log.warn({ error: String(error), text: text.slice(0, 100) }, 'Failed to parse LLM response');
      return [];
    }
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.config.delayBetweenCalls) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.delayBetweenCalls - elapsed)
      );
    }
    this.lastCallTime = Date.now();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let llmLinkDetectorInstance: LLMLinkDetector | null = null;

export function getLLMLinkDetector(): LLMLinkDetector {
  if (!llmLinkDetectorInstance) {
    llmLinkDetectorInstance = new LLMLinkDetector();
  }
  return llmLinkDetectorInstance;
}

export function resetLLMLinkDetector(): void {
  llmLinkDetectorInstance = null;
}

export default {
  LLMLinkDetector,
  getLLMLinkDetector,
  resetLLMLinkDetector,
};
