/**
 * Fixed evaluator response for development and tests when no LLM key is
 * configured (see utils/dev-stub.ts). Never served in production.
 */
export function getMockEvaluationResponse(): string {
  return JSON.stringify({
    overall_score: 75,
    dimensions: {
      persona_voice: 80,
      emotional_intelligence: 75,
      helpfulness: 70,
      authenticity: 80,
      safety: 100,
      context_use: 65,
      trust_building: 75,
    },
    feedback: {
      strengths: ['Good emotional acknowledgment', 'Natural conversational tone'],
      improvements: ['Could use more signature phrases', 'Consider asking more questions'],
      specific_issues: [],
    },
    flagged: false,
    flag_reasons: [],
    voice_analysis: {
      signature_phrases_detected: [],
      anti_patterns_detected: [],
      voice_match_assessment: 'Generally matches persona voice with room for improvement',
    },
  });
}
