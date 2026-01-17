/**
 * Test script for proactive outreach
 * Sends a test text message to verify the system works
 */

import { setUserContactInfo, textUser, scheduleText, initializeProactiveOutreach } from '../../../../../src/tools/domains/proactive/outreach/index.js';

async function test() {
  const phone = process.env.TEST_PHONE_NUMBER;
  
  if (!phone) {
    console.error('❌ TEST_PHONE_NUMBER not set in .env');
    process.exit(1);
  }
  
  const userId = 'test-user';
  
  console.log('📱 Setting up contact info for:', phone);
  setUserContactInfo(userId, { 
    phone: phone,
    timezone: 'America/Denver'
  });
  
  console.log('📤 Sending test message...');
  const result = await textUser(
    userId, 
    '🎉 Proactive outreach is working! Ferni can now text, email, and call you for reminders, check-ins, and celebrations.',
    'Ferni'
  );
  
  if (result.success) {
    console.log('✅ Message sent successfully!');
  } else {
    console.log('❌ Failed:', result.error);
  }
  
  // Also schedule one for 2 minutes from now
  const inTwoMin = new Date(Date.now() + 2 * 60 * 1000);
  console.log('📅 Scheduling follow-up for:', inTwoMin.toLocaleTimeString());
  
  const scheduled = await scheduleText(
    userId,
    'This is a scheduled reminder from 2 minutes ago. The reminder system is working! 🚀',
    inTwoMin,
    'Ferni'
  );
  
  if (scheduled.success) {
    console.log('✅ Reminder scheduled:', scheduled.reminderId);
    console.log('⏰ Starting scheduler to deliver it...');
    
    // Start the scheduler
    initializeProactiveOutreach();
    
    // Wait for delivery
    console.log('⏳ Waiting 2.5 minutes for scheduled reminder...');
    await new Promise(resolve => setTimeout(resolve, 150000));
    
    console.log('✅ Test complete!');
  } else {
    console.log('❌ Scheduling failed:', scheduled.error);
  }
  
  process.exit(0);
}

test().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

