#!/usr/bin/env node
/**
 * Generate Unique Handoff Sounds
 * 
 * Creates distinctive audio tones for each team member using Web Audio API concepts.
 * Run this in a browser console or use a library like `tone` to generate actual files.
 * 
 * Each persona has a unique "sonic signature":
 * - Alex (Communication): Clean, professional chime - C major (bright, clear)
 * - Maya (Spend & Save): Warm, reassuring tone - F major (comfortable, safe)  
 * - Jordan (Life Planner): Energetic, exciting fanfare - G major (adventurous)
 * - Peter (Stocks): Rising whoosh with energy - A major (dynamic)
 * - Jack (Index): Calm, settling tone - D major (steady, reliable)
 */

// Sound specifications for each persona
const SOUND_SPECS = {
  alex: {
    name: 'handoff-to-alex',
    description: 'Clean professional chime - Communication Specialist',
    notes: ['C5', 'E5', 'G5'], // C major triad
    duration: 0.4,
    attack: 0.02,
    decay: 0.3,
    waveform: 'sine',
    character: 'Crisp, digital, efficient',
  },
  maya: {
    name: 'handoff-to-maya', 
    description: 'Warm reassuring tone - Spend & Save Specialist',
    notes: ['F4', 'A4', 'C5'], // F major triad
    duration: 0.5,
    attack: 0.05,
    decay: 0.4,
    waveform: 'triangle',
    character: 'Soft, warm, comforting',
  },
  jordan: {
    name: 'handoff-to-jordan',
    description: 'Energetic exciting fanfare - Life & Event Planner', 
    notes: ['G4', 'B4', 'D5', 'G5'], // G major with octave
    duration: 0.6,
    attack: 0.01,
    decay: 0.5,
    waveform: 'sawtooth',
    character: 'Bright, exciting, adventurous',
  },
  peter: {
    name: 'handoff-to-peter',
    description: 'Rising whoosh with energy - Stock Picker',
    notes: ['A3', 'C#4', 'E4', 'A4'], // A major arpeggio
    duration: 0.5,
    attack: 0.02,
    decay: 0.4,
    waveform: 'square',
    character: 'Dynamic, rising, energetic',
  },
  jack: {
    name: 'handoff-to-jack',
    description: 'Calm settling tone - Index Fund Coach',
    notes: ['D4', 'F#4', 'A4'], // D major triad
    duration: 0.6,
    attack: 0.1,
    decay: 0.5,
    waveform: 'sine',
    character: 'Steady, reliable, calming',
  },
};

/**
 * Browser-based sound generation
 * Paste this in browser console to generate and download sounds
 */
const BROWSER_SCRIPT = `
// Run this in browser console to generate sounds

async function generateSound(spec) {
  const audioCtx = new AudioContext();
  const sampleRate = audioCtx.sampleRate;
  const duration = spec.duration;
  const numSamples = sampleRate * duration;
  
  const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);
  
  // Note frequencies
  const noteFreqs = {
    'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13,
    'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00,
    'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'G5': 783.99,
    'A3': 220.00, 'C#4': 277.18,
  };
  
  // Generate waveform
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    
    // Add each note
    spec.notes.forEach((note, idx) => {
      const freq = noteFreqs[note];
      const noteDelay = idx * 0.05; // Slight arpeggio
      
      if (t >= noteDelay) {
        const noteT = t - noteDelay;
        // Envelope
        const attack = Math.min(1, noteT / spec.attack);
        const decay = Math.max(0, 1 - (noteT - spec.attack) / spec.decay);
        const envelope = attack * decay;
        
        // Waveform
        let wave;
        switch(spec.waveform) {
          case 'sine': wave = Math.sin(2 * Math.PI * freq * noteT); break;
          case 'triangle': wave = 2 * Math.abs(2 * (noteT * freq % 1) - 1) - 1; break;
          case 'sawtooth': wave = 2 * (noteT * freq % 1) - 1; break;
          case 'square': wave = Math.sign(Math.sin(2 * Math.PI * freq * noteT)); break;
          default: wave = Math.sin(2 * Math.PI * freq * noteT);
        }
        
        sample += wave * envelope * 0.3;
      }
    });
    
    data[i] = Math.max(-1, Math.min(1, sample));
  }
  
  // Convert to WAV
  const wavBuffer = audioBufferToWav(buffer);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  
  // Download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = spec.name + '.wav';
  a.click();
  
  return buffer;
}

function audioBufferToWav(buffer) {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const data = buffer.getChannelData(0);
  const dataLength = data.length * 2;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;
  
  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitDepth / 8, true);
  view.setUint16(32, numChannels * bitDepth / 8, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write samples
  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample * 0x7FFF, true);
    offset += 2;
  }
  
  return arrayBuffer;
}

// Generate all sounds
const specs = ${JSON.stringify(SOUND_SPECS, null, 2)};
Object.values(specs).forEach(spec => generateSound(spec));
`;

console.log('='.repeat(60));
console.log('HANDOFF SOUND GENERATOR');
console.log('='.repeat(60));
console.log('\nSound specifications for each persona:\n');

Object.entries(SOUND_SPECS).forEach(([key, spec]) => {
  console.log(`${spec.name.toUpperCase()}`);
  console.log(`  Notes: ${spec.notes.join(' → ')}`);
  console.log(`  Character: ${spec.character}`);
  console.log(`  Duration: ${spec.duration}s`);
  console.log('');
});

console.log('='.repeat(60));
console.log('TO GENERATE ACTUAL AUDIO FILES:');
console.log('='.repeat(60));
console.log('\n1. Open browser console (F12 → Console)');
console.log('2. Paste the following script:');
console.log('\n--- COPY BELOW THIS LINE ---\n');
console.log(BROWSER_SCRIPT);
console.log('\n--- COPY ABOVE THIS LINE ---\n');
console.log('3. Press Enter - WAV files will download');
console.log('4. Convert WAV to MP3 using ffmpeg:');
console.log('   ffmpeg -i handoff-to-alex.wav handoff-to-alex.mp3');
console.log('5. Copy MP3 files to frontend-typescript/public/sounds/\n');

// Also output a simple Node.js alternative using tone.js
console.log('='.repeat(60));
console.log('ALTERNATIVE: Use royalty-free sounds');  
console.log('='.repeat(60));
console.log('\nRecommended sources for UI sounds:');
console.log('• https://freesound.org (search: "notification chime")');
console.log('• https://mixkit.co/free-sound-effects/notification/');
console.log('• https://soundbible.com');
console.log('\nLook for sounds that match these characteristics:');
console.log('• Alex: Clean digital chime, professional');
console.log('• Maya: Warm soft tone, comforting');
console.log('• Jordan: Upbeat fanfare, exciting');

