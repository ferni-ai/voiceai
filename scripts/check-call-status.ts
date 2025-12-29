#!/usr/bin/env npx tsx
import 'dotenv/config';
import { RoomServiceClient } from 'livekit-server-sdk';

async function main() {
  const roomService = new RoomServiceClient(process.env.LIVEKIT_URL, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);

  // List rooms to see if the call is still active
  const rooms = await roomService.listRooms();
  console.log('Active rooms:', rooms.map(r => ({ name: r.name, participants: r.numParticipants })));

  // Find outbound call rooms
  const outboundRooms = rooms.filter(r => r.name.startsWith('outbound_call_'));
  
  for (const room of outboundRooms) {
    try {
      const participants = await roomService.listParticipants(room.name);
      console.log('\nParticipants in', room.name + ':');
      for (const p of participants) {
        console.log('  -', p.identity, '(', p.name, ')');
      }
    } catch (e) {
      console.log('Could not list participants for', room.name);
    }
  }
}

main().catch(console.error);
