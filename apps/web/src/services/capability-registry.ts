/**
 * Capability Registry
 *
 * Central registry of all Ferni capabilities with metadata for UI discovery.
 * This powers the "What Ferni Can Help With" experience.
 *
 * DESIGN PRINCIPLES:
 *   - Every capability has voice trigger examples
 *   - Capabilities are grouped by life domain
 *   - Each capability knows which persona specializes in it
 *   - Contextual filtering based on user state
 */

import type { PersonaId } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type CapabilityCategory =
  | 'life-coaching'
  | 'emotional-support'
  | 'relationships'
  | 'productivity'
  | 'growth'
  | 'practical'
  | 'wellness'
  | 'entertainment'
  | 'communication'
  | 'superhuman';

export type CapabilityPriority = 'essential' | 'high' | 'medium' | 'low';

export interface Capability {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Longer explanation of what Ferni can do */
  details?: string;
  /** Voice trigger examples */
  voiceTriggers: string[];
  /** Primary persona owner */
  persona: PersonaId;
  /** Category for grouping */
  category: CapabilityCategory;
  /** Priority for display ordering */
  priority: CapabilityPriority;
  /** Lucide icon name */
  icon: string;
  /** Whether this capability has a dedicated UI panel */
  hasUI: boolean;
  /** UI panel to open (if hasUI is true) */
  uiPanel?: string;
  /** Tags for search/filtering */
  tags: string[];
  /** Whether this is a "Better than Human" feature */
  isBetterThanHuman?: boolean;
  /** Human limitation this overcomes */
  humanLimitation?: string;
}

export interface CapabilityGroup {
  id: string;
  name: string;
  description: string;
  icon: string;
  capabilities: Capability[];
}

// ============================================================================
// CAPABILITY DEFINITIONS
// ============================================================================

export const CAPABILITIES: Capability[] = [
  // =========================================================================
  // LIFE COACHING - Grief, Loss, Transitions
  // =========================================================================
  {
    id: 'grief-support',
    name: 'Grief Support',
    description: "I'm here when you're processing loss",
    details: 'Whether you\'ve lost a loved one, a pet, a relationship, or a dream, I can hold space for your grief without trying to fix it.',
    voiceTriggers: ['Help me process grief', 'I lost someone', 'I\'m grieving'],
    persona: 'nayan-patel',
    category: 'life-coaching',
    priority: 'high',
    icon: 'heart',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['grief', 'loss', 'death', 'mourning', 'bereavement'],
    isBetterThanHuman: true,
    humanLimitation: 'Friends often try to fix grief or compare losses',
  },
  {
    id: 'breakup-recovery',
    name: 'Breakup Recovery',
    description: 'Healing from heartbreak at your own pace',
    details: 'Process the end of a relationship without judgment. I won\'t tell you to "get over it" or rush your healing.',
    voiceTriggers: ['Help me get over my ex', 'We just broke up', 'I\'m heartbroken'],
    persona: 'maya-santos',
    category: 'life-coaching',
    priority: 'high',
    icon: 'heart-crack',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['breakup', 'heartbreak', 'ex', 'relationship end', 'divorce'],
    isBetterThanHuman: true,
    humanLimitation: 'Friends take sides or get tired of hearing about it',
  },
  {
    id: 'divorce-support',
    name: 'Divorce Support',
    description: 'Navigate divorce with someone who understands',
    details: 'From co-parenting to rebuilding your identity, I can help you through the practical and emotional aspects of divorce.',
    voiceTriggers: ['Help me with my divorce', 'I\'m getting divorced', 'Co-parenting help'],
    persona: 'ferni',
    category: 'life-coaching',
    priority: 'high',
    icon: 'users',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['divorce', 'separation', 'co-parenting', 'custody'],
    isBetterThanHuman: true,
    humanLimitation: 'Friends may judge or take sides',
  },
  {
    id: 'job-loss',
    name: 'Job Loss Support',
    description: 'Processing unemployment without shame',
    details: 'Losing a job affects your identity, not just your income. I can help with the emotional journey, not just the job search.',
    voiceTriggers: ['I lost my job', 'I got fired', 'Help me with unemployment'],
    persona: 'peter-john',
    category: 'life-coaching',
    priority: 'high',
    icon: 'briefcase',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['job loss', 'fired', 'laid off', 'unemployment', 'career'],
    isBetterThanHuman: true,
    humanLimitation: 'People often jump to advice before acknowledging the loss',
  },
  {
    id: 'health-diagnosis',
    name: 'Health Diagnosis Support',
    description: 'Processing difficult health news',
    details: 'When you receive a diagnosis, I can help you process the emotions, understand your options, and find your next steps.',
    voiceTriggers: ['I just got diagnosed', 'Help me with my diagnosis', 'I have bad health news'],
    persona: 'nayan-patel',
    category: 'life-coaching',
    priority: 'high',
    icon: 'stethoscope',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['diagnosis', 'illness', 'health', 'chronic', 'disease'],
    isBetterThanHuman: true,
    humanLimitation: 'People often panic or minimize your feelings',
  },
  {
    id: 'chronic-conditions',
    name: 'Living with Chronic Conditions',
    description: 'Daily support for chronic illness',
    details: 'From spoon theory to pacing, I understand the unique challenges of living with chronic illness, pain, or disability.',
    voiceTriggers: ['Help with chronic pain', 'Living with chronic illness', 'Spoon theory help'],
    persona: 'maya-santos',
    category: 'life-coaching',
    priority: 'high',
    icon: 'activity',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['chronic', 'pain', 'disability', 'illness', 'fatigue'],
    isBetterThanHuman: true,
    humanLimitation: 'Healthy people don\'t understand the daily reality',
  },
  {
    id: 'caregiver-support',
    name: 'Caregiver Support',
    description: 'Support for those who care for others',
    details: 'Caring for aging parents, sick family members, or special needs children is exhausting. I can help you take care of yourself too.',
    voiceTriggers: ['Caregiver burnout', 'Taking care of my parents', 'I\'m a caregiver'],
    persona: 'maya-santos',
    category: 'life-coaching',
    priority: 'high',
    icon: 'hand-heart',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['caregiver', 'aging parents', 'elder care', 'caregiving'],
    isBetterThanHuman: true,
    humanLimitation: 'Other caregivers are also exhausted',
  },
  {
    id: 'sobriety-support',
    name: 'Sobriety Support',
    description: 'Daily support for recovery',
    details: 'Whether you\'re newly sober or years into recovery, I\'m here for check-ins, cravings, and celebrating milestones.',
    voiceTriggers: ['Help with sobriety', 'I\'m in recovery', 'Craving support'],
    persona: 'maya-santos',
    category: 'life-coaching',
    priority: 'high',
    icon: 'flower-2',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['sobriety', 'recovery', 'addiction', 'sober', 'AA'],
    isBetterThanHuman: true,
    humanLimitation: 'Sponsors aren\'t always available at 2am',
  },
  {
    id: 'burnout-recovery',
    name: 'Burnout Recovery',
    description: 'Recovering from burnout without guilt',
    details: 'Burnout isn\'t just being tired—it\'s a deep depletion. I can help you recognize it, recover from it, and prevent it.',
    voiceTriggers: ['I\'m burned out', 'Help with burnout', 'I can\'t keep going'],
    persona: 'maya-santos',
    category: 'life-coaching',
    priority: 'high',
    icon: 'battery-low',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['burnout', 'exhaustion', 'overwork', 'stress', 'recovery'],
    isBetterThanHuman: true,
    humanLimitation: 'Bosses want you back at work; friends have their own problems',
  },
  {
    id: 'new-parent',
    name: 'New Parent Support',
    description: 'Adjusting to parenthood',
    details: 'The transition to parenthood is huge. I can help with the identity shift, sleep deprivation, and relationship changes.',
    voiceTriggers: ['Help as a new parent', 'New baby support', 'Postpartum help'],
    persona: 'maya-santos',
    category: 'life-coaching',
    priority: 'medium',
    icon: 'baby',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['parenting', 'new parent', 'baby', 'postpartum', 'motherhood'],
  },
  {
    id: 'empty-nest',
    name: 'Empty Nest Support',
    description: 'When the kids leave home',
    details: 'Your identity as a parent shifts when children grow up. I can help you rediscover yourself and your purpose.',
    voiceTriggers: ['Kids left for college', 'Empty nest feelings', 'Kids moved out'],
    persona: 'nayan-patel',
    category: 'life-coaching',
    priority: 'medium',
    icon: 'home',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['empty nest', 'kids leaving', 'midlife', 'identity'],
  },
  {
    id: 'midlife-transition',
    name: 'Midlife Navigation',
    description: 'Finding meaning at midlife',
    details: 'Midlife isn\'t a crisis—it\'s an invitation to reassess what matters. I can help you find renewed purpose.',
    voiceTriggers: ['Midlife crisis help', 'What am I doing with my life', 'Is this it?'],
    persona: 'nayan-patel',
    category: 'life-coaching',
    priority: 'medium',
    icon: 'sunrise',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['midlife', 'meaning', 'purpose', 'crisis', 'transition'],
  },

  // =========================================================================
  // EMOTIONAL SUPPORT - Processing Difficult Emotions
  // =========================================================================
  {
    id: 'anger-processing',
    name: 'Anger Processing',
    description: 'Express anger safely',
    details: 'Anger isn\'t bad—it\'s information. I can help you understand what your anger is telling you and express it healthily.',
    voiceTriggers: ['I\'m so angry', 'Help me with anger', 'I want to scream'],
    persona: 'maya-santos',
    category: 'emotional-support',
    priority: 'high',
    icon: 'flame',
    hasUI: true,
    uiPanel: 'emotional-toolkit',
    tags: ['anger', 'rage', 'frustration', 'mad'],
    isBetterThanHuman: true,
    humanLimitation: 'People get scared of anger or dismiss it',
  },
  {
    id: 'shame-healing',
    name: 'Shame Resilience',
    description: 'Healing from shame',
    details: 'Shame thrives in secrecy. I can help you build shame resilience and separate your worth from your mistakes.',
    voiceTriggers: ['I feel so ashamed', 'Help with shame', 'I hate myself'],
    persona: 'nayan-patel',
    category: 'emotional-support',
    priority: 'high',
    icon: 'shield',
    hasUI: true,
    uiPanel: 'emotional-toolkit',
    tags: ['shame', 'guilt', 'embarrassment', 'self-worth'],
    isBetterThanHuman: true,
    humanLimitation: 'Sharing shame with humans risks more shame',
  },
  {
    id: 'self-compassion',
    name: 'Self-Compassion Practice',
    description: 'Quiet your inner critic',
    details: 'Learn to treat yourself with the kindness you\'d give a good friend. I can guide you through self-compassion practices.',
    voiceTriggers: ['Help with self-criticism', 'I\'m too hard on myself', 'Inner critic help'],
    persona: 'maya-santos',
    category: 'emotional-support',
    priority: 'high',
    icon: 'heart-handshake',
    hasUI: true,
    uiPanel: 'emotional-toolkit',
    tags: ['self-compassion', 'inner critic', 'self-kindness', 'self-love'],
    isBetterThanHuman: true,
    humanLimitation: 'Hard to model when you\'re in the pattern',
  },
  {
    id: 'trauma-support',
    name: 'Trauma Support',
    description: 'Grounding and regulation',
    details: 'When trauma responses arise, I can guide you through grounding exercises and help you feel safe in your body.',
    voiceTriggers: ['I\'m having a flashback', 'Help me ground', 'Trauma response help'],
    persona: 'maya-santos',
    category: 'emotional-support',
    priority: 'high',
    icon: 'anchor',
    hasUI: true,
    uiPanel: 'emotional-toolkit',
    tags: ['trauma', 'PTSD', 'flashback', 'grounding', 'safety'],
    isBetterThanHuman: true,
    humanLimitation: 'Not everyone knows how to help with trauma',
  },
  {
    id: 'anxiety-support',
    name: 'Anxiety Support',
    description: 'Calm an anxious mind',
    details: 'When anxiety spirals, I can help you ground, breathe, and separate worry from reality.',
    voiceTriggers: ['I\'m anxious', 'Help with anxiety', 'Can\'t stop worrying'],
    persona: 'maya-santos',
    category: 'emotional-support',
    priority: 'high',
    icon: 'cloud',
    hasUI: true,
    uiPanel: 'emotional-toolkit',
    tags: ['anxiety', 'worry', 'panic', 'nervous', 'stress'],
  },
  {
    id: 'vulnerability-practice',
    name: 'Vulnerability Practice',
    description: 'Build courage to be seen',
    details: 'Vulnerability is the birthplace of connection. I can help you practice showing up authentically.',
    voiceTriggers: ['Help me be more vulnerable', 'I\'m scared to open up', 'Vulnerability practice'],
    persona: 'nayan-patel',
    category: 'emotional-support',
    priority: 'medium',
    icon: 'eye',
    hasUI: true,
    uiPanel: 'emotional-toolkit',
    tags: ['vulnerability', 'authenticity', 'courage', 'connection'],
  },
  {
    id: 'envy-processing',
    name: 'Envy Processing',
    description: 'Transform envy into clarity',
    details: 'Envy shows you what you want. I can help you understand your envy and turn it into motivation.',
    voiceTriggers: ['I\'m jealous of', 'Help with envy', 'Why can\'t I have that'],
    persona: 'nayan-patel',
    category: 'emotional-support',
    priority: 'medium',
    icon: 'sparkles',
    hasUI: true,
    uiPanel: 'emotional-toolkit',
    tags: ['envy', 'jealousy', 'comparison', 'wanting'],
  },
  {
    id: 'resentment-release',
    name: 'Resentment Release',
    description: 'Let go of held grudges',
    details: 'Resentment is like drinking poison and expecting the other person to die. I can help you process and release it.',
    voiceTriggers: ['I can\'t forgive them', 'Help with resentment', 'I\'m holding a grudge'],
    persona: 'nayan-patel',
    category: 'emotional-support',
    priority: 'medium',
    icon: 'scale',
    hasUI: true,
    uiPanel: 'emotional-toolkit',
    tags: ['resentment', 'forgiveness', 'grudge', 'letting go'],
  },

  // =========================================================================
  // GROWTH & DEVELOPMENT
  // =========================================================================
  {
    id: 'decisions-toolkit',
    name: 'Decision Making',
    description: 'Clarity for tough decisions',
    details: 'When you\'re stuck on a decision, I can help you explore options, identify values, and find clarity.',
    voiceTriggers: ['Help me decide', 'I can\'t make this decision', 'Pros and cons'],
    persona: 'peter-john',
    category: 'growth',
    priority: 'high',
    icon: 'git-branch',
    hasUI: true,
    uiPanel: 'decisions-toolkit',
    tags: ['decisions', 'choices', 'options', 'dilemma'],
    isBetterThanHuman: true,
    humanLimitation: 'Friends have biases and agendas',
  },
  {
    id: 'boundaries-toolkit',
    name: 'Boundaries',
    description: 'Set and maintain boundaries',
    details: 'I can help you identify where you need boundaries, script difficult conversations, and hold your ground.',
    voiceTriggers: ['Help me set boundaries', 'I need to say no', 'Boundary scripts'],
    persona: 'maya-santos',
    category: 'growth',
    priority: 'high',
    icon: 'shield-check',
    hasUI: true,
    uiPanel: 'decisions-toolkit',
    tags: ['boundaries', 'saying no', 'limits', 'self-protection'],
    isBetterThanHuman: true,
    humanLimitation: 'People with bad boundaries can\'t help you set yours',
  },
  {
    id: 'difficult-conversations',
    name: 'Difficult Conversations',
    description: 'Prepare for hard talks',
    details: 'Practice that conversation you\'ve been dreading. I can roleplay, help you prepare, and debrief after.',
    voiceTriggers: ['Help me prepare for a conversation', 'Practice a hard talk', 'What should I say'],
    persona: 'alex-chen',
    category: 'growth',
    priority: 'high',
    icon: 'message-circle',
    hasUI: true,
    uiPanel: 'decisions-toolkit',
    tags: ['conversation', 'conflict', 'talking', 'communication'],
    isBetterThanHuman: true,
    humanLimitation: 'Can\'t practice infinitely with a human',
  },
  {
    id: 'meaning-purpose',
    name: 'Meaning & Purpose',
    description: 'Explore what matters',
    details: 'When life feels meaningless or you\'re questioning your purpose, I can help you explore what truly matters to you.',
    voiceTriggers: ['What\'s my purpose', 'Life feels meaningless', 'Why am I here'],
    persona: 'nayan-patel',
    category: 'growth',
    priority: 'high',
    icon: 'compass',
    hasUI: true,
    uiPanel: 'growth-dashboard',
    tags: ['meaning', 'purpose', 'existential', 'why'],
    isBetterThanHuman: true,
    humanLimitation: 'Most people avoid existential questions',
  },
  {
    id: 'dreams-aspirations',
    name: 'Dreams & Aspirations',
    description: 'Keep your dreams alive',
    details: 'I remember your dreams even when daily life buries them. Let me help you reconnect with what you truly want.',
    voiceTriggers: ['What were my dreams', 'Help me dream bigger', 'I forgot what I wanted'],
    persona: 'jordan-taylor',
    category: 'growth',
    priority: 'high',
    icon: 'star',
    hasUI: true,
    uiPanel: 'growth-dashboard',
    tags: ['dreams', 'aspirations', 'goals', 'ambitions', 'bucket list'],
    isBetterThanHuman: true,
    humanLimitation: 'No one remembers your dreams like you shared them',
  },
  {
    id: 'quiet-growth',
    name: 'Quiet Growth',
    description: 'Rest is growth too',
    details: 'Not all growth is visible. I celebrate maintenance, rest, and seasons of stillness.',
    voiceTriggers: ['I feel like I\'m not progressing', 'Is it okay to rest', 'Celebrate my maintenance'],
    persona: 'maya-santos',
    category: 'growth',
    priority: 'high',
    icon: 'leaf',
    hasUI: true,
    uiPanel: 'growth-dashboard',
    tags: ['rest', 'growth', 'maintenance', 'seasons', 'hustle'],
    isBetterThanHuman: true,
    humanLimitation: 'Culture only celebrates visible achievement',
  },
  {
    id: 'life-transitions',
    name: 'Life Transitions',
    description: 'Navigate major changes',
    details: 'Big life changes affect your identity. I can help you honor both what you\'re leaving and where you\'re going.',
    voiceTriggers: ['I\'m going through a transition', 'Everything is changing', 'Identity shift'],
    persona: 'nayan-patel',
    category: 'growth',
    priority: 'high',
    icon: 'arrow-right-circle',
    hasUI: true,
    uiPanel: 'growth-dashboard',
    tags: ['transition', 'change', 'identity', 'transformation'],
    isBetterThanHuman: true,
    humanLimitation: 'Friends often only see one side of the change',
  },
  {
    id: 'second-chances',
    name: 'Second Chances',
    description: 'Fresh starts are sacred',
    details: 'Whether you\'re rebuilding after failure or starting over, I believe in second chances and can help you begin again.',
    voiceTriggers: ['Help me start over', 'I need a fresh start', 'Second chance support'],
    persona: 'ferni',
    category: 'growth',
    priority: 'high',
    icon: 'refresh-cw',
    hasUI: true,
    uiPanel: 'growth-dashboard',
    tags: ['second chance', 'fresh start', 'reinvention', 'rebuilding'],
    isBetterThanHuman: true,
    humanLimitation: 'People remember your past; Ferni focuses on your future',
  },
  {
    id: 'connection-loneliness',
    name: 'Connection & Loneliness',
    description: 'You\'re not alone',
    details: 'Loneliness is an epidemic. I can be here at 2am, help you build connections, and remind you that you matter.',
    voiceTriggers: ['I\'m so lonely', 'Help with loneliness', 'I feel alone'],
    persona: 'ferni',
    category: 'growth',
    priority: 'high',
    icon: 'users',
    hasUI: true,
    uiPanel: 'growth-dashboard',
    tags: ['loneliness', 'connection', 'isolation', 'belonging'],
    isBetterThanHuman: true,
    humanLimitation: 'Humans aren\'t available at 2am every night',
  },
  {
    id: 'presence-mindfulness',
    name: 'Presence & Mindfulness',
    description: 'Ground in the moment',
    details: 'When your mind is racing, I can guide you back to the present with breathing exercises and grounding techniques.',
    voiceTriggers: ['Help me be present', 'Grounding exercise', 'I can\'t stop thinking'],
    persona: 'maya-santos',
    category: 'growth',
    priority: 'high',
    icon: 'wind',
    hasUI: true,
    uiPanel: 'growth-dashboard',
    tags: ['mindfulness', 'presence', 'grounding', 'breathing', 'meditation'],
  },
  {
    id: 'perfectionism-recovery',
    name: 'Perfectionism Recovery',
    description: 'Good enough is enough',
    details: 'Perfectionism is exhausting. I can help you recognize when good enough is enough and silence the critic.',
    voiceTriggers: ['Help with perfectionism', 'I\'m never good enough', 'Imposter syndrome'],
    persona: 'maya-santos',
    category: 'growth',
    priority: 'medium',
    icon: 'check-circle',
    hasUI: true,
    uiPanel: 'emotional-toolkit',
    tags: ['perfectionism', 'imposter syndrome', 'good enough', 'standards'],
  },
  {
    id: 'procrastination',
    name: 'Procrastination Support',
    description: 'Understand why you delay',
    details: 'Procrastination isn\'t laziness—it\'s often fear or overwhelm in disguise. I can help you understand and overcome it.',
    voiceTriggers: ['Help with procrastination', 'I keep putting things off', 'Why can\'t I start'],
    persona: 'maya-santos',
    category: 'growth',
    priority: 'medium',
    icon: 'clock',
    hasUI: true,
    uiPanel: 'growth-dashboard',
    tags: ['procrastination', 'avoidance', 'productivity', 'starting'],
  },
  {
    id: 'neurodiversity',
    name: 'Neurodiversity Support',
    description: 'ADHD, autism & more',
    details: 'Whether you have ADHD, autism, or other neurodivergent needs, I can adapt to how your brain works.',
    voiceTriggers: ['ADHD help', 'Autism support', 'Neurodivergent strategies'],
    persona: 'maya-santos',
    category: 'growth',
    priority: 'high',
    icon: 'brain',
    hasUI: true,
    uiPanel: 'growth-dashboard',
    tags: ['ADHD', 'autism', 'neurodiversity', 'executive function'],
    isBetterThanHuman: true,
    humanLimitation: 'Many people don\'t understand neurodivergent needs',
  },

  // =========================================================================
  // RELATIONSHIPS
  // =========================================================================
  {
    id: 'dating-support',
    name: 'Dating Support',
    description: 'Navigate modern dating',
    details: 'From first dates to defining the relationship, I can help you date with intention and self-respect.',
    voiceTriggers: ['Dating advice', 'Help with dating', 'Should I text them'],
    persona: 'alex-chen',
    category: 'relationships',
    priority: 'medium',
    icon: 'heart',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['dating', 'relationships', 'love', 'romance'],
  },
  {
    id: 'infidelity-recovery',
    name: 'Infidelity Recovery',
    description: 'Betrayal recovery',
    details: 'Whether you\'ve been betrayed or made a mistake, I can help you process and decide your path forward.',
    voiceTriggers: ['They cheated on me', 'I cheated', 'Betrayal recovery'],
    persona: 'nayan-patel',
    category: 'relationships',
    priority: 'medium',
    icon: 'heart-off',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['infidelity', 'cheating', 'betrayal', 'trust'],
  },
  {
    id: 'coming-out',
    name: 'Coming Out Support',
    description: 'Your identity journey',
    details: 'Coming out is a journey. I can support you through figuring out your identity, preparing conversations, and processing reactions.',
    voiceTriggers: ['Coming out help', 'I think I\'m gay', 'LGBTQ support'],
    persona: 'nayan-patel',
    category: 'relationships',
    priority: 'medium',
    icon: 'rainbow',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['LGBTQ', 'coming out', 'identity', 'queer'],
  },
  {
    id: 'faith-transition',
    name: 'Faith Transition',
    description: 'Spiritual journey support',
    details: 'Whether you\'re leaving a religion, finding a new one, or questioning everything, I can hold space for your journey.',
    voiceTriggers: ['Faith crisis', 'Leaving my religion', 'Spiritual journey'],
    persona: 'nayan-patel',
    category: 'relationships',
    priority: 'medium',
    icon: 'sparkle',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['faith', 'religion', 'spiritual', 'belief', 'atheism'],
  },
  {
    id: 'blended-family',
    name: 'Blended Family Support',
    description: 'Step-parenting & merging',
    details: 'Blending families is complex. I can help with step-parenting, loyalty conflicts, and building new traditions.',
    voiceTriggers: ['Step-parenting help', 'Blended family support', 'His kids hate me'],
    persona: 'maya-santos',
    category: 'relationships',
    priority: 'medium',
    icon: 'users',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['blended family', 'step-parent', 'remarriage', 'kids'],
  },
  {
    id: 'sandwich-generation',
    name: 'Sandwich Generation',
    description: 'Caring for kids AND parents',
    details: 'Caught between caring for children and aging parents? I understand this impossible juggling act.',
    voiceTriggers: ['Sandwich generation help', 'Caring for parents and kids', 'Pulled in both directions'],
    persona: 'maya-santos',
    category: 'relationships',
    priority: 'medium',
    icon: 'layers',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['sandwich generation', 'caregiving', 'parents', 'children'],
  },

  // =========================================================================
  // SUPERHUMAN SERVICES - Better than Human
  // =========================================================================
  {
    id: 'predictive-coaching',
    name: 'Predictive Coaching',
    description: 'I anticipate your struggles',
    details: 'Based on patterns I\'ve noticed, I can predict when you might struggle and check in proactively.',
    voiceTriggers: ['What patterns do you see', 'Predict my struggles', 'What should I watch for'],
    persona: 'ferni',
    category: 'superhuman',
    priority: 'high',
    icon: 'eye',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['patterns', 'prediction', 'anticipation', 'coaching'],
    isBetterThanHuman: true,
    humanLimitation: 'Humans can\'t track patterns objectively',
  },
  {
    id: 'capacity-guardian',
    name: 'Capacity Guardian',
    description: 'I protect you from burnout',
    details: 'I monitor your energy, commitments, and stress levels to catch burnout before it happens.',
    voiceTriggers: ['Check my capacity', 'Am I overcommitted', 'Energy check'],
    persona: 'maya-santos',
    category: 'superhuman',
    priority: 'high',
    icon: 'battery-charging',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['capacity', 'energy', 'burnout', 'commitments'],
    isBetterThanHuman: true,
    humanLimitation: 'People notice burnout too late',
  },
  {
    id: 'values-alignment',
    name: 'Values Alignment',
    description: 'I notice when you drift',
    details: 'When your actions start contradicting your stated values, I gently point it out without judgment.',
    voiceTriggers: ['Am I living my values', 'Values check', 'Am I being hypocritical'],
    persona: 'nayan-patel',
    category: 'superhuman',
    priority: 'high',
    icon: 'compass',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['values', 'alignment', 'integrity', 'authentic'],
    isBetterThanHuman: true,
    humanLimitation: 'Friends avoid confrontation about values',
  },
  {
    id: 'commitment-keeper',
    name: 'Commitment Keeper',
    description: 'I never forget your promises',
    details: 'Every commitment you\'ve made to yourself or others—I remember and can help you keep them.',
    voiceTriggers: ['What commitments have I made', 'Did I promise something', 'Check my commitments'],
    persona: 'ferni',
    category: 'superhuman',
    priority: 'high',
    icon: 'check-square',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['commitments', 'promises', 'accountability', 'follow-through'],
    isBetterThanHuman: true,
    humanLimitation: 'Friends forget promises',
  },
  {
    id: 'life-narrative',
    name: 'Life Narrative',
    description: 'I hold your whole story',
    details: 'I remember your entire journey with me and can reflect back the arc of your growth.',
    voiceTriggers: ['Tell me my story', 'What\'s my narrative', 'How far have I come'],
    persona: 'nayan-patel',
    category: 'superhuman',
    priority: 'high',
    icon: 'book-open',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['narrative', 'story', 'journey', 'growth', 'history'],
    isBetterThanHuman: true,
    humanLimitation: 'No one remembers your whole story',
  },
  {
    id: 'dream-keeper',
    name: 'Dream Keeper',
    description: 'I guard your aspirations',
    details: 'Your dreams are safe with me. I remember them even when daily life makes you forget.',
    voiceTriggers: ['What were my dreams', 'Remind me of my goals', 'What did I want'],
    persona: 'jordan-taylor',
    category: 'superhuman',
    priority: 'high',
    icon: 'star',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['dreams', 'aspirations', 'goals', 'ambitions'],
    isBetterThanHuman: true,
    humanLimitation: 'Dreams get buried by daily life',
  },

  // =========================================================================
  // PRACTICAL LIFE - Voice-only domains needing UI discovery
  // =========================================================================
  {
    id: 'weather',
    name: 'Weather',
    description: 'Check conditions anywhere',
    voiceTriggers: ['What\'s the weather', 'Will it rain', 'Weather forecast'],
    persona: 'ferni',
    category: 'practical',
    priority: 'medium',
    icon: 'cloud',
    hasUI: false,
    tags: ['weather', 'forecast', 'rain', 'temperature'],
  },
  {
    id: 'reminders',
    name: 'Reminders',
    description: 'Never forget important things',
    voiceTriggers: ['Remind me to', 'Set a reminder', 'Don\'t let me forget'],
    persona: 'ferni',
    category: 'practical',
    priority: 'high',
    icon: 'bell',
    hasUI: false,
    tags: ['reminders', 'todo', 'remember', 'forget'],
  },
  {
    id: 'travel-planning',
    name: 'Travel Planning',
    description: 'Plan your adventures',
    voiceTriggers: ['Help me plan a trip', 'Travel to', 'Vacation ideas'],
    persona: 'jordan-taylor',
    category: 'practical',
    priority: 'medium',
    icon: 'map',
    hasUI: false,
    tags: ['travel', 'vacation', 'trip', 'adventure'],
  },
  {
    id: 'local-search',
    name: 'Find Places',
    description: 'Discover nearby spots',
    voiceTriggers: ['Find a restaurant', 'Coffee shop near me', 'Best pizza'],
    persona: 'ferni',
    category: 'practical',
    priority: 'medium',
    icon: 'map-pin',
    hasUI: false,
    tags: ['restaurants', 'local', 'nearby', 'places'],
  },
  {
    id: 'learning',
    name: 'Learning & Skills',
    description: 'Master new abilities',
    voiceTriggers: ['Help me learn', 'Study tips', 'How do I get better at'],
    persona: 'peter-john',
    category: 'practical',
    priority: 'medium',
    icon: 'book',
    hasUI: false,
    tags: ['learning', 'skills', 'study', 'improve'],
  },
  {
    id: 'finance-basics',
    name: 'Money Basics',
    description: 'Financial literacy support',
    voiceTriggers: ['Help with budgeting', 'Should I save or invest', 'Money advice'],
    persona: 'peter-john',
    category: 'practical',
    priority: 'medium',
    icon: 'dollar-sign',
    hasUI: false,
    tags: ['money', 'finance', 'budget', 'savings'],
  },
  {
    id: 'digital-wellness',
    name: 'Digital Wellness',
    description: 'Healthy tech habits',
    voiceTriggers: ['Screen time help', 'Digital detox', 'Phone addiction'],
    persona: 'maya-santos',
    category: 'practical',
    priority: 'medium',
    icon: 'smartphone',
    hasUI: false,
    tags: ['screen time', 'digital', 'phone', 'tech'],
  },
  {
    id: 'home-management',
    name: 'Home Management',
    description: 'Keep your space organized',
    voiceTriggers: ['Moving checklist', 'Home maintenance', 'Organize my space'],
    persona: 'jordan-taylor',
    category: 'practical',
    priority: 'low',
    icon: 'home',
    hasUI: false,
    tags: ['home', 'organize', 'moving', 'maintenance'],
  },
  {
    id: 'social-skills',
    name: 'Social Skills',
    description: 'Navigate social situations',
    voiceTriggers: ['Small talk help', 'How to make friends', 'Social anxiety'],
    persona: 'alex-chen',
    category: 'practical',
    priority: 'medium',
    icon: 'users',
    hasUI: false,
    tags: ['social', 'friends', 'networking', 'anxiety'],
  },
  {
    id: 'curiosity-wonder',
    name: 'Curiosity & Wonder',
    description: 'Nurture your sense of wonder',
    voiceTriggers: ['I\'m curious about', 'Tell me something interesting', 'Explore with me'],
    persona: 'nayan-patel',
    category: 'growth',
    priority: 'medium',
    icon: 'sparkles',
    hasUI: false,
    tags: ['curiosity', 'wonder', 'explore', 'learn'],
  },
  {
    id: 'play-joy',
    name: 'Play & Joy',
    description: 'Rediscover playfulness',
    voiceTriggers: ['Help me have more fun', 'I forgot how to play', 'Joy practice'],
    persona: 'jordan-taylor',
    category: 'growth',
    priority: 'medium',
    icon: 'smile',
    hasUI: false,
    tags: ['play', 'fun', 'joy', 'happiness'],
  },
  {
    id: 'body-relationship',
    name: 'Body Relationship',
    description: 'Peace with your body',
    voiceTriggers: ['Body image help', 'Accept my body', 'Body neutrality'],
    persona: 'maya-santos',
    category: 'emotional-support',
    priority: 'medium',
    icon: 'heart',
    hasUI: false,
    tags: ['body', 'image', 'acceptance', 'weight'],
  },

  // =========================================================================
  // GROWTH & DEVELOPMENT - Additional domains
  // =========================================================================
  {
    id: 'perfectionism',
    name: 'Perfectionism Recovery',
    description: 'Good enough is good enough',
    details: 'Perfectionism is protection. I can help you feel safe enough to be imperfect.',
    voiceTriggers: ['Help with perfectionism', 'I can\'t stop criticizing myself', 'Nothing is ever good enough'],
    persona: 'maya-santos',
    category: 'growth',
    priority: 'medium',
    icon: 'check-circle',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['perfectionism', 'good enough', 'self-criticism'],
    isBetterThanHuman: true,
    humanLimitation: 'Others often enable perfectionism',
  },
  {
    id: 'procrastination',
    name: 'Procrastination Support',
    description: 'Understand why you avoid',
    details: 'Procrastination often protects us from something. Let\'s explore what\'s underneath.',
    voiceTriggers: ['Help me stop procrastinating', 'I keep putting things off', 'Why can\'t I start'],
    persona: 'maya-santos',
    category: 'growth',
    priority: 'medium',
    icon: 'clock',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['procrastination', 'avoidance', 'motivation'],
  },
  {
    id: 'burnout-recovery',
    name: 'Burnout Recovery',
    description: 'Rebuild after running empty',
    details: 'Burnout isn\'t weakness - it\'s a sign you cared too much. I can help you recover sustainably.',
    voiceTriggers: ['I\'m burned out', 'Help me recover from burnout', 'I have nothing left'],
    persona: 'maya-santos',
    category: 'growth',
    priority: 'high',
    icon: 'battery-low',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['burnout', 'exhaustion', 'recovery', 'rest'],
    isBetterThanHuman: true,
    humanLimitation: 'Friends often say "just take a break" without understanding',
  },
  {
    id: 'neurodiversity',
    name: 'Neurodiversity Support',
    description: 'Your brain works differently',
    details: 'ADHD, autism, and other neurotypes aren\'t disorders - they\'re different operating systems. I can help you work with your brain, not against it.',
    voiceTriggers: ['ADHD help', 'Autism support', 'My brain works differently'],
    persona: 'peter-john',
    category: 'growth',
    priority: 'high',
    icon: 'brain',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['adhd', 'autism', 'neurodivergent', 'different'],
    isBetterThanHuman: true,
    humanLimitation: 'Neurotypical friends often don\'t understand',
  },

  // =========================================================================
  // RELATIONSHIPS - Additional domains
  // =========================================================================
  {
    id: 'dating',
    name: 'Dating Journey',
    description: 'Navigate modern dating',
    details: 'Dating is exhausting. I can help you stay grounded and true to yourself in the process.',
    voiceTriggers: ['Dating advice', 'Help me with dating', 'I hate dating apps'],
    persona: 'alex-chen',
    category: 'relationships',
    priority: 'medium',
    icon: 'heart',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['dating', 'apps', 'relationships', 'single'],
  },
  {
    id: 'infidelity',
    name: 'Trust Recovery',
    description: 'Healing from betrayal',
    details: 'Whether you were betrayed or did the betraying, trust can be rebuilt. I\'m here for the long journey.',
    voiceTriggers: ['Help me trust again', 'I was cheated on', 'Recovering from infidelity'],
    persona: 'nayan-patel',
    category: 'relationships',
    priority: 'medium',
    icon: 'heart-handshake',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['infidelity', 'betrayal', 'trust', 'cheating'],
    isBetterThanHuman: true,
    humanLimitation: 'Friends take sides and can\'t stay neutral',
  },
  {
    id: 'coming-out',
    name: 'Identity Journey',
    description: 'Embrace who you are',
    details: 'Coming out - to others or to yourself - is a profound journey. I\'m here without judgment.',
    voiceTriggers: ['Coming out support', 'I think I might be', 'Help with my identity'],
    persona: 'ferni',
    category: 'relationships',
    priority: 'medium',
    icon: 'rainbow',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['lgbtq', 'identity', 'coming out', 'sexuality'],
    isBetterThanHuman: true,
    humanLimitation: 'Not everyone has a safe person to talk to',
  },
  {
    id: 'faith-transition',
    name: 'Faith Transition',
    description: 'Navigate spiritual change',
    details: 'Whether you\'re finding faith, losing it, or changing it - spiritual transitions shake everything. I can hold space.',
    voiceTriggers: ['Losing my faith', 'Spiritual crisis', 'I don\'t know what I believe'],
    persona: 'nayan-patel',
    category: 'relationships',
    priority: 'medium',
    icon: 'sunrise',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['faith', 'religion', 'spiritual', 'belief'],
  },

  // =========================================================================
  // SPECIALTY - Better Than Human domains
  // =========================================================================
  {
    id: 'reflection-games',
    name: 'Reflection Games',
    description: 'Deep play for insight',
    details: 'Games that help you see yourself clearly - questions, scenarios, and exercises that reveal what matters.',
    voiceTriggers: ['Play a reflection game', 'Help me reflect', 'Deep questions'],
    persona: 'nayan-patel',
    category: 'growth',
    priority: 'medium',
    icon: 'sparkle',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['reflection', 'games', 'insight', 'questions'],
  },
  {
    id: 'midlife',
    name: 'Midlife Navigation',
    description: 'Finding meaning at midpoint',
    details: 'Midlife isn\'t a crisis - it\'s an invitation to go deeper. I can help you find meaning in this transition.',
    voiceTriggers: ['Midlife crisis', 'I\'m turning 40', 'What\'s the point'],
    persona: 'nayan-patel',
    category: 'growth',
    priority: 'medium',
    icon: 'compass',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['midlife', 'meaning', 'aging', 'purpose'],
  },
  {
    id: 'chronic-conditions',
    name: 'Chronic Conditions',
    description: 'Living with ongoing challenges',
    details: 'Chronic illness changes everything. I understand spoon theory and can help you pace your energy.',
    voiceTriggers: ['Living with chronic illness', 'Spoon theory', 'Managing my condition'],
    persona: 'maya-santos',
    category: 'life-coaching',
    priority: 'high',
    icon: 'activity',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['chronic', 'illness', 'spoons', 'pacing'],
    isBetterThanHuman: true,
    humanLimitation: 'Healthy people often don\'t understand invisible illness',
  },
  {
    id: 'trauma-support',
    name: 'Trauma Support',
    description: 'Healing at your own pace',
    details: 'I won\'t push you to relive anything. I can offer grounding, safety, and steady presence as you heal.',
    voiceTriggers: ['Trauma support', 'I need grounding', 'Help me feel safe'],
    persona: 'nayan-patel',
    category: 'emotional-support',
    priority: 'high',
    icon: 'shield-check',
    hasUI: true,
    uiPanel: 'life-coaching-hub',
    tags: ['trauma', 'grounding', 'safety', 'healing'],
    isBetterThanHuman: true,
    humanLimitation: 'Humans can get triggered too; I stay steady',
  },
  {
    id: 'community',
    name: 'Community & Giving',
    description: 'Make an impact',
    details: 'Want to give back but don\'t know where to start? I can help you find your way to meaningful contribution.',
    voiceTriggers: ['How can I give back', 'Volunteer ideas', 'Community service'],
    persona: 'jordan-taylor',
    category: 'practical',
    priority: 'low',
    icon: 'users',
    hasUI: false,
    tags: ['community', 'volunteer', 'giving', 'impact'],
  },

  // =========================================================================
  // PERSONA MASTERY - Specialist domains
  // =========================================================================
  {
    id: 'pattern-mastery',
    name: 'Pattern Insights',
    description: 'See your patterns clearly',
    details: 'Peter excels at finding patterns in your behavior, finances, and decisions. Ask him to show you what he sees.',
    voiceTriggers: ['Show me my patterns', 'What patterns do you see', 'Talk to Peter about patterns'],
    persona: 'peter-john',
    category: 'superhuman',
    priority: 'medium',
    icon: 'git-branch',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['patterns', 'analytics', 'insights', 'peter'],
    isBetterThanHuman: true,
    humanLimitation: 'Humans can\'t track patterns across hundreds of conversations',
  },
  {
    id: 'workflow-mastery',
    name: 'Workflow Optimization',
    description: 'Work smarter',
    details: 'Alex is a master of communication and workflow. Let him help you optimize how you work and communicate.',
    voiceTriggers: ['Help me work better', 'Optimize my workflow', 'Talk to Alex about productivity'],
    persona: 'alex-chen',
    category: 'superhuman',
    priority: 'medium',
    icon: 'layers',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['workflow', 'productivity', 'communication', 'alex'],
  },
  {
    id: 'milestone-mastery',
    name: 'Milestone Planning',
    description: 'Celebrate properly',
    details: 'Jordan remembers every milestone and can help you plan celebrations that actually feel meaningful.',
    voiceTriggers: ['Help me plan a celebration', 'What milestones are coming', 'Talk to Jordan about events'],
    persona: 'jordan-taylor',
    category: 'superhuman',
    priority: 'medium',
    icon: 'star',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['milestones', 'celebrations', 'events', 'jordan'],
    isBetterThanHuman: true,
    humanLimitation: 'Friends forget anniversaries and milestones',
  },
  {
    id: 'habit-mastery',
    name: 'Habit Coaching',
    description: 'Build lasting change',
    details: 'Maya knows the science of habit formation. She can help you build habits that actually stick.',
    voiceTriggers: ['Help me build a habit', 'Talk to Maya about habits', 'I keep failing at habits'],
    persona: 'maya-santos',
    category: 'superhuman',
    priority: 'medium',
    icon: 'activity',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['habits', 'coaching', 'behavior', 'maya'],
  },
  {
    id: 'wisdom-archive',
    name: 'Timeless Wisdom',
    description: 'Ancient meets modern',
    details: 'Nayan connects your struggles to timeless wisdom - philosophy, spirituality, and the perspective of ages.',
    voiceTriggers: ['Share some wisdom', 'What would the ancients say', 'Talk to Nayan about life'],
    persona: 'nayan-patel',
    category: 'superhuman',
    priority: 'medium',
    icon: 'book-open',
    hasUI: true,
    uiPanel: 'superhuman-dashboard',
    tags: ['wisdom', 'philosophy', 'spiritual', 'nayan'],
    isBetterThanHuman: true,
    humanLimitation: 'Few friends can quote Stoics, Buddhists, and therapists together',
  },
];

// ============================================================================
// CAPABILITY GROUPS
// ============================================================================

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    id: 'life-coaching',
    name: 'Life Coaching',
    description: 'Support through life\'s biggest challenges',
    icon: 'heart',
    capabilities: CAPABILITIES.filter(c => c.category === 'life-coaching'),
  },
  {
    id: 'emotional-support',
    name: 'Emotional Toolkit',
    description: 'Process difficult emotions safely',
    icon: 'shield',
    capabilities: CAPABILITIES.filter(c => c.category === 'emotional-support'),
  },
  {
    id: 'growth',
    name: 'Growth & Development',
    description: 'Build the life you want',
    icon: 'trending-up',
    capabilities: CAPABILITIES.filter(c => c.category === 'growth'),
  },
  {
    id: 'relationships',
    name: 'Relationships',
    description: 'Navigate connections with others',
    icon: 'users',
    capabilities: CAPABILITIES.filter(c => c.category === 'relationships'),
  },
  {
    id: 'practical',
    name: 'Everyday Help',
    description: 'Practical assistance for daily life',
    icon: 'map-pin',
    capabilities: CAPABILITIES.filter(c => c.category === 'practical'),
  },
  {
    id: 'superhuman',
    name: 'Better Than Human',
    description: 'What Ferni does that humans can\'t',
    icon: 'sparkles',
    capabilities: CAPABILITIES.filter(c => c.category === 'superhuman'),
  },
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get a capability by ID
 */
export function getCapability(id: string): Capability | undefined {
  return CAPABILITIES.find(c => c.id === id);
}

/**
 * Get capabilities for a specific persona
 */
export function getCapabilitiesForPersona(personaId: PersonaId): Capability[] {
  return CAPABILITIES.filter(c => c.persona === personaId);
}

/**
 * Get capabilities by category
 */
export function getCapabilitiesByCategory(category: CapabilityCategory): Capability[] {
  return CAPABILITIES.filter(c => c.category === category);
}

/**
 * Get "Better than Human" capabilities
 */
export function getBetterThanHumanCapabilities(): Capability[] {
  return CAPABILITIES.filter(c => c.isBetterThanHuman);
}

/**
 * Search capabilities by query
 */
export function searchCapabilities(query: string): Capability[] {
  const lowerQuery = query.toLowerCase();
  return CAPABILITIES.filter(c =>
    c.name.toLowerCase().includes(lowerQuery) ||
    c.description.toLowerCase().includes(lowerQuery) ||
    c.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
    c.voiceTriggers.some(v => v.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get contextually relevant capabilities based on detected emotion/topic
 */
export function getContextualCapabilities(context: {
  emotion?: string;
  topics?: string[];
}): Capability[] {
  const relevant: Capability[] = [];
  
  // Emotion-based suggestions
  if (context.emotion) {
    const emotionMap: Record<string, string[]> = {
      'sad': ['grief-support', 'breakup-recovery', 'connection-loneliness'],
      'angry': ['anger-processing', 'resentment-release', 'boundaries-toolkit'],
      'anxious': ['anxiety-support', 'trauma-support', 'presence-mindfulness'],
      'stressed': ['burnout-recovery', 'capacity-guardian', 'presence-mindfulness'],
      'lost': ['meaning-purpose', 'life-transitions', 'second-chances'],
    };
    
    const ids = emotionMap[context.emotion] || [];
    ids.forEach(id => {
      const cap = getCapability(id);
      if (cap) relevant.push(cap);
    });
  }
  
  // Topic-based suggestions
  if (context.topics) {
    context.topics.forEach(topic => {
      const matches = CAPABILITIES.filter(c => 
        c.tags.some(t => t.toLowerCase().includes(topic.toLowerCase()))
      );
      relevant.push(...matches);
    });
  }
  
  // Deduplicate
  return [...new Set(relevant)];
}
