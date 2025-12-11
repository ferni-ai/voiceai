/**
 * Channel Adapter Service
 *
 * Adapts brand content for different channels while maintaining
 * consistent voice. Same warmth, optimized for the medium.
 *
 * @module @ferni/brand/channel-adapter
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getPersonaVoice } from './persona-voices.js';
import type { Channel, ChannelConfig, ContextType, PersonaId } from './types.js';

const log = createLogger({ module: 'ChannelAdapter' });

// ============================================================================
// CHANNEL CONFIGURATIONS
// ============================================================================

/**
 * Configuration for each supported channel
 */
export const CHANNEL_CONFIGS: Record<Channel, ChannelConfig> = {
  app: {
    channel: 'app',
    constraints: {
      maxLength: 500,
      allowEmoji: false, // Brand guidelines: no emoji
      allowLinks: false,
      formality: 'casual',
    },
    adaptations: {
      greetingStyle: 'None or minimal - user is already engaged',
      signoffStyle: 'None',
      urgencyLevel: 'low',
    },
  },

  web: {
    channel: 'web',
    constraints: {
      maxLength: 1000,
      allowEmoji: false,
      allowLinks: true,
      formality: 'casual',
    },
    adaptations: {
      greetingStyle: 'Warm but brief',
      signoffStyle: 'None or subtle CTA',
      urgencyLevel: 'low',
    },
  },

  email: {
    channel: 'email',
    constraints: {
      maxLength: 2000,
      allowEmoji: false,
      allowLinks: true,
      formality: 'semi-formal',
    },
    adaptations: {
      greetingStyle: 'Warm personal opening',
      signoffStyle: 'Warm closing with name',
      urgencyLevel: 'low',
    },
  },

  sms: {
    channel: 'sms',
    constraints: {
      maxLength: 160, // Standard SMS length
      allowEmoji: false,
      allowLinks: true,
      formality: 'casual',
    },
    adaptations: {
      greetingStyle: 'Ultra brief or none',
      signoffStyle: 'None',
      urgencyLevel: 'medium',
    },
  },

  push: {
    channel: 'push',
    constraints: {
      maxLength: 100, // iOS/Android limits
      allowEmoji: false,
      allowLinks: false,
      formality: 'casual',
    },
    adaptations: {
      greetingStyle: 'None',
      signoffStyle: 'None',
      urgencyLevel: 'high',
    },
  },

  voice: {
    channel: 'voice',
    constraints: {
      maxLength: Infinity, // No hard limit
      allowEmoji: false,
      allowLinks: false,
      formality: 'casual',
    },
    adaptations: {
      greetingStyle: 'Natural conversational opening',
      signoffStyle: 'Natural conversational ending',
      urgencyLevel: 'low',
    },
  },
};

// ============================================================================
// ADAPTATION FUNCTIONS
// ============================================================================

/**
 * Adapt content for a specific channel
 */
export function adaptForChannel(
  content: string,
  toChannel: Channel,
  options: {
    fromChannel?: Channel;
    persona?: PersonaId;
    context?: ContextType;
  } = {}
): string {
  const config = CHANNEL_CONFIGS[toChannel];
  const { persona = 'ferni', context = 'checkin' } = options;

  let adapted = content;

  // 1. Length adaptation
  if (adapted.length > config.constraints.maxLength) {
    adapted = shortenContent(adapted, config.constraints.maxLength, context);
  }

  // 2. Formality adaptation
  if (config.constraints.formality === 'semi-formal') {
    adapted = adjustFormality(adapted, 'semi-formal');
  }

  // 3. Channel-specific additions
  adapted = addChannelFraming(adapted, toChannel, persona, context);

  // 4. Link handling
  if (!config.constraints.allowLinks) {
    adapted = removeLinks(adapted);
  }

  log.debug(
    {
      channel: toChannel,
      originalLength: content.length,
      adaptedLength: adapted.length,
    },
    'Content adapted for channel'
  );

  return adapted;
}

/**
 * Shorten content while preserving brand voice
 */
function shortenContent(content: string, maxLength: number, context: ContextType): string {
  // If within limits, return as-is
  if (content.length <= maxLength) {
    return content;
  }

  // Try to find natural break points
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];

  let shortened = '';
  for (const sentence of sentences) {
    if ((shortened + sentence).length <= maxLength) {
      shortened += sentence;
    } else {
      break;
    }
  }

  // If first sentence is too long, truncate with ellipsis
  if (shortened.length === 0) {
    shortened = content.slice(0, maxLength - 3) + '...';
  }

  return shortened.trim();
}

/**
 * Adjust content formality
 */
function adjustFormality(content: string, level: 'casual' | 'semi-formal' | 'formal'): string {
  if (level === 'casual') {
    return content; // Already casual by default
  }

  let adjusted = content;

  if (level === 'semi-formal') {
    // Minor adjustments for email-appropriate tone
    // Replace ultra-casual contractions in specific contexts
    // But keep warmth - don't make it corporate

    // Ensure sentences are complete
    if (!adjusted.endsWith('.') && !adjusted.endsWith('!') && !adjusted.endsWith('?')) {
      adjusted += '.';
    }
  }

  return adjusted;
}

/**
 * Add channel-specific framing
 */
function addChannelFraming(
  content: string,
  channel: Channel,
  personaId: PersonaId,
  context: ContextType
): string {
  const config = CHANNEL_CONFIGS[channel];
  const persona = getPersonaVoice(personaId);

  switch (channel) {
    case 'email':
      return addEmailFraming(content, persona.name, context);

    case 'sms':
      return addSmsFraming(content);

    case 'push':
      return addPushFraming(content, persona.name);

    default:
      return content;
  }
}

/**
 * Add email-specific framing
 */
function addEmailFraming(content: string, personaName: string, context: ContextType): string {
  // Add warm opening if not present
  const hasGreeting =
    content.toLowerCase().startsWith('hey') ||
    content.toLowerCase().startsWith('hi') ||
    content.toLowerCase().startsWith('thinking');

  let framed = content;

  if (!hasGreeting) {
    const openings: Record<ContextType, string[]> = {
      celebration: ['Hey.', 'Good news.'],
      support: ['Hey.', 'Thinking of you.'],
      coaching: ['Hey.', 'Quick thought.'],
      checkin: ['Hey.', 'Thinking about you.'],
      onboarding: ["Hey. I'm Ferni."],
      error: ['Hey.'],
      notification: ['Hey.'],
      marketing: ['Hey.'],
    };

    const options = openings[context] || openings.checkin;
    const opening = options[Math.floor(Math.random() * options.length)];
    framed = `${opening}\n\n${content}`;
  }

  // Add warm closing if not present
  const hasClosing =
    framed.toLowerCase().includes('— ' + personaName.toLowerCase()) ||
    framed.toLowerCase().includes('- ' + personaName.toLowerCase());

  if (!hasClosing) {
    framed += `\n\n— ${personaName}`;
  }

  return framed;
}

/**
 * Add SMS-specific framing
 */
function addSmsFraming(content: string): string {
  // SMS should be ultra-concise
  // Remove any email-style formatting
  let framed = content.replace(/\n\n/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Ensure it fits in 160 chars
  if (framed.length > 160) {
    framed = framed.slice(0, 157) + '...';
  }

  return framed;
}

/**
 * Add push notification framing
 */
function addPushFraming(content: string, personaName: string): string {
  // Push notifications need to be ultra-short and attention-grabbing
  // but still warm and on-brand

  let framed = content;

  // Remove any line breaks
  framed = framed.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Ensure under 100 chars
  if (framed.length > 100) {
    // Try to cut at a natural point
    const truncated = framed.slice(0, 97);
    const lastSpace = truncated.lastIndexOf(' ');
    framed = (lastSpace > 50 ? truncated.slice(0, lastSpace) : truncated) + '...';
  }

  return framed;
}

/**
 * Remove links from content
 */
function removeLinks(content: string): string {
  // Remove URLs
  return content
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// MULTI-CHANNEL GENERATION
// ============================================================================

/**
 * Generate content for multiple channels at once
 */
export function generateForAllChannels(
  baseContent: string,
  options: {
    persona?: PersonaId;
    context?: ContextType;
    channels?: Channel[];
  } = {}
): Record<Channel, string> {
  const { persona = 'ferni', context = 'checkin', channels } = options;

  const targetChannels = channels || (['app', 'email', 'sms', 'push'] as Channel[]);
  const result: Record<string, string> = {};

  for (const channel of targetChannels) {
    result[channel] = adaptForChannel(baseContent, channel, { persona, context });
  }

  return result as Record<Channel, string>;
}

/**
 * Get channel configuration
 */
export function getChannelConfig(channel: Channel): ChannelConfig {
  return CHANNEL_CONFIGS[channel];
}

/**
 * Check if content fits channel constraints
 */
export function fitsChannelConstraints(
  content: string,
  channel: Channel
): {
  fits: boolean;
  issues: string[];
} {
  const config = CHANNEL_CONFIGS[channel];
  const issues: string[] = [];

  if (content.length > config.constraints.maxLength) {
    issues.push(
      `Content exceeds ${channel} max length (${content.length}/${config.constraints.maxLength})`
    );
  }

  if (!config.constraints.allowLinks && /https?:\/\//.test(content)) {
    issues.push(`${channel} doesn't allow links`);
  }

  if (
    !config.constraints.allowEmoji &&
    /[\u{1F600}-\u{1F64F}]|[\u{2600}-\u{26FF}]/u.test(content)
  ) {
    issues.push(`${channel} doesn't allow emoji`);
  }

  return {
    fits: issues.length === 0,
    issues,
  };
}

// ============================================================================
// VOICE CONSISTENCY
// ============================================================================

/**
 * Check voice consistency across channels
 */
export function checkVoiceConsistency(contents: Record<Channel, string>): {
  consistent: boolean;
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  const channels = Object.keys(contents) as Channel[];

  if (channels.length < 2) {
    return { consistent: true, score: 100, issues: [] };
  }

  // Check for wildly different tones
  const tones = channels.map((ch) => analyzeContentTone(contents[ch]));
  const avgEnergy = tones.reduce((sum, t) => sum + t.energy, 0) / tones.length;
  const avgWarmth = tones.reduce((sum, t) => sum + t.warmth, 0) / tones.length;

  for (let i = 0; i < channels.length; i++) {
    if (Math.abs(tones[i].energy - avgEnergy) > 2) {
      issues.push(`${channels[i]} has inconsistent energy level`);
    }
    if (Math.abs(tones[i].warmth - avgWarmth) > 2) {
      issues.push(`${channels[i]} has inconsistent warmth level`);
    }
  }

  const score = Math.max(0, 100 - issues.length * 20);

  return {
    consistent: issues.length === 0,
    score,
    issues,
  };
}

/**
 * Simple tone analysis for consistency checking
 */
function analyzeContentTone(content: string): { energy: number; warmth: number } {
  let energy = 3; // Start at neutral
  let warmth = 3;

  // Energy indicators
  if (/!/.test(content)) energy += 1;
  if (/\?/.test(content)) energy += 0.5;
  if (/amazing|exciting|huge/i.test(content)) energy += 1;
  if (/quiet|gentle|soft/i.test(content)) energy -= 1;

  // Warmth indicators
  if (/you|your|we|our/i.test(content)) warmth += 1;
  if (/thinking of|here for|care/i.test(content)) warmth += 1;
  if (/must|should|required/i.test(content)) warmth -= 1;

  return {
    energy: Math.min(5, Math.max(1, energy)),
    warmth: Math.min(5, Math.max(1, warmth)),
  };
}
