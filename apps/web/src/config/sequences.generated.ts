/**
 * Motion Sequences - Auto-Generated
 * 🎬 AUTO-GENERATED FROM design-system/tokens/sequences.json
 * Do not edit directly - run: pnpm build:sequences
 *
 * 19 sequences. Each step animates one element after `delay` ms; a sequence has
 * at most one sound and one haptic, so a moment never stacks chimes or buzzes.
 */

export type SequenceId =
  | 'onboarding_reveal'
  | 'connection_establishing'
  | 'connection_success'
  | 'handoff_transition'
  | 'celebration_small'
  | 'celebration_big'
  | 'streak_milestone'
  | 'deep_moment'
  | 'session_end'
  | 'team_unlock'
  | 'error_recovery'
  | 'arrival_calling'
  | 'arrival_slow'
  | 'arrival_very_slow'
  | 'arrival_joined'
  | 'arrival_ready'
  | 'arrival_speaking'
  | 'arrival_listening'
  | 'arrival_failed';

export interface SequenceStep {
  readonly element: string;
  readonly animation: string;
  readonly delay: number;
  readonly duration: number;
  readonly easing?: string;
  readonly stagger?: number;
  readonly repeat?: number;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly description?: string;
  /** Older sequences carry extra, free-form keys. */
  readonly [extra: string]: unknown;
}

export interface Sequence {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly trigger: string;
  readonly totalDuration: number;
  readonly interruptible: boolean;
  readonly emotion?: string;
  readonly steps: readonly SequenceStep[];
  readonly sound?: { readonly track: string; readonly delay: number; readonly volume?: number; readonly [extra: string]: unknown };
  readonly haptic?: { readonly pattern: string; readonly delay: number; readonly [extra: string]: unknown };
  readonly [extra: string]: unknown;
}

export interface ReducedMotionSimplification {
  readonly description?: string;
  readonly replaceWith?: readonly Partial<SequenceStep>[];
  readonly removeSteps?: readonly string[];
  readonly modifySteps?: Readonly<Record<string, Partial<SequenceStep>>>;
  readonly [extra: string]: unknown;
}

export const SEQUENCES: Readonly<Record<SequenceId, Sequence>> = {
  "onboarding_reveal": {
    "id": "onboarding_reveal",
    "name": "First Meeting",
    "description": "First-time user sees Ferni for the first time - our most important moment",
    "trigger": "first_app_open",
    "totalDuration": 4500,
    "interruptible": false,
    "emotion": "welcoming",
    "steps": [
      {
        "element": "backdrop",
        "animation": "fadeIn",
        "delay": 0,
        "duration": 800,
        "easing": "expoOut",
        "properties": {
          "opacity": [
            0,
            1
          ]
        },
        "description": "Warm backdrop fades in"
      },
      {
        "element": "avatar",
        "animation": "breatheIn",
        "delay": 400,
        "duration": 1200,
        "easing": "gentle",
        "properties": {
          "scale": [
            0.8,
            1
          ],
          "opacity": [
            0,
            1
          ],
          "filter": [
            "blur(10px)",
            "blur(0)"
          ]
        },
        "description": "Avatar materializes with soft breath"
      },
      {
        "element": "avatarGlow",
        "animation": "pulseIn",
        "delay": 600,
        "duration": 1000,
        "easing": "gentle",
        "properties": {
          "opacity": [
            0,
            0.6
          ],
          "scale": [
            0.9,
            1.05,
            1
          ]
        },
        "description": "Persona glow awakens"
      },
      {
        "element": "greeting",
        "animation": "typewriter",
        "delay": 1600,
        "duration": 1500,
        "easing": "linear",
        "properties": {
          "text": "Hey. I'm Ferni.",
          "speed": 50
        },
        "description": "Greeting types out naturally"
      },
      {
        "element": "cta",
        "animation": "fadeSlideUp",
        "delay": 3500,
        "duration": 400,
        "easing": "spring",
        "properties": {
          "opacity": [
            0,
            1
          ],
          "translateY": [
            16,
            0
          ]
        },
        "description": "CTA appears, inviting conversation"
      }
    ],
    "sound": {
      "track": "system.startup",
      "delay": 300,
      "volume": 0.7
    },
    "haptic": {
      "pattern": "warmWelcome",
      "delay": 500
    }
  },
  "connection_establishing": {
    "id": "connection_establishing",
    "name": "Reaching Out",
    "description": "Voice connection being established",
    "trigger": "connection_start",
    "totalDuration": 2000,
    "interruptible": false,
    "emotion": "anticipatory",
    "steps": [
      {
        "element": "avatar",
        "animation": "anticipate",
        "delay": 0,
        "duration": 200,
        "easing": "anticipate",
        "properties": {
          "scale": [
            1,
            0.97
          ]
        },
        "description": "Brief anticipation"
      },
      {
        "element": "connectionRing",
        "animation": "pulseGrow",
        "delay": 200,
        "duration": 800,
        "easing": "expoOut",
        "properties": {
          "scale": [
            0,
            1.5
          ],
          "opacity": [
            0.5,
            0
          ]
        },
        "repeat": 3,
        "stagger": 400,
        "description": "Ripples emanate from avatar"
      },
      {
        "element": "statusText",
        "animation": "fadeIn",
        "delay": 100,
        "duration": 300,
        "properties": {
          "opacity": [
            0,
            1
          ],
          "text": "Connecting..."
        }
      }
    ],
    "sound": {
      "track": "system.connecting",
      "delay": 0,
      "loop": true,
      "fadeOutOnComplete": true
    }
  },
  "connection_success": {
    "id": "connection_success",
    "name": "We're Connected",
    "description": "Voice connection successfully established",
    "trigger": "livekit_connected",
    "totalDuration": 1200,
    "interruptible": true,
    "emotion": "reassuring",
    "steps": [
      {
        "element": "avatar",
        "animation": "settleBounce",
        "delay": 0,
        "duration": 500,
        "easing": "spring",
        "properties": {
          "scale": [
            0.97,
            1.03,
            1
          ],
          "translateY": [
            0,
            -4,
            0
          ]
        },
        "description": "Satisfying arrival bounce"
      },
      {
        "element": "avatarGlow",
        "animation": "pulse",
        "delay": 100,
        "duration": 600,
        "easing": "gentle",
        "properties": {
          "opacity": [
            0.6,
            1,
            0.7
          ],
          "scale": [
            1,
            1.15,
            1
          ]
        },
        "description": "Glow pulses with life"
      },
      {
        "element": "statusText",
        "animation": "swap",
        "delay": 200,
        "duration": 300,
        "properties": {
          "text": "Connected",
          "color": "var(--color-semantic-success)"
        }
      },
      {
        "element": "waveform",
        "animation": "fadeIn",
        "delay": 400,
        "duration": 400,
        "easing": "decelerate",
        "properties": {
          "opacity": [
            0,
            1
          ]
        },
        "description": "Waveform appears, ready to listen"
      }
    ],
    "sound": {
      "track": "system.connectionSuccess",
      "delay": 0,
      "volume": 0.8
    },
    "haptic": {
      "pattern": "presence",
      "delay": 100
    }
  },
  "handoff_transition": {
    "id": "handoff_transition",
    "name": "Passing the Conversation",
    "description": "One persona hands off to another",
    "trigger": "persona_switch",
    "totalDuration": 2200,
    "interruptible": false,
    "emotion": "transitioning",
    "steps": [
      {
        "element": "currentAvatar",
        "animation": "fadeGlow",
        "delay": 0,
        "duration": 400,
        "easing": "accelerate",
        "properties": {
          "opacity": [
            1,
            0
          ],
          "scale": [
            1,
            0.9
          ],
          "filter": [
            "blur(0)",
            "blur(8px)"
          ]
        },
        "description": "Current persona gently fades"
      },
      {
        "element": "transitionGlow",
        "animation": "colorShift",
        "delay": 200,
        "duration": 800,
        "easing": "gentle",
        "properties": {
          "backgroundColor": [
            "var(--prev-persona-primary)",
            "var(--next-persona-primary)"
          ],
          "opacity": [
            0.3,
            0.6,
            0.3
          ]
        },
        "description": "Color transitions between personas"
      },
      {
        "element": "newAvatar",
        "animation": "breatheIn",
        "delay": 700,
        "duration": 800,
        "easing": "spring",
        "properties": {
          "opacity": [
            0,
            1
          ],
          "scale": [
            0.9,
            1.02,
            1
          ],
          "filter": [
            "blur(8px)",
            "blur(0)"
          ]
        },
        "description": "New persona materializes"
      },
      {
        "element": "nameTag",
        "animation": "slideUp",
        "delay": 1200,
        "duration": 400,
        "easing": "spring",
        "properties": {
          "opacity": [
            0,
            1
          ],
          "translateY": [
            12,
            0
          ]
        },
        "description": "Name appears with personality"
      }
    ],
    "sound": {
      "track": "persona.{nextPersonaId}",
      "delay": 600,
      "volume": 0.6
    },
    "haptic": {
      "pattern": "personaSignature",
      "delay": 700
    }
  },
  "celebration_small": {
    "id": "celebration_small",
    "name": "Small Win",
    "description": "Quick acknowledgment of achievement",
    "trigger": "achievement_small",
    "totalDuration": 1200,
    "interruptible": true,
    "emotion": "proud",
    "steps": [
      {
        "element": "avatar",
        "animation": "nod",
        "delay": 0,
        "duration": 400,
        "easing": "spring",
        "properties": {
          "translateY": [
            0,
            -4,
            0
          ],
          "rotate": [
            0,
            2,
            0
          ]
        },
        "description": "Approving nod"
      },
      {
        "element": "avatarGlow",
        "animation": "celebrate",
        "delay": 50,
        "duration": 600,
        "easing": "gentle",
        "properties": {
          "opacity": [
            0.6,
            1,
            0.6
          ],
          "scale": [
            1,
            1.2,
            1
          ]
        }
      },
      {
        "element": "sparkle",
        "animation": "burst",
        "delay": 100,
        "duration": 500,
        "easing": "expoOut",
        "properties": {
          "particles": 5,
          "spread": 30,
          "size": "small"
        },
        "description": "Subtle sparkle effect"
      }
    ],
    "sound": {
      "track": "celebration.small",
      "delay": 0,
      "volume": 0.5
    },
    "haptic": {
      "pattern": "success",
      "delay": 50
    }
  },
  "celebration_big": {
    "id": "celebration_big",
    "name": "Major Achievement",
    "description": "Full celebration for significant accomplishments",
    "trigger": "achievement_major",
    "totalDuration": 3500,
    "interruptible": false,
    "emotion": "ecstatic",
    "steps": [
      {
        "element": "overlay",
        "animation": "fadeIn",
        "delay": 0,
        "duration": 300,
        "properties": {
          "opacity": [
            0,
            1
          ],
          "backgroundColor": "rgba(0,0,0,0.3)"
        }
      },
      {
        "element": "avatar",
        "animation": "joyBounce",
        "delay": 100,
        "duration": 600,
        "easing": "spring",
        "properties": {
          "scale": [
            1,
            1.15,
            0.95,
            1.05,
            1
          ],
          "translateY": [
            0,
            -20,
            0,
            -8,
            0
          ]
        },
        "description": "Pixar-style joy bounce"
      },
      {
        "element": "avatarGlow",
        "animation": "radiate",
        "delay": 200,
        "duration": 1000,
        "easing": "expoOut",
        "properties": {
          "opacity": [
            0.6,
            1
          ],
          "scale": [
            1,
            2
          ],
          "filter": [
            "blur(20px)",
            "blur(40px)"
          ]
        },
        "description": "Glow radiates outward"
      },
      {
        "element": "confetti",
        "animation": "burst",
        "delay": 300,
        "duration": 2500,
        "properties": {
          "particles": 50,
          "colors": [
            "var(--persona-primary)",
            "var(--color-accent)",
            "#FFD700",
            "#FF6B6B"
          ],
          "spread": 180,
          "gravity": 0.8
        },
        "description": "Confetti celebration"
      },
      {
        "element": "achievementCard",
        "animation": "popIn",
        "delay": 600,
        "duration": 500,
        "easing": "spring",
        "properties": {
          "scale": [
            0.5,
            1.05,
            1
          ],
          "opacity": [
            0,
            1
          ]
        }
      },
      {
        "element": "achievementText",
        "animation": "typewriter",
        "delay": 1100,
        "duration": 800,
        "properties": {
          "speed": 40
        }
      }
    ],
    "sound": {
      "track": "celebration.big",
      "delay": 100,
      "volume": 0.8
    },
    "haptic": {
      "pattern": "celebration",
      "delay": 100
    }
  },
  "streak_milestone": {
    "id": "streak_milestone",
    "name": "Consistency Streak",
    "description": "Celebrating consecutive day milestones",
    "trigger": "streak_milestone",
    "totalDuration": 3000,
    "interruptible": false,
    "emotion": "impressed",
    "steps": [
      {
        "element": "streakFlame",
        "animation": "ignite",
        "delay": 0,
        "duration": 500,
        "easing": "spring",
        "properties": {
          "scale": [
            0,
            1.2,
            1
          ],
          "opacity": [
            0,
            1
          ]
        },
        "description": "Flame ignites"
      },
      {
        "element": "streakNumber",
        "animation": "countUp",
        "delay": 300,
        "duration": 800,
        "easing": "expoOut",
        "properties": {
          "from": 0,
          "to": "{streakCount}"
        },
        "description": "Number counts up dramatically"
      },
      {
        "element": "streakRing",
        "animation": "draw",
        "delay": 400,
        "duration": 1000,
        "easing": "expoOut",
        "properties": {
          "strokeDashoffset": [
            283,
            0
          ]
        },
        "description": "Ring draws around number"
      },
      {
        "element": "avatar",
        "animation": "impressed",
        "delay": 800,
        "duration": 400,
        "easing": "spring",
        "properties": {
          "translateY": [
            0,
            -6,
            0
          ],
          "rotate": [
            0,
            -3,
            0
          ]
        },
        "description": "Impressed lean-back"
      },
      {
        "element": "streakMessage",
        "animation": "fadeSlideUp",
        "delay": 1500,
        "duration": 400,
        "easing": "spring",
        "properties": {
          "opacity": [
            0,
            1
          ],
          "translateY": [
            8,
            0
          ]
        }
      }
    ],
    "sound": {
      "track": "celebration.streak",
      "delay": 0,
      "volume": 0.7
    },
    "haptic": {
      "pattern": "success",
      "delay": 300
    }
  },
  "deep_moment": {
    "id": "deep_moment",
    "name": "Breakthrough",
    "description": "Emotional or cognitive breakthrough - subtle, supportive",
    "trigger": "emotional_breakthrough",
    "totalDuration": 3000,
    "interruptible": true,
    "emotion": "supportive",
    "steps": [
      {
        "element": "avatar",
        "animation": "softenExpression",
        "delay": 0,
        "duration": 800,
        "easing": "gentle",
        "properties": {
          "expression": "empathetic"
        },
        "description": "Expression softens"
      },
      {
        "element": "avatarGlow",
        "animation": "warmPulse",
        "delay": 200,
        "duration": 2000,
        "easing": "gentle",
        "properties": {
          "opacity": [
            0.5,
            0.8,
            0.6
          ],
          "scale": [
            1,
            1.1,
            1.05
          ]
        },
        "description": "Warm, slow pulse"
      },
      {
        "element": "ambientLight",
        "animation": "warmShift",
        "delay": 400,
        "duration": 2000,
        "easing": "gentle",
        "properties": {
          "filter": [
            "brightness(1)",
            "brightness(1.05)",
            "brightness(1.02)"
          ]
        },
        "description": "Subtle ambient warmth"
      }
    ],
    "sound": {
      "track": "notification.gentle",
      "delay": 500,
      "volume": 0.3
    },
    "haptic": {
      "pattern": "empathy",
      "delay": 200
    }
  },
  "session_end": {
    "id": "session_end",
    "name": "Until Next Time",
    "description": "Graceful session conclusion",
    "trigger": "session_ending",
    "totalDuration": 2500,
    "interruptible": true,
    "emotion": "grateful",
    "steps": [
      {
        "element": "avatar",
        "animation": "gratefulNod",
        "delay": 0,
        "duration": 600,
        "easing": "gentle",
        "properties": {
          "translateY": [
            0,
            -3,
            0
          ],
          "rotate": [
            0,
            2,
            0
          ]
        },
        "description": "Appreciative nod"
      },
      {
        "element": "farewell",
        "animation": "fadeIn",
        "delay": 400,
        "duration": 400,
        "properties": {
          "opacity": [
            0,
            1
          ]
        }
      },
      {
        "element": "avatarGlow",
        "animation": "fadeOut",
        "delay": 1000,
        "duration": 1000,
        "easing": "gentle",
        "properties": {
          "opacity": [
            0.6,
            0
          ]
        },
        "description": "Glow gently fades"
      },
      {
        "element": "avatar",
        "animation": "breatheOut",
        "delay": 1200,
        "duration": 1200,
        "easing": "gentle",
        "properties": {
          "scale": [
            1,
            0.95
          ],
          "opacity": [
            1,
            0
          ],
          "filter": [
            "blur(0)",
            "blur(8px)"
          ]
        },
        "description": "Avatar breathes away"
      }
    ],
    "sound": {
      "track": "system.sessionEnd",
      "delay": 0,
      "volume": 0.5
    },
    "haptic": {
      "pattern": "goodbye",
      "delay": 400
    }
  },
  "team_unlock": {
    "id": "team_unlock",
    "name": "New Friend",
    "description": "Team member becomes available",
    "trigger": "persona_unlocked",
    "totalDuration": 4000,
    "interruptible": false,
    "emotion": "welcoming",
    "steps": [
      {
        "element": "overlay",
        "animation": "fadeIn",
        "delay": 0,
        "duration": 400,
        "properties": {
          "opacity": [
            0,
            1
          ]
        }
      },
      {
        "element": "mysteryOrb",
        "animation": "materialize",
        "delay": 300,
        "duration": 600,
        "easing": "spring",
        "properties": {
          "scale": [
            0,
            1.1,
            1
          ],
          "opacity": [
            0,
            1
          ],
          "filter": [
            "blur(20px)",
            "blur(0)"
          ]
        }
      },
      {
        "element": "newPersonaAvatar",
        "animation": "reveal",
        "delay": 900,
        "duration": 800,
        "easing": "expoOut",
        "properties": {
          "clipPath": [
            "circle(0%)",
            "circle(100%)"
          ]
        },
        "description": "New persona revealed inside orb"
      },
      {
        "element": "confetti",
        "animation": "burst",
        "delay": 1200,
        "duration": 2000,
        "properties": {
          "particles": 40,
          "colors": [
            "var(--new-persona-primary)",
            "var(--color-accent)"
          ]
        }
      },
      {
        "element": "newPersonaName",
        "animation": "typewriter",
        "delay": 1600,
        "duration": 600,
        "properties": {
          "speed": 50
        }
      },
      {
        "element": "newPersonaBio",
        "animation": "fadeSlideUp",
        "delay": 2200,
        "duration": 400,
        "easing": "spring",
        "properties": {
          "opacity": [
            0,
            1
          ],
          "translateY": [
            12,
            0
          ]
        }
      },
      {
        "element": "meetButton",
        "animation": "pulseAttention",
        "delay": 2800,
        "duration": 600,
        "easing": "spring",
        "repeat": 2,
        "properties": {
          "scale": [
            1,
            1.05,
            1
          ]
        }
      }
    ],
    "sound": {
      "track": "celebration.teamUnlock",
      "delay": 800,
      "volume": 0.8
    },
    "haptic": {
      "pattern": "celebration",
      "delay": 900
    }
  },
  "error_recovery": {
    "id": "error_recovery",
    "name": "Getting Back on Track",
    "description": "Recovering from an error state gracefully",
    "trigger": "error_resolved",
    "totalDuration": 1500,
    "interruptible": true,
    "emotion": "reassuring",
    "steps": [
      {
        "element": "errorIndicator",
        "animation": "fadeOut",
        "delay": 0,
        "duration": 300,
        "properties": {
          "opacity": [
            1,
            0
          ]
        }
      },
      {
        "element": "avatar",
        "animation": "relievedSigh",
        "delay": 200,
        "duration": 500,
        "easing": "gentle",
        "properties": {
          "scale": [
            0.98,
            1.02,
            1
          ],
          "translateY": [
            0,
            -2,
            0
          ]
        },
        "description": "Relieved settling motion"
      },
      {
        "element": "statusText",
        "animation": "swap",
        "delay": 400,
        "duration": 300,
        "properties": {
          "text": "We're back.",
          "color": "var(--color-semantic-success)"
        }
      },
      {
        "element": "avatarGlow",
        "animation": "stabilize",
        "delay": 500,
        "duration": 800,
        "easing": "gentle",
        "properties": {
          "opacity": [
            0.3,
            0.6
          ],
          "scale": [
            0.95,
            1
          ]
        }
      }
    ],
    "sound": {
      "track": "system.recovered",
      "delay": 200,
      "volume": 0.4
    },
    "haptic": {
      "pattern": "gentle",
      "delay": 300
    }
  },
  "arrival_calling": {
    "id": "arrival_calling",
    "name": "Calling Ferni",
    "description": "Arrival beat 1: the caller tapped Call. Ferni rests; only the button and his halo answer. No sound: the chord waits for him.",
    "trigger": "call_start",
    "totalDuration": 1400,
    "interruptible": true,
    "emotion": "anticipatory",
    "steps": [
      {
        "element": "face",
        "animation": "expression",
        "delay": 0,
        "duration": 0,
        "properties": {
          "expression": "resting"
        },
        "description": "Resting while we reach him"
      },
      {
        "element": "callButton",
        "animation": "press",
        "delay": 0,
        "duration": 260,
        "easing": "spring",
        "properties": {
          "scale": [
            1,
            0.95,
            1
          ]
        }
      },
      {
        "element": "halo",
        "animation": "warm",
        "delay": 60,
        "duration": 1340,
        "easing": "gentle",
        "properties": {
          "opacity": [
            0,
            0.35
          ]
        },
        "description": "Warms like a porch light; no spinner"
      },
      {
        "element": "statusText",
        "animation": "swap",
        "delay": 0,
        "duration": 240,
        "properties": {
          "text": "Calling Ferni…"
        }
      }
    ],
    "haptic": {
      "pattern": "tap",
      "delay": 0
    }
  },
  "arrival_slow": {
    "id": "arrival_slow",
    "name": "Waking Ferni",
    "description": "Arrival after 4 s of connecting: the words say so and Ferni stirs once.",
    "trigger": "connect_slow",
    "totalDuration": 2700,
    "interruptible": true,
    "emotion": "patient",
    "steps": [
      {
        "element": "statusText",
        "animation": "swap",
        "delay": 0,
        "duration": 240,
        "properties": {
          "text": "Waking Ferni up…"
        }
      },
      {
        "element": "face",
        "animation": "expression",
        "delay": 2000,
        "duration": 0,
        "properties": {
          "expression": "sleepy"
        },
        "description": "Stirs, eyes half open"
      },
      {
        "element": "face",
        "animation": "expression",
        "delay": 2700,
        "duration": 0,
        "properties": {
          "expression": "resting"
        },
        "description": "Drifts back"
      }
    ]
  },
  "arrival_very_slow": {
    "id": "arrival_very_slow",
    "name": "Longer than usual",
    "description": "Arrival after 9 s of connecting.",
    "trigger": "connect_very_slow",
    "totalDuration": 240,
    "interruptible": true,
    "emotion": "patient",
    "steps": [
      {
        "element": "statusText",
        "animation": "swap",
        "delay": 0,
        "duration": 240,
        "properties": {
          "text": "Taking a little longer than usual"
        }
      }
    ]
  },
  "arrival_joined": {
    "id": "arrival_joined",
    "name": "Ferni arrives",
    "description": "The hero beat: Ferni joined the call. He wakes (surprised), dips, then rises happy as the chord plays; the controls follow. One focal point, one sound, one haptic.",
    "trigger": "agent_joined",
    "totalDuration": 1000,
    "interruptible": false,
    "emotion": "warm",
    "steps": [
      {
        "element": "face",
        "animation": "expression",
        "delay": 0,
        "duration": 0,
        "properties": {
          "expression": "surprised"
        },
        "description": "Wakes: eyes fly open"
      },
      {
        "element": "avatar",
        "animation": "anticipate",
        "delay": 0,
        "duration": 140,
        "easing": "spring",
        "properties": {
          "scaleY": [
            1,
            0.95
          ],
          "scaleX": [
            1,
            1.03
          ]
        }
      },
      {
        "element": "face",
        "animation": "expression",
        "delay": 140,
        "duration": 0,
        "properties": {
          "expression": "happy"
        },
        "description": "Happy squint as he rises"
      },
      {
        "element": "avatar",
        "animation": "rise",
        "delay": 140,
        "duration": 450,
        "easing": "spring",
        "properties": {
          "scaleY": [
            0.95,
            1
          ],
          "scaleX": [
            1.03,
            1
          ],
          "translateY": [
            0,
            -6,
            0
          ]
        }
      },
      {
        "element": "halo",
        "animation": "bloom",
        "delay": 170,
        "duration": 600,
        "easing": "spring",
        "properties": {
          "opacity": [
            0.35,
            1
          ],
          "scale": [
            0.97,
            1.06,
            1
          ]
        }
      },
      {
        "element": "controls",
        "animation": "followIn",
        "delay": 280,
        "duration": 360,
        "easing": "decelerate",
        "stagger": 60,
        "properties": {
          "opacity": [
            0,
            1
          ],
          "translateY": [
            14,
            0
          ]
        }
      },
      {
        "element": "statusText",
        "animation": "swap",
        "delay": 0,
        "duration": 240,
        "properties": {
          "text": ""
        }
      },
      {
        "element": "face",
        "animation": "expression",
        "delay": 1000,
        "duration": 0,
        "properties": {
          "expression": "attentive"
        },
        "description": "Settles and looks at you"
      }
    ],
    "sound": {
      "track": "system.connectionSuccess",
      "delay": 140,
      "volume": 0.6
    },
    "haptic": {
      "pattern": "success",
      "delay": 140
    }
  },
  "arrival_ready": {
    "id": "arrival_ready",
    "name": "About to speak",
    "description": "Ferni is thinking of his first words: he looks at you and breathes in.",
    "trigger": "agent_thinking",
    "totalDuration": 500,
    "interruptible": true,
    "emotion": "present",
    "steps": [
      {
        "element": "avatar",
        "animation": "inhale",
        "delay": 0,
        "duration": 320,
        "easing": "gentle",
        "properties": {
          "scaleY": [
            1,
            1.025
          ],
          "scaleX": [
            1,
            1.01
          ]
        }
      },
      {
        "element": "eyes",
        "animation": "look",
        "delay": 0,
        "duration": 500,
        "easing": "spring",
        "properties": {
          "translateY": [
            0,
            -1.2,
            0
          ]
        }
      }
    ]
  },
  "arrival_speaking": {
    "id": "arrival_speaking",
    "name": "Speaking",
    "description": "His voice is playing: it drives his body, eyes and halo (speaking system). Interface sounds duck under it.",
    "trigger": "agent_speaking",
    "totalDuration": 0,
    "interruptible": true,
    "emotion": "present",
    "steps": [
      {
        "element": "face",
        "animation": "expression",
        "delay": 0,
        "duration": 0,
        "properties": {
          "expression": "speaking"
        },
        "description": "Speaking face"
      }
    ]
  },
  "arrival_listening": {
    "id": "arrival_listening",
    "name": "Listening",
    "description": "He finished speaking: he exhales and leans in, only while he listens.",
    "trigger": "agent_listening",
    "totalDuration": 600,
    "interruptible": true,
    "emotion": "attentive",
    "steps": [
      {
        "element": "face",
        "animation": "expression",
        "delay": 0,
        "duration": 0,
        "properties": {
          "expression": "listening"
        },
        "description": "Listening face"
      },
      {
        "element": "avatar",
        "animation": "lean",
        "delay": 0,
        "duration": 600,
        "easing": "gentle",
        "properties": {
          "translateY": [
            0,
            -3
          ]
        }
      }
    ]
  },
  "arrival_failed": {
    "id": "arrival_failed",
    "name": "Couldn't reach Ferni",
    "description": "Connecting failed: a soft sigh and plain words. No shake and no chime.",
    "trigger": "connect_failed",
    "totalDuration": 700,
    "interruptible": false,
    "emotion": "empathetic",
    "steps": [
      {
        "element": "face",
        "animation": "expression",
        "delay": 0,
        "duration": 0,
        "properties": {
          "expression": "empathetic"
        },
        "description": "Empathetic, not broken"
      },
      {
        "element": "halo",
        "animation": "dim",
        "delay": 0,
        "duration": 700,
        "easing": "gentle",
        "properties": {
          "opacity": [
            0.35,
            0.15
          ]
        }
      },
      {
        "element": "avatar",
        "animation": "sigh",
        "delay": 0,
        "duration": 700,
        "easing": "gentle",
        "properties": {
          "scaleY": [
            1,
            0.97
          ],
          "translateY": [
            0,
            3
          ]
        }
      },
      {
        "element": "statusText",
        "animation": "swap",
        "delay": 0,
        "duration": 240,
        "properties": {
          "text": "Couldn't reach Ferni. Try again?"
        }
      }
    ],
    "haptic": {
      "pattern": "soft",
      "delay": 0
    }
  }
};

export const REDUCED_MOTION: Readonly<Partial<Record<SequenceId, ReducedMotionSimplification>>> = {
  "arrival_joined": {
    "description": "The same story in light and faces: no dip, rise or slide",
    "removeSteps": [
      "avatar"
    ],
    "modifySteps": {
      "controls": {
        "properties": {
          "opacity": [
            0,
            1
          ]
        }
      }
    }
  },
  "arrival_ready": {
    "description": "Look only, no breath scaling",
    "removeSteps": [
      "avatar"
    ]
  },
  "arrival_listening": {
    "description": "No lean",
    "removeSteps": [
      "avatar"
    ]
  },
  "arrival_failed": {
    "description": "No sigh motion",
    "removeSteps": [
      "avatar"
    ]
  },
  "celebration_big": {
    "description": "Simplified celebration without confetti",
    "removeSteps": [
      "confetti"
    ],
    "modifySteps": {
      "avatar": {
        "duration": 300,
        "properties": {
          "scale": [
            1,
            1.02,
            1
          ]
        }
      }
    }
  },
  "onboarding_reveal": {
    "description": "Simpler reveal without complex animations",
    "modifySteps": {
      "avatar": {
        "duration": 400,
        "animation": "fadeIn"
      },
      "greeting": {
        "animation": "fadeIn",
        "duration": 300
      }
    }
  },
  "handoff_transition": {
    "description": "Simple crossfade instead of complex transition",
    "replaceWith": [
      {
        "element": "currentAvatar",
        "animation": "fadeOut",
        "duration": 300
      },
      {
        "element": "newAvatar",
        "animation": "fadeIn",
        "delay": 200,
        "duration": 300
      }
    ]
  }
};
