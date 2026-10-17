#!/usr/bin/env npx tsx
/**
 * Save Betty Ford as "Mom" contact for Seth
 * 
 * Run: npx env-cmd -f .env npx tsx scripts/save-mom-contact.ts --phone=<+1XXXXXXXXXX>
 *   (or set MOM_PHONE). The number is never written into this file: it is in a
 *   public repository.
 */

import { upsertContact } from '../src/services/contacts/contact-relationship-service.js';

async function saveMomContact() {
  const phoneArg = process.argv.find((a) => a.startsWith('--phone='))?.slice('--phone='.length);
  const phone = (phoneArg ?? process.env.MOM_PHONE ?? '').trim();
  if (!phone) {
    console.error(
      'Missing phone.\n\nUsage: npx tsx scripts/save-mom-contact.ts --phone=<+1XXXXXXXXXX>\n   or: MOM_PHONE=<+1XXXXXXXXXX> npx tsx scripts/save-mom-contact.ts'
    );
    process.exit(1);
  }
  const userId = process.env.FERNI_USER_ID || 'seth';
  
  console.log('\n📇 Saving Betty Ford as "Mom" contact...');
  console.log('   User ID:', userId);

  try {
    // Use the proper contact relationship service
    const contact = await upsertContact(userId, {
      name: 'Betty Ford',
      contactId: phone, // Primary identifier
      phone,
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

