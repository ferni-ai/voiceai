/**
 * Tools Domains - Registry-Based Exports
 *
 * Exports all domain tool definitions for the new registry-based system.
 * Each domain provides a getToolDefinitions() function that returns
 * ToolDefinition[] for registration with the tool registry.
 *
 * DOMAIN STRUCTURE:
 *   === FUNCTIONAL DOMAINS ===
 *   domains/memory/       - Memory and recall tools
 *   domains/productivity/ - Tasks, notes, routines, shopping
 *   domains/information/  - News, weather, sports, search
 *   domains/handoff/      - Team handoffs
 *   domains/calendar/     - Appointments, delivery, places, contacts
 *   domains/habits/       - Habit tracking, coaching, gamification
 *   domains/finance/      - Banking, calculators, personal finance
 *   domains/wellness/     - Emotional wellness, medications
 *   domains/wisdom/       - Quotes, principles, history
 *   domains/communication/ - Email, SMS, scheduling
 *   domains/research/     - Stock research, analysis
 *   domains/life-planning/ - Goals, milestones
 *   domains/entertainment/ - Music, media
 *   domains/telephony/    - Phone calls, callbacks
 *   domains/concierge/    - AI-powered outreach (hotels, restaurants, appointments, services)
 *
 *   === DEEP HUMAN ENGAGEMENT DOMAINS ===
 *   domains/relationships/ - Connection, conflict, nurturing relationships
 *   domains/meaning/       - Purpose, values, spirituality, existential
 *   domains/grief/         - Loss, transition, endings, transformation
 *   domains/stories/       - Life story, legacy, narrative identity
 *   domains/vulnerability/ - Shame, secrets, authenticity, self-forgiveness
 *   domains/curiosity/     - Wonder, questions, mystery, exploration
 *   domains/dreams/        - Aspirations, imagination, possibility
 *   domains/self-compassion/ - Inner critic, self-kindness, acceptance
 *   domains/play/          - Joy, fun, playfulness, lightness
 *   domains/presence/      - Grounding, mindfulness, savoring, flow
 *
 *   === LIFE COACHING DOMAINS (NEW) ===
 *   domains/crisis/        - Crisis support, grounding, safety planning
 *   domains/health/        - Exercise, nutrition, sleep, energy
 *   domains/career/        - Job search, interviews, professional development
 *   domains/decisions/     - Decision frameworks, analysis, values alignment
 *   domains/family/        - Parenting, family dynamics, elder care
 *   domains/home/          - Home maintenance, organization, moving
 *   domains/learning/      - Education, skill development, study planning
 *   domains/creativity/    - Hobbies, creative projects, artistic pursuits
 *   domains/community/     - Volunteering, giving, civic engagement
 *   domains/legal-admin/   - Documents, estate planning, insurance
 *   domains/second-chances/ - Fresh starts, reinvention, rebuilding
 *   domains/connection/     - Loneliness, friendship, belonging, community
 */
export { getToolDefinitions as getMemoryToolDefinitions } from './memory/index.js';
export { getToolDefinitions as getProductivityToolDefinitions } from './productivity/index.js';
export { getToolDefinitions as getInformationToolDefinitions } from './information/index.js';
export { getToolDefinitions as getHandoffToolDefinitions } from './handoff/index.js';
export { getToolDefinitions as getCalendarToolDefinitions } from './calendar/index.js';
export { getToolDefinitions as getHabitsToolDefinitions } from './habits/index.js';
export { getToolDefinitions as getProactiveToolDefinitions } from './proactive/index.js';
export { getToolDefinitions as getFinanceToolDefinitions } from './finance/index.js';
export { getToolDefinitions as getWellnessToolDefinitions } from './wellness/index.js';
export { getToolDefinitions as getWisdomToolDefinitions } from './wisdom/index.js';
export { getToolDefinitions as getCommunicationToolDefinitions } from './communication/index.js';
export { getToolDefinitions as getResearchToolDefinitions } from './research/index.js';
export { getToolDefinitions as getLifePlanningToolDefinitions } from './life-planning/index.js';
export { getToolDefinitions as getEntertainmentToolDefinitions } from './entertainment/index.js';
export { getToolDefinitions as getVibeToolDefinitions } from './vibe/index.js';
export { getToolDefinitions as getGamesToolDefinitions } from './games/index.js';
export { getToolDefinitions as getTelephonyToolDefinitions } from './telephony/index.js';
export { getToolDefinitions as getVoiceEnrollmentToolDefinitions } from './voice-enrollment/index.js';
export { getToolDefinitions as getHumanTransferToolDefinitions } from './human-transfer/index.js';
export { getToolDefinitions as getCameoToolDefinitions } from './cameo/index.js';
export { getToolDefinitions as getGroupConversationToolDefinitions } from './group-conversation/index.js';
export { getToolDefinitions as getBehaviorToolDefinitions } from './behavior/index.js';
export { getToolDefinitions as getRelationshipsToolDefinitions } from './relationships/index.js';
export { getToolDefinitions as getMeaningToolDefinitions } from './meaning/index.js';
export { getToolDefinitions as getGriefToolDefinitions } from './grief/index.js';
export { getToolDefinitions as getStoriesToolDefinitions } from './stories/index.js';
export { getToolDefinitions as getVulnerabilityToolDefinitions } from './vulnerability/index.js';
export { getToolDefinitions as getCuriosityToolDefinitions } from './curiosity/index.js';
export { getToolDefinitions as getDreamsToolDefinitions } from './dreams/index.js';
export { getToolDefinitions as getSelfCompassionToolDefinitions } from './self-compassion/index.js';
export { getToolDefinitions as getCoachingSupportToolDefinitions } from './coaching-support/index.js';
export { getToolDefinitions as getPlayToolDefinitions } from './play/index.js';
export { getToolDefinitions as getPresenceToolDefinitions } from './presence/index.js';
export { getToolDefinitions as getEngagementToolDefinitions } from './engagement/index.js';
export { getToolDefinitions as getAwarenessToolDefinitions } from './awareness/index.js';
export { getToolDefinitions as getSimpleUtilitiesToolDefinitions } from './simple-utilities/index.js';
export { getToolDefinitions as getCrisisToolDefinitions } from './crisis/index.js';
export { getToolDefinitions as getHealthToolDefinitions } from './health/index.js';
export { getToolDefinitions as getCareerToolDefinitions } from './career/index.js';
export { getToolDefinitions as getDecisionsToolDefinitions } from './decisions/index.js';
export { getToolDefinitions as getFamilyToolDefinitions } from './family/index.js';
export { getToolDefinitions as getHomeToolDefinitions } from './home/index.js';
export { getToolDefinitions as getLearningToolDefinitions } from './learning/index.js';
export { getToolDefinitions as getCreativityToolDefinitions } from './creativity/index.js';
export { getToolDefinitions as getCommunityToolDefinitions } from './community/index.js';
export { getToolDefinitions as getLegalAdminToolDefinitions } from './legal-admin/index.js';
export { getToolDefinitions as getSecondChancesToolDefinitions } from './second-chances/index.js';
export { getToolDefinitions as getConnectionToolDefinitions } from './connection/index.js';
export { getToolDefinitions as getDifficultConversationsToolDefinitions } from './difficult-conversations/index.js';
export { getToolDefinitions as getLifeTransitionsToolDefinitions } from './life-transitions/index.js';
export { getToolDefinitions as getReflectionGamesToolDefinitions } from './reflection-games/index.js';
export { getToolDefinitions as getQuietGrowthToolDefinitions } from './quiet-growth/index.js';
export { getToolDefinitions as getBoundariesToolDefinitions } from './boundaries/index.js';
export { getToolDefinitions as getSocialSkillsToolDefinitions } from './social-skills/index.js';
export { getToolDefinitions as getAngerToolDefinitions } from './anger/index.js';
export { getToolDefinitions as getShameToolDefinitions } from './shame/index.js';
export { getToolDefinitions as getEnvyToolDefinitions } from './envy/index.js';
export { getToolDefinitions as getResentmentToolDefinitions } from './resentment/index.js';
export { getToolDefinitions as getCaregiverToolDefinitions } from './caregiver/index.js';
export { getToolDefinitions as getDivorceToolDefinitions } from './divorce/index.js';
export { getToolDefinitions as getNewParentToolDefinitions } from './new-parent/index.js';
export { getToolDefinitions as getEmptyNestToolDefinitions } from './empty-nest/index.js';
export { getToolDefinitions as getInfidelityToolDefinitions } from './infidelity/index.js';
export { getToolDefinitions as getHealthDiagnosisToolDefinitions } from './health-diagnosis/index.js';
export { getToolDefinitions as getJobLossToolDefinitions } from './job-loss/index.js';
export { getToolDefinitions as getSobrietyToolDefinitions } from './sobriety/index.js';
export { getToolDefinitions as getSandwichGenerationToolDefinitions } from './sandwich-generation/index.js';
export { getToolDefinitions as getBlendedFamilyToolDefinitions } from './blended-family/index.js';
export { getToolDefinitions as getComingOutToolDefinitions } from './coming-out/index.js';
export { getToolDefinitions as getFaithTransitionToolDefinitions } from './faith-transition/index.js';
export { getToolDefinitions as getProcrastinationToolDefinitions } from './procrastination/index.js';
export { getToolDefinitions as getBurnoutRecoveryToolDefinitions } from './burnout-recovery/index.js';
export { getToolDefinitions as getPerfectionismToolDefinitions } from './perfectionism/index.js';
export { getToolDefinitions as getDigitalWellnessToolDefinitions } from './digital-wellness/index.js';
export { getToolDefinitions as getBreakupRecoveryToolDefinitions } from './breakup-recovery/index.js';
export { getToolDefinitions as getBodyRelationshipToolDefinitions } from './body-relationship/index.js';
export { getToolDefinitions as getDatingToolDefinitions } from './dating/index.js';
export { getToolDefinitions as getNeurodiversityToolDefinitions } from './neurodiversity/index.js';
export { getToolDefinitions as getTraumaSupportToolDefinitions } from './trauma-support/index.js';
export { getToolDefinitions as getIntimacyToolDefinitions } from './intimacy/index.js';
export { getToolDefinitions as getChronicConditionsToolDefinitions } from './chronic-conditions/index.js';
export { getToolDefinitions as getMidlifeToolDefinitions } from './midlife/index.js';
export { getToolDefinitions as getSchedulingToolDefinitions } from './scheduling/index.js';
export { getToolDefinitions as getConciergeToolDefinitions } from './concierge/index.js';
export { getToolDefinitions as getLocalSearchToolDefinitions } from './local-search/index.js';
export { getToolDefinitions as getVisualMemoryToolDefinitions } from './visual-memory/index.js';
export { getToolDefinitions as getAmbientModeToolDefinitions } from './ambient-mode/index.js';
export { getToolDefinitions as getPatternMasteryToolDefinitions } from './pattern-mastery/index.js';
export { getToolDefinitions as getWorkflowMasteryToolDefinitions } from './workflow-mastery/index.js';
export { getToolDefinitions as getMilestoneMasteryToolDefinitions } from './milestone-mastery/index.js';
export { getToolDefinitions as getHabitPersistenceToolDefinitions } from './habit-persistence/index.js';
export { getToolDefinitions as getTimelessPerspectiveToolDefinitions } from './timeless-perspective/index.js';
export { getToolDefinitions as getDeveloperToolDefinitions } from './developer/index.js';
export { getToolDefinitions as getMarketingToolDefinitions } from './marketing/index.js';
export { getToolDefinitions as getReferralToolDefinitions } from './referral/index.js';
export { getToolDefinitions as getPodcastsToolDefinitions } from './podcasts/index.js';
export { getToolDefinitions as getVideoToolDefinitions } from './video/index.js';
export { getToolDefinitions as getBooksToolDefinitions } from './books/index.js';
export { getToolDefinitions as getSettingsToolDefinitions } from './settings/index.js';
export { getToolDefinitions as getInsightsToolDefinitions } from './insights/index.js';
export * from './agent.js';
export * from './banking.js';
export * from './conversation/index.js';
export * from './personas.js';
import type { ToolDefinition } from '../registry/types.js';
/**
 * Get all tool definitions from all migrated domains
 * Use this to register all domain tools with the registry at once
 */
export declare function getAllDomainToolDefinitions(): Promise<ToolDefinition[]>;
/**
 * Domain metadata for documentation and UI
 */
export declare const DOMAIN_METADATA: {
    readonly memory: {
        readonly name: "Memory";
        readonly description: "User memory, recall, and relationship tracking";
        readonly icon: "🧠";
        readonly status: "active";
    };
    readonly productivity: {
        readonly name: "Productivity";
        readonly description: "Tasks, notes, routines, and shopping lists";
        readonly icon: "✅";
        readonly status: "active";
    };
    readonly information: {
        readonly name: "Information";
        readonly description: "News, weather, sports, and web search";
        readonly icon: "📰";
        readonly status: "active";
    };
    readonly handoff: {
        readonly name: "Handoff";
        readonly description: "Team coordination and agent handoffs";
        readonly icon: "🤝";
        readonly status: "active";
    };
    readonly calendar: {
        readonly name: "Calendar";
        readonly description: "Appointments, reservations, and contacts";
        readonly icon: "📅";
        readonly status: "active";
    };
    readonly habits: {
        readonly name: "Habits";
        readonly description: "Habit tracking, coaching, and gamification";
        readonly icon: "🎯";
        readonly status: "active";
    };
    readonly proactive: {
        readonly name: "Proactive Coaching";
        readonly description: "Goal tracking, follow-ups, and coaching triggers";
        readonly icon: "🚀";
        readonly status: "active";
    };
    readonly finance: {
        readonly name: "Finance";
        readonly description: "Banking, calculators, and budgeting";
        readonly icon: "💰";
        readonly status: "active";
    };
    readonly wellness: {
        readonly name: "Wellness";
        readonly description: "Emotional wellness and medications";
        readonly icon: "💚";
        readonly status: "active";
    };
    readonly wisdom: {
        readonly name: "Wisdom";
        readonly description: "Quotes, principles, and historical perspective";
        readonly icon: "📚";
        readonly status: "active";
    };
    readonly communication: {
        readonly name: "Communication";
        readonly description: "Email, SMS, and messaging";
        readonly icon: "✉️";
        readonly status: "active";
    };
    readonly research: {
        readonly name: "Research";
        readonly description: "Stock research and company analysis";
        readonly icon: "🔬";
        readonly status: "active";
    };
    readonly 'life-planning': {
        readonly name: "Life Planning";
        readonly description: "Goals, milestones, and life events";
        readonly icon: "🗓️";
        readonly status: "active";
    };
    readonly entertainment: {
        readonly name: "Entertainment";
        readonly description: "Music and media";
        readonly icon: "🎵";
        readonly status: "active";
    };
    readonly games: {
        readonly name: "Games";
        readonly description: "Interactive music games - Name That Tune, Desert Island Discs, etc.";
        readonly icon: "🎮";
        readonly status: "active";
    };
    readonly telephony: {
        readonly name: "Telephony";
        readonly description: "Phone calls and callbacks";
        readonly icon: "📞";
        readonly status: "active";
    };
    readonly 'human-transfer': {
        readonly name: "Human Transfer";
        readonly description: "Evaluate and connect to human professionals when AI coaching isn't enough - therapy, crisis support, legal, financial";
        readonly icon: "🤝";
        readonly status: "active";
    };
    readonly cameo: {
        readonly name: "Team Cameos";
        readonly description: "Invite team members to briefly pop in and share quick insights";
        readonly icon: "🎬";
        readonly status: "active";
    };
    readonly relationships: {
        readonly name: "Relationships";
        readonly description: "Connection, conflict resolution, and nurturing relationships";
        readonly icon: "💞";
        readonly status: "active";
    };
    readonly meaning: {
        readonly name: "Meaning & Spirituality";
        readonly description: "Purpose, values, spirituality, and existential exploration";
        readonly icon: "✨";
        readonly status: "active";
    };
    readonly grief: {
        readonly name: "Grief & Transition";
        readonly description: "Loss, endings, transitions, and transformation";
        readonly icon: "🕊️";
        readonly status: "active";
    };
    readonly stories: {
        readonly name: "Stories & Legacy";
        readonly description: "Life story, legacy building, and narrative identity";
        readonly icon: "📖";
        readonly status: "active";
    };
    readonly vulnerability: {
        readonly name: "Vulnerability & Authenticity";
        readonly description: "Shame resilience, secrets, authenticity, and self-forgiveness";
        readonly icon: "💎";
        readonly status: "active";
    };
    readonly curiosity: {
        readonly name: "Curiosity & Wonder";
        readonly description: "Wonder, questions, mystery, and intellectual exploration";
        readonly icon: "🔮";
        readonly status: "active";
    };
    readonly dreams: {
        readonly name: "Dreams & Imagination";
        readonly description: "Aspirations, imagination, and possibility";
        readonly icon: "🌟";
        readonly status: "active";
    };
    readonly 'self-compassion': {
        readonly name: "Self-Compassion";
        readonly description: "Inner critic management, self-kindness, and acceptance";
        readonly icon: "🤗";
        readonly status: "active";
    };
    readonly play: {
        readonly name: "Play & Joy";
        readonly description: "Joy, fun, playfulness, and lightness";
        readonly icon: "🎈";
        readonly status: "active";
    };
    readonly presence: {
        readonly name: "Presence & Embodiment";
        readonly description: "Grounding, mindfulness, savoring, and flow";
        readonly icon: "🧘";
        readonly status: "active";
    };
    readonly engagement: {
        readonly name: "Engagement & Rituals";
        readonly description: "Daily rituals, persona games, team interactions, and streak tracking";
        readonly icon: "🎮";
        readonly status: "active";
    };
    readonly awareness: {
        readonly name: "Awareness & Context";
        readonly description: "Time awareness, environmental context, and situational understanding";
        readonly icon: "👁️";
        readonly status: "active";
    };
    readonly 'simple-utilities': {
        readonly name: "Simple Utilities";
        readonly description: "Everyday helper tools: timers, tip calculator, unit conversions, timezone lookup";
        readonly icon: "🛠️";
        readonly status: "active";
    };
    readonly crisis: {
        readonly name: "Crisis & Safety";
        readonly description: "Crisis resources, grounding exercises, safety planning, recovery support";
        readonly icon: "🆘";
        readonly status: "active";
    };
    readonly health: {
        readonly name: "Health & Fitness";
        readonly description: "Exercise tracking, nutrition coaching, sleep hygiene, energy management";
        readonly icon: "💪";
        readonly status: "active";
    };
    readonly career: {
        readonly name: "Career & Professional";
        readonly description: "Job search, interview prep, salary negotiation, career development";
        readonly icon: "💼";
        readonly status: "active";
    };
    readonly decisions: {
        readonly name: "Decision Support";
        readonly description: "Decision frameworks, pros/cons analysis, values alignment, risk assessment";
        readonly icon: "🎯";
        readonly status: "active";
    };
    readonly family: {
        readonly name: "Family & Parenting";
        readonly description: "Parenting coaching, family dynamics, elder care, traditions";
        readonly icon: "👨‍👩‍👧‍👦";
        readonly status: "active";
    };
    readonly home: {
        readonly name: "Home & Living";
        readonly description: "Home maintenance, organization, decluttering, moving, emergency prep";
        readonly icon: "🏠";
        readonly status: "active";
    };
    readonly learning: {
        readonly name: "Education & Learning";
        readonly description: "Learning goals, study planning, spaced repetition, knowledge testing";
        readonly icon: "📚";
        readonly status: "active";
    };
    readonly creativity: {
        readonly name: "Creativity & Hobbies";
        readonly description: "Creative projects, hobby exploration, artistic blocks, inspiration";
        readonly icon: "🎨";
        readonly status: "active";
    };
    readonly community: {
        readonly name: "Community & Impact";
        readonly description: "Volunteering, charitable giving, civic engagement, social impact";
        readonly icon: "🤲";
        readonly status: "active";
    };
    readonly 'legal-admin': {
        readonly name: "Legal & Administrative";
        readonly description: "Document organization, estate planning, insurance review, tax prep";
        readonly icon: "📋";
        readonly status: "active";
    };
    readonly 'second-chances': {
        readonly name: "Second Chances";
        readonly description: "Fresh starts, reinvention, rebuilding after setbacks - because second chances are sacred";
        readonly icon: "🌅";
        readonly status: "active";
    };
    readonly connection: {
        readonly name: "Loneliness & Connection";
        readonly description: "Loneliness support, adult friendship, belonging, and community building";
        readonly icon: "🤗";
        readonly status: "active";
    };
    readonly 'difficult-conversations': {
        readonly name: "Difficult Conversations";
        readonly description: "Preparing for, practicing, and recovering from hard conversations";
        readonly icon: "💬";
        readonly status: "active";
    };
    readonly 'life-transitions': {
        readonly name: "Life Transitions";
        readonly description: "Emotional support for navigating major life changes and identity shifts";
        readonly icon: "🦋";
        readonly status: "active";
    };
    readonly 'reflection-games': {
        readonly name: "Reflection Games";
        readonly description: "Deep coaching games for self-discovery - Letters to Future Self, Values Auction, Rose/Thorn/Bud";
        readonly icon: "🎯";
        readonly status: "active";
    };
    readonly 'quiet-growth': {
        readonly name: "Quiet Growth";
        readonly description: "Anti-hustle growth: rest, seasons, plateaus, and sufficiency. Growth without comparison or urgency.";
        readonly icon: "🌱";
        readonly status: "active";
    };
    readonly boundaries: {
        readonly name: "Boundaries";
        readonly description: "Setting and maintaining healthy boundaries in all relationships";
        readonly icon: "🛡️";
        readonly status: "active";
    };
    readonly 'social-skills': {
        readonly name: "Social Skills";
        readonly description: "Communication, active listening, small talk, and social confidence";
        readonly icon: "💬";
        readonly status: "active";
    };
    readonly anger: {
        readonly name: "Anger Management";
        readonly description: "Healthy anger expression, triggers, and regulation strategies";
        readonly icon: "🌋";
        readonly status: "active";
    };
    readonly shame: {
        readonly name: "Shame";
        readonly description: "Understanding, processing, and healing from shame";
        readonly icon: "🌑";
        readonly status: "active";
    };
    readonly envy: {
        readonly name: "Envy";
        readonly description: "Understanding and transforming envy into motivation";
        readonly icon: "💚";
        readonly status: "active";
    };
    readonly resentment: {
        readonly name: "Resentment";
        readonly description: "Processing and releasing held grudges and resentments";
        readonly icon: "⚖️";
        readonly status: "active";
    };
    readonly procrastination: {
        readonly name: "Procrastination";
        readonly description: "Understanding and overcoming procrastination patterns";
        readonly icon: "⏰";
        readonly status: "active";
    };
    readonly 'burnout-recovery': {
        readonly name: "Burnout Recovery";
        readonly description: "Recognizing, recovering from, and preventing burnout";
        readonly icon: "🔋";
        readonly status: "active";
    };
    readonly perfectionism: {
        readonly name: "Perfectionism";
        readonly description: "Healing from perfectionism and imposter syndrome";
        readonly icon: "✨";
        readonly status: "active";
    };
    readonly 'digital-wellness': {
        readonly name: "Digital Wellness";
        readonly description: "Healthy relationship with technology and social media";
        readonly icon: "📱";
        readonly status: "active";
    };
    readonly 'breakup-recovery': {
        readonly name: "Breakup Recovery";
        readonly description: "Healing from heartbreak and rebuilding after relationships end";
        readonly icon: "💔";
        readonly status: "active";
    };
    readonly 'body-relationship': {
        readonly name: "Body Relationship";
        readonly description: "Developing a healthier relationship with your body";
        readonly icon: "🪞";
        readonly status: "active";
    };
    readonly dating: {
        readonly name: "Dating";
        readonly description: "Navigating modern dating with intention and self-respect";
        readonly icon: "💕";
        readonly status: "active";
    };
    readonly neurodiversity: {
        readonly name: "Neurodiversity";
        readonly description: "Support for ADHD, autism, and neurodivergent needs";
        readonly icon: "🧠";
        readonly status: "active";
    };
    readonly 'trauma-support': {
        readonly name: "Trauma Support";
        readonly description: "Grounding, regulation, and support for trauma responses";
        readonly icon: "🌿";
        readonly status: "active";
    };
    readonly intimacy: {
        readonly name: "Intimacy";
        readonly description: "Building and maintaining intimate connection in relationships";
        readonly icon: "❤️";
        readonly status: "active";
    };
    readonly 'chronic-conditions': {
        readonly name: "Chronic Conditions";
        readonly description: "Living well with chronic illness, pain, or disability";
        readonly icon: "🥄";
        readonly status: "active";
    };
    readonly midlife: {
        readonly name: "Midlife";
        readonly description: "Navigating midlife transitions, meaning, and reinvention";
        readonly icon: "🌅";
        readonly status: "active";
    };
    readonly 'pattern-mastery': {
        readonly name: "Pattern Mastery";
        readonly description: "Peter John's specialty: superhuman pattern recognition, cross-domain connections, and data insights";
        readonly icon: "🔬";
        readonly status: "active";
    };
    readonly 'workflow-mastery': {
        readonly name: "Workflow Mastery";
        readonly description: "Alex Chen's specialty: superhuman organization, communication clarity, and calendar optimization";
        readonly icon: "📋";
        readonly status: "active";
    };
    readonly 'milestone-mastery': {
        readonly name: "Milestone Mastery";
        readonly description: "Jordan Taylor's specialty: superhuman celebration, event anticipation, and life milestone navigation";
        readonly icon: "🎉";
        readonly status: "active";
    };
    readonly 'habit-persistence': {
        readonly name: "Habit Persistence";
        readonly description: "Maya Santos's specialty: superhuman patience for behavior change, compassionate coaching, and gentle accountability";
        readonly icon: "🌿";
        readonly status: "active";
    };
    readonly 'timeless-perspective': {
        readonly name: "Timeless Perspective";
        readonly description: "Nayan Patel's specialty: superhuman patience, wisdom across decades, and the long view that transcends current struggles";
        readonly icon: "🏔️";
        readonly status: "active";
    };
    readonly developer: {
        readonly name: "Developer Tools";
        readonly description: "Voice-driven development: Ferni CLI commands, file editing, bash, and code search";
        readonly icon: "💻";
        readonly status: "active";
    };
    readonly marketing: {
        readonly name: "Marketing & Social Media";
        readonly description: "Alex's marketing tools: social content generation, Twitter/X posting, LinkedIn publishing, analytics";
        readonly icon: "📣";
        readonly status: "active";
    };
    readonly referral: {
        readonly name: "Voice Referrals";
        readonly description: "Viral growth via voice calls - Ferni personally calls friends to introduce herself";
        readonly icon: "📞";
        readonly status: "active";
    };
    readonly podcasts: {
        readonly name: "Podcasts";
        readonly description: "Podcast discovery, search, and recommendations via iTunes";
        readonly icon: "🎙️";
        readonly status: "active";
    };
    readonly video: {
        readonly name: "Video";
        readonly description: "YouTube video discovery, search, and trending content";
        readonly icon: "📺";
        readonly status: "active";
    };
    readonly books: {
        readonly name: "Books";
        readonly description: "Book discovery, reading lists, and progress tracking via Google Books";
        readonly icon: "📖";
        readonly status: "active";
    };
    readonly scheduling: {
        readonly name: "Scheduling";
        readonly description: "Schedule text messages, phone calls, and emails for later delivery";
        readonly icon: "📲";
        readonly status: "active";
    };
    readonly concierge: {
        readonly name: "AI Concierge";
        readonly description: "AI-powered outreach: hotel quotes, restaurant reservations, healthcare appointments, service provider quotes";
        readonly icon: "🛎️";
        readonly status: "active";
    };
    readonly 'local-search': {
        readonly name: "Local Search";
        readonly description: "Yelp-powered local business discovery: restaurants, reviews, ratings, hours, phone lookup";
        readonly icon: "📍";
        readonly status: "active";
    };
    readonly 'visual-memory': {
        readonly name: "Visual Memory";
        readonly description: "Photo recall, image analysis, and visual context - Ferni remembers every photo you share";
        readonly icon: "📸";
        readonly status: "active";
    };
    readonly 'ambient-mode': {
        readonly name: "Ambient Mode";
        readonly description: "Continuous presence, location awareness, and proactive nudges - Ferni knows when to check in";
        readonly icon: "🌙";
        readonly status: "active";
    };
    readonly settings: {
        readonly name: "Settings";
        readonly description: "User preferences - language, voice, and session settings";
        readonly icon: "⚙️";
        readonly status: "active";
    };
    readonly insights: {
        readonly name: "Insights";
        readonly description: "Analytics summaries, progress tracking, and weekly reviews";
        readonly icon: "📊";
        readonly status: "active";
    };
};
//# sourceMappingURL=index.d.ts.map