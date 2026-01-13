/**
 * Unified Conversation Orchestrator Types
 *
 * Type definitions for the layered orchestrator architecture that coordinates
 * all conversation humanization systems.
 *
 * Architecture Overview:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    ConversationOrchestrator                  │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Phase 1: ANALYSIS                                          │
 * │  - Analyze user message (energy, engagement, topic weight)  │
 * │  - Detect signals (breakthrough, evidence, hesitation)      │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Phase 2: INTELLIGENCE                                      │
 * │  - Session intelligence (concern, predictions)              │
 * │  - Better-than-human (relationship, emotional memory)       │
 * │  - Deep humanization (mood tracking)                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Phase 3: HUMANIZATION                                      │
 * │  - Speech naturalization                                    │
 * │  - Advanced humanization (disfluencies, self-correction)    │
 * │  - Vocal humanization (energy matching, contractions)       │
 * │  - Content delivery pacing                                  │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Phase 4: OUTPUT                                            │
 * │  - Apply modifications                                      │
 * │  - Generate SSML                                            │
 * │  - Compile features list                                    │
 * └─────────────────────────────────────────────────────────────┘
 *
 * @module @ferni/conversation/orchestrator
 */
/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG = {
    enableAnalysis: true,
    enableIntelligence: true,
    enableHumanization: true,
    features: {
        speechNaturalization: true,
        vocalHumanization: true,
        advancedHumanization: true,
        deepHumanization: true,
        sessionIntelligence: true,
        betterThanHuman: true,
        contentDeliveryPacing: true,
        silencePresence: true,
        composableEffects: true, // NEW: Enabled by default - clean architecture effects system
    },
    maxHumanizationsPerResponse: 3,
    maxPriorityActions: 2,
    debug: false,
};
//# sourceMappingURL=types.js.map