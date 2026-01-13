/**
 * Layout Optimizer
 *
 * Determines optimal section ordering and emphasis based on visitor context.
 * Uses AI to reason about what content will resonate.
 *
 * @module services/landing-intelligence/layout-optimizer
 */
import { createLogger } from '../../utils/safe-logger.js';
import { generateJSON } from './gemini-client.js';
const log = createLogger({ module: 'LayoutOptimizer' });
// ============================================================================
// AVAILABLE SECTIONS
// ============================================================================
const ALL_SECTIONS = [
    'hero',
    'two-am',
    'stats',
    'showcase',
    'memory-demo',
    'story',
    'use-cases',
    'team',
    'journey',
    'how-it-works',
    'features',
    'proof',
    'security',
    'faq',
    'pricing',
    'final-cta',
];
// ============================================================================
// DEFAULT LAYOUTS
// ============================================================================
const DEFAULT_ORDER = [
    'hero',
    'two-am',
    'stats',
    'showcase',
    'memory-demo',
    'story',
    'use-cases',
    'team',
    'journey',
    'how-it-works',
    'features',
    'proof',
    'security',
    'faq',
    'pricing',
    'final-cta',
];
// Predefined layouts for common scenarios
const LAYOUT_PRESETS = {
    // Anxious visitor at night
    'anxious-night': {
        order: [
            'hero',
            'two-am',
            'story',
            'presence-demo',
            'faq',
            'security',
            'pricing',
            'final-cta',
        ],
        emphasis: [
            { section: 'two-am', treatment: 'section--expanded', priority: 1 },
            { section: 'security', treatment: 'section--highlighted', priority: 2 },
        ],
        hide: ['stats', 'proof'],
        reasoning: 'Anxious night visitor - prioritize comfort and safety',
    },
    // Price-focused decision maker
    'decision-pricing': {
        order: ['hero', 'proof', 'pricing', 'features', 'faq', 'security', 'final-cta'],
        emphasis: [
            { section: 'proof', treatment: 'section--expanded', priority: 1 },
            { section: 'pricing', treatment: 'section--highlighted', priority: 2 },
        ],
        hide: ['two-am', 'story', 'journey'],
        reasoning: 'Decision-stage visitor focused on pricing - streamline to conversion',
    },
    // Curious explorer
    'curious-explore': {
        order: [
            'hero',
            'showcase',
            'memory-demo',
            'team',
            'journey',
            'use-cases',
            'features',
            'proof',
            'pricing',
            'faq',
            'final-cta',
        ],
        emphasis: [
            { section: 'memory-demo', treatment: 'section--expanded', priority: 1 },
            { section: 'team', treatment: 'section--highlighted', priority: 2 },
        ],
        hide: [],
        reasoning: 'Curious visitor - show breadth of capabilities',
    },
    // Career-focused
    'career-focused': {
        order: [
            'hero',
            'showcase',
            'team',
            'use-cases',
            'features',
            'proof',
            'pricing',
            'faq',
            'final-cta',
        ],
        emphasis: [
            { section: 'use-cases', treatment: 'section--expanded', priority: 1 },
            { section: 'team', treatment: 'section--highlighted', priority: 2 },
        ],
        hide: ['two-am', 'journey'],
        reasoning: 'Career-focused visitor - emphasize practical value',
    },
    // Skeptical
    skeptical: {
        order: [
            'hero',
            'proof',
            'security',
            'faq',
            'features',
            'pricing',
            'team',
            'final-cta',
        ],
        emphasis: [
            { section: 'proof', treatment: 'section--expanded', priority: 1 },
            { section: 'faq', treatment: 'section--highlighted', priority: 2 },
            { section: 'security', treatment: 'section--highlighted', priority: 3 },
        ],
        hide: ['story', 'two-am'],
        reasoning: 'Skeptical visitor - lead with proof and address concerns',
    },
};
function selectPreset(context) {
    const { intent, timeMode } = context;
    // Night + anxiety = anxious-night
    if (timeMode === 'late-night' && intent?.emotionalState === 'anxious') {
        return 'anxious-night';
    }
    // Decision stage + pricing interest
    if (intent?.buyingStage === 'decision') {
        return 'decision-pricing';
    }
    // Skeptical
    if (intent?.buyingStage === 'skeptical' || intent?.emotionalState === 'skeptical') {
        return 'skeptical';
    }
    // Career focus
    if (intent?.primaryConcern === 'career') {
        return 'career-focused';
    }
    // Default curious
    if (intent?.buyingStage === 'awareness') {
        return 'curious-explore';
    }
    return null;
}
// ============================================================================
// AI-POWERED OPTIMIZATION
// ============================================================================
const LAYOUT_OPTIMIZATION_PROMPT = `You are optimizing a landing page layout for Ferni, an AI life coach.

AVAILABLE SECTIONS (in default order):
${ALL_SECTIONS.join(', ')}

SECTION DESCRIPTIONS:
- hero: Main headline and CTA
- two-am: "2am presence" emotional story
- stats: Quick stats (10K+ conversations, etc.)
- showcase: Product demo with chat mockup
- memory-demo: Timeline showing memory capability
- story: Ferni's origin story (AI built by AI)
- use-cases: Career, habits, relationships, etc.
- team: 6 AI specialists
- journey: Relationship deepening visualization
- how-it-works: Call/Text/App steps
- features: Grid of superpowers
- proof: Comparison table vs coach/friend
- security: Privacy and encryption
- faq: Common questions
- pricing: 3 tiers
- final-cta: Final call to action

VISITOR CONTEXT:
{context}

Optimize the layout:
1. Reorder sections to match visitor intent
2. Choose sections to emphasize or hide
3. Keep total sections reasonable (8-12 for desktop, 6-8 for mobile)
4. Hero and final-cta should stay first and last

Return JSON:
{
  "order": ["section1", "section2", ...],
  "emphasis": [
    { "section": "section-id", "treatment": "section--expanded" | "section--highlighted" | "section--minimal", "priority": 1-5 }
  ],
  "hide": ["section-to-hide"],
  "reasoning": "brief explanation",
  "confidence": 0.0-1.0
}`;
export async function getOptimalSectionOrder(context) {
    // Try preset first
    const presetKey = selectPreset(context);
    if (presetKey) {
        const preset = LAYOUT_PRESETS[presetKey];
        log.debug({ presetKey }, 'Using layout preset');
        return {
            order: preset.order || DEFAULT_ORDER,
            emphasis: preset.emphasis || [],
            hide: preset.hide || [],
            reasoning: preset.reasoning || 'Preset layout',
            confidence: 0.8,
        };
    }
    // Use AI for complex cases
    const prompt = LAYOUT_OPTIMIZATION_PROMPT.replace('{context}', JSON.stringify(context, null, 2));
    const result = await generateJSON(prompt, {
        timeout: 4000,
        cacheTTL: 5 * 60 * 1000, // 5 minutes
    });
    if (result) {
        // Validate the order contains valid sections
        const validOrder = result.order.filter((s) => ALL_SECTIONS.includes(s));
        // Ensure hero is first and final-cta is last
        if (validOrder[0] !== 'hero') {
            validOrder.unshift('hero');
        }
        if (validOrder[validOrder.length - 1] !== 'final-cta') {
            validOrder.push('final-cta');
        }
        log.info({
            sectionCount: validOrder.length,
            hiddenCount: result.hide?.length || 0,
        }, 'AI layout optimization complete');
        return {
            order: validOrder,
            emphasis: result.emphasis || [],
            hide: result.hide || [],
            reasoning: result.reasoning,
            confidence: result.confidence,
        };
    }
    // Fallback to default
    return {
        order: DEFAULT_ORDER,
        emphasis: [],
        hide: [],
        reasoning: 'Default layout',
        confidence: 0.5,
    };
}
// ============================================================================
// MOBILE OPTIMIZATION
// ============================================================================
export function optimizeForMobile(layout) {
    // Mobile should have fewer sections
    const prioritySections = [
        'hero',
        'two-am',
        'showcase',
        'features',
        'pricing',
        'faq',
        'final-cta',
    ];
    const mobileOrder = layout.order.filter((section) => prioritySections.includes(section) || layout.emphasis.some((e) => e.section === section));
    // Hide more sections on mobile
    const mobileHide = layout.order.filter((section) => !mobileOrder.includes(section) && !layout.hide.includes(section));
    return {
        ...layout,
        order: mobileOrder,
        hide: [...layout.hide, ...mobileHide],
        reasoning: `${layout.reasoning} (optimized for mobile)`,
    };
}
//# sourceMappingURL=layout-optimizer.js.map