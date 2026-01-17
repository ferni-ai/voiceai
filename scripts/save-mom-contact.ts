#!/usr/bin/env npx tsx
/**
 * Save Betty Ford as "Mom" contact for Seth
 * 
 * Run: npx env-cmd -f .env npx tsx scripts/save-mom-contact.ts
 */

import { upsertContact } from '../src/services/contacts/contact-relationship-service.js';

async function saveMomContact() {
  const userId = process.env.FERNI_USER_ID || 'seth';
  
  console.log('\n📇 Saving Betty Ford as "Mom" contact...');
  console.log('   User ID:', userId);

  try {
    // Use the proper contact relationship service
    const contact = await upsertContact(userId, {
      name: 'Betty Ford',
      contactId: '+18018983303', // Primary identifier
      phone: '+18018983303',
      email: '', // Provide empty string instead of undefined
      relationship: 'family',
      notes: "Seth's mom - wish her amazing days!",
    });
    
    console.log('\n✅ Contact saved!');
    console.log('   ID:', contact.id);
    console.log('   Name:', contact.name);
    console.log('   Phone:', contact.phone);
    console.log('   Relationship:', contact.relationship);
    
    console.log('\n🎤 Now tell Ferni:');
    console.log('   "Call my mom and wish her an amazing day"');
    console.log('\n   Or test directly:');
    console.log('   npx env-cmd -f .env npx tsx scripts/test-call-mom.ts');
    console.log('');
  } catch (error) {
    console.error('\n❌ Error saving contact:', error);
  }
}

saveMomContact().catch(console.error);

