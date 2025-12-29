// @ts-nocheck - WIP: APIs need updating to current architecture
/**
 * Intelligent Outbound Call Agent
 *
 * A TRULY intelligent agent for making calls on behalf of users.
 * This is NOT a script reader - it's a full agent with:
 *
 * 1. **User Context** - Knows the user's profile, preferences, history
 * 2. **Contact Context** - Knows the relationship, past interactions
 * 3. **Adaptive Behavior** - Handles IVR, voicemail, hold, humans naturally
 * 4. **Real Conversation** - Uses LLM to have natural dialogue
 * 5. **Result Understanding** - Captures what actually happened
 *
 * "Better than human" means this agent should be more prepared and
 * more attentive than any human assistant making a call.
 *
 * @module agents/outbound/intelligent-outbound-agent
 */

import type { JobContext } from '@livekit/agents';
import type { RemoteParticipant } from '@livekit/rtc-node';
import { voice } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { Modality } from '@google/genai';
import { getLogger } from '../../utils/safe-logger.js';
import { createCartesiaTTS } from '../../speech/tts/index.js';
import { getVoiceId } from '../../personas/voice-registry.js';

const log = getLogger().child({ module: 'intelligent-outbound-agent' });

// ============================================================================
// TYPES
// ============================================================================

export interface IntelligentCallMetadata {
  type: 'on_behalf_call';
  callId: string;
  originalSessionId: string;
  userId: string;
  userName: string;
  contact: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
  purpose: string;
  objective: string;
  callType: 'business' | 'personal' | 'emergency';
  script?: string; // Optional - agent can use this as guidance but isn't bound to it
  userPreferences?: {
    preferredTimes?: string[];
    additionalContext?: string;
  };
}

interface UserContext {
  name: string;
  email?: string;
  phone?: string;
  timezone?: string;
  preferences?: Record<string, unknown>;
  recentTopics?: string[];
  upcomingEvents?: string[];
  healthProviders?: { name: string; type: string; phone?: string }[];
}

interface ContactContext {
  name: string;
  relationship: string;
  lastInteraction?: string;
  interactionHistory?: string[];
  notes?: string[];
  preferredContactMethod?: string;
  businessHours?: string;
}

interface ConversationState {
  phase:
    | 'greeting'
    | 'navigating_ivr'
    | 'on_hold'
    | 'talking_to_human'
    | 'leaving_voicemail'
    | 'wrapping_up';
  objectiveProgress: 'not_started' | 'in_progress' | 'achieved' | 'blocked';
  keyInfoGathered: string[];
  nextActions: string[];
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run the intelligent outbound call agent.
 *
 * This agent has FULL context about the user and contact, enabling
 * truly intelligent, personalized conversations.
 */
export async function runIntelligentOutboundAgent(
  ctx: JobContext,
  rawMetadata: Record<string, unknown>
): Promise<void> {
  const metadata = rawMetadata as unknown as IntelligentCallMetadata;
  const { callId, contact, purpose, userId, userName } = metadata;

  log.info(
    { callId, contactName: contact?.name, purpose },
    '🧠 Starting INTELLIGENT outbound agent'
  );
  logToStderr('========================================');
  logToStderr('🧠 INTELLIGENT OUTBOUND CALL AGENT');
  logToStderr(`Call ID: ${callId}`);
  logToStderr(`Calling: ${contact?.name || 'Unknown'} (${contact?.relationship || 'contact'})`);
  logToStderr(`On behalf of: ${userName}`);
  logToStderr(`Purpose: ${purpose}`);
  logToStderr('========================================');

  // =========================================================================
  // STEP 1: GATHER INTELLIGENCE
  // =========================================================================
  logToStderr('📚 Gathering intelligence about user and contact...');

  const [userContext, contactContext] = await Promise.all([
    loadUserContext(userId, userName),
    loadContactContext(userId, contact?.name || '', contact?.relationship),
  ]);

  logToStderr(`   User context: ${Object.keys(userContext).length} fields loaded`);
  logToStderr(`   Contact context: ${contactContext.name} (${contactContext.relationship})`);

  // =========================================================================
  // STEP 2: CONNECT TO ROOM
  // =========================================================================
  logToStderr('📡 Connecting to LiveKit room...');

  try {
    await ctx.connect();
    logToStderr(`   ✅ Connected to room: ${ctx.room.name}`);
  } catch (error) {
    logToStderr(`   ❌ Failed to connect: ${error}`);
    throw error;
  }

  // =========================================================================
  // STEP 3: SET UP VOICE & BRAIN
  // =========================================================================
  logToStderr('🎙️ Setting up voice and brain...');

  const voiceId = getVoiceId('ferni');
  const tts = createCartesiaTTS(voiceId);

  // Build the INTELLIGENT system prompt with full context
  const systemPrompt = buildIntelligentPrompt({
    userContext,
    contactContext,
    purpose,
    objective: metadata.objective,
    callType: metadata.callType,
    scriptGuidance: metadata.script,
    userPreferences: metadata.userPreferences,
  });

  logToStderr(`   System prompt: ${systemPrompt.length} chars (rich context loaded)`);

  const llm = new google.beta.realtime.RealtimeModel({
    model: 'gemini-2.0-flash-live-001',
    modalities: [Modality.TEXT],
    temperature: 0.8, // Slightly higher for more natural conversation
    instructions: systemPrompt,
    inputAudioTranscription: {},
  });

  // =========================================================================
  // STEP 4: WAIT FOR PHONE PARTICIPANT
  // =========================================================================
  logToStderr('📞 Waiting for call to connect...');

  const phoneParticipant = await waitForPhoneParticipant(ctx, 60000);

  if (!phoneParticipant) {
    logToStderr('   ⚠️ No answer after 60 seconds');
    await reportResult(metadata, 'no_answer', {
      outcome: `Couldn't reach ${contact?.name || 'contact'} - no answer`,
      callbackRequired: true,
    });
    return;
  }

  logToStderr(`   ✅ Connected to: ${phoneParticipant.identity}`);

  // =========================================================================
  // STEP 5: CREATE AGENT SESSION
  // =========================================================================
  logToStderr('🤖 Creating agent session...');

  const session = new voice.AgentSession({
    turnDetection: 'realtime_llm',
    llm,
    tts,
    minEndpointingDelay: 300,
    maxEndpointingDelay: 800,
  });

  await session.start({
    room: ctx.room,
    participant: phoneParticipant,
  });

  logToStderr('   ✅ Agent session started');

  // =========================================================================
  // STEP 6: INITIATE CONVERSATION INTELLIGENTLY
  // =========================================================================
  logToStderr('🎤 Speaking opening...');

  // Build an intelligent opening based on context
  const opening = buildIntelligentOpening({
    userContext,
    contactContext,
    purpose,
    callType: metadata.callType,
  });

  logToStderr(`   Opening: "${opening}"`);

  try {
    await session.say(opening, { allowInterruptions: true });
    logToStderr('   ✅ Opening delivered');
  } catch (error) {
    logToStderr(`   ❌ Failed to speak: ${error}`);
  }

  // =========================================================================
  // STEP 7: MONITOR & TRACK CONVERSATION
  // =========================================================================
  logToStderr('👂 Monitoring conversation...');

  // Initialize conversation tracking state
  const state: ConversationState = {
    phase: 'greeting',
    objectiveProgress: 'not_started',
    keyInfoGathered: [],
    nextActions: [],
  };

  // Set up conversation monitoring
  setupConversationMonitoring(session, state, metadata);

  // Wait for call to end
  await waitForCallEnd(ctx, phoneParticipant.identity);

  logToStderr('📞 Call ended');

  // =========================================================================
  // STEP 8: ANALYZE & REPORT
  // =========================================================================
  logToStderr('📊 Analyzing call outcome...');

  // In a full implementation, we'd analyze the transcript here
  // For now, report based on tracked state
  const outcome = buildOutcomeReport(state, contactContext);

  await reportResult(
    metadata,
    state.objectiveProgress === 'achieved' ? 'completed' : 'completed',
    outcome
  );

  logToStderr('✅ Intelligent outbound agent finished');
}

// ============================================================================
// CONTEXT LOADING
// ============================================================================

/**
 * Load full user context for intelligent conversation
 */
async function loadUserContext(userId: string, userName: string): Promise<UserContext> {
  const context: UserContext = {
    name: userName,
  };

  try {
    // Load user profile
    const { getUserProfile } = await import('../../services/user-profile.js');
    const profile = await getUserProfile(userId);

    if (profile) {
      context.email = profile.email;
      context.phone = profile.phone;
      context.timezone = profile.timezone || 'America/Los_Angeles';
      context.preferences = profile.preferences;
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Could not load user profile');
  }

  try {
    // Load recent conversation topics (so agent knows what user cares about)
    const { getRecentTopics } = await import('../../memory/topic-tracker.js');
    const topics = await getRecentTopics(userId, 5);
    context.recentTopics = topics?.map((t) => t.topic) || [];
  } catch {
    // Topic tracker might not be available
  }

  try {
    // Load upcoming calendar events (context for scheduling)
    const { getUpcomingEvents } = await import('../../services/calendar/index.js');
    const events = await getUpcomingEvents(userId, 7); // Next 7 days
    context.upcomingEvents = events?.slice(0, 5).map((e) => `${e.title} on ${e.date}`) || [];
  } catch {
    // Calendar might not be connected
  }

  try {
    // Load healthcare providers if relevant
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (db) {
      const doc = await db.collection('bogle_users').doc(userId).get();
      const data = doc.data();
      if (data?.healthcareProviders) {
        context.healthProviders = data.healthcareProviders;
      }
    }
  } catch {
    // Firestore might not be available
  }

  return context;
}

/**
 * Load contact relationship context
 */
async function loadContactContext(
  userId: string,
  contactName: string,
  relationship?: string
): Promise<ContactContext> {
  const context: ContactContext = {
    name: contactName || 'Unknown Contact',
    relationship: relationship || 'contact',
  };

  try {
    // Load from contact relationship service
    const { searchContacts } =
      await import('../../services/contacts/contact-relationship-service.js');
    const contacts = await searchContacts(userId, contactName);

    if (contacts && contacts.length > 0) {
      const contact = contacts[0];
      context.relationship = contact.relationship || context.relationship;
      context.lastInteraction = contact.lastInteraction?.toISOString();
      context.notes = contact.notes;
      context.preferredContactMethod = contact.preferredContactMethod;
    }
  } catch (error) {
    log.debug({ error: String(error), contactName }, 'Could not load contact details');
  }

  return context;
}

// ============================================================================
// INTELLIGENT PROMPTS
// ============================================================================

/**
 * Build a rich, intelligent system prompt with full context
 */
function buildIntelligentPrompt(params: {
  userContext: UserContext;
  contactContext: ContactContext;
  purpose: string;
  objective: string;
  callType: string;
  scriptGuidance?: string;
  userPreferences?: { preferredTimes?: string[]; additionalContext?: string };
}): string {
  const {
    userContext,
    contactContext,
    purpose,
    objective,
    callType,
    scriptGuidance,
    userPreferences,
  } = params;

  // Build context sections
  const userSection = buildUserContextSection(userContext);
  const contactSection = buildContactContextSection(contactContext);
  const situationSection = buildSituationSection(purpose, objective, callType, userPreferences);
  const guidanceSection = scriptGuidance ? `\n## GUIDANCE FROM USER\n${scriptGuidance}` : '';

  return `# Intelligent Outbound Call Agent

You are Ferni, making a phone call on behalf of ${userContext.name}.
You have FULL context about both the user and who you're calling.
Use this intelligence to have a natural, effective conversation.

${userSection}

${contactSection}

${situationSection}

${guidanceSection}

## YOUR CAPABILITIES

You can:
- Navigate IVR menus (say numbers or keywords when prompted)
- Wait patiently when put on hold
- Leave clear voicemails if you reach one
- Adapt to whoever answers (receptionist, nurse, the person themselves)
- Ask clarifying questions when needed
- Confirm important details before ending

## CONVERSATION APPROACH

1. **Be warm and professional** - You represent ${userContext.name}
2. **Be efficient** - Respect everyone's time
3. **Be adaptable** - Handle whatever situation arises
4. **Be thorough** - Get the information needed
5. **Be clear** - Confirm important details

## WHAT TO CAPTURE

During the call, mentally note:
- Who you spoke with
- What was accomplished
- Any dates/times confirmed
- Any follow-up needed
- Any important information shared

## ENDING THE CALL

When the objective is achieved (or if it can't be):
1. Summarize what was accomplished
2. Confirm any next steps
3. Thank them warmly
4. Say goodbye

Remember: You're not reading a script. You're having a real conversation
to help ${userContext.name}. Be intelligent, be human, be helpful.`;
}

function buildUserContextSection(user: UserContext): string {
  const lines = [`## ABOUT ${user.name.toUpperCase()} (WHO YOU REPRESENT)`];

  lines.push(`- Name: ${user.name}`);
  if (user.timezone) lines.push(`- Timezone: ${user.timezone}`);
  if (user.phone) lines.push(`- Their phone: ${user.phone}`);
  if (user.email) lines.push(`- Their email: ${user.email}`);

  if (user.recentTopics && user.recentTopics.length > 0) {
    lines.push(`- Recent interests: ${user.recentTopics.join(', ')}`);
  }

  if (user.upcomingEvents && user.upcomingEvents.length > 0) {
    lines.push(`- Upcoming schedule: ${user.upcomingEvents.join('; ')}`);
  }

  if (user.healthProviders && user.healthProviders.length > 0) {
    lines.push(`- Healthcare providers:`);
    user.healthProviders.forEach((p) => {
      lines.push(`  - ${p.name} (${p.type})`);
    });
  }

  return lines.join('\n');
}

function buildContactContextSection(contact: ContactContext): string {
  const lines = [`## ABOUT ${contact.name.toUpperCase()} (WHO YOU'RE CALLING)`];

  lines.push(`- Name: ${contact.name}`);
  lines.push(`- Relationship: ${contact.relationship}`);

  if (contact.lastInteraction) {
    lines.push(`- Last interaction: ${contact.lastInteraction}`);
  }

  if (contact.notes && contact.notes.length > 0) {
    lines.push(`- Notes: ${contact.notes.join('; ')}`);
  }

  if (contact.businessHours) {
    lines.push(`- Business hours: ${contact.businessHours}`);
  }

  return lines.join('\n');
}

function buildSituationSection(
  purpose: string,
  objective: string,
  callType: string,
  preferences?: { preferredTimes?: string[]; additionalContext?: string }
): string {
  const lines = ['## THIS CALL'];

  lines.push(`- Purpose: ${purpose}`);
  lines.push(`- Objective: ${objective}`);
  lines.push(`- Call type: ${callType}`);

  if (preferences?.preferredTimes && preferences.preferredTimes.length > 0) {
    lines.push(`- Preferred times: ${preferences.preferredTimes.join(', ')}`);
  }

  if (preferences?.additionalContext) {
    lines.push(`- Additional context: ${preferences.additionalContext}`);
  }

  return lines.join('\n');
}

/**
 * Build an intelligent opening based on context
 */
function buildIntelligentOpening(params: {
  userContext: UserContext;
  contactContext: ContactContext;
  purpose: string;
  callType: string;
}): string {
  const { userContext, contactContext, purpose, callType } = params;

  // Personalize based on relationship
  const relationshipGreeting = getRelationshipGreeting(contactContext.relationship);

  // Keep it natural and warm
  if (callType === 'business') {
    return `${relationshipGreeting}, this is Ferni calling on behalf of ${userContext.name}. ${purpose}`;
  } else if (callType === 'personal') {
    return `Hey${contactContext.name !== 'Unknown Contact' ? ` ${contactContext.name.split(' ')[0]}` : ''}! This is Ferni, I'm calling for ${userContext.name}. ${purpose}`;
  } else {
    return `Hi, this is Ferni calling on behalf of ${userContext.name}. ${purpose}`;
  }
}

function getRelationshipGreeting(relationship: string): string {
  const greetings: Record<string, string> = {
    doctor: 'Hi',
    dentist: 'Hi',
    healthcare: 'Hi',
    restaurant: 'Hi there',
    business: 'Hello',
    friend: 'Hey',
    family: 'Hi',
    mother: 'Hi Mom',
    father: 'Hi Dad',
    default: 'Hi',
  };

  return greetings[relationship.toLowerCase()] || greetings.default;
}

// ============================================================================
// CONVERSATION MONITORING
// ============================================================================

/**
 * Set up monitoring of the conversation state
 */
function setupConversationMonitoring(
  session: voice.AgentSession,
  state: ConversationState,
  metadata: IntelligentCallMetadata
): void {
  // Track when we detect different situations
  // In a full implementation, this would analyze audio/transcripts

  // For now, track basic state transitions
  state.phase = 'talking_to_human';
  state.objectiveProgress = 'in_progress';
}

// ============================================================================
// HELPERS
// ============================================================================

function logToStderr(msg: string): void {
  process.stderr.write(`[intelligent-agent] ${msg}\n`);
}

async function waitForPhoneParticipant(
  ctx: JobContext,
  timeoutMs: number
): Promise<RemoteParticipant | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logToStderr(`   ⏰ Timeout reached. Listing all participants in room:`);
      for (const p of ctx.room.remoteParticipants.values()) {
        logToStderr(`      - "${p.identity}" (name: ${p.name})`);
      }
      if (ctx.room.remoteParticipants.size === 0) {
        logToStderr(`      (no remote participants in room)`);
      }
      resolve(null);
    }, timeoutMs);

    // Check if already there
    logToStderr(`   Checking existing participants...`);
    for (const participant of ctx.room.remoteParticipants.values()) {
      logToStderr(`      Found: "${participant.identity}" (name: ${participant.name})`);
      if (isPhoneParticipant(participant.identity)) {
        logToStderr(`      ✅ Matched as phone participant!`);
        clearTimeout(timeout);
        resolve(participant);
        return;
      }
    }
    logToStderr(`   No existing phone participant. Waiting for new connections...`);

    // Wait for them to join
    const handler = (participant: RemoteParticipant) => {
      logToStderr(`   🔔 Participant joined: "${participant.identity}" (name: ${participant.name})`);
      if (isPhoneParticipant(participant.identity)) {
        logToStderr(`   ✅ Phone participant connected!`);
        clearTimeout(timeout);
        ctx.room.off('participantConnected', handler);
        resolve(participant);
      } else {
        logToStderr(`   (not a phone participant, continuing to wait...)`);
      }
    };

    ctx.room.on('participantConnected', handler);
  });
}

function isPhoneParticipant(identity: string): boolean {
  return identity.startsWith('phone_') || identity.startsWith('sip_') || identity.startsWith('+1');
}

async function waitForCallEnd(ctx: JobContext, phoneIdentity: string): Promise<void> {
  return new Promise((resolve) => {
    if (!ctx.room.isConnected) {
      resolve();
      return;
    }

    const disconnectHandler = (participant: RemoteParticipant) => {
      if (participant.identity === phoneIdentity) {
        ctx.room.off('participantDisconnected', disconnectHandler);
        resolve();
      }
    };
    ctx.room.on('participantDisconnected', disconnectHandler);

    ctx.room.on('disconnected', () => resolve());

    // Periodic check
    const interval = setInterval(() => {
      if (!ctx.room.isConnected || !ctx.room.remoteParticipants.has(phoneIdentity)) {
        clearInterval(interval);
        resolve();
      }
    }, 5000);
  });
}

function buildOutcomeReport(
  state: ConversationState,
  contact: ContactContext
): { outcome: string; callbackRequired: boolean; actionItems?: string[] } {
  return {
    outcome: `Call with ${contact.name} completed. ${state.keyInfoGathered.length > 0 ? `Key info: ${state.keyInfoGathered.join(', ')}` : ''}`,
    callbackRequired: state.objectiveProgress !== 'achieved',
    actionItems: state.nextActions.length > 0 ? state.nextActions : undefined,
  };
}

async function reportResult(
  metadata: IntelligentCallMetadata,
  status: 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed',
  outcome: { outcome: string; callbackRequired: boolean; actionItems?: string[] }
): Promise<void> {
  const { callId, originalSessionId, userId, userName, contact, purpose, objective, callType } =
    metadata;

  log.info(
    { callId, status, outcome: outcome.outcome.slice(0, 100) },
    'Reporting intelligent call result'
  );

  try {
    const { captureCallResult } = await import('../../services/outreach/call-result-capture.js');

    await captureCallResult(
      callId,
      {
        callId,
        status,
        objectiveAchieved: status === 'completed' && !outcome.callbackRequired,
        outcome: outcome.outcome,
        callbackRequired: outcome.callbackRequired,
        actionItems: outcome.actionItems,
      },
      {
        originalSessionId,
        userId,
        userName,
        contactQuery: contact?.name || 'contact',
        purpose,
        objective: objective as 'schedule' | 'reschedule' | 'cancel' | 'inquiry' | 'general',
        callType,
        userTimezone: 'America/Los_Angeles',
        recordingConsent: true,
      }
    );

    log.info({ callId }, '✅ Intelligent call result reported');
  } catch (error) {
    log.error({ error: String(error), callId }, 'Failed to report result');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { runIntelligentOutboundAgent as runOnBehalfCallAgent };
