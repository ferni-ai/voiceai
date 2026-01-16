/**
 * Training Data Augmenter
 *
 * Generates synthetic training examples to augment production data.
 * Uses LLM to create paraphrases and variations of queries.
 *
 * @module tools/intelligence/router/training/data-augmenter
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { TEMP_REASONING } from '../../../../config/gemini-config.js';
import type {
  TrainingExample,
  SyntheticGenerationConfig,
  DEFAULT_SYNTHETIC_CONFIG,
} from './types.js';

const log = createLogger({ module: 'ftis:data-augmenter' });

// ============================================================================
// TYPES
// ============================================================================

interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  domain: string;
  exampleQueries?: string[];
}

// ============================================================================
// DATA AUGMENTER
// ============================================================================

export class TrainingDataAugmenter {
  private config: SyntheticGenerationConfig;
  private generatedExamples: TrainingExample[] = [];

  constructor(config: Partial<SyntheticGenerationConfig> = {}) {
    this.config = {
      examplesPerTool: 10,
      paraphraseCount: 3,
      includeMultiTool: true,
      temperature: TEMP_REASONING,
      personaWeights: {
        ferni: 0.3,
        maya: 0.2,
        peter: 0.15,
        alex: 0.15,
        jordan: 0.1,
        nayan: 0.1,
      },
      timeWeights: {
        morning: 0.3,
        afternoon: 0.25,
        evening: 0.3,
        night: 0.15,
      },
      ...config,
    };
  }

  // ==========================================================================
  // SYNTHETIC GENERATION
  // ==========================================================================

  /**
   * Generate synthetic examples for a set of tools
   */
  async generateForTools(tools: ToolDefinition[]): Promise<TrainingExample[]> {
    this.generatedExamples = [];
    const startTime = Date.now();

    log.info({ toolCount: tools.length }, 'Starting synthetic data generation');

    for (const tool of tools) {
      try {
        const examples = await this.generateForTool(tool);
        this.generatedExamples.push(...examples);
      } catch (error) {
        log.warn({ tool: tool.id, error: String(error) }, 'Failed to generate for tool');
      }
    }

    // Generate multi-tool examples
    if (this.config.includeMultiTool) {
      const multiToolExamples = await this.generateMultiToolExamples(tools);
      this.generatedExamples.push(...multiToolExamples);
    }

    log.info(
      {
        exampleCount: this.generatedExamples.length,
        durationMs: Date.now() - startTime,
      },
      'Synthetic data generation complete'
    );

    return this.generatedExamples;
  }

  /**
   * Generate examples for a single tool
   */
  private async generateForTool(tool: ToolDefinition): Promise<TrainingExample[]> {
    const examples: TrainingExample[] = [];

    // Start with existing example queries if available
    const seedQueries = tool.exampleQueries || [];

    // Generate from description if no seed queries
    if (seedQueries.length === 0) {
      const generatedQueries = await this.generateQueriesFromDescription(tool);
      seedQueries.push(...generatedQueries);
    }

    // Generate paraphrases for each seed query
    for (const query of seedQueries.slice(0, this.config.examplesPerTool)) {
      // Original query
      examples.push(this.createExample(query, [tool.id]));

      // Paraphrased versions
      const paraphrases = await this.generateParaphrases(query);
      for (const paraphrase of paraphrases.slice(0, this.config.paraphraseCount)) {
        examples.push(this.createExample(paraphrase, [tool.id]));
      }
    }

    return examples;
  }

  /**
   * Generate queries from tool description using LLM
   */
  private async generateQueriesFromDescription(tool: ToolDefinition): Promise<string[]> {
    try {
      const prompt = `Generate ${this.config.examplesPerTool} natural user queries that would trigger the following tool:

Tool: ${tool.name}
Description: ${tool.description}
Domain: ${tool.domain}

Generate diverse queries that a user might say to trigger this tool. Include:
- Direct requests
- Indirect/implied requests
- Questions
- Casual phrasing

Output as a JSON array of strings:
["query 1", "query 2", ...]`;

      const response = await this.callLLM(prompt);
      return this.parseQueryArray(response);
    } catch (error) {
      log.debug(
        { tool: tool.id, error: String(error) },
        'Failed to generate queries from description'
      );

      // Fallback: generate basic queries from name/description
      return [
        `${tool.name.toLowerCase()}`,
        `help me with ${tool.description.slice(0, 50).toLowerCase()}`,
        `I need to ${tool.name.toLowerCase()}`,
      ];
    }
  }

  /**
   * Generate paraphrases of a query
   */
  private async generateParaphrases(query: string): Promise<string[]> {
    try {
      const prompt = `Generate ${this.config.paraphraseCount} paraphrases of this user query:

Original: "${query}"

Generate natural variations that mean the same thing but use different words/phrasing.
Include casual, formal, and question forms.

Output as a JSON array of strings:
["paraphrase 1", "paraphrase 2", ...]`;

      const response = await this.callLLM(prompt);
      return this.parseQueryArray(response);
    } catch (error) {
      log.debug({ query, error: String(error) }, 'Failed to generate paraphrases');
      return [];
    }
  }

  /**
   * Generate multi-tool examples
   */
  private async generateMultiToolExamples(tools: ToolDefinition[]): Promise<TrainingExample[]> {
    const examples: TrainingExample[] = [];

    // Find commonly co-occurring tool pairs
    const toolPairs = this.findCommonToolPairs(tools);

    for (const pair of toolPairs.slice(0, 20)) {
      try {
        const query = await this.generateMultiToolQuery(pair[0], pair[1]);
        if (query) {
          examples.push(this.createExample(query, [pair[0].id, pair[1].id]));
        }
      } catch (error) {
        log.debug(
          { pair: pair.map((t) => t.id), error: String(error) },
          'Failed to generate multi-tool query'
        );
      }
    }

    return examples;
  }

  /**
   * Generate a query that would need multiple tools
   */
  private async generateMultiToolQuery(
    tool1: ToolDefinition,
    tool2: ToolDefinition
  ): Promise<string | null> {
    try {
      const prompt = `Generate a natural user query that would require BOTH of these tools:

Tool 1: ${tool1.name} - ${tool1.description}
Tool 2: ${tool2.name} - ${tool2.description}

The query should be a single request that naturally needs both tools.
Output only the query string, no quotes.`;

      const response = await this.callLLM(prompt);
      return response.trim().replace(/^["']|["']$/g, '');
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // AUGMENTATION TECHNIQUES
  // ==========================================================================

  /**
   * Add noise/typos to queries (for robustness)
   */
  addTypos(examples: TrainingExample[], ratio = 0.1): TrainingExample[] {
    const augmented: TrainingExample[] = [];

    for (const example of examples) {
      // Keep original
      augmented.push(example);

      // Add typo version with some probability
      if (Math.random() < ratio) {
        const noisyQuery = this.introduceTypo(example.query);
        augmented.push({
          ...example,
          id: `${example.id}_typo`,
          query: noisyQuery,
          source: 'synthetic',
        });
      }
    }

    return augmented;
  }

  /**
   * Introduce a typo into a query
   */
  private introduceTypo(query: string): string {
    const words = query.split(' ');
    if (words.length < 2) return query;

    const wordIndex = Math.floor(Math.random() * words.length);
    const word = words[wordIndex];

    if (word.length < 3) return query;

    // Choose a typo type
    const typoType = Math.floor(Math.random() * 4);
    let typoWord = word;

    switch (typoType) {
      case 0: // Character swap
        if (word.length >= 2) {
          const i = Math.floor(Math.random() * (word.length - 1));
          typoWord = word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
        }
        break;
      case 1: // Missing character
        {
          const i = Math.floor(Math.random() * word.length);
          typoWord = word.slice(0, i) + word.slice(i + 1);
        }
        break;
      case 2: // Double character
        {
          const i = Math.floor(Math.random() * word.length);
          typoWord = word.slice(0, i) + word[i] + word.slice(i);
        }
        break;
      case 3: // Adjacent key (simplified)
        {
          const i = Math.floor(Math.random() * word.length);
          const adjacentKeys: Record<string, string> = {
            a: 's',
            s: 'd',
            d: 'f',
            f: 'g',
            g: 'h',
            h: 'j',
            j: 'k',
            k: 'l',
            q: 'w',
            w: 'e',
            e: 'r',
            r: 't',
            t: 'y',
            y: 'u',
            u: 'i',
            i: 'o',
            o: 'p',
            z: 'x',
            x: 'c',
            c: 'v',
            v: 'b',
            b: 'n',
            n: 'm',
          };
          const char = word[i].toLowerCase();
          const replacement = adjacentKeys[char] || char;
          typoWord = word.slice(0, i) + replacement + word.slice(i + 1);
        }
        break;
    }

    words[wordIndex] = typoWord;
    return words.join(' ');
  }

  /**
   * Balance dataset by undersampling majority classes
   */
  balanceDataset(examples: TrainingExample[], maxPerTool = 100): TrainingExample[] {
    const toolCounts = new Map<string, TrainingExample[]>();

    for (const example of examples) {
      const key = example.selectedTools.sort().join(',');
      if (!toolCounts.has(key)) {
        toolCounts.set(key, []);
      }
      toolCounts.get(key)!.push(example);
    }

    const balanced: TrainingExample[] = [];
    for (const [, toolExamples] of toolCounts) {
      // Shuffle and take max
      const shuffled = toolExamples.sort(() => Math.random() - 0.5);
      balanced.push(...shuffled.slice(0, maxPerTool));
    }

    return balanced;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Create a training example
   */
  private createExample(query: string, tools: string[]): TrainingExample {
    const personaId = this.sampleFromWeights(this.config.personaWeights);
    const timeOfDay = this.sampleFromWeights(this.config.timeWeights) as
      | 'morning'
      | 'afternoon'
      | 'evening'
      | 'night';

    return {
      id: `synthetic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      query,
      personaId,
      emotion: 'neutral',
      timeOfDay,
      recentTools: [],
      userAffinities: {},
      selectedTools: tools,
      wasSuccessful: true,
      timestamp: new Date(),
      sessionId: `synthetic_session_${Date.now()}`,
      userId: 'synthetic_user',
      source: 'synthetic',
    };
  }

  /**
   * Sample from weighted distribution
   */
  private sampleFromWeights(weights: Record<string, number>): string {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let random = Math.random() * total;

    for (const [key, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) {
        return key;
      }
    }

    return Object.keys(weights)[0];
  }

  /**
   * Find commonly co-occurring tool pairs
   */
  private findCommonToolPairs(tools: ToolDefinition[]): Array<[ToolDefinition, ToolDefinition]> {
    const pairs: Array<[ToolDefinition, ToolDefinition]> = [];

    // Group tools by domain for more likely co-occurrence
    const domainGroups = new Map<string, ToolDefinition[]>();
    for (const tool of tools) {
      if (!domainGroups.has(tool.domain)) {
        domainGroups.set(tool.domain, []);
      }
      domainGroups.get(tool.domain)!.push(tool);
    }

    // Create pairs within domains
    for (const [, domainTools] of domainGroups) {
      for (let i = 0; i < domainTools.length; i++) {
        for (let j = i + 1; j < domainTools.length; j++) {
          pairs.push([domainTools[i], domainTools[j]]);
        }
      }
    }

    return pairs;
  }

  /**
   * Call LLM for generation
   */
  private async callLLM(prompt: string): Promise<string> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY not set');
    }

    const { getExtractionModel } = await import('../../../../config/gemini-config.js');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: getExtractionModel() });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: 1000,
      },
    });

    return result.response.text();
  }

  /**
   * Parse JSON array from LLM response
   */
  private parseQueryArray(response: string): string[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }
      return JSON.parse(jsonMatch[0]) as string[];
    } catch {
      return [];
    }
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get augmenter statistics
   */
  getStats(): {
    generatedCount: number;
    config: SyntheticGenerationConfig;
  } {
    return {
      generatedCount: this.generatedExamples.length,
      config: this.config,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let augmenterInstance: TrainingDataAugmenter | null = null;

export function getTrainingDataAugmenter(): TrainingDataAugmenter {
  if (!augmenterInstance) {
    augmenterInstance = new TrainingDataAugmenter();
  }
  return augmenterInstance;
}

export function resetTrainingDataAugmenter(): void {
  augmenterInstance = null;
}
