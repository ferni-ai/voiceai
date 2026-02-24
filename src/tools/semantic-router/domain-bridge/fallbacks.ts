/**
 * Graceful Fallback Responses
 *
 * Category-specific fallback responses when a domain tool isn't implemented yet.
 * These provide warm, human responses while allowing the LLM to continue the conversation.
 *
 * @module tools/semantic-router/domain-bridge/fallbacks
 */

/**
 * Category-specific fallback responses when a domain tool isn't implemented yet.
 * These provide warm, human responses while allowing the LLM to continue the conversation.
 */
export const FALLBACK_RESPONSES: Record<string, (args: Record<string, unknown>) => string> = {
  // Coaching & Support
  coaching: () =>
    "I'd love to help with that. Let me share some thoughts based on what I know about you.",
  support: () => "I hear you. Let's talk through this together.",
  motivation: () =>
    'Finding motivation can be tricky. Let me share what I think might help based on our conversations.',

  // Self-Compassion & Mindfulness
  self: () =>
    "Self-care is so important. Let me offer some gentle guidance from what I've learned about what works for you.",
  affirm: () =>
    "You deserve kindness, especially from yourself. Let's explore what's coming up for you.",
  mindful: () => 'Taking a mindful moment is a beautiful practice. Let me guide you through it.',

  // Relationships & Communication
  conflict: () =>
    'Navigating conflict is hard. I can help you think through this from what I know about your situation.',
  relationship: () =>
    "Relationships are so important. Let me share some thoughts based on what you've told me.",
  dating: () =>
    'Dating can be exciting and nerve-wracking! Let me help you think through your approach.',
  breakup: () =>
    "I'm here for you during this difficult time. Let's process what you're feeling together.",

  // Dreams & Purpose
  dream: () =>
    "Your dreams matter so much. Let me help you explore this based on what you've shared about your aspirations.",
  purpose: () =>
    'Finding purpose is a beautiful journey. Let me reflect back what I see in our conversations.',
  meaning: () =>
    "Questions of meaning are profound. I'd love to explore this with you based on what I know about your values.",

  // Career & Work
  career: () =>
    "Career growth is important. Let me share some thoughts based on what you've told me about your goals.",
  work: () =>
    'Work challenges can be tough. Let me help you think through this from your perspective.',
  burnout: () =>
    "Recognizing burnout is the first step. Let's explore some strategies that might work for you.",
  imposter: () =>
    'Imposter syndrome is so common among capable people. Let me share what I see in you.',

  // Home & Life Admin
  home: () =>
    "Home projects can feel overwhelming. Let me help you think through priorities based on what you've mentioned.",
  control: () =>
    "I'd help control that for you, but let me share some thoughts on how to approach it.",

  // Communication & Follow-ups
  draft: () =>
    "I'd love to help you draft that. Let me suggest some approaches based on what you've told me.",
  schedule: () =>
    "Scheduling is important. While I can't set that up directly right now, let me help you plan it out.",
  recall: () => 'Let me think about what I remember from our conversations that might be relevant.',

  // Default fallback
  default: () => 'I hear what you need. Let me share my thoughts on how I can help with that.',
};

/**
 * Generate a graceful fallback response when a domain tool isn't implemented.
 */
export function generateFallbackResponse(
  semanticToolId: string,
  args: Record<string, unknown>
): string {
  // Extract category from semantic tool ID (e.g., "coaching_motivation" -> "coaching")
  const parts = semanticToolId.toLowerCase().split('_');

  // Try to find a matching fallback category
  for (const part of parts) {
    if (FALLBACK_RESPONSES[part]) {
      return FALLBACK_RESPONSES[part](args);
    }
  }

  // Try the first part as primary category
  if (parts[0] && FALLBACK_RESPONSES[parts[0]]) {
    return FALLBACK_RESPONSES[parts[0]](args);
  }

  // Default fallback
  return FALLBACK_RESPONSES.default(args);
}
