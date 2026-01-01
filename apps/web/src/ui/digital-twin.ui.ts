/**
 * Digital Twin Experience UI
 *
 * A beautiful, on-brand onboarding and management experience for Digital Twins.
 * Digital Twins are personal voice journals that grow with you - record your thoughts,
 * talk to your past self, and build a library of your own wisdom.
 *
 * Key principles:
 *   - Warm, human tone (never robotic or technical)
 *   - Clean, minimal design following Ferni brand guidelines
 *   - No emojis - we use elegant Lucide icons
 *   - Feels like opening a personal journal, not using an app
 *
 * @module digital-twin.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { t } from '../i18n/index.js';
import {
  type CustomAgent,
  listCustomAgents,
} from '../services/custom-agent.service.js';
import { openVoiceJournal } from './voice-journal/index.js';
import { openCustomAgentWizard } from './custom-agent-wizard.ui.js';
import {
  enableJournalCapture,
  disableJournalCapture,
  loadCaptureSettings,
  saveCaptureSettings,
} from '../services/journal-capture.service.js';

const log = createLogger('DigitalTwinUI');

// ============================================================================
// ICONS (Lucide-style, 1.5px stroke, rounded - NO EMOJIS)
// ============================================================================

const ICONS = {
  // Core Digital Twin icons
  journal:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>',
  
  // Hero illustration for Digital Twin onboarding - "Better than Human" quality
  // Depicts: Voice waves flowing from a figure, becoming leaves that gather into a tree,
  // with a mirror reflection showing "past self" conversation
  heroIllustration: `
    <svg viewBox="0 0 400 280" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Premium gradients -->
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fdfcfa"/>
          <stop offset="50%" stop-color="#f8f5f0"/>
          <stop offset="100%" stop-color="#f3efe8"/>
        </linearGradient>
        
        <linearGradient id="figureGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3d3530"/>
          <stop offset="100%" stop-color="#2c2520"/>
        </linearGradient>
        
        <linearGradient id="trunkGradient" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#2d4a35"/>
          <stop offset="40%" stop-color="#3d5a35"/>
          <stop offset="100%" stop-color="#4a6741"/>
        </linearGradient>
        
        <linearGradient id="leafGradientA" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#6b9a5a"/>
          <stop offset="100%" stop-color="#4a6741"/>
        </linearGradient>
        
        <linearGradient id="leafGradientB" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#7aaa6a"/>
          <stop offset="100%" stop-color="#5a7a4a"/>
        </linearGradient>
        
        <linearGradient id="leafGradientC" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stop-color="#5a8a5a"/>
          <stop offset="100%" stop-color="#3d5a35"/>
        </linearGradient>
        
        <linearGradient id="voiceWaveGradient" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stop-color="#a67a6a" stop-opacity="0.7"/>
          <stop offset="50%" stop-color="#8a9a6a" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="#4a6741" stop-opacity="0.2"/>
        </linearGradient>
        
        <linearGradient id="mirrorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#d4ccc0" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#a8a090" stop-opacity="0.1"/>
        </linearGradient>
        
        <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#4a6741" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#4a6741" stop-opacity="0"/>
        </radialGradient>
        
        <radialGradient id="warmGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#c4a265" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#c4a265" stop-opacity="0"/>
        </radialGradient>
        
        <!-- Refined filters -->
        <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
          <feOffset dx="0" dy="2"/>
          <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1"/>
          <feColorMatrix values="0 0 0 0 0.17 0 0 0 0 0.14 0 0 0 0 0.12 0 0 0 0.15 0"/>
          <feBlend in2="SourceGraphic"/>
        </filter>
        
        <filter id="leafGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
        
        <filter id="etherealBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2"/>
        </filter>
        
        <!-- Texture pattern for depth -->
        <pattern id="noiseTexture" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
          <circle cx="25" cy="25" r="0.5" fill="#2c2520" opacity="0.02"/>
          <circle cx="75" cy="75" r="0.5" fill="#2c2520" opacity="0.02"/>
          <circle cx="50" cy="10" r="0.3" fill="#4a6741" opacity="0.015"/>
          <circle cx="10" cy="60" r="0.4" fill="#4a6741" opacity="0.02"/>
        </pattern>
      </defs>
      
      <!-- Background with subtle depth -->
      <rect width="400" height="280" fill="url(#bgGradient)" rx="20"/>
      <rect width="400" height="280" fill="url(#noiseTexture)" rx="20" opacity="0.5"/>
      
      <!-- Ambient glow behind tree -->
      <ellipse cx="220" cy="160" rx="100" ry="90" fill="url(#glowGradient)">
        <animate attributeName="opacity" values="0.8;1;0.8" dur="8s" repeatCount="indefinite"/>
      </ellipse>
      
      <!-- Subtle growth rings - representing time -->
      <g opacity="0.08" stroke="#4a6741" stroke-width="0.75" fill="none">
        <ellipse cx="220" cy="175" rx="45" ry="35"/>
        <ellipse cx="220" cy="175" rx="70" ry="55"/>
        <ellipse cx="220" cy="175" rx="95" ry="75"/>
        <ellipse cx="220" cy="175" rx="120" ry="95"/>
      </g>
      
      <!-- LEFT: Elegant speaking figure - abstract, refined silhouette -->
      <g transform="translate(40, 55)" filter="url(#softShadow)">
        <!-- Full body - elegant continuous form (not stick figure) -->
        <path d="M40 145 
                 Q30 130, 32 110 
                 Q34 95, 38 80 
                 Q40 70, 40 60
                 Q40 70, 42 80
                 Q46 95, 48 110
                 Q50 130, 40 145" 
              fill="url(#figureGradient)" opacity="0.85"/>
        
        <!-- Shoulder/torso suggestion -->
        <ellipse cx="40" cy="65" rx="18" ry="12" fill="url(#figureGradient)" opacity="0.75"/>
        
        <!-- Head - refined, slightly turned toward audience -->
        <ellipse cx="40" cy="38" rx="20" ry="24" fill="url(#figureGradient)" opacity="0.92"/>
        
        <!-- Subtle highlight on head for dimension -->
        <ellipse cx="36" cy="32" rx="6" ry="8" fill="#4a4540" opacity="0.15"/>
        
        <!-- Warm glow where voice originates -->
        <ellipse cx="62" cy="42" rx="18" ry="14" fill="url(#warmGlow)">
          <animate attributeName="rx" values="18;22;18" dur="3s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.5;0.8;0.5" dur="3s" repeatCount="indefinite"/>
        </ellipse>
        
        <!-- Voice waves - flowing, musical curves -->
        <g class="voice-waves">
          <!-- Wave 1 - innermost, most visible -->
          <path d="M62 35 Q85 28, 115 32 Q140 36, 160 48" 
                stroke="url(#voiceWaveGradient)" stroke-width="3.5" stroke-linecap="round" fill="none">
            <animate attributeName="opacity" values="0.95;0.35;0.95" dur="2.5s" repeatCount="indefinite"/>
            <animate attributeName="d" 
                     values="M62 35 Q85 28, 115 32 Q140 36, 160 48;M62 35 Q88 25, 120 28 Q145 32, 168 42;M62 35 Q85 28, 115 32 Q140 36, 160 48" 
                     dur="2.5s" repeatCount="indefinite"/>
          </path>
          
          <!-- Wave 2 - middle -->
          <path d="M62 48 Q90 44, 125 50 Q155 56, 178 70" 
                stroke="url(#voiceWaveGradient)" stroke-width="4" stroke-linecap="round" fill="none">
            <animate attributeName="opacity" values="0.85;0.3;0.85" dur="3s" repeatCount="indefinite" begin="0.3s"/>
            <animate attributeName="d" 
                     values="M62 48 Q90 44, 125 50 Q155 56, 178 70;M62 48 Q95 40, 130 45 Q162 50, 185 62;M62 48 Q90 44, 125 50 Q155 56, 178 70" 
                     dur="3s" repeatCount="indefinite" begin="0.3s"/>
          </path>
          
          <!-- Wave 3 - outer, most expansive -->
          <path d="M62 60 Q95 60, 135 70 Q170 80, 195 98" 
                stroke="url(#voiceWaveGradient)" stroke-width="3" stroke-linecap="round" fill="none">
            <animate attributeName="opacity" values="0.65;0.2;0.65" dur="3.5s" repeatCount="indefinite" begin="0.6s"/>
            <animate attributeName="d" 
                     values="M62 60 Q95 60, 135 70 Q170 80, 195 98;M62 60 Q100 56, 142 64 Q178 72, 205 88;M62 60 Q95 60, 135 70 Q170 80, 195 98" 
                     dur="3.5s" repeatCount="indefinite" begin="0.6s"/>
          </path>
        </g>
      </g>
      
      <!-- CENTER: The Wisdom Tree - organic and alive -->
      <g transform="translate(175, 25)">
        <!-- Tree shadow for grounding -->
        <ellipse cx="45" cy="220" rx="35" ry="8" fill="#2c2520" opacity="0.08"/>
        
        <!-- Trunk - organic, flowing form -->
        <path d="M45 215 
                 Q44 195, 42 175 
                 Q38 155, 42 135 
                 Q48 115, 44 95 
                 Q40 80, 45 65 
                 Q52 50, 45 35" 
              stroke="url(#trunkGradient)" stroke-width="12" stroke-linecap="round" fill="none" filter="url(#softShadow)"/>
        
        <!-- Main branches -->
        <path d="M43 110 Q28 95, 12 82" stroke="url(#trunkGradient)" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M47 100 Q62 85, 82 75" stroke="url(#trunkGradient)" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M44 80 Q30 65, 18 50" stroke="url(#trunkGradient)" stroke-width="5" stroke-linecap="round" fill="none"/>
        <path d="M46 70 Q60 55, 78 45" stroke="url(#trunkGradient)" stroke-width="5" stroke-linecap="round" fill="none"/>
        <path d="M45 55 Q35 42, 28 28" stroke="url(#trunkGradient)" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M45 50 Q55 38, 68 28" stroke="url(#trunkGradient)" stroke-width="4" stroke-linecap="round" fill="none"/>
        
        <!-- Roots - connecting to ground/past -->
        <g opacity="0.5">
          <path d="M45 215 Q30 225, 15 232" stroke="url(#trunkGradient)" stroke-width="5" stroke-linecap="round" fill="none"/>
          <path d="M45 215 Q55 228, 70 235" stroke="url(#trunkGradient)" stroke-width="4" stroke-linecap="round" fill="none"/>
          <path d="M45 215 Q40 230, 38 245" stroke="url(#trunkGradient)" stroke-width="3" stroke-linecap="round" fill="none"/>
        </g>
        
        <!-- Leaves - the canopy (each leaf = a journal entry) -->
        <g class="leaves" filter="url(#leafGlow)">
          <!-- Layer 1: Background leaves (deepest) -->
          <ellipse cx="5" cy="70" rx="16" ry="11" fill="url(#leafGradientC)" opacity="0.6" transform="rotate(-35 5 70)">
            <animate attributeName="opacity" values="0.5;0.7;0.5" dur="6s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="85" cy="65" rx="14" ry="10" fill="url(#leafGradientC)" opacity="0.6" transform="rotate(30 85 65)">
            <animate attributeName="opacity" values="0.55;0.75;0.55" dur="5.5s" repeatCount="indefinite"/>
          </ellipse>
          
          <!-- Layer 2: Mid leaves -->
          <ellipse cx="15" cy="55" rx="18" ry="12" fill="url(#leafGradientA)" opacity="0.75" transform="rotate(-25 15 55)">
            <animate attributeName="opacity" values="0.7;0.9;0.7" dur="5s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="35" cy="25" rx="20" ry="13" fill="url(#leafGradientB)" opacity="0.8" transform="rotate(10 35 25)">
            <animate attributeName="opacity" values="0.75;0.95;0.75" dur="4.5s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="60" cy="35" rx="17" ry="11" fill="url(#leafGradientA)" opacity="0.75" transform="rotate(-8 60 35)">
            <animate attributeName="opacity" values="0.7;0.88;0.7" dur="5.2s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="75" cy="55" rx="19" ry="12" fill="url(#leafGradientB)" opacity="0.78" transform="rotate(20 75 55)">
            <animate attributeName="opacity" values="0.72;0.92;0.72" dur="4.8s" repeatCount="indefinite"/>
          </ellipse>
          
          <!-- Layer 3: Front leaves (most vibrant) -->
          <ellipse cx="25" cy="42" rx="16" ry="10" fill="url(#leafGradientB)" opacity="0.85" transform="rotate(-15 25 42)">
            <animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="50" cy="18" rx="14" ry="9" fill="url(#leafGradientA)" opacity="0.88" transform="rotate(5 50 18)">
            <animate attributeName="opacity" values="0.82;0.98;0.82" dur="3.8s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="65" cy="48" rx="15" ry="10" fill="url(#leafGradientB)" opacity="0.82" transform="rotate(25 65 48)">
            <animate attributeName="opacity" values="0.78;0.95;0.78" dur="4.2s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="8" cy="85" rx="14" ry="9" fill="url(#leafGradientA)" opacity="0.7" transform="rotate(-40 8 85)">
            <animate attributeName="opacity" values="0.65;0.85;0.65" dur="5.5s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="82" cy="80" rx="15" ry="10" fill="url(#leafGradientB)" opacity="0.72" transform="rotate(35 82 80)">
            <animate attributeName="opacity" values="0.68;0.88;0.68" dur="5.8s" repeatCount="indefinite"/>
          </ellipse>
          
          <!-- Floating leaves - recent entries drifting in -->
          <g class="floating-leaves">
            <ellipse cx="105" cy="90" rx="10" ry="6" fill="url(#leafGradientA)" opacity="0.45" transform="rotate(50 105 90)">
              <animate attributeName="cy" values="90;82;90" dur="7s" repeatCount="indefinite"/>
              <animate attributeName="cx" values="105;100;105" dur="7s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.45;0.25;0.45" dur="7s" repeatCount="indefinite"/>
            </ellipse>
            <ellipse cx="-12" cy="45" rx="9" ry="5" fill="url(#leafGradientB)" opacity="0.4" transform="rotate(-45 -12 45)">
              <animate attributeName="cy" values="45;38;45" dur="8s" repeatCount="indefinite"/>
              <animate attributeName="cx" values="-12;-8;-12" dur="8s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.4;0.2;0.4" dur="8s" repeatCount="indefinite"/>
            </ellipse>
            <ellipse cx="95" cy="35" rx="8" ry="5" fill="url(#leafGradientC)" opacity="0.35" transform="rotate(60 95 35)">
              <animate attributeName="cy" values="35;28;35" dur="9s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.35;0.15;0.35" dur="9s" repeatCount="indefinite"/>
            </ellipse>
          </g>
        </g>
      </g>
      
      <!-- RIGHT: Mirror/Portal to Past Self -->
      <g transform="translate(305, 65)">
        <!-- Ethereal mirror glow -->
        <ellipse cx="40" cy="70" rx="50" ry="75" fill="url(#mirrorGradient)">
          <animate attributeName="opacity" values="0.6;0.8;0.6" dur="6s" repeatCount="indefinite"/>
        </ellipse>
        
        <!-- Mirror frame - delicate oval -->
        <ellipse cx="40" cy="70" rx="45" ry="68" fill="none" stroke="#b5a89a" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.5">
          <animate attributeName="stroke-dashoffset" values="0;20" dur="8s" repeatCount="indefinite"/>
        </ellipse>
        
        <!-- Past self figure - ethereal, softer -->
        <g filter="url(#etherealBlur)" opacity="0.5">
          <!-- Body silhouette -->
          <path d="M40 85 Q40 105, 33 125 Q30 138, 27 150" 
                stroke="#8a7a6a" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.5"/>
          <path d="M40 85 Q40 105, 47 125 Q50 138, 54 150" 
                stroke="#8a7a6a" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.5"/>
          
          <!-- Head -->
          <ellipse cx="40" cy="60" rx="16" ry="20" fill="#9a8a7a" opacity="0.4"/>
        </g>
        
        <!-- Connection wisps - linking present to past -->
        <g class="connection-wisps" opacity="0.4">
          <path d="M-30 70 Q-10 65, 5 68 Q15 72, 25 70" 
                stroke="#a67a6a" stroke-width="1.5" stroke-linecap="round" fill="none" stroke-dasharray="4 3">
            <animate attributeName="stroke-dashoffset" values="0;14" dur="3s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.4;0.2;0.4" dur="3s" repeatCount="indefinite"/>
          </path>
          <path d="M-25 85 Q-5 82, 10 86 Q22 90, 30 88" 
                stroke="#a67a6a" stroke-width="1" stroke-linecap="round" fill="none" stroke-dasharray="3 3">
            <animate attributeName="stroke-dashoffset" values="0;12" dur="4s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.35;0.15;0.35" dur="4s" repeatCount="indefinite"/>
          </path>
        </g>
      </g>
      
      <!-- Ambient sparkles - wisdom/insights emerging (more prominent) -->
      <g class="sparkles">
        <!-- Large sparkle near voice waves -->
        <g transform="translate(145, 55)">
          <circle r="3.5" fill="#c4a265" opacity="0">
            <animate attributeName="opacity" values="0;0.85;0" dur="4s" repeatCount="indefinite"/>
            <animate attributeName="r" values="2;4;2" dur="4s" repeatCount="indefinite"/>
          </circle>
          <!-- Cross sparkle effect -->
          <line x1="-6" y1="0" x2="6" y2="0" stroke="#c4a265" stroke-width="1" opacity="0">
            <animate attributeName="opacity" values="0;0.6;0" dur="4s" repeatCount="indefinite"/>
          </line>
          <line x1="0" y1="-6" x2="0" y2="6" stroke="#c4a265" stroke-width="1" opacity="0">
            <animate attributeName="opacity" values="0;0.6;0" dur="4s" repeatCount="indefinite"/>
          </line>
        </g>
        
        <!-- Sparkle near tree top -->
        <circle cx="255" cy="45" r="3" fill="#c4a265" opacity="0">
          <animate attributeName="opacity" values="0;0.75;0" dur="5s" repeatCount="indefinite" begin="1s"/>
          <animate attributeName="r" values="1.5;3.5;1.5" dur="5s" repeatCount="indefinite" begin="1s"/>
        </circle>
        
        <!-- Sparkle near mirror -->
        <circle cx="345" cy="90" r="2.5" fill="#c4a265" opacity="0">
          <animate attributeName="opacity" values="0;0.65;0" dur="4.5s" repeatCount="indefinite" begin="2s"/>
          <animate attributeName="r" values="1.5;3;1.5" dur="4.5s" repeatCount="indefinite" begin="2s"/>
        </circle>
        
        <!-- Sparkle on timeline -->
        <circle cx="335" cy="250" r="3" fill="#c4a265" opacity="0">
          <animate attributeName="opacity" values="0;0.7;0" dur="5.5s" repeatCount="indefinite" begin="0.5s"/>
          <animate attributeName="r" values="2;4;2" dur="5.5s" repeatCount="indefinite" begin="0.5s"/>
        </circle>
        
        <!-- Small ambient sparkles -->
        <circle cx="95" cy="130" r="2" fill="#c4a265" opacity="0">
          <animate attributeName="opacity" values="0;0.5;0" dur="6s" repeatCount="indefinite" begin="3s"/>
        </circle>
        <circle cx="175" cy="200" r="1.5" fill="#c4a265" opacity="0">
          <animate attributeName="opacity" values="0;0.45;0" dur="7s" repeatCount="indefinite" begin="1.5s"/>
        </circle>
      </g>
      
      <!-- Timeline at bottom - elegant journey visualization -->
      <g transform="translate(50, 250)">
        <!-- Soft glow behind timeline -->
        <ellipse cx="150" cy="0" rx="140" ry="12" fill="url(#glowGradient)" opacity="0.3"/>
        
        <!-- Connecting line - organic curve -->
        <path d="M10 0 Q80 -3, 150 0 Q220 3, 290 0" stroke="#4a6741" stroke-width="2" opacity="0.2" fill="none"/>
        
        <!-- Time dots - growing toward present with varied sizes -->
        <circle cx="15" cy="0" r="4" fill="#4a6741" opacity="0.28"/>
        <circle cx="50" cy="-1" r="4.5" fill="#4a6741" opacity="0.35"/>
        <circle cx="85" cy="0" r="5" fill="#4a6741" opacity="0.45"/>
        <circle cx="120" cy="1" r="5.5" fill="#4a6741" opacity="0.55"/>
        <circle cx="160" cy="0" r="6" fill="#4a6741" opacity="0.65"/>
        <circle cx="200" cy="-1" r="6.5" fill="#4a6741" opacity="0.75"/>
        <circle cx="240" cy="0" r="7.5" fill="#4a6741" opacity="0.88"/>
        
        <!-- Present moment - pulsing, prominent -->
        <circle cx="285" cy="0" r="9" fill="#4a6741">
          <animate attributeName="r" values="9;11;9" dur="2.5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0.85;1" dur="2.5s" repeatCount="indefinite"/>
        </circle>
        <!-- Glow ring around present -->
        <circle cx="285" cy="0" r="14" fill="none" stroke="#4a6741" stroke-width="1.5" opacity="0">
          <animate attributeName="opacity" values="0;0.4;0" dur="2.5s" repeatCount="indefinite"/>
          <animate attributeName="r" values="12;18;12" dur="2.5s" repeatCount="indefinite"/>
        </circle>
      </g>
    </svg>
  `,
  voice:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  time:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  sparkle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  play:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  chevronRight:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>',
  reflection:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  memories:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
  conversation:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  flame:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  capture:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="M2 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="M12 22v-4"/><path d="m19.07 19.07-2.83-2.83"/><path d="M22 12h-4"/><path d="m19.07 4.93-2.83 2.83"/><circle cx="12" cy="12" r="4"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let twins: CustomAgent[] = [];
let isLoading = false;

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .digital-twin-modal {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
  }

  .digital-twin-modal.open {
    opacity: 1;
    pointer-events: auto;
  }

  .digital-twin-modal__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
  }

  .digital-twin-modal__container {
    position: relative;
    width: min(90vw, 640px);
    max-height: 90vh;
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-xl, 20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.95) translateY(10px);
    transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
  }

  .digital-twin-modal.open .digital-twin-modal__container {
    transform: scale(1) translateY(0);
  }

  /* Header */
  .digital-twin-modal__header {
    padding: var(--space-6, 24px) var(--space-6, 24px) var(--space-4, 16px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    text-align: center;
    position: relative;
  }

  .digital-twin-modal__close {
    position: absolute;
    top: var(--space-4, 16px);
    right: var(--space-4, 16px);
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--color-text-muted, #7a6f63);
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-modal__close:hover {
    background: var(--color-background-hover, rgba(44, 37, 32, 0.05));
    color: var(--color-text-primary, #2c2520);
  }

  .digital-twin-modal__close svg {
    width: 20px;
    height: 20px;
  }

  .digital-twin-modal__eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-accent, #3d5a45);
    margin-bottom: var(--space-2, 8px);
  }

  .digital-twin-modal__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: clamp(24px, 4vw, 28px);
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    line-height: 1.2;
    margin: 0;
  }

  .digital-twin-modal__subtitle {
    font-size: 15px;
    color: var(--color-text-secondary, #5a5048);
    margin-top: var(--space-2, 8px);
    line-height: 1.5;
  }

  /* Content */
  .digital-twin-modal__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4, 16px) var(--space-6, 24px) var(--space-6, 24px);
  }

  /* Onboarding state - no twins yet */
  .digital-twin-onboarding {
    text-align: center;
    padding: var(--space-2, 8px) 0 var(--space-6, 24px);
  }

  /* Hero illustration - premium "Better than Human" quality */
  .digital-twin-hero {
    width: 100%;
    max-width: 420px;
    margin: 0 auto var(--space-5, 20px);
    border-radius: var(--radius-2xl, 24px);
    overflow: hidden;
    background: linear-gradient(145deg, #fdfcfa 0%, #f3efe8 100%);
    box-shadow: 
      0 8px 40px rgba(74, 103, 65, 0.1),
      0 4px 16px rgba(44, 37, 32, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(74, 103, 65, 0.08);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 0.4s ease;
  }

  .digital-twin-hero:hover {
    transform: translateY(-2px);
    box-shadow: 
      0 12px 50px rgba(74, 103, 65, 0.14),
      0 6px 20px rgba(44, 37, 32, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }

  .digital-twin-hero svg {
    width: 100%;
    height: auto;
    display: block;
  }

  /* Respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .digital-twin-hero {
      transition: none;
    }
    .digital-twin-hero:hover {
      transform: none;
    }
    .digital-twin-hero svg * {
      animation: none !important;
    }
  }

  /* Legacy icon style kept for fallback */
  .digital-twin-onboarding__icon {
    width: 80px;
    height: 80px;
    margin: 0 auto var(--space-6, 24px);
    background: linear-gradient(135deg, var(--color-accent, #3d5a45), var(--color-ferni, #4a6741));
    border-radius: var(--radius-2xl, 24px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .digital-twin-onboarding__icon svg {
    width: 40px;
    height: 40px;
  }

  .digital-twin-onboarding__heading {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-3, 12px);
  }

  .digital-twin-onboarding__description {
    font-size: 15px;
    color: var(--color-text-secondary, #5a5048);
    line-height: 1.6;
    max-width: min(400px, 100%);
    margin: 0 auto var(--space-6, 24px);
  }

  /* Feature list */
  .digital-twin-features {
    display: grid;
    gap: var(--space-3, 12px);
    text-align: left;
    margin: var(--space-6, 24px) 0;
  }

  .digital-twin-feature {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3, 12px);
    padding: var(--space-4, 16px);
    background: var(--color-background-subtle, rgba(44, 37, 32, 0.03));
    border-radius: var(--radius-lg, 12px);
  }

  .digital-twin-feature__icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.1));
    color: var(--color-accent, #3d5a45);
    border-radius: var(--radius-md, 8px);
  }

  .digital-twin-feature__icon svg {
    width: 18px;
    height: 18px;
  }

  .digital-twin-feature__text h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-1, 4px);
  }

  .digital-twin-feature__text p {
    font-size: 13px;
    color: var(--color-text-secondary, #5a5048);
    margin: 0;
    line-height: 1.5;
  }

  /* Twin cards */
  .digital-twin-list {
    display: grid;
    gap: var(--space-3, 12px);
  }

  .digital-twin-card {
    display: flex;
    align-items: center;
    gap: var(--space-4, 16px);
    padding: var(--space-4, 16px);
    background: var(--color-background-elevated, #fffdfb);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-lg, 12px);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-card:hover {
    border-color: var(--color-accent, #3d5a45);
    box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
    transform: translateY(-2px);
  }

  .digital-twin-card__avatar {
    width: 52px;
    height: 52px;
    flex-shrink: 0;
    background: linear-gradient(135deg, var(--color-accent, #3d5a45), var(--color-ferni, #4a6741));
    border-radius: var(--radius-lg, 12px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    position: relative;
  }

  .digital-twin-card__avatar > svg:first-child {
    width: 24px;
    height: 24px;
  }

  /* Streak badge */
  .digital-twin-card__streak {
    position: absolute;
    bottom: -6px;
    right: -6px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 6px;
    background: linear-gradient(135deg, #f59e0b, #ea580c);
    color: white;
    font-size: 11px;
    font-weight: 700;
    border-radius: var(--radius-full, 9999px);
    box-shadow: 0 2px 4px rgba(234, 88, 12, 0.3);
    white-space: nowrap;
  }

  .digital-twin-card__streak svg {
    width: 12px;
    height: 12px;
  }

  .digital-twin-card__info {
    flex: 1;
    min-width: 0;
  }

  .digital-twin-card__name {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-1, 4px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .digital-twin-card__meta {
    font-size: 13px;
    color: var(--color-text-muted, #7a6f63);
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
  }

  .digital-twin-card__stat {
    display: flex;
    align-items: center;
    gap: var(--space-1, 4px);
  }

  .digital-twin-card__stat svg {
    width: 14px;
    height: 14px;
  }

  .digital-twin-card__action {
    flex-shrink: 0;
    color: var(--color-accent, #3d5a45);
  }

  .digital-twin-card__action svg {
    width: 20px;
    height: 20px;
  }

  /* Create button */
  .digital-twin-create-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    padding: var(--space-4, 16px) var(--space-6, 24px);
    background: linear-gradient(135deg, var(--color-accent, #3d5a45), var(--color-ferni, #4a6741));
    color: white;
    font-size: 15px;
    font-weight: 600;
    border: none;
    border-radius: var(--radius-lg, 12px);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-create-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px -4px var(--color-accent-glow, rgba(61, 90, 69, 0.4));
  }

  .digital-twin-create-btn svg {
    width: 18px;
    height: 18px;
  }

  /* Add new twin button (when twins exist) */
  .digital-twin-add-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px);
    background: transparent;
    color: var(--color-accent, #3d5a45);
    font-size: 14px;
    font-weight: 500;
    border: 1px dashed var(--color-accent, #3d5a45);
    border-radius: var(--radius-lg, 12px);
    cursor: pointer;
    margin-top: var(--space-3, 12px);
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-add-btn:hover {
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.1));
  }

  .digital-twin-add-btn svg {
    width: 16px;
    height: 16px;
  }

  /* Section headers */
  .digital-twin-section-header {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-text-muted, #7a6f63);
    margin-bottom: var(--space-3, 12px);
    padding-left: var(--space-1, 4px);
  }

  /* Auto-capture card */
  .digital-twin-capture-card {
    background: var(--color-background-subtle, rgba(44, 37, 32, 0.03));
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-4, 16px);
    margin-bottom: var(--space-4, 16px);
  }

  .digital-twin-capture-card--enabled {
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
    border-color: var(--color-accent, #3d5a45);
  }

  .digital-twin-capture-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2, 8px);
  }

  .digital-twin-capture-title {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .digital-twin-capture-title svg {
    width: 18px;
    height: 18px;
    color: var(--color-accent, #3d5a45);
  }

  .digital-twin-capture-title h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0;
  }

  .digital-twin-capture-description {
    font-size: 13px;
    color: var(--color-text-secondary, #5a5048);
    line-height: 1.5;
    margin: 0;
  }

  /* Toggle switch */
  .digital-twin-toggle {
    position: relative;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .digital-twin-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .digital-twin-toggle-track {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: var(--color-border-subtle, rgba(44, 37, 32, 0.2));
    border-radius: var(--radius-full, 9999px);
    transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-toggle-track::before {
    content: '';
    position: absolute;
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background: white;
    border-radius: 50%;
    transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .digital-twin-toggle input:checked + .digital-twin-toggle-track {
    background: var(--color-accent, #3d5a45);
  }

  .digital-twin-toggle input:checked + .digital-twin-toggle-track::before {
    transform: translateX(20px);
  }

  .digital-twin-toggle input:focus-visible + .digital-twin-toggle-track {
    outline: 2px solid var(--color-accent, #3d5a45);
    outline-offset: 2px;
  }

  /* Consent card (first-time setup) */
  .digital-twin-consent {
    background: linear-gradient(135deg, var(--color-accent-subtle, rgba(61, 90, 69, 0.1)), transparent);
    border: 1px solid var(--color-accent, #3d5a45);
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-5, 20px);
    margin-bottom: var(--space-4, 16px);
    text-align: center;
  }

  .digital-twin-consent__icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-3, 12px);
    background: var(--color-accent, #3d5a45);
    border-radius: var(--radius-lg, 12px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .digital-twin-consent__icon svg {
    width: 24px;
    height: 24px;
  }

  .digital-twin-consent h4 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-2, 8px);
  }

  .digital-twin-consent p {
    font-size: 14px;
    color: var(--color-text-secondary, #5a5048);
    line-height: 1.6;
    margin: 0 0 var(--space-4, 16px);
    max-width: min(320px, 100%);
    margin-left: auto;
    margin-right: auto;
  }

  .digital-twin-consent__btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px) var(--space-5, 20px);
    background: var(--color-accent, #3d5a45);
    color: white;
    font-size: 14px;
    font-weight: 600;
    border: none;
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-consent__btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px var(--color-accent-glow, rgba(61, 90, 69, 0.3));
  }

  .digital-twin-consent__btn svg {
    width: 16px;
    height: 16px;
  }

  .digital-twin-consent__skip {
    display: block;
    margin-top: var(--space-3, 12px);
    font-size: 13px;
    color: var(--color-text-muted, #7a6f63);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .digital-twin-consent__skip:hover {
    color: var(--color-text-secondary, #5a5048);
  }

  /* Loading state */
  .digital-twin-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12, 48px) 0;
    gap: var(--space-3, 12px);
    color: var(--color-text-muted, #7a6f63);
  }

  .digital-twin-loading__spinner {
    width: 32px;
    height: 32px;
    border: 2px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
    border-top-color: var(--color-accent, #3d5a45);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Dark theme overrides */
  [data-theme="dark"] .digital-twin-modal__container,
  [data-theme="zen"] .digital-twin-modal__container {
    background: var(--color-background-elevated, #3a3530);
  }

  [data-theme="dark"] .digital-twin-card,
  [data-theme="zen"] .digital-twin-card {
    background: var(--color-background-subtle, rgba(255, 255, 255, 0.05));
    border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="dark"] .digital-twin-card:hover,
  [data-theme="zen"] .digital-twin-card:hover {
    border-color: var(--color-accent, #5a8a62);
  }

  [data-theme="dark"] .digital-twin-feature,
  [data-theme="zen"] .digital-twin-feature {
    background: var(--color-background-subtle, rgba(255, 255, 255, 0.05));
  }

  /* Responsive */
  @media (max-width: clamp(336px, 90vw, 480px)) {
    .digital-twin-modal__container {
      width: 100%;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
    }

    .digital-twin-features {
      gap: var(--space-2, 8px);
    }

    .digital-twin-feature {
      padding: var(--space-3, 12px);
    }
  }
`;

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderOnboarding(): string {
  return `
    <div class="digital-twin-onboarding">
      <div class="digital-twin-hero">
        ${ICONS.heroIllustration}
      </div>
      <h3 class="digital-twin-onboarding__heading">Your Voice, Your Story</h3>
      <p class="digital-twin-onboarding__description">
        A Digital Twin is your personal voice journal. Record your thoughts, 
        capture your wisdom, and one day, talk to your past self.
      </p>

      <div class="digital-twin-features">
        <div class="digital-twin-feature">
          <div class="digital-twin-feature__icon">${ICONS.voice}</div>
          <div class="digital-twin-feature__text">
            <h4>Record Daily Journals</h4>
            <p>Speak your thoughts aloud. Your voice captures nuance that text never could.</p>
          </div>
        </div>
        <div class="digital-twin-feature">
          <div class="digital-twin-feature__icon">${ICONS.time}</div>
          <div class="digital-twin-feature__text">
            <h4>Talk to Your Past Self</h4>
            <p>Your entries become a conversation partner, reflecting your growth over time.</p>
          </div>
        </div>
        <div class="digital-twin-feature">
          <div class="digital-twin-feature__icon">${ICONS.sparkle}</div>
          <div class="digital-twin-feature__text">
            <h4>Discover Patterns</h4>
            <p>See trends in your moods, track streaks, and gain insights from your own wisdom.</p>
          </div>
        </div>
      </div>

      <button aria-label="${t('accessibility.add')}" class="digital-twin-create-btn" data-action="create">
        ${ICONS.plus}
        Create Your Digital Twin
      </button>
    </div>
  `;
}

function renderTwinsList(): string {
  const twinCards = twins
    .map((twin) => {
      // Calculate entry count from journal entries
      const journalEntries = twin.memories?.journalEntries || [];
      const entryCount = journalEntries.length;
      
      // Calculate streak
      const streak = calculateStreak(journalEntries);
      
      // Find most recent entry date
      const lastEntryDate = journalEntries.length > 0
        ? journalEntries
            .map(e => new Date(e.createdAt))
            .sort((a, b) => b.getTime() - a.getTime())[0]
        : null;
      const lastEntry = lastEntryDate
        ? formatRelativeDate(lastEntryDate)
        : 'No entries yet';

      // Streak badge (only show if streak > 0)
      const streakBadge = streak > 0
        ? `<span class="digital-twin-card__streak" title="${streak} day streak">
             ${ICONS.flame}
             ${streak}
           </span>`
        : '';

      return `
        <button aria-label="${t('accessibility.goForward')}" class="digital-twin-card" data-twin-id="${twin.id}">
          <div class="digital-twin-card__avatar">
            ${ICONS.journal}
            ${streakBadge}
          </div>
          <div class="digital-twin-card__info">
            <h4 class="digital-twin-card__name">${twin.displayName || twin.name}</h4>
            <div class="digital-twin-card__meta">
              <span class="digital-twin-card__stat">
                ${ICONS.memories}
                ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}
              </span>
              <span class="digital-twin-card__stat">
                ${ICONS.calendar}
                ${lastEntry}
              </span>
            </div>
          </div>
          <div class="digital-twin-card__action" role="button" tabindex="0">
            ${ICONS.chevronRight}
          </div>
        </button>
      `;
    })
    .join('');

  return `
    ${renderAutoCaptureCard()}
    <div class="digital-twin-section-header">Your Journals</div>
    <div class="digital-twin-list">
      ${twinCards}
    </div>
    <button aria-label="${t('accessibility.add')}" class="digital-twin-add-btn" data-action="create">
      ${ICONS.plus}
      Create Another Journal
    </button>
  `;
}

/**
 * Render the auto-capture toggle card
 * Shows consent prompt if never enabled, or toggle if already set up
 */
function renderAutoCaptureCard(): string {
  const settings = loadCaptureSettings();
  const hasConsented = settings.consentDate != null;
  const isEnabled = settings.enabled;

  // First-time consent flow
  if (!hasConsented) {
    return `
      <div class="digital-twin-consent">
        <div class="digital-twin-consent__icon">
          ${ICONS.capture}
        </div>
        <h4>Capture Moments Automatically</h4>
        <p>
          I can remember the meaningful moments from our conversations - 
          breakthroughs, decisions, gratitude - and add them to your journal. 
          You're always in control.
        </p>
        <button aria-label="${t('accessibility.confirm')}" class="digital-twin-consent__btn" data-action="enable-capture">
          ${ICONS.check}
          Yes, remember what matters
        </button>
        <button aria-label="${t('accessibility.maybeLater')}" class="digital-twin-consent__skip" data-action="skip-capture">
          Maybe later
        </button>
      </div>
    `;
  }

  // Toggle card (after consent)
  return `
    <div class="digital-twin-capture-card ${isEnabled ? 'digital-twin-capture-card--enabled' : ''}">
      <div class="digital-twin-capture-header">
        <div class="digital-twin-capture-title">
          ${ICONS.capture}
          <h4>Auto-Capture Moments</h4>
        </div>
        <label class="digital-twin-toggle">
          <input type="checkbox" ${isEnabled ? 'checked' : ''} data-action="toggle-capture" />
          <span class="digital-twin-toggle-track" role="button" tabindex="0"></span>
        </label>
      </div>
      <p class="digital-twin-capture-description">
        ${isEnabled 
          ? "I'm listening for meaningful moments in our conversations and adding them to your journal."
          : "When enabled, I'll capture breakthroughs, decisions, and insights from our chats."
        }
      </p>
    </div>
  `;
}

function renderLoading(): string {
  return `
    <div class="digital-twin-loading">
      <div class="digital-twin-loading__spinner"></div>
      <span>Loading your journals...</span>
    </div>
  `;
}

function renderContent(): string {
  if (isLoading) {
    return renderLoading();
  }

  if (twins.length === 0) {
    return renderOnboarding();
  }

  return renderTwinsList();
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Calculate journaling streak from entries
 * A streak is consecutive days with at least one entry
 */
function calculateStreak(entries: Array<{ createdAt: string }>): number {
  if (entries.length === 0) return 0;

  // Get unique dates (normalized to day start)
  const entryDates = entries
    .map((e) => {
      const d = new Date(e.createdAt);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    })
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .sort((a, b) => b - a); // newest first

  if (entryDates.length === 0) return 0;

  const today = new Date();
  const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yesterday = todayNormalized - 24 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Check if most recent entry is today or yesterday (streak is active)
  const mostRecent = entryDates[0];
  if (mostRecent !== todayNormalized && mostRecent !== yesterday) {
    return 0; // Streak broken
  }

  // Count consecutive days
  let streak = 1;
  let currentDate = mostRecent;

  for (let i = 1; i < entryDates.length; i++) {
    const entryDate = entryDates[i];
    if (entryDate === undefined) break;
    const expectedPrev = currentDate - oneDayMs;
    if (entryDate === expectedPrev) {
      streak++;
      currentDate = entryDate;
    } else {
      break; // Gap found, streak ends
    }
  }

  return streak;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

function ensureModalExists(): HTMLElement {
  if (modal) return modal;

  // Inject styles
  if (!document.getElementById('digital-twin-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'digital-twin-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  // Create modal
  modal = document.createElement('div');
  modal.className = 'digital-twin-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'digital-twin-title');

  modal.innerHTML = `
    <div class="digital-twin-modal__backdrop"></div>
    <div class="digital-twin-modal__container">
      <header class="digital-twin-modal__header">
        <button class="digital-twin-modal__close" aria-label="${t('accessibility.close')}">
          ${ICONS.close}
        </button>
        <div class="digital-twin-modal__eyebrow">Your Journey</div>
        <h2 class="digital-twin-modal__title" id="digital-twin-title">Voice Journal</h2>
        <p class="digital-twin-modal__subtitle">Capture your thoughts, wisdom, and growth</p>
      </header>
      <div class="digital-twin-modal__content">
        ${renderContent()}
      </div>
    </div>
  `;

  // Event listeners
  const backdrop = modal.querySelector('.digital-twin-modal__backdrop');
  const closeBtn = modal.querySelector('.digital-twin-modal__close');

  backdrop?.addEventListener('click', closeDigitalTwinUI);
  closeBtn?.addEventListener('click', closeDigitalTwinUI);

  // Close on Escape
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDigitalTwinUI();
  });

  // Delegate click events
  modal.addEventListener('click', handleClick);

  document.body.appendChild(modal);
  return modal;
}

function updateContent(): void {
  if (!modal) return;

  const content = modal.querySelector('.digital-twin-modal__content');
  if (content) {
    content.innerHTML = renderContent();
  }
}

async function handleClick(e: Event): Promise<void> {
  const target = e.target as HTMLElement;

  // Create new twin
  const createBtn = target.closest('[data-action="create"]');
  if (createBtn) {
    e.preventDefault();
    closeDigitalTwinUI();
    // Open wizard pre-configured for Digital Twin
    openCustomAgentWizard({ preselectedType: 'twin' });
    return;
  }

  // Enable auto-capture (consent)
  const enableCaptureBtn = target.closest('[data-action="enable-capture"]');
  if (enableCaptureBtn) {
    e.preventDefault();
    enableJournalCapture();
    updateContent();
    soundUI.play('success');
    
    // Show confirmation toast
    const { toast } = await import('./whisper.ui.js');
    toast.success("I'll remember what matters");
    return;
  }

  // Skip auto-capture consent
  const skipCaptureBtn = target.closest('[data-action="skip-capture"]');
  if (skipCaptureBtn) {
    e.preventDefault();
    // Mark as seen but not enabled (so we don't show consent again)
    const settings = loadCaptureSettings();
    settings.consentDate = new Date().toISOString();
    settings.enabled = false;
    saveCaptureSettings(settings);
    updateContent();
    return;
  }

  // Toggle auto-capture
  const toggleCapture = target.closest<HTMLInputElement>('[data-action="toggle-capture"]');
  if (toggleCapture) {
    const isEnabled = toggleCapture.checked;
    if (isEnabled) {
      enableJournalCapture();
    } else {
      disableJournalCapture();
    }
    updateContent();
    soundUI.play('click');
    return;
  }

  // Open existing twin's journal
  const twinCard = target.closest<HTMLElement>('[data-twin-id]');
  if (twinCard) {
    const twinId = twinCard.dataset.twinId;
    if (twinId) {
      e.preventDefault();
      closeDigitalTwinUI();
      await openVoiceJournal(twinId);
    }
    return;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Digital Twin experience
 * Shows existing twins or onboarding if none exist
 */
export async function openDigitalTwinUI(): Promise<void> {
  const modalEl = ensureModalExists();

  // Show loading state
  isLoading = true;
  updateContent();

  // Show modal
  modalEl.classList.add('open');
  document.body.style.overflow = 'hidden';
  soundUI.play('switch');

  try {
    // Load user's Digital Twins
    const agents = await listCustomAgents();
    twins = agents.filter((a) => a.type === 'twin');
    isLoading = false;
    updateContent();

    log.info(`Loaded ${twins.length} Digital Twins`);
  } catch (error) {
    log.error('Failed to load Digital Twins:', error);
    isLoading = false;
    twins = [];
    updateContent();

    const { toast } = await import('./whisper.ui.js');
    toast.error(t('toasts.couldNotLoadJournals'));
  }
}

/**
 * Close the Digital Twin UI
 */
export function closeDigitalTwinUI(): void {
  if (!modal) return;

  modal.classList.remove('open');
  document.body.style.overflow = '';
  soundUI.play('switch');

  // Reset state
  twins = [];
  isLoading = false;
}

/**
 * Check if the Digital Twin UI is open
 */
export function isDigitalTwinUIOpen(): boolean {
  return modal?.classList.contains('open') ?? false;
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

let keyboardShortcutInitialized = false;

/**
 * Initialize keyboard shortcut for quick access to journaling
 * Cmd+J (Mac) / Ctrl+J (Windows/Linux) opens the journal
 */
export function initJournalingShortcut(): void {
  if (keyboardShortcutInitialized) return;
  keyboardShortcutInitialized = true;

  document.addEventListener('keydown', (e) => {
    // Cmd+J (Mac) or Ctrl+J (Windows/Linux)
    // Don't trigger if user is typing in an input field
    const target = e.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyJ' && !isTyping) {
      e.preventDefault();
      
      // Toggle: if open, close; if closed, open
      if (isDigitalTwinUIOpen()) {
        closeDigitalTwinUI();
      } else {
        void openDigitalTwinUI();
      }
    }
  });

  log.info('Journaling shortcut initialized (Cmd/Ctrl+J to open)');
}

// ============================================================================
// AUTO-CLEANUP ON HMR
// ============================================================================

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    modal?.remove();
    modal = null;
    keyboardShortcutInitialized = false;
    document.getElementById('digital-twin-styles')?.remove();
  });
}

