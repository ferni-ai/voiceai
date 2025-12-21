/** @type {import('tailwindcss').Config} */
// Auto-generated from design tokens - DO NOT EDIT DIRECTLY
// Rebuild with: npm run build:tokens

export default {
  "theme": {
    "extend": {
      "colors": {
        "background": {
          "primary": "var(--color-background-primary)",
          "secondary": "var(--color-background-secondary)",
          "tertiary": "var(--color-background-tertiary)",
          "elevated": "var(--color-background-elevated)",
          "glass": "var(--color-background-glass)",
          "overlay": "var(--color-background-overlay)"
        },
        "text": {
          "primary": "var(--color-text-primary)",
          "secondary": "var(--color-text-secondary)",
          "muted": "var(--color-text-muted)",
          "dimmed": "var(--color-text-dimmed)",
          "inverse": "var(--color-text-inverse)"
        },
        "border": {
          "subtle": "var(--color-border-subtle)",
          "medium": "var(--color-border-medium)",
          "strong": "var(--color-border-strong)"
        },
        "accent": {
          "DEFAULT": "var(--color-accent-primary)",
          "hover": "var(--color-accent-hover)",
          "pressed": "var(--color-accent-pressed)",
          "glow": "var(--color-accent-glow)",
          "subtle": "var(--color-accent-subtle)"
        },
        "success": {
          "DEFAULT": "var(--color-semantic-success)",
          "glow": "var(--color-semantic-success-glow)"
        },
        "error": {
          "DEFAULT": "var(--color-semantic-error)",
          "glow": "var(--color-semantic-error-glow)"
        },
        "warning": {
          "DEFAULT": "var(--color-semantic-warning)",
          "glow": "var(--color-semantic-warning-glow)"
        },
        "info": {
          "DEFAULT": "var(--color-semantic-info)",
          "glow": "var(--color-semantic-info-glow)"
        },
        "persona": {
          "primary": "var(--persona-primary)",
          "secondary": "var(--persona-secondary)",
          "glow": "var(--persona-glow)",
          "tint": "var(--persona-tint)"
        },
        "natural": {
          "wood": "var(--color-natural-wood)",
          "wood-light": "var(--color-natural-wood-light)",
          "bamboo": "var(--color-natural-bamboo)",
          "stone": "var(--color-natural-stone)",
          "sand": "var(--color-natural-sand)",
          "moss": "var(--color-natural-moss)"
        }
      },
      "fontFamily": {
        "display": "var(--font-display)",
        "body": "var(--font-body)",
        "mono": "var(--font-mono)"
      },
      "fontSize": {
        "2xs": "0.625rem",
        "xs": "0.75rem",
        "sm": "0.8125rem",
        "base": "0.9375rem",
        "lg": "1.0625rem",
        "xl": "1.25rem",
        "2xl": "1.5rem",
        "3xl": "1.875rem",
        "4xl": "2.25rem",
        "5xl": "3rem",
        "6xl": "3.75rem"
      },
      "fontWeight": {
        "light": 300,
        "regular": 400,
        "medium": 500,
        "semibold": 600,
        "bold": 700,
        "extrabold": 800
      },
      "lineHeight": {
        "none": "1",
        "tight": "1.2",
        "snug": "1.35",
        "normal": "1.6",
        "relaxed": "1.75",
        "loose": "2"
      },
      "letterSpacing": {
        "tighter": "-0.03em",
        "tight": "-0.015em",
        "normal": "0",
        "wide": "0.015em",
        "wider": "0.05em",
        "widest": "0.1em"
      },
      "spacing": {
        "0": "0",
        "1": "0.25rem",
        "2": "0.5rem",
        "3": "0.75rem",
        "4": "1rem",
        "5": "1.25rem",
        "6": "1.5rem",
        "7": "1.75rem",
        "8": "2rem",
        "9": "2.25rem",
        "10": "2.5rem",
        "11": "2.75rem",
        "12": "3rem",
        "14": "3.5rem",
        "16": "4rem",
        "20": "5rem",
        "24": "6rem",
        "28": "7rem",
        "32": "8rem",
        "36": "9rem",
        "40": "10rem",
        "44": "11rem",
        "48": "12rem",
        "52": "13rem",
        "56": "14rem",
        "60": "15rem",
        "64": "16rem",
        "72": "18rem",
        "80": "20rem",
        "96": "24rem",
        "px": "1px",
        "0_5": "0.125rem",
        "1_5": "0.375rem",
        "2_5": "0.625rem",
        "3_5": "0.875rem"
      },
      "borderRadius": {
        "none": "0",
        "xs": "0.25rem",
        "sm": "0.5rem",
        "md": "0.75rem",
        "lg": "1rem",
        "xl": "1.25rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        "full": "9999px"
      },
      "boxShadow": {
        "xs": "var(--shadow-xs)",
        "sm": "var(--shadow-sm)",
        "md": "var(--shadow-md)",
        "lg": "var(--shadow-lg)",
        "xl": "var(--shadow-xl)",
        "2xl": "var(--shadow-2xl)",
        "glow": "var(--shadow-glow)",
        "inner": "var(--shadow-inner)"
      },
      "zIndex": {
        "hide": -1,
        "auto": "auto",
        "base": 0,
        "docked": 10,
        "dropdown": 1000,
        "sticky": 1100,
        "banner": 1200,
        "overlay": 1300,
        "modal": 1400,
        "popover": 1500,
        "skipLink": 1600,
        "toast": 1700,
        "tooltip": 1800
      },
      "transitionTimingFunction": {
        "linear": "linear",
        "ease-in": "cubic-bezier(0.4, 0, 1, 1)",
        "ease-out": "cubic-bezier(0, 0, 0.2, 1)",
        "ease-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
        "ease-out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "ease-out-back": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "ease-in-out-quint": "cubic-bezier(0.83, 0, 0.17, 1)",
        "spring": "cubic-bezier(0.5, 1.5, 0.5, 1)",
        "spring-bouncy": "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        "smooth": "cubic-bezier(0.45, 0, 0.55, 1)",
        "organic": "cubic-bezier(0.4, 0.2, 0.2, 1.1)",
        "elastic": "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
        "anticipate": "cubic-bezier(0.38, -0.4, 0.88, 0.65)",
        "decelerate": "cubic-bezier(0.0, 0.0, 0.2, 1)",
        "gentle": "cubic-bezier(0.25, 0.1, 0.25, 1)",
        "playful": "cubic-bezier(0.175, 0.885, 0.32, 1.275)"
      },
      "transitionDuration": {
        "instant": "0ms",
        "fastest": "50ms",
        "faster": "100ms",
        "fast": "150ms",
        "normal": "200ms",
        "slow": "300ms",
        "slower": "400ms",
        "slowest": "500ms",
        "deliberate": "700ms",
        "dramatic": "1000ms",
        "glacial": "1500ms",
        "meditative": "3000ms",
        "ambient": "8000ms"
      },
      "animation": {
        "fade-in": "fadeIn 200ms cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "fade-out": "fadeOut 200ms cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "slide-up": "slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-down": "slideDown 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scaleIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "pulse": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "breathe": "breathe 4s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "glow": "glow 2s ease-in-out infinite",
        "spin": "spin 1s linear infinite",
        "warmth-glow": "warmthGlow 1.2s cubic-bezier(0.45, 0, 0.55, 1) forwards",
        "soft-breathe": "softBreathe 5s ease-in-out infinite",
        "gentle-bounce": "gentleBounce 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "connection-warmth": "connectionWarmth 1.5s cubic-bezier(0.45, 0, 0.55, 1) forwards",
        "presence-pulse": "presencePulse 3s ease-in-out infinite",
        "acknowledgement": "acknowledgement 400ms cubic-bezier(0.45, 0, 0.55, 1) forwards",
        "aurora": "aurora 15s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "morph-blob": "morphBlob 8s ease-in-out infinite",
        "sparkle": "sparkle 700ms ease-out forwards",
        "ripple": "ripple 600ms ease-out forwards",
        "celebrate": "celebrate 800ms ease-in-out forwards",
        "heartbeat": "heartbeat 1.5s ease-in-out infinite",
        "wiggle": "wiggle 500ms ease-in-out",
        "levitate": "levitate 3s ease-in-out infinite",
        "magnetic-pull": "magneticPull 300ms ease-out forwards",
        "text-reveal": "textReveal 800ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "wave-hand": "waveHand 2s ease-in-out",
        "gradient-shift": "gradientShift 8s ease infinite",
        "unfold": "unfold 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "dust-float": "dustFloat 8s linear infinite",
        "typewriter": "typewriter 2s steps(40) forwards",
        "blink-cursor": "blinkCursor 1s step-end infinite"
      },
      "keyframes": {
        "fadeIn": {
          "from": {
            "opacity": "0"
          },
          "to": {
            "opacity": "1"
          }
        },
        "fadeOut": {
          "from": {
            "opacity": "1"
          },
          "to": {
            "opacity": "0"
          }
        },
        "slideUp": {
          "from": {
            "transform": "translateY(10px)",
            "opacity": "0"
          },
          "to": {
            "transform": "translateY(0)",
            "opacity": "1"
          }
        },
        "slideDown": {
          "from": {
            "transform": "translateY(-10px)",
            "opacity": "0"
          },
          "to": {
            "transform": "translateY(0)",
            "opacity": "1"
          }
        },
        "scaleIn": {
          "from": {
            "transform": "scale(0.95)",
            "opacity": "0"
          },
          "to": {
            "transform": "scale(1)",
            "opacity": "1"
          }
        },
        "pulse": {
          "0%": {
            "opacity": "1"
          },
          "50%": {
            "opacity": "0.5"
          },
          "100%": {
            "opacity": "1"
          }
        },
        "breathe": {
          "0%": {
            "transform": "scale(1)"
          },
          "50%": {
            "transform": "scale(1.05)"
          },
          "100%": {
            "transform": "scale(1)"
          }
        },
        "avatarBreathe": {
          "_comment": "Pixar-inspired breathing for circular persona avatars. Subtle enough to feel alive but not distracting.",
          "0%, 100%": {
            "transform": "scale3d(1, 1, 1) translateY(0)"
          },
          "40%": {
            "transform": "scale3d(0.994, 1.012, 1) translateY(-2px)"
          },
          "50%": {
            "transform": "scale3d(0.994, 1.012, 1) translateY(-2px)"
          },
          "90%": {
            "transform": "scale3d(1, 1, 1) translateY(0)"
          }
        },
        "avatarFloat": {
          "_comment": "Gentle floating motion for discover cards and hero sections",
          "0%, 100%": {
            "transform": "translateY(0) rotate(0deg)"
          },
          "33%": {
            "transform": "translateY(-4px) rotate(0.5deg)"
          },
          "66%": {
            "transform": "translateY(-2px) rotate(-0.5deg)"
          }
        },
        "avatarGlowRing": {
          "_comment": "Pulsing glow ring behind avatar for emphasis on hover/active states",
          "0%, 100%": {
            "opacity": "0.15",
            "transform": "scale(1)"
          },
          "50%": {
            "opacity": "0.4",
            "transform": "scale(1.02)"
          }
        },
        "shimmer": {
          "0%": {
            "backgroundPosition": "-200% 0"
          },
          "100%": {
            "backgroundPosition": "200% 0"
          }
        },
        "glow": {
          "0%": {
            "boxShadow": "0 0 5px var(--color-accent-glow)"
          },
          "50%": {
            "boxShadow": "0 0 20px var(--color-accent-glow)"
          },
          "100%": {
            "boxShadow": "0 0 5px var(--color-accent-glow)"
          }
        },
        "spin": {
          "from": {
            "transform": "rotate(0deg)"
          },
          "to": {
            "transform": "rotate(360deg)"
          }
        },
        "warmthGlow": {
          "0%": {
            "boxShadow": "0 0 0 0 var(--persona-glow)",
            "opacity": "1"
          },
          "50%": {
            "boxShadow": "0 0 30px 10px var(--persona-glow)",
            "opacity": "0.95"
          },
          "100%": {
            "boxShadow": "0 0 0 0 var(--persona-glow)",
            "opacity": "1"
          }
        },
        "softBreathe": {
          "0%": {
            "transform": "scale(1)",
            "opacity": "1"
          },
          "50%": {
            "transform": "scale(1.02)",
            "opacity": "0.97"
          },
          "100%": {
            "transform": "scale(1)",
            "opacity": "1"
          }
        },
        "gentleBounce": {
          "0%": {
            "transform": "scale(1)"
          },
          "30%": {
            "transform": "scale(1.03)"
          },
          "60%": {
            "transform": "scale(0.98)"
          },
          "100%": {
            "transform": "scale(1)"
          }
        },
        "connectionWarmth": {
          "0%": {
            "boxShadow": "0 0 0 0 var(--color-semantic-success-glow)",
            "transform": "scale(1)"
          },
          "40%": {
            "boxShadow": "0 0 25px 8px var(--color-semantic-success-glow)",
            "transform": "scale(1.02)"
          },
          "100%": {
            "boxShadow": "0 0 0 0 var(--color-semantic-success-glow)",
            "transform": "scale(1)"
          }
        },
        "presencePulse": {
          "0%": {
            "opacity": "1",
            "transform": "scale(1)"
          },
          "50%": {
            "opacity": "0.85",
            "transform": "scale(1.01)"
          },
          "100%": {
            "opacity": "1",
            "transform": "scale(1)"
          }
        },
        "acknowledgement": {
          "0%": {
            "transform": "scale(1)"
          },
          "50%": {
            "transform": "scale(1.015)"
          },
          "100%": {
            "transform": "scale(1)"
          }
        },
        "aurora": {
          "0%": {
            "backgroundPosition": "0% 50%",
            "filter": "hue-rotate(0deg)"
          },
          "50%": {
            "backgroundPosition": "100% 50%",
            "filter": "hue-rotate(30deg)"
          },
          "100%": {
            "backgroundPosition": "0% 50%",
            "filter": "hue-rotate(0deg)"
          }
        },
        "float": {
          "0%": {
            "transform": "translateY(0px) rotate(0deg)"
          },
          "33%": {
            "transform": "translateY(-8px) rotate(1deg)"
          },
          "66%": {
            "transform": "translateY(-4px) rotate(-1deg)"
          },
          "100%": {
            "transform": "translateY(0px) rotate(0deg)"
          }
        },
        "morphBlob": {
          "0%": {
            "borderRadius": "60% 40% 30% 70% / 60% 30% 70% 40%"
          },
          "25%": {
            "borderRadius": "30% 60% 70% 40% / 50% 60% 30% 60%"
          },
          "50%": {
            "borderRadius": "50% 60% 30% 60% / 30% 60% 70% 40%"
          },
          "75%": {
            "borderRadius": "60% 40% 60% 30% / 70% 30% 50% 60%"
          },
          "100%": {
            "borderRadius": "60% 40% 30% 70% / 60% 30% 70% 40%"
          }
        },
        "sparkle": {
          "0%": {
            "transform": "scale(0) rotate(0deg)",
            "opacity": "0"
          },
          "50%": {
            "transform": "scale(1) rotate(180deg)",
            "opacity": "1"
          },
          "100%": {
            "transform": "scale(0) rotate(360deg)",
            "opacity": "0"
          }
        },
        "ripple": {
          "0%": {
            "transform": "scale(0)",
            "opacity": "0.6"
          },
          "100%": {
            "transform": "scale(4)",
            "opacity": "0"
          }
        },
        "celebrate": {
          "0%": {
            "transform": "scale(1) rotate(0deg)"
          },
          "10%": {
            "transform": "scale(1.1) rotate(-3deg)"
          },
          "20%": {
            "transform": "scale(1.1) rotate(3deg)"
          },
          "30%": {
            "transform": "scale(1.1) rotate(-3deg)"
          },
          "40%": {
            "transform": "scale(1.1) rotate(3deg)"
          },
          "50%": {
            "transform": "scale(1.1) rotate(0deg)"
          },
          "100%": {
            "transform": "scale(1) rotate(0deg)"
          }
        },
        "heartbeat": {
          "0%": {
            "transform": "scale(1)"
          },
          "14%": {
            "transform": "scale(1.1)"
          },
          "28%": {
            "transform": "scale(1)"
          },
          "42%": {
            "transform": "scale(1.1)"
          },
          "70%": {
            "transform": "scale(1)"
          }
        },
        "wiggle": {
          "0%": {
            "transform": "rotate(0deg)"
          },
          "25%": {
            "transform": "rotate(-5deg)"
          },
          "50%": {
            "transform": "rotate(5deg)"
          },
          "75%": {
            "transform": "rotate(-5deg)"
          },
          "100%": {
            "transform": "rotate(0deg)"
          }
        },
        "levitate": {
          "0%": {
            "transform": "translateY(0)",
            "boxShadow": "0 5px 15px 0 rgba(0,0,0,0.1)"
          },
          "50%": {
            "transform": "translateY(-10px)",
            "boxShadow": "0 25px 15px 0 rgba(0,0,0,0.05)"
          },
          "100%": {
            "transform": "translateY(0)",
            "boxShadow": "0 5px 15px 0 rgba(0,0,0,0.1)"
          }
        },
        "magneticPull": {
          "0%": {
            "transform": "translate(var(--magnetic-x, 0), var(--magnetic-y, 0))"
          },
          "100%": {
            "transform": "translate(0, 0)"
          }
        },
        "textReveal": {
          "0%": {
            "clipPath": "inset(0 100% 0 0)",
            "opacity": "0"
          },
          "100%": {
            "clipPath": "inset(0 0 0 0)",
            "opacity": "1"
          }
        },
        "waveHand": {
          "0%": {
            "transform": "rotate(0deg)"
          },
          "10%": {
            "transform": "rotate(14deg)"
          },
          "20%": {
            "transform": "rotate(-8deg)"
          },
          "30%": {
            "transform": "rotate(14deg)"
          },
          "40%": {
            "transform": "rotate(-4deg)"
          },
          "50%": {
            "transform": "rotate(10deg)"
          },
          "60%": {
            "transform": "rotate(0deg)"
          },
          "100%": {
            "transform": "rotate(0deg)"
          }
        },
        "gradientShift": {
          "0%": {
            "backgroundPosition": "0% 50%"
          },
          "50%": {
            "backgroundPosition": "100% 50%"
          },
          "100%": {
            "backgroundPosition": "0% 50%"
          }
        },
        "unfold": {
          "0%": {
            "transform": "scaleY(0)",
            "transformOrigin": "top",
            "opacity": "0"
          },
          "100%": {
            "transform": "scaleY(1)",
            "transformOrigin": "top",
            "opacity": "1"
          }
        },
        "dustFloat": {
          "0%": {
            "transform": "translateY(0) translateX(0)",
            "opacity": "0"
          },
          "10%": {
            "opacity": "1"
          },
          "90%": {
            "opacity": "1"
          },
          "100%": {
            "transform": "translateY(-100px) translateX(20px)",
            "opacity": "0"
          }
        },
        "typewriter": {
          "from": {
            "width": "0"
          },
          "to": {
            "width": "100%"
          }
        },
        "blinkCursor": {
          "0%": {
            "borderColor": "transparent"
          },
          "50%": {
            "borderColor": "var(--color-accent-primary)"
          },
          "100%": {
            "borderColor": "transparent"
          }
        },
        "_pixarInspired": "=== PIXAR-INSPIRED KEYFRAMES ===",
        "pixarBounce": {
          "_description": "Full squash & stretch bounce with anticipation and follow-through",
          "0%": {
            "transform": "translateY(0) scaleX(1) scaleY(1)",
            "opacity": "0.5"
          },
          "15%": {
            "transform": "translateY(2px) scaleX(1.2) scaleY(0.8)",
            "opacity": "0.7"
          },
          "35%": {
            "transform": "translateY(-10px) scaleX(0.8) scaleY(1.2)",
            "opacity": "1"
          },
          "45%": {
            "transform": "translateY(-12px) scaleX(0.85) scaleY(1.15)",
            "opacity": "1"
          },
          "55%": {
            "transform": "translateY(-6px) scaleX(0.9) scaleY(1.1)",
            "opacity": "0.9"
          },
          "70%": {
            "transform": "translateY(1px) scaleX(1.15) scaleY(0.85)",
            "opacity": "0.6"
          },
          "85%": {
            "transform": "translateY(-1px) scaleX(1.05) scaleY(0.95)",
            "opacity": "0.5"
          },
          "100%": {
            "transform": "translateY(0) scaleX(1) scaleY(1)",
            "opacity": "0.5"
          }
        },
        "pixarAnticipate": {
          "_description": "Wind-up before action - builds expectation",
          "0%": {
            "transform": "scale(1) rotate(0deg)"
          },
          "30%": {
            "transform": "scale(0.95) rotate(-2deg)"
          },
          "100%": {
            "transform": "scale(1.1) rotate(3deg)"
          }
        },
        "pixarSettle": {
          "_description": "Overshoot and settle - natural landing",
          "0%": {
            "transform": "scale(1.1)"
          },
          "40%": {
            "transform": "scale(0.97)"
          },
          "70%": {
            "transform": "scale(1.02)"
          },
          "100%": {
            "transform": "scale(1)"
          }
        },
        "pixarThinkingTilt": {
          "_description": "Curious head tilt - like WALL-E examining something",
          "0%": {
            "transform": "rotate(0deg) translateX(0)"
          },
          "50%": {
            "transform": "rotate(3deg) translateX(2px)"
          },
          "100%": {
            "transform": "rotate(0deg) translateX(0)"
          }
        },
        "pixarJoyBounce": {
          "_description": "Excited bounce - like Luxo Jr. hopping",
          "0%": {
            "transform": "translateY(0) scale(1)"
          },
          "20%": {
            "transform": "translateY(-15px) scaleX(0.9) scaleY(1.1)"
          },
          "40%": {
            "transform": "translateY(0) scaleX(1.1) scaleY(0.9)"
          },
          "60%": {
            "transform": "translateY(-8px) scaleX(0.95) scaleY(1.05)"
          },
          "80%": {
            "transform": "translateY(0) scaleX(1.02) scaleY(0.98)"
          },
          "100%": {
            "transform": "translateY(0) scale(1)"
          }
        },
        "pixarSadSlump": {
          "_description": "Weight of sadness - like Bing Bong fading",
          "0%": {
            "transform": "translateY(0) scale(1)",
            "opacity": "1"
          },
          "50%": {
            "transform": "translateY(3px) scaleY(0.95)",
            "opacity": "0.9"
          },
          "100%": {
            "transform": "translateY(5px) scaleY(0.92)",
            "opacity": "0.85"
          }
        },
        "pixarAttention": {
          "_description": "Snap to attention - like EVE spotting a plant",
          "0%": {
            "transform": "scale(1) rotate(0deg)"
          },
          "30%": {
            "transform": "scale(1.05) rotate(-1deg)"
          },
          "60%": {
            "transform": "scale(1.02) rotate(0.5deg)"
          },
          "100%": {
            "transform": "scale(1) rotate(0deg)"
          }
        },
        "pixarBreathe": {
          "_description": "Living, organic breathing - everything alive breathes",
          "0%": {
            "transform": "scale(1)"
          },
          "40%": {
            "transform": "scale(1.015)"
          },
          "60%": {
            "transform": "scale(1.02)"
          },
          "100%": {
            "transform": "scale(1)"
          }
        },
        "pixarFloat": {
          "_description": "Gentle floating - like balloons in Up",
          "0%": {
            "transform": "translateY(0) rotate(0deg)"
          },
          "25%": {
            "transform": "translateY(-5px) rotate(1deg)"
          },
          "50%": {
            "transform": "translateY(-8px) rotate(-0.5deg)"
          },
          "75%": {
            "transform": "translateY(-4px) rotate(0.5deg)"
          },
          "100%": {
            "transform": "translateY(0) rotate(0deg)"
          }
        },
        "_avatarAnimations": "=== AVATAR SQUASH & STRETCH ANIMATIONS ===",
        "avatarNod": {
          "_description": "Agreement nod with squash & stretch - like WALL-E acknowledging",
          "0%": {
            "transform": "scale3d(1, 1, 1) translate3d(0, 0, 0) rotate(0deg)"
          },
          "15%": {
            "transform": "scale3d(1.02, 0.98, 1) translate3d(0, 3px, 0) rotate(3deg)"
          },
          "30%": {
            "transform": "scale3d(0.98, 1.03, 1) translate3d(0, -5px, 0) rotate(-4deg)"
          },
          "50%": {
            "transform": "scale3d(1.01, 0.99, 1) translate3d(0, 2px, 0) rotate(2deg)"
          },
          "65%": {
            "transform": "scale3d(0.99, 1.01, 1) translate3d(0, -2px, 0) rotate(-1.5deg)"
          },
          "80%": {
            "transform": "scale3d(1.005, 0.995, 1) translate3d(0, 1px, 0) rotate(0.5deg)"
          },
          "92%": {
            "transform": "scale3d(0.998, 1.002, 1) translate3d(0, -0.3px, 0) rotate(-0.2deg)"
          },
          "100%": {
            "transform": "scale3d(1, 1, 1) translate3d(0, 0, 0) rotate(0deg)"
          }
        },
        "avatarShake": {
          "_description": "Gentle disagreement shake with squash on direction changes",
          "0%": {
            "transform": "scale3d(1, 1, 1) translate3d(0, 0, 0) rotate(0deg)"
          },
          "15%": {
            "transform": "scale3d(0.98, 1.02, 1) translate3d(-4px, 0, 0) rotate(-2deg)"
          },
          "30%": {
            "transform": "scale3d(1.02, 0.98, 1) translate3d(4px, 0, 0) rotate(2deg)"
          },
          "45%": {
            "transform": "scale3d(0.99, 1.01, 1) translate3d(-3px, 0, 0) rotate(-1.5deg)"
          },
          "60%": {
            "transform": "scale3d(1.01, 0.99, 1) translate3d(2px, 0, 0) rotate(1deg)"
          },
          "75%": {
            "transform": "scale3d(1, 1, 1) translate3d(-1px, 0, 0) rotate(-0.5deg)"
          },
          "88%": {
            "transform": "scale3d(1, 1, 1) translate3d(0.5px, 0, 0) rotate(0.2deg)"
          },
          "100%": {
            "transform": "scale3d(1, 1, 1) translate3d(0, 0, 0) rotate(0deg)"
          }
        },
        "avatarBounce": {
          "_description": "Luxo Jr. style excited bounce with full squash & stretch",
          "0%": {
            "transform": "scale3d(1, 1, 1) translate3d(0, 0, 0)"
          },
          "12%": {
            "transform": "scale3d(1.08, 0.92, 1) translate3d(0, 2px, 0)"
          },
          "28%": {
            "transform": "scale3d(0.94, 1.08, 1) translate3d(0, -12px, 0)"
          },
          "35%": {
            "transform": "scale3d(0.92, 1.1, 1) translate3d(0, -15px, 0)"
          },
          "48%": {
            "transform": "scale3d(0.96, 1.05, 1) translate3d(0, -8px, 0)"
          },
          "58%": {
            "transform": "scale3d(1.1, 0.9, 1) translate3d(0, 3px, 0)"
          },
          "70%": {
            "transform": "scale3d(0.97, 1.04, 1) translate3d(0, -4px, 0)"
          },
          "80%": {
            "transform": "scale3d(1.03, 0.97, 1) translate3d(0, 1px, 0)"
          },
          "90%": {
            "transform": "scale3d(0.99, 1.01, 1) translate3d(0, -0.5px, 0)"
          },
          "100%": {
            "transform": "scale3d(1, 1, 1) translate3d(0, 0, 0)"
          }
        },
        "avatarPulse": {
          "_description": "Warm heartbeat-style acknowledgment pulse",
          "0%": {
            "transform": "scale3d(1, 1, 1)",
            "filter": "brightness(1)"
          },
          "25%": {
            "transform": "scale3d(1.05, 1.05, 1)",
            "filter": "brightness(1.08)"
          },
          "35%": {
            "transform": "scale3d(1.06, 1.06, 1)",
            "filter": "brightness(1.1)"
          },
          "55%": {
            "transform": "scale3d(0.98, 0.98, 1)",
            "filter": "brightness(1.03)"
          },
          "70%": {
            "transform": "scale3d(1.02, 1.02, 1)",
            "filter": "brightness(1.02)"
          },
          "85%": {
            "transform": "scale3d(0.995, 0.995, 1)",
            "filter": "brightness(1)"
          },
          "100%": {
            "transform": "scale3d(1, 1, 1)",
            "filter": "brightness(1)"
          }
        },
        "avatarCuriousTilt": {
          "_description": "WALL-E curious head tilt - examining something interesting",
          "0%": {
            "transform": "rotate(0deg) translate3d(0, 0, 0)"
          },
          "30%": {
            "transform": "rotate(-4deg) translate3d(-2px, 0, 0)"
          },
          "60%": {
            "transform": "rotate(3deg) translate3d(1px, 0, 0)"
          },
          "100%": {
            "transform": "rotate(0deg) translate3d(0, 0, 0)"
          }
        },
        "avatarAttentiveLean": {
          "_description": "Focused attention - like WALL-E leaning in to listen",
          "0%": {
            "transform": "scale(1) translate3d(0, 0, 0) rotate(0deg)"
          },
          "40%": {
            "transform": "scale(1.02) translate3d(0, -2px, 0) rotate(2deg)"
          },
          "70%": {
            "transform": "scale(1.015) translate3d(0, -1px, 0) rotate(1deg)"
          },
          "100%": {
            "transform": "scale(1) translate3d(0, 0, 0) rotate(0deg)"
          }
        }
      },
      "screens": {
        "xs": "375px",
        "sm": "640px",
        "md": "768px",
        "lg": "1024px",
        "xl": "1280px",
        "2xl": "1536px"
      }
    }
  }
};
