/**
 * Brand Generator Service
 *
 * AI-powered content generation that follows brand rules.
 * Uses LLM with brand context to generate on-brand copy.
 *
 * @module @ferni/brand/brand-generator
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getToneConfig, loadBrandContext } from './brand-context.js';
import { autoFixViolations, validateBrandCompliance } from './brand-validator.js';
import { getPersonaVoice, getRandomGreeting, getResponsePatterns } from './persona-voices.js';
const log = createLogger({ module: 'BrandGenerator' });
// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================
/**
 * Build the complete system prompt for brand-aware generation
 */
export function buildBrandSystemPrompt(config) {
    const { brandContext, personaVoice, contentType, context } = config;
    const toneConfig = getToneConfig(context.emotion);
    return `You are writing content for Ferni, an AI life coaching service.
Your job is to write content that sounds exactly like ${personaVoice.name}.

## THE MOST IMPORTANT RULE
${personaVoice.name} is NOT an AI assistant. ${personaVoice.name} is a companion, a friend, someone in your corner.
NEVER reference being AI, being programmed, having algorithms, or any technical aspect.
Instead, focus on what ${personaVoice.name} DOES: notices, remembers, shows up, cares.

## Brand Promise
"${brandContext.identity.promise}"

## Brand Values
${brandContext.identity.values.join(', ')}

## Voice Principles
${brandContext.voice.principles
        .map((p) => `- **${p.name}**: ${p.description}
  BAD: "${p.badExample}"
  GOOD: "${p.goodExample}"`)
        .join('\n\n')}

## Words to USE (prefer these)
${brandContext.voice.wordsToUse.map((w) => `- ${w.word}: ${w.why}`).join('\n')}

## Words to AVOID (never use)
${brandContext.voice.wordsToAvoid
        .filter((w) => w.severity === 'critical')
        .map((w) => `- "${w.avoid}"`)
        .join('\n')}

## ABSOLUTELY BANNED PHRASES (instant fail)
${brandContext.voice.bannedPhrases.map((p) => `- "${p}"`).join('\n')}

## About ${personaVoice.name}
Role: ${personaVoice.role}
Archetype: "${personaVoice.archetype}"
Tone: ${personaVoice.tone}
Speaking Style: ${personaVoice.speakingStyle}

Words ${personaVoice.name} uses often: ${personaVoice.vocabularyBias.join(', ')}

Signature phrases:
${personaVoice.signaturePhrases.map((p) => `- "${p}"`).join('\n')}

What ${personaVoice.name} NEVER says:
${personaVoice.antiPatterns.map((p) => `- "${p}"`).join('\n')}

## Current Context
Content type: ${contentType}
Audience: ${context.audience}
Emotional context: ${context.emotion}
Channel: ${context.channel}
${context.topic ? `Topic: ${context.topic}` : ''}

## Tone for ${context.emotion} context
${toneConfig.description}

Example phrases for this context:
${toneConfig.examples.map((e) => `- "${e}"`).join('\n')}

Avoid in this context:
${toneConfig.avoid.map((a) => `- "${a}"`).join('\n')}

## Key Rules
1. Sound like ${personaVoice.name}, not a generic assistant
2. Be warm but not saccharine (no "AMAZING!!!" or excessive enthusiasm)
3. Be confident but not arrogant (state truths, don't overpromise)
4. Be present and human (no corporate jargon)
5. Compare to human support (therapists, friends), NEVER to other AI
6. Lead with emotion and connection, not features

## Output Format
Return ONLY the content. No explanations, no alternatives, just the ${contentType}.
Keep it concise and impactful.
`.trim();
}
// ============================================================================
// GENERATION FUNCTIONS
// ============================================================================
/**
 * Generate brand-compliant content
 */
export async function generateBrandContent(request, llmClient) {
    const startTime = Date.now();
    const brandContext = await loadBrandContext();
    const personaId = request.context.persona || 'ferni';
    const personaVoice = getPersonaVoice(personaId);
    log.info({ type: request.type, persona: personaId, context: request.context.emotion }, 'Generating brand content');
    // If no LLM client, use template-based generation
    if (!llmClient) {
        const content = generateFromTemplates(request, personaVoice);
        return {
            content,
            alternatives: [],
            complianceScore: 100,
            violations: [],
            meta: {
                personaUsed: personaId,
                tokensUsed: 0,
                generatedAt: new Date().toISOString(),
            },
        };
    }
    // Build system prompt
    const systemPrompt = buildBrandSystemPrompt({
        brandContext,
        personaVoice,
        contentType: request.type,
        context: request.context,
    });
    // Build user prompt
    const userPrompt = buildUserPrompt(request);
    // Call LLM
    const generated = await llmClient.generate({
        system: systemPrompt,
        user: userPrompt,
        temperature: 0.7,
        maxTokens: getMaxTokens(request.type),
    });
    // Validate compliance
    const validation = await validateBrandCompliance(generated, {
        persona: personaId,
        context: request.context.emotion,
    });
    // If violations, attempt auto-fix
    let finalContent = generated;
    if (validation.violations.length > 0) {
        const { fixed, changes } = autoFixViolations(generated);
        if (changes.length > 0) {
            finalContent = fixed;
            log.info({ changes }, 'Auto-fixed brand violations');
        }
    }
    // Re-validate after fixes
    const finalValidation = await validateBrandCompliance(finalContent, {
        persona: personaId,
        context: request.context.emotion,
    });
    const elapsed = Date.now() - startTime;
    log.info({
        elapsed,
        score: finalValidation.score,
        violations: finalValidation.violations.length,
    }, 'Brand content generated');
    return {
        content: finalContent,
        alternatives: generated !== finalContent ? [generated] : [],
        complianceScore: finalValidation.score,
        violations: finalValidation.violations,
        meta: {
            personaUsed: personaId,
            tokensUsed: estimateTokens(generated),
            generatedAt: new Date().toISOString(),
        },
    };
}
/**
 * Generate content from templates (no LLM required)
 */
function generateFromTemplates(request, personaVoice) {
    const { type, context } = request;
    switch (type) {
        case 'greeting':
            return getRandomGreeting(personaVoice.id);
        case 'response':
            const patterns = getResponsePatterns(personaVoice.id, context.emotion);
            return patterns[Math.floor(Math.random() * patterns.length)];
        case 'headline':
            return generateHeadline(personaVoice, context.emotion);
        case 'cta':
            return generateCTA(context.emotion);
        case 'notification':
            return generateNotification(personaVoice);
        case 'toast':
            return generateToast(context.emotion);
        case 'email':
            return generateEmailOpening(personaVoice, context);
        default:
            return personaVoice.signaturePhrases[0];
    }
}
/**
 * Generate a headline
 */
function generateHeadline(persona, context) {
    const headlines = {
        celebration: ['You did it.', 'This moment matters.', "Don't brush past this."],
        support: ["I'm here.", "You're not alone in this.", 'Take your time.'],
        coaching: ['One step at a time.', "Let's make this doable.", 'What would help right now?'],
        checkin: ['Thinking of you.', "How'd it go?", 'Just checking in.'],
        onboarding: ['Finally, someone who listens.', "Hey. I'm Ferni.", 'Someone in your corner.'],
        error: ["Something's not right.", "That's on us.", "Let's try again."],
        notification: ['Thinking of you.', 'Just wanted you to know.', 'Remember this?'],
        marketing: [
            'Better than human.',
            'Finally, someone who actually listens.',
            'Someone in your corner. Always.',
        ],
    };
    const options = headlines[context] || headlines.checkin;
    return options[Math.floor(Math.random() * options.length)];
}
/**
 * Generate a CTA
 */
function generateCTA(context) {
    const ctas = {
        celebration: ['Tell me everything', 'Keep going'],
        support: ['Take your time', "I'm here"],
        coaching: ['Start small', "Let's do this"],
        checkin: ['Share more', 'Keep talking'],
        onboarding: ['Begin a real conversation', 'Meet the team'],
        error: ['Try again', 'Take a breath'],
        notification: ['Open Ferni', 'See more'],
        marketing: ['Begin a real conversation', 'Meet Ferni'],
    };
    const options = ctas[context] || ctas.checkin;
    return options[Math.floor(Math.random() * options.length)];
}
/**
 * Generate a notification
 */
function generateNotification(persona) {
    const notifications = [
        'Thinking of you.',
        'No pressure. Just here.',
        'How are you today?',
        ...persona.responsePatterns.notification,
    ];
    return notifications[Math.floor(Math.random() * notifications.length)];
}
/**
 * Generate a toast message
 */
function generateToast(context) {
    const toasts = {
        celebration: 'Nice work.',
        support: "I'm here.",
        coaching: 'One step done.',
        checkin: 'Saved.',
        onboarding: 'Welcome.',
        error: 'Something went wrong.',
        notification: 'New message.',
        marketing: 'Welcome.',
    };
    return toasts[context] || 'Done.';
}
/**
 * Generate email opening
 */
function generateEmailOpening(persona, context) {
    const openings = [
        `Hey.\n\n${persona.greetings[0]}`,
        `Thinking of you.\n\n`,
        `Just wanted to reach out.\n\n`,
    ];
    return openings[Math.floor(Math.random() * openings.length)];
}
/**
 * Build user prompt for LLM
 */
function buildUserPrompt(request) {
    const { type, context, constraints } = request;
    let prompt = `Generate a ${type} for Ferni.`;
    if (context.topic) {
        prompt += `\nTopic: ${context.topic}`;
    }
    if (constraints?.maxLength) {
        prompt += `\nMaximum length: ${constraints.maxLength} characters`;
    }
    if (constraints?.mustInclude?.length) {
        prompt += `\nMust include: ${constraints.mustInclude.join(', ')}`;
    }
    if (constraints?.mustAvoid?.length) {
        prompt += `\nMust avoid: ${constraints.mustAvoid.join(', ')}`;
    }
    if (constraints?.tone) {
        prompt += `\nTone: ${constraints.tone}`;
    }
    return prompt;
}
/**
 * Get max tokens for content type
 */
function getMaxTokens(type) {
    const maxTokens = {
        headline: 50,
        cta: 20,
        toast: 30,
        notification: 100,
        greeting: 150,
        response: 300,
        email: 500,
    };
    return maxTokens[type] || 200;
}
/**
 * Estimate tokens in content
 */
function estimateTokens(content) {
    // Rough estimate: ~4 chars per token
    return Math.ceil(content.length / 4);
}
// ============================================================================
// BATCH GENERATION
// ============================================================================
/**
 * Generate multiple variants for A/B testing
 */
export async function generateVariants(request, count = 3, llmClient) {
    const results = [];
    for (let i = 0; i < count; i++) {
        const result = await generateBrandContent(request, llmClient);
        results.push(result);
    }
    // Sort by compliance score
    results.sort((a, b) => b.complianceScore - a.complianceScore);
    return results;
}
/**
 * Generate experiment variants for a specific experiment type
 */
export async function generateExperimentVariants(experimentType, context = 'marketing', llmClient) {
    const request = {
        type: experimentType,
        context: {
            audience: 'new_user',
            emotion: context,
            channel: 'web',
        },
    };
    const results = await generateVariants(request, 5, llmClient);
    return results.map((r, i) => ({
        variantId: `ai_gen_${experimentType}_${i}`,
        content: r.content,
        score: r.complianceScore,
    }));
}
//# sourceMappingURL=brand-generator.js.map