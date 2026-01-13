/**
 * Therapeutic Frameworks Types
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Core types for evidence-based therapeutic frameworks.
 * These aren't replacements for therapy—they're tools that help
 * Ferni offer research-backed support in everyday conversation.
 *
 * PHILOSOPHY:
 * Real therapeutic frameworks have decades of research behind them.
 * We adapt their essence for conversational coaching while being
 * clear that Ferni is a coach, not a therapist.
 *
 * @module TherapeuticFrameworks/Types
 */
/**
 * DBT's TIPP skills for crisis.
 */
export const TIPP_SKILL = {
    id: 'tipp',
    name: 'TIPP',
    module: 'distress_tolerance',
    description: 'Quickly change your body chemistry when emotions are at a 10',
    acronym: 'TIPP',
    acronymMeaning: {
        T: 'Temperature - cold water on face',
        I: 'Intense exercise',
        P1: 'Paced breathing',
        P2: 'Paired muscle relaxation',
    },
    whenToUse: ['crisis', 'panic', 'extreme emotion', "can't calm down"],
    steps: [
        'Temperature: Put cold water on your face, or hold ice',
        'Intense Exercise: Even 20 jumping jacks can help',
        'Paced Breathing: Breathe out longer than you breathe in',
        'Paired Muscle Relaxation: Tense muscles as you breathe in, relax as you breathe out',
    ],
    voiceGuidance: `When emotions are at a 10, we need to change your body chemistry. 
Let me walk you through TIPP. 
First - Temperature. If you can, run cold water on your face or hold something cold. 
This activates your dive reflex and slows your heart rate. 
Can you try that?`,
};
/**
 * DBT's STOP skill for when you're about to do something impulsive.
 */
export const STOP_SKILL = {
    id: 'stop',
    name: 'STOP',
    module: 'distress_tolerance',
    description: 'Pause before acting on impulse',
    acronym: 'STOP',
    acronymMeaning: {
        S: "Stop - freeze, don't act",
        T: 'Take a step back',
        O: "Observe what's happening",
        P: 'Proceed mindfully',
    },
    whenToUse: ['about to say something regrettable', 'impulsive', 'reactive', 'angry'],
    steps: [
        'Stop - freeze where you are',
        "Take a step back - breathe, don't react",
        "Observe - what am I feeling? What's happening?",
        "Proceed mindfully - what's effective here?",
    ],
    voiceGuidance: `Before you do anything, let's STOP together.
Stop. Just freeze for a second. You don't have to respond right now.
Take a step back. One deep breath with me.
Observe. What are you feeling right now? What just happened?
Now we can proceed mindfully. What do you actually want to happen here?`,
};
export const DEFAULT_CONFIG = {
    enableACT: true,
    enableDBT: true,
    enableMI: true,
    enableBehavioralActivation: true,
    minRelationshipStage: 'building',
};
//# sourceMappingURL=types.js.map