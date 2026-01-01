"use strict";(function(){"use strict";const s={sentiment:{positive:.7,negative:.3,neutral:.5},colors:{warmShift:10,coolShift:-5,saturationBoost:5,lightnessBoost:3},typing:{sampleWindow:5e3,minKeystrokes:3,breathMultiplier:1.5},attention:{minDuration:2e3,fadeDelay:3e4,maxSections:5},respectsReducedMotion:window.matchMedia("(prefers-reduced-motion: reduce)").matches},n={sentiment:.5,engagementLevel:0,typingRhythm:null,lastKeyTime:0,keystrokeTimes:[],attentionMap:new Map,scrollVelocity:0,mouseMovement:0,interactionCount:0,ferniMood:"present"},o={root:document.documentElement,signals:{fastScroll:-.05,slowScroll:.02,scrollPause:.03,ctaHover:.05,teamClick:.08,faqOpen:.04,timeSpent30s:.05,timeSpent60s:.08,returnVisitor:.1,demoOpen:.15},init(){localStorage.getItem("ferni_visited")&&this.adjustSentiment("returnVisitor"),this.applyColors()},adjustSentiment(e){const t=this.signals[e]||0;n.sentiment=Math.max(0,Math.min(1,n.sentiment+t)),this.applyColors(),c.updateMood()},applyColors(){if(s.respectsReducedMotion)return;const e=n.sentiment-s.sentiment.neutral,t=e>0?e*s.colors.warmShift:e*s.colors.coolShift,i=e>0?e*s.colors.saturationBoost:0,r=e*s.colors.lightnessBoost;this.root.style.setProperty("--sentiment-hue-shift",`${t}deg`),this.root.style.setProperty("--sentiment-saturation-boost",`${i}%`),this.root.style.setProperty("--sentiment-lightness-boost",`${r}%`),this.root.style.setProperty("--sentiment-level",n.sentiment);const a=.9+n.sentiment*.2;this.root.style.setProperty("--warmth-filter",`sepia(${(n.sentiment-.5)*10}%) saturate(${a*100}%)`)}},u={inputs:null,orb:null,init(){this.inputs=document.querySelectorAll('input[type="text"], input[type="email"], textarea'),this.orb=document.querySelector("[data-hero-orb], [data-orb-aware], .hero-ferni"),this.inputs.forEach(e=>{e.addEventListener("keydown",this.handleKeydown.bind(this)),e.addEventListener("focus",this.handleFocus.bind(this)),e.addEventListener("blur",this.handleBlur.bind(this))})},handleKeydown(e){const t=Date.now();if(n.lastKeyTime>0){const i=t-n.lastKeyTime;n.keystrokeTimes.push(i),n.keystrokeTimes.length>20&&n.keystrokeTimes.shift(),n.keystrokeTimes.length>=s.typing.minKeystrokes&&this.calculateRhythm()}n.lastKeyTime=t,n.keystrokeTimes.length>5&&o.adjustSentiment("slowScroll")},handleFocus(){this.orb&&!s.respectsReducedMotion&&this.orb.classList.add("ferni-listening-to-typing")},handleBlur(){this.orb&&this.orb.classList.remove("ferni-listening-to-typing"),n.keystrokeTimes=[],n.typingRhythm=null,this.resetBreath()},calculateRhythm(){const e=n.keystrokeTimes.reduce((i,r)=>i+r,0)/n.keystrokeTimes.length;n.typingRhythm=e;const t=Math.max(2e3,Math.min(6e3,e*s.typing.breathMultiplier*10));this.syncBreath(t)},syncBreath(e){!this.orb||s.respectsReducedMotion||(this.orb.style.setProperty("--typing-breath-rate",`${e}ms`),this.orb.classList.add("ferni-typing-sync"))},resetBreath(){this.orb&&(this.orb.classList.remove("ferni-typing-sync"),this.orb.style.removeProperty("--typing-breath-rate"))}},c={orb:null,moodIndicator:null,currentMood:"present",moods:{present:{breathRate:4e3,glowIntensity:.3,pulseChance:.1,description:"Calm, attentive presence"},curious:{breathRate:3500,glowIntensity:.4,pulseChance:.2,description:"Engaged and interested"},warm:{breathRate:4500,glowIntensity:.5,pulseChance:.3,description:"Connected and welcoming"},delighted:{breathRate:3e3,glowIntensity:.6,pulseChance:.4,description:"Excited and encouraging"},concerned:{breathRate:5e3,glowIntensity:.35,pulseChance:.15,description:"Attentive and supportive"}},init(){this.orb=document.querySelector("[data-hero-orb], [data-orb-aware], .hero-ferni"),this.updateMood()},updateMood(){const e=n.sentiment,t=n.engagementLevel;let i="present";e>.8&&t>=1?i="delighted":e>.65?i="warm":e>.55&&t>=1?i="curious":e<.35&&(i="concerned"),i!==this.currentMood&&this.transitionToMood(i)},transitionToMood(e){if(!this.orb||s.respectsReducedMotion)return;const t=this.moods[e];t&&(Object.keys(this.moods).forEach(i=>{this.orb.classList.remove(`ferni-mood-${i}`)}),this.orb.classList.add(`ferni-mood-${e}`),this.orb.style.setProperty("--mood-breath-rate",`${t.breathRate}ms`),this.orb.style.setProperty("--mood-glow-intensity",t.glowIntensity),this.currentMood=e,n.ferniMood=e,Math.random()<t.pulseChance&&this.moodPulse())},moodPulse(){!this.orb||s.respectsReducedMotion||this.orb.animate([{transform:"scale(1)",filter:"brightness(1)"},{transform:"scale(1.03)",filter:"brightness(1.1)"},{transform:"scale(1)",filter:"brightness(1)"}],{duration:600,easing:"cubic-bezier(0.34, 1.56, 0.64, 1)"})}},d={sections:null,observer:null,visibilityTimers:new Map,init(){this.sections=document.querySelectorAll("section[id], .section"),this.setupObserver()},setupObserver(){this.observer=new IntersectionObserver(e=>{e.forEach(t=>{const i=t.target,r=i.id||i.className;t.isIntersecting?this.startTracking(i,r):this.stopTracking(r)})},{threshold:.5}),this.sections.forEach(e=>this.observer.observe(e))},startTracking(e,t){const i=Date.now(),r=setInterval(()=>{const a=Date.now()-i;n.attentionMap.set(t,{duration:a,lastSeen:Date.now(),element:e}),a>=s.attention.minDuration&&this.markAttended(e,a),a===s.attention.minDuration&&o.adjustSentiment("scrollPause")},500);this.visibilityTimers.set(t,r)},stopTracking(e){const t=this.visibilityTimers.get(e);t&&(clearInterval(t),this.visibilityTimers.delete(e))},markAttended(e,t){if(!s.respectsReducedMotion&&!e.classList.contains("ferni-attended")){e.classList.add("ferni-attended");const i=Math.min(1,t/1e4);e.style.setProperty("--attention-intensity",i)}},getMostAttended(e=3){return Array.from(n.attentionMap.entries()).sort((i,r)=>r[1].duration-i[1].duration).slice(0,e).map(([i,r])=>({id:i,...r}))}},g={patterns:{teamInterest:{trigger:()=>{const e=n.attentionMap.get("team");return e&&e.duration>5e3},action:()=>this.highlightCTA("Meet the team \u2192","#team")},pricingIntent:{trigger:()=>{const e=n.attentionMap.get("pricing");return e&&e.duration>8e3},action:()=>this.showSoftNudge("Ready to start? Your first 5 conversations are free.")},ctaHesitation:{trigger:()=>n.interactionCount>10&&!n.hasClickedCTA,action:()=>this.showSoftNudge("No pressure. Just try talking to Ferni.")},highEngagementNoConversion:{trigger:()=>n.sentiment>.7&&n.engagementLevel>=2&&!n.hasConverted,action:()=>this.pulseDemo()}},triggeredPatterns:new Set,init(){setInterval(()=>this.checkPatterns(),5e3)},checkPatterns(){Object.entries(this.patterns).forEach(([e,t])=>{!this.triggeredPatterns.has(e)&&t.trigger()&&(this.triggeredPatterns.add(e),t.action())})},highlightCTA(e,t){const i=document.querySelector(`a[href="${t}"]`);i&&!s.respectsReducedMotion&&(i.classList.add("ferni-suggested"),setTimeout(()=>i.classList.remove("ferni-suggested"),5e3))},showSoftNudge(e){s.debug&&console.log("[Ferni Sentience] Soft nudge (disabled):",e)},pulseDemo(){const e=document.querySelector(".ferni-demo-trigger");e&&!s.respectsReducedMotion&&(e.classList.add("ferni-pulse-attention"),setTimeout(()=>e.classList.remove("ferni-pulse-attention"),3e3))}},p={lastScrollY:0,lastScrollTime:0,velocitySamples:[],init(){window.addEventListener("scroll",this.handleScroll.bind(this),{passive:!0})},handleScroll(){const e=Date.now(),t=window.scrollY;if(this.lastScrollTime>0){const i=Math.abs(t-this.lastScrollY),r=e-this.lastScrollTime,a=i/r;this.velocitySamples.push(a),this.velocitySamples.length>10&&this.velocitySamples.shift(),n.scrollVelocity=this.velocitySamples.reduce((m,b)=>m+b,0)/this.velocitySamples.length,a>3?o.adjustSentiment("fastScroll"):a<.5&&a>0&&o.adjustSentiment("slowScroll")}this.lastScrollY=t,this.lastScrollTime=e}},f={init(){document.querySelectorAll(".btn--primary, .btn--secondary").forEach(e=>{e.addEventListener("mouseenter",()=>{o.adjustSentiment("ctaHover"),n.interactionCount++}),e.addEventListener("click",()=>{n.hasClickedCTA=!0,o.adjustSentiment("demoOpen")})}),document.querySelectorAll(".team-card, .persona-card").forEach(e=>{e.addEventListener("click",()=>{o.adjustSentiment("teamClick"),n.engagementLevel=Math.min(2,n.engagementLevel+1)})}),document.querySelectorAll(".faq-item, details").forEach(e=>{e.addEventListener("toggle",()=>{o.adjustSentiment("faqOpen")})}),setTimeout(()=>{o.adjustSentiment("timeSpent30s"),n.engagementLevel=Math.min(2,n.engagementLevel+1)},3e4),setTimeout(()=>{o.adjustSentiment("timeSpent60s"),n.engagementLevel=2},6e4),document.addEventListener("click",e=>{e.target.closest(".ferni-demo-trigger")&&(o.adjustSentiment("demoOpen"),n.engagementLevel=2)})}};function y(){if(document.getElementById("ferni-sentience-styles"))return;const e=document.createElement("style");e.id="ferni-sentience-styles",e.textContent=`
      /* Sentiment color shifts */
      :root {
        --sentiment-hue-shift: 0deg;
        --sentiment-saturation-boost: 0%;
        --sentiment-lightness-boost: 0%;
        --sentiment-level: 0.5;
        --warmth-filter: none;
      }
      
      .hero__bg {
        filter: var(--warmth-filter);
        transition: filter 2s ease;
      }
      
      /* Typing sync breathing */
      .ferni-typing-sync {
        animation: ferni-typing-breath var(--typing-breath-rate, 4000ms) ease-in-out infinite !important;
      }
      
      @keyframes ferni-typing-breath {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
      }
      
      .ferni-listening-to-typing {
        transform: translateY(-2px);
        transition: transform 0.3s ease;
      }
      
      /* Mood states */
      .ferni-mood-present { --mood-color: var(--color-ferni, #4a6741); }
      .ferni-mood-curious { --mood-color: #5a8060; }
      .ferni-mood-warm { --mood-color: #6a9070; }
      .ferni-mood-delighted { --mood-color: #7aa080; }
      .ferni-mood-concerned { --mood-color: #5a7050; }
      
      [class*="ferni-mood-"] {
        animation: mood-breath var(--mood-breath-rate, 4000ms) ease-in-out infinite;
      }
      
      @keyframes mood-breath {
        0%, 100% { 
          box-shadow: 0 0 40px rgba(74, 103, 65, calc(var(--mood-glow-intensity, 0.3)));
        }
        50% { 
          box-shadow: 0 0 60px rgba(74, 103, 65, calc(var(--mood-glow-intensity, 0.3) + 0.1));
        }
      }
      
      /* Attention awareness */
      .ferni-attended {
        position: relative;
      }
      
      .ferni-attended::after {
        content: '';
        position: absolute;
        left: -20px;
        top: 50%;
        transform: translateY(-50%);
        width: 4px;
        height: calc(var(--attention-intensity, 0.5) * 60%);
        background: linear-gradient(180deg, transparent, var(--color-ferni, #4a6741), transparent);
        border-radius: 2px;
        opacity: 0.3;
        transition: height 0.5s ease, opacity 0.5s ease;
      }
      
      /* Suggested CTA highlight */
      .ferni-suggested {
        animation: ferni-suggest 2s ease infinite;
      }
      
      @keyframes ferni-suggest {
        0%, 100% { box-shadow: 0 0 0 0 rgba(74, 103, 65, 0); }
        50% { box-shadow: 0 0 20px 5px rgba(74, 103, 65, 0.3); }
      }
      
      /* Soft nudge - DISABLED (kept for reference)
       * Previously showed floating message boxes - users found them intrusive
       * Sentiment feedback now happens through color shifts and mood states
       */
      
      /* Demo pulse attention */
      .ferni-pulse-attention {
        animation: ferni-pulse-attention 1s ease infinite;
      }
      
      @keyframes ferni-pulse-attention {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .ferni-typing-sync,
        [class*="ferni-mood-"],
        .ferni-suggested,
        .ferni-pulse-attention {
          animation: none !important;
        }
        
        .ferni-soft-nudge {
          transition: opacity 0.3s ease;
          transform: none;
        }
      }
    `,document.head.appendChild(e)}const l={isMobile:/iPhone|iPad|iPod|Android/i.test(navigator.userAgent),supportsHaptics:"vibrate"in navigator,touchStartTime:0,init(){this.isMobile&&(document.addEventListener("touchstart",this.handleTouchStart.bind(this),{passive:!0}),document.addEventListener("touchend",this.handleTouchEnd.bind(this),{passive:!0}),this.initMobileScroll(),this.adjustNudgePositioning())},handleTouchStart(e){this.touchStartTime=Date.now(),e.target.closest(".btn, .team-card, .persona-card, .faq-item")&&n.interactionCount++},handleTouchEnd(e){const t=Date.now()-this.touchStartTime,i=e.target.closest(".btn--primary, .btn--secondary");t>500&&i&&(o.adjustSentiment("ctaHover"),this.hapticFeedback("light")),t<300&&i&&(o.adjustSentiment("ctaHover"),this.hapticFeedback("medium")),e.target.closest(".ferni-demo-trigger")&&this.hapticFeedback("heavy")},hapticFeedback(e){if(!this.supportsHaptics||s.respectsReducedMotion)return;const t={light:[10],medium:[20],heavy:[30,10,30],success:[10,50,20]};try{navigator.vibrate(t[e]||[10])}catch{}},initMobileScroll(){let e=0,t=0;document.addEventListener("touchmove",r=>{const a=r.touches[0];t=Math.abs(a.clientY-e),t>30&&o.adjustSentiment("fastScroll"),e=a.clientY},{passive:!0});let i;document.addEventListener("scroll",()=>{clearTimeout(i),i=setTimeout(()=>{t<5&&o.adjustSentiment("scrollPause"),t=0},150)},{passive:!0})},adjustNudgePositioning(){}};function h(){y(),o.init(),u.init(),c.init(),d.init(),g.init(),p.init(),f.init(),l.init(),window.FerniSentience={state:()=>({...n}),sentiment:()=>n.sentiment,mood:()=>n.ferniMood,attention:()=>d.getMostAttended(),adjustSentiment:e=>o.adjustSentiment(e),isMobile:()=>l.isMobile,haptic:e=>l.hapticFeedback(e)},console.log("%c\u{1F9E0} Ferni Sentience loaded","color: #4a6741; font-weight: bold;"),console.log("%c5 New Capabilities Active:","color: #756a5e; font-size: 11px;"),console.log("%c  1. Sentiment Color Shifts","color: #756a5e; font-size: 10px;"),console.log("%c  2. Typing Cadence Mirroring","color: #756a5e; font-size: 10px;"),console.log("%c  3. Emotional Contagion","color: #756a5e; font-size: 10px;"),console.log("%c  4. Attention Awareness","color: #756a5e; font-size: 10px;"),console.log("%c  5. Predictive Presence","color: #756a5e; font-size: 10px;"),l.isMobile&&console.log("%c  \u{1F4F1} Mobile optimizations active","color: #756a5e; font-size: 10px;")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",h):h()})();
