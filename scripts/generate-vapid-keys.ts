#!/usr/bin/env npx ts-node
/**
 * Generate VAPID Keys for Web Push Notifications
 * 
 * VAPID (Voluntary Application Server Identification) keys are required
 * for sending push notifications to web browsers.
 * 
 * Usage:
 *   npx ts-node scripts/generate-vapid-keys.ts
 * 
 * This will output keys you can add to your .env file.
 */

import crypto from 'crypto';

// VAPID keys need to be ECDSA P-256 keys
function generateVapidKeys(): { publicKey: string; privateKey: string } {
  // Generate ECDSA key pair
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();

  // Get raw keys
  const publicKeyBuffer = ecdh.getPublicKey();
  const privateKeyBuffer = ecdh.getPrivateKey();

  // Convert to URL-safe base64 (required for VAPID)
  const publicKey = publicKeyBuffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const privateKey = privateKeyBuffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { publicKey, privateKey };
}

// Main
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  🔐 VAPID Key Generator for Web Push Notifications');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

const keys = generateVapidKeys();

console.log('Add these to your .env file:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:hello@ferni.ai`);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('For the frontend, also add to your Vite environment:');
console.log('');
console.log(`VITE_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log('');
console.log('Note: Keep the PRIVATE key secret! Never expose it to the frontend.');
console.log('');

