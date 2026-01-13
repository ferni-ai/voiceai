/**
 * Life Coaching & Mental Health Pronunciations
 *
 * @module ssml/constants/mental-health
 */
export const MENTAL_HEALTH_PRONUNCIATIONS = [
    // -------------------------------------------------------------------------
    // Therapy Types & Approaches
    // -------------------------------------------------------------------------
    { pattern: /\bCBT\b/g, replacement: 'C B T', description: 'Cognitive Behavioral Therapy' },
    { pattern: /\bDBT\b/g, replacement: 'D B T', description: 'Dialectical Behavior Therapy' },
    {
        pattern: /\bACT\b(?!\s+on|\s+like|\s+as)/gi,
        replacement: 'A C T therapy',
        description: 'Acceptance and Commitment Therapy',
    },
    { pattern: /\bEMDR\b/g, replacement: 'E M D R', description: 'Eye Movement Desensitization' },
    { pattern: /\bIFS\b/g, replacement: 'I F S', description: 'Internal Family Systems' },
    {
        pattern: /\bMBCT\b/g,
        replacement: 'M B C T',
        description: 'Mindfulness-Based Cognitive Therapy',
    },
    {
        pattern: /\bMBSR\b/g,
        replacement: 'M B S R',
        description: 'Mindfulness-Based Stress Reduction',
    },
    // -------------------------------------------------------------------------
    // Mental Health Conditions
    // -------------------------------------------------------------------------
    {
        pattern: /\bADHD\b/g,
        replacement: 'A D H D',
        description: 'Attention Deficit Hyperactivity Disorder',
    },
    { pattern: /\bADD\b/g, replacement: 'A D D', description: 'Attention Deficit Disorder' },
    { pattern: /\bOCD\b/g, replacement: 'O C D', description: 'Obsessive Compulsive Disorder' },
    { pattern: /\bPTSD\b/g, replacement: 'P T S D', description: 'Post-Traumatic Stress Disorder' },
    { pattern: /\bGAD\b/g, replacement: 'G A D', description: 'Generalized Anxiety Disorder' },
    { pattern: /\bMDD\b/g, replacement: 'M D D', description: 'Major Depressive Disorder' },
    { pattern: /\bBPD\b/g, replacement: 'B P D', description: 'Borderline Personality Disorder' },
    { pattern: /\bASD\b/g, replacement: 'A S D', description: 'Autism Spectrum Disorder' },
    // -------------------------------------------------------------------------
    // Emotional Intelligence & Coaching Terms
    // -------------------------------------------------------------------------
    { pattern: /\bEQ\b/g, replacement: 'E Q', description: 'Emotional Intelligence' },
    { pattern: /\bIQ\b/g, replacement: 'I Q', description: 'Intelligence Quotient' },
    { pattern: /\bNLP\b/g, replacement: 'N L P', description: 'Neuro-Linguistic Programming' },
];
//# sourceMappingURL=mental-health.js.map