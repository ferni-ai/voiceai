/**
 * Test script for outreach intelligence
 * Demonstrates how agents predict when to reach out
 */

import { 
  extractCommitments,
  detectEmotionalTriggers,
  analyzeConversationForOutreach,
  setPreferences,
  getPreferences,
} from '../../../../../src/services/outreach-intelligence.js';
import { setUserContactInfo } from '../../../../../src/tools/proactive-outreach.js';

async function test() {
  const userId = 'test-user';
  const phone = process.env.TEST_PHONE_NUMBER;
  
  console.log('\n🧠 OUTREACH INTELLIGENCE TEST\n');
  console.log('=' .repeat(60));
  
  // Set up user contact info
  if (phone) {
    setUserContactInfo(userId, { phone, timezone: 'America/Denver' });
    console.log(`📱 Phone: ${phone}\n`);
  }
  
  // Set preferences
  setPreferences(userId, {
    enabled: true,
    preferredMethod: 'sms',
    timezone: 'America/Denver',
    maxPerDay: 5,
    maxPerWeek: 20,
  });
  
  // =========================================================================
  // TEST 1: Commitment Extraction
  // =========================================================================
  console.log('\n📝 TEST 1: Commitment Extraction');
  console.log('-'.repeat(60));
  
  const conversations = [
    "I'll definitely work out tomorrow morning",
    "I'm going to call my mom this weekend",
    "I need to apply to 3 jobs by Friday",
    "I promise to meditate every day this week",
    "I'm going to drink more water today",
  ];
  
  for (const text of conversations) {
    console.log(`\nInput: "${text}"`);
    const commitments = extractCommitments(userId, text);
    
    if (commitments.length > 0) {
      for (const c of commitments) {
        console.log(`  ✅ Extracted: "${c.what}"`);
        console.log(`     Due: ${c.when.toLocaleString()}`);
        console.log(`     Check-in: ${c.checkInTime.toLocaleString()}`);
      }
    } else {
      console.log('  ❌ No commitment detected');
    }
  }
  
  // =========================================================================
  // TEST 2: Emotional Support Detection
  // =========================================================================
  console.log('\n\n💙 TEST 2: Emotional Support Detection');
  console.log('-'.repeat(60));
  
  const emotionalTexts = [
    "I've been really stressed about work lately",
    "I'm having a hard time staying motivated",
    "Feeling a bit overwhelmed with everything",
    "I had a great day today!",
    "Can't sleep, too much on my mind",
  ];
  
  for (const text of emotionalTexts) {
    console.log(`\nInput: "${text}"`);
    const opp = detectEmotionalTriggers(userId, text);
    
    if (opp) {
      console.log(`  ✅ Support outreach triggered!`);
      console.log(`     Message: "${opp.message}"`);
      console.log(`     Time: ${opp.suggestedTime.toLocaleString()}`);
    } else {
      console.log('  ⚪ No emotional trigger detected');
    }
  }
  
  // =========================================================================
  // TEST 3: Full Conversation Analysis
  // =========================================================================
  console.log('\n\n🔍 TEST 3: Full Conversation Analysis');
  console.log('-'.repeat(60));
  
  const fullConversation = `
    User: Hey, I've been feeling pretty overwhelmed with my job search.
    Agent: I'm sorry to hear that. Job searching can be really stressful. What's been the hardest part?
    User: Just the rejections. But I'm going to apply to 5 more jobs this week.
    Agent: That's a great attitude! Persistence pays off.
    User: Yeah, I'll also work out tomorrow to clear my head.
    Agent: Exercise is a great stress reliever!
    User: Thanks for listening. I promise to stay positive.
  `;
  
  console.log('\nConversation:');
  console.log(fullConversation);
  
  if (phone) {
    console.log('\n📤 Analyzing and scheduling outreach...\n');
    
    const result = await analyzeConversationForOutreach(userId, fullConversation, 'Ferni');
    
    console.log(`📝 Commitments found: ${result.commitments.length}`);
    for (const c of result.commitments) {
      console.log(`   - "${c.what}" (check-in: ${c.checkInTime.toLocaleString()})`);
    }
    
    console.log(`\n🎯 Outreach opportunities: ${result.opportunities.length}`);
    for (const o of result.opportunities) {
      console.log(`   - [${o.trigger}] ${o.priority} priority`);
      console.log(`     "${o.message.slice(0, 50)}..."`);
    }
    
    console.log(`\n📬 Scheduled: ${result.scheduled} outreach messages`);
  } else {
    console.log('\n⚠️  Set TEST_PHONE_NUMBER to test actual scheduling');
  }
  
  // =========================================================================
  // TEST 4: Preferences
  // =========================================================================
  console.log('\n\n⚙️  TEST 4: User Preferences');
  console.log('-'.repeat(60));
  
  const prefs = getPreferences(userId);
  console.log('\nCurrent preferences:');
  console.log(`  Enabled: ${prefs.enabled}`);
  console.log(`  Preferred method: ${prefs.preferredMethod}`);
  console.log(`  Timezone: ${prefs.timezone}`);
  console.log(`  Max per day: ${prefs.maxPerDay}`);
  console.log(`  Max per week: ${prefs.maxPerWeek}`);
  console.log(`  Quiet hours: ${prefs.quietHoursStart} - ${prefs.quietHoursEnd}`);
  console.log(`  Enabled triggers: ${prefs.enabledTriggers.join(', ')}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Outreach Intelligence test complete!');
  console.log('='.repeat(60) + '\n');
}

test().catch(console.error);

