/**
 * A `getGenerativeModel()` with the shape of the old @google/generative-ai SDK,
 * backed by the shared @google/genai client from getGeminiClient().
 *
 * The old SDK only speaks to the Gemini API with GOOGLE_API_KEY. The memory
 * pipeline (deep extraction, knowledge-graph extractors, link detection,
 * retrieval reranking) used it directly, so an invalid or rotated key disabled
 * all of it while the rest of the agent kept working through Vertex. This
 * adapter keeps those call sites' shape but routes them through the one
 * configured client (Vertex on the agent, API key elsewhere).
 *
 * @module config/generative-model
 */

import { getGeminiClient } from './gemini-config.js';

export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  responseMimeType?: string;
}

export type GenerateRequest = string | { contents: unknown; generationConfig?: GenerationConfig };

export interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

export interface GenerateResult {
  response: { text(): string; usageMetadata?: UsageMetadata };
}

export interface GenerativeModel {
  generateContent(request: GenerateRequest): Promise<GenerateResult>;
}

interface GenAIClient {
  models: {
    generateContent(req: {
      model: string;
      contents: unknown;
      config?: Record<string, unknown>;
    }): Promise<{ text?: string; usageMetadata?: UsageMetadata }>;
  };
}

export interface ModelOptions {
  model: string;
  generationConfig?: GenerationConfig;
  systemInstruction?: string;
}

/** The old SDK's `genAI` object: a synchronous getGenerativeModel(). */
export interface GenerativeAI {
  getGenerativeModel: (options: ModelOptions) => GenerativeModel;
}

function bindModel(client: GenAIClient, options: ModelOptions): GenerativeModel {
  return {
    async generateContent(request) {
      const contents = typeof request === 'string' ? request : request.contents;
      const perRequest = typeof request === 'string' ? undefined : request.generationConfig;
      const config: Record<string, unknown> = { ...options.generationConfig, ...perRequest };
      if (options.systemInstruction) config.systemInstruction = options.systemInstruction;

      const result = await client.models.generateContent({
        model: options.model,
        contents,
        config,
      });
      const text = result.text ?? '';
      return { response: { text: () => text, usageMetadata: result.usageMetadata } };
    },
  };
}

/**
 * @returns a model bound to `model`, or null when Gemini is not configured
 */
export async function getGenerativeModel(options: ModelOptions): Promise<GenerativeModel | null> {
  const client = (await getGeminiClient()) as GenAIClient | null;
  return client ? bindModel(client, options) : null;
}

/**
 * For call sites written as `genAI.getGenerativeModel({ model })`.
 *
 * @returns the old-SDK `genAI` shape over the shared client, or null when
 *   Gemini is not configured
 */
export async function getGenerativeAI(): Promise<GenerativeAI | null> {
  const client = (await getGeminiClient()) as GenAIClient | null;
  return client ? { getGenerativeModel: (options) => bindModel(client, options) } : null;
}
