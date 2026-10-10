/**
 * One text reply from the Vertex SDK client that llm-utils uses.
 *
 * gemini-3.x thinks by default, and thinking tokens count against
 * maxOutputTokens. llm-utils callers set small caps (summaries 1000, emotion
 * 200), so the model spent the cap thinking and the reply stopped mid-JSON:
 * on a call summary 804 of 1000 tokens were thoughts (2026-10-10), the parser
 * found no closing brace, and every end-of-call summary fell back to keyword
 * extraction, so open threads were never saved. The shared @google/genai
 * client already gets minimal thinking (config/thinking-defaults.ts); this
 * client went around it.
 *
 * @module services/llm/vertex-text
 */

import { minimalThinkingFor } from '../../config/thinking-defaults.js';
import { getLogger } from '../../utils/safe-logger.js';

interface Part {
  text?: string;
  thought?: boolean;
}

export interface VertexTextModel {
  generateContent(params: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    generationConfig?: Record<string, unknown>;
  }): Promise<{
    response: {
      candidates?: Array<{ finishReason?: string; content?: { parts?: Part[] } }>;
    };
  }>;
}

/** The model's reply text with the least thinking it allows, or null if it said nothing. */
export async function vertexText(
  model: VertexTextModel,
  modelName: string,
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<string | null> {
  const thinking = minimalThinkingFor(modelName);
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  });
  const candidate = result.response?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  if (candidate?.finishReason === 'MAX_TOKENS') {
    getLogger().warn(
      { model: modelName, maxTokens, chars: text.length },
      'LLM reply cut off at maxOutputTokens'
    );
  }
  return text || null;
}
