/**
 * SSML Text Processing Functions
 *
 * Core functions for adding natural speech elements.
 * Some functions are persona-specific (Jack Bogle) and should be
 * migrated to persona bundles.
 */

import {
  BREATH_POINTS,
  CONTEMPLATIVE_PAUSE_PHRASES,
  FINANCIAL_END,
  FINANCIAL_START,
  REFLECTION_PHRASES,
  TRANSITION_PHRASES,
} from '../../ssml/constants.js';

// Re-export clamping functions from canonical source
export { clampSpeed, clampVolume, mapToCartesiaEmotion } from '../../ssml/tags.js';

/**
 * Add thinking sounds and reflection at natural transition points
 * Note: This function adds natural speech patterns that work for all personas.
 */
export function addThinkingSounds(text: string): string {
  let result = text;

  // Add "well" or "hmm" before contrastive transitions
  result = result.replace(/\b(but|however|although)\b/gi, (match, offset) => {
    const before = result.substring(Math.max(0, offset - 20), offset);
    // Don't add if there's already a thinking sound nearby
    if (!/\b(well|hmm|ah|oh|um|uh)\b/i.test(before)) {
      return `well<break time="150ms"/>${match}`;
    }
    return match;
  });

  // Add reflection sounds before contemplative phrases
  REFLECTION_PHRASES.forEach((pattern) => {
    result = result.replace(pattern, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 15), offset);
      // Don't duplicate if already present
      if (!/\b(well|hmm|ah|oh|um|uh|you know|i mean)\b/i.test(before)) {
        // Add a thinking sound before reflection phrases
        if (/\b(let me think|let me see|i wonder|that makes me think)\b/i.test(match)) {
          return `hmm<break time="200ms"/>${match}`;
        }
        return match;
      }
      return match;
    });
  });

  // Add natural hesitations before important statements with longer pauses
  result = result.replace(
    /\b(i think|i believe|i feel|i know|i see|i understand|i realize)\b/gi,
    (match) => {
      return `<break time="120ms"/>${match}<break time="150ms"/>`;
    }
  );

  // Add "you know" or "I mean" before clarifications (natural speech patterns)
  result = result.replace(
    /\b(that is|which means|in other words|to put it another way)\b/gi,
    (match, offset) => {
      const before = result.substring(Math.max(0, offset - 20), offset);
      if (!/\b(you know|i mean)\b/i.test(before)) {
        return `you know<break time="100ms"/>${match}`;
      }
      return match;
    }
  );

  // Add contemplative pauses before deep thoughts
  CONTEMPLATIVE_PAUSE_PHRASES.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="180ms"/>${match}<break time="200ms"/>`;
    });
  });

  return result;
}

/**
 * Add natural pauses with variable timing based on context
 */
export function addNaturalPauses(text: string, _baseSpeed: number): string {
  let result = text;

  // Variable pause after commas based on context (120-300ms)
  result = result.replace(/,(\s+)/g, (match, space, offset) => {
    const after = result.substring(offset + match.length, offset + match.length + 40);
    const before = result.substring(Math.max(0, offset - 30), offset);
    const isComplex = /\b(which|that|who|when|where|because|since|although|while)\b/i.test(after);
    const isReflective = /\b(think|consider|remember|reflect|wonder|imagine)\b/i.test(
      before + after
    );
    const pauseTime = isReflective ? '280ms' : isComplex ? '220ms' : '140ms';
    return `,<break time="${pauseTime}"/>${space}`;
  });

  // Pauses after semicolons (280-400ms)
  result = result.replace(/;(\s+)/g, (match, space, offset) => {
    const before = result.substring(Math.max(0, offset - 30), offset);
    const isReflective = /\b(think|consider|remember|reflect)\b/i.test(before);
    const pauseTime = isReflective ? '380ms' : '300ms';
    return `;<break time="${pauseTime}"/>${space}`;
  });

  // Variable pauses after periods (350-800ms)
  result = result.replace(/\.(\s+)/g, (match, space, offset) => {
    const before = result.substring(Math.max(0, offset - 50), offset);
    const isImportant = /\b(important|crucial|remember|listen|think|know|understand)\b/i.test(
      before
    );
    const isReflective = /\b(think|consider|remember|reflect|wonder|imagine|realize)\b/i.test(
      before
    );
    const isQuestion = /\?/.test(before);

    let pauseTime = '400ms';
    if (isReflective) {
      pauseTime = '650ms';
    } else if (isImportant) {
      pauseTime = '580ms';
    } else if (isQuestion) {
      pauseTime = '450ms';
    }

    return `.<break time="${pauseTime}"/>${space}`;
  });

  // Longer pauses after questions (600-900ms)
  result = result.replace(/\?(\s+)/g, (match, space, offset) => {
    const before = result.substring(Math.max(0, offset - 40), offset);
    const isDeepQuestion = /\b(think|consider|wonder|imagine|reflect|understand)\b/i.test(before);
    const pauseTime = isDeepQuestion ? '850ms' : '650ms';
    return `?<break time="${pauseTime}"/>${space}`;
  });

  // Pauses after exclamation marks (300-450ms)
  result = result.replace(/!(\s+)/g, (_match, space) => {
    return `!<break time="350ms"/>${space}`;
  });

  // Add micro-pauses before thinking sounds and transitions
  // IMPORTANT: Exclude matches inside protected financial pronunciation markers
  result = result.replace(
    /\b(well|you know|i mean|actually|hmm|ah|oh|um|uh)\b/gi,
    (match, _word, offset) => {
      // Check if we're inside a protected region
      const before = result.substring(0, offset);
      const startCount = (before.match(new RegExp(FINANCIAL_START, 'g')) || []).length;
      const endCount = (before.match(new RegExp(FINANCIAL_END, 'g')) || []).length;
      if (startCount > endCount) {
        // We're inside a protected region, don't modify
        return match;
      }
      return `<break time="100ms"/>${match}`;
    }
  );

  // Add longer contemplative pauses before reflection phrases
  REFLECTION_PHRASES.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="250ms"/>${match}<break time="200ms"/>`;
    });
  });

  // Add breath pauses before important phrases
  BREATH_POINTS.forEach((pattern) => {
    result = result.replace(pattern, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 30), offset);
      const isReflective = /\b(think|consider|reflect|wonder)\b/i.test(before + match);
      const pauseTime = isReflective ? '250ms' : '200ms';
      return `<break time="${pauseTime}"/>${match}`;
    });
  });

  // Add pauses after transition phrases
  TRANSITION_PHRASES.forEach((pattern) => {
    result = result.replace(pattern, (match, offset) => {
      const after = result.substring(offset + match.length, offset + match.length + 30);
      const isReflective = /\b(think|consider|remember|reflect)\b/i.test(after);
      const pauseTime = isReflective ? '220ms' : '170ms';
      return `${match}<break time="${pauseTime}"/>`;
    });
  });

  // Add longer pauses before reflection words
  result = result.replace(
    /\b(remember|think about|consider|reflect on|imagine|picture)\b/gi,
    (match) => {
      return `<break time="300ms"/>${match}<break time="200ms"/>`;
    }
  );

  // Add pause before long sentences
  result = result.replace(/^([A-Z][^.!?]{80,}[.!?])/gm, (match) => {
    return `<break time="250ms"/>${match}`;
  });

  return result;
}
