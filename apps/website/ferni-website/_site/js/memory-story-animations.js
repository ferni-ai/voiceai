"use strict";const EASING={gentle:"cubic-bezier(0.25, 0.1, 0.25, 1)",spring:"cubic-bezier(0.34, 1.56, 0.64, 1)",springGentle:"cubic-bezier(0.34, 1.2, 0.64, 1)",expoOut:"cubic-bezier(0.16, 1, 0.3, 1)",decelerate:"cubic-bezier(0.0, 0.0, 0.2, 1)",organic:"cubic-bezier(0.4, 0.2, 0.2, 1.1)",playful:"cubic-bezier(0.175, 0.885, 0.32, 1.275)",anticipate:"cubic-bezier(0.38, -0.4, 0.88, 0.65)"},DURATION={micro:50,fast:100,normal:200,slow:300,moderate:400,deliberate:500,dramatic:600,celebration:800,glacial:1500},STAGGER={fast:50,normal:80,slow:120,dramatic:180};class MemoryStoryAnimation{constructor(){this.section=document.querySelector(".memory-story"),this.chapters=[],this.insightPanel=null,this.dashboard=null,this.observer=null,this.hasAnimated=!1,this.section&&this.init()}init(){this.chapters=Array.from(this.section.querySelectorAll(".memory-story__chapter")),this.insightPanel=this.section.querySelector(".memory-story__insight"),this.dashboard=this.section.querySelector(".memory-dashboard"),this.injectKeyframes(),this.prepareElements(),this.setupIntersectionObserver(),this.setupHoverEffects(),console.log("%c\u{1F4D6} Memory Story Animations loaded","color: #4a6741; font-weight: bold;")}injectKeyframes(){const e=document.createElement("style");e.id="memory-story-keyframes",e.textContent=`
      /* ========================================
         MEMORY STORY KEYFRAMES - Pixar-Inspired
         ======================================== */
      
      /* Fade up with gentle spring - main card reveal */
      @keyframes memoryCardReveal {
        0% {
          opacity: 0;
          transform: translateY(30px) scale(0.96);
        }
        60% {
          opacity: 1;
          transform: translateY(-4px) scale(1.01);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      /* Time marker fade in */
      @keyframes timeMarkerReveal {
        0% {
          opacity: 0;
          transform: scale(0.8);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }
      
      /* Emotion tag pop - bouncy spring */
      @keyframes emotionTagPop {
        0% {
          opacity: 0;
          transform: scale(0) translateY(10px);
        }
        50% {
          transform: scale(1.15) translateY(-2px);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      
      /* Ferni's card - special treatment with glow */
      @keyframes ferniCardReveal {
        0% {
          opacity: 0;
          transform: translateY(40px) scale(0.94);
          box-shadow: 0 0 0 rgba(74, 103, 65, 0);
        }
        50% {
          opacity: 1;
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 12px 40px rgba(74, 103, 65, 0.15);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
          box-shadow: 0 4px 20px rgba(74, 103, 65, 0.1);
        }
      }
      
      /* Ferni's response typing cursor */
      @keyframes typingCursor {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
      
      /* Ferni avatar breathing - feels alive */
      @keyframes avatarBreathe {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 2px 8px rgba(74, 103, 65, 0.25);
        }
        50% {
          transform: scale(1.03);
          box-shadow: 0 4px 16px rgba(74, 103, 65, 0.35);
        }
      }
      
      /* Insight panel unfold */
      @keyframes insightUnfold {
        0% {
          opacity: 0;
          transform: translateY(20px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      /* Insight item stagger reveal */
      @keyframes insightItemReveal {
        0% {
          opacity: 0;
          transform: translateX(-15px);
        }
        100% {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      /* Sparkle on insight icons */
      @keyframes iconSparkle {
        0% {
          transform: scale(0.8) rotate(-10deg);
          opacity: 0.5;
        }
        50% {
          transform: scale(1.1) rotate(5deg);
          opacity: 1;
        }
        100% {
          transform: scale(1) rotate(0deg);
          opacity: 1;
        }
      }
      
      /* Connection line draw */
      @keyframes drawLine {
        0% {
          stroke-dashoffset: 100%;
        }
        100% {
          stroke-dashoffset: 0;
        }
      }
      
      /* Warmth pulse - the "magic moment" */
      @keyframes warmthPulse {
        0%, 100% {
          box-shadow: 0 0 0 0 rgba(74, 103, 65, 0.3);
        }
        50% {
          box-shadow: 0 0 30px 10px rgba(74, 103, 65, 0.15);
        }
      }
      
      /* Quote marks appear */
      @keyframes quoteReveal {
        0% {
          opacity: 0;
          transform: translateY(10px) rotate(-5deg);
        }
        100% {
          opacity: 0.15;
          transform: translateY(0) rotate(0deg);
        }
      }
      
      /* ========================================
         ANIMATION CLASSES
         ======================================== */
      
      /* Hidden state before animation */
      .memory-story__chapter.animate-ready {
        opacity: 0;
        transform: translateY(30px);
      }
      
      .memory-story__chapter.animate-in .memory-story__marker {
        animation: timeMarkerReveal ${DURATION.slow}ms ${EASING.spring} forwards;
      }
      
      .memory-story__chapter.animate-in .memory-story__card {
        animation: memoryCardReveal ${DURATION.deliberate}ms ${EASING.organic} forwards;
      }
      
      .memory-story__chapter.animate-in .memory-story__tag {
        animation: emotionTagPop ${DURATION.moderate}ms ${EASING.spring} forwards;
        animation-delay: calc(var(--tag-index, 0) * ${STAGGER.fast}ms + ${DURATION.slow}ms);
      }
      
      /* Ferni's card special animation */
      .memory-story__chapter:last-child.animate-in .memory-story__card {
        animation: ferniCardReveal ${DURATION.dramatic}ms ${EASING.organic} forwards;
      }
      
      /* Ferni avatar breathing when visible */
      .memory-story__chapter.animate-in .memory-story__avatar {
        animation: avatarBreathe 4s ${EASING.gentle} infinite;
        animation-delay: ${DURATION.dramatic}ms;
      }
      
      /* Insight panel animations */
      .memory-story__insight.animate-ready {
        opacity: 0;
        transform: translateY(20px);
      }
      
      .memory-story__insight.animate-in {
        animation: insightUnfold ${DURATION.deliberate}ms ${EASING.expoOut} forwards;
      }
      
      .memory-story__insight.animate-in .memory-story__insight-item {
        animation: insightItemReveal ${DURATION.moderate}ms ${EASING.organic} forwards;
        animation-delay: calc(var(--item-index, 0) * ${STAGGER.slow}ms);
      }
      
      .memory-story__insight.animate-in .memory-story__insight-icon {
        animation: iconSparkle ${DURATION.slow}ms ${EASING.spring} forwards;
        animation-delay: calc(var(--item-index, 0) * ${STAGGER.slow}ms + 100ms);
      }
      
      /* Hover enhancements - cards lift and glow */
      .memory-story__card {
        transition: 
          transform ${DURATION.slow}ms ${EASING.spring},
          box-shadow ${DURATION.slow}ms ${EASING.gentle};
      }
      
      .memory-story__card:hover {
        transform: translateY(-6px) scale(1.01);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
      }
      
      .memory-story__card--ferni:hover {
        box-shadow: 0 16px 40px rgba(74, 103, 65, 0.15);
      }
      
      /* Emotion tags hover bounce */
      .memory-story__tag {
        transition: transform ${DURATION.fast}ms ${EASING.spring};
        cursor: default;
      }
      
      .memory-story__tag:hover {
        transform: scale(1.08);
      }
      
      /* Insight items hover */
      .memory-story__insight-item {
        transition: 
          background ${DURATION.normal}ms ${EASING.gentle},
          transform ${DURATION.normal}ms ${EASING.springGentle};
      }
      
      .memory-story__insight-item:hover {
        transform: translateX(4px);
      }
      
      /* ========================================
         MEMORY DASHBOARD ANIMATIONS
         ======================================== */
      
      /* Dashboard container */
      .memory-dashboard.animate-ready {
        opacity: 0;
        transform: translateY(30px);
      }
      
      .memory-dashboard.animate-in {
        animation: insightUnfold ${DURATION.deliberate}ms ${EASING.expoOut} forwards;
      }
      
      /* Graph line draw animation */
      @keyframes dashboardLineReveal {
        from {
          stroke-dashoffset: 500;
        }
        to {
          stroke-dashoffset: 0;
        }
      }
      
      /* Pattern card hover effects */
      .memory-dashboard__pattern {
        transition: 
          transform ${DURATION.slow}ms ${EASING.spring},
          background ${DURATION.normal}ms ${EASING.gentle},
          border-color ${DURATION.normal}ms ${EASING.gentle},
          box-shadow ${DURATION.slow}ms ${EASING.gentle};
      }
      
      .memory-dashboard__pattern:hover {
        transform: translateY(-4px) scale(1.02);
        box-shadow: 0 8px 24px rgba(74, 103, 65, 0.1);
      }
      
      /* Graph point hover */
      .memory-dashboard__point {
        transition: 
          r ${DURATION.fast}ms ${EASING.spring},
          filter ${DURATION.normal}ms ${EASING.gentle};
        cursor: pointer;
      }
      
      /* Connection web subtle float */
      .memory-dashboard__web svg circle {
        transition: 
          fill ${DURATION.normal}ms ${EASING.gentle},
          transform ${DURATION.slow}ms ${EASING.organic};
      }
      
      /* Footer shimmer on hover */
      .memory-dashboard__footer {
        transition: 
          background ${DURATION.normal}ms ${EASING.gentle},
          transform ${DURATION.slow}ms ${EASING.spring};
      }
      
      .memory-dashboard__footer:hover {
        background: linear-gradient(135deg, rgba(184,149,106,0.1) 0%, rgba(74,103,65,0.08) 100%);
        transform: scale(1.01);
      }
      
      /* Ring animation - count up effect */
      .memory-dashboard__ring circle:last-child {
        transition: stroke-dashoffset 1.5s ${EASING.expoOut};
      }
      
      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .memory-story__chapter.animate-ready,
        .memory-story__insight.animate-ready,
        .memory-dashboard.animate-ready {
          opacity: 1;
          transform: none;
        }
        
        .memory-story__chapter.animate-in .memory-story__marker,
        .memory-story__chapter.animate-in .memory-story__card,
        .memory-story__chapter.animate-in .memory-story__tag,
        .memory-story__insight.animate-in,
        .memory-story__insight.animate-in .memory-story__insight-item,
        .memory-story__insight.animate-in .memory-story__insight-icon,
        .memory-dashboard.animate-in,
        .memory-dashboard__pattern,
        .memory-dashboard__web,
        .memory-dashboard__footer {
          animation: none;
          opacity: 1;
          transform: none;
        }
        
        .memory-story__avatar {
          animation: none !important;
        }
        
        .memory-dashboard__line,
        .memory-dashboard__area,
        .memory-dashboard__point {
          animation: none !important;
          opacity: 1;
          stroke-dashoffset: 0 !important;
        }
      }
    `,document.head.appendChild(e)}prepareElements(){this.chapters.forEach((e,t)=>{e.classList.add("animate-ready"),e.style.setProperty("--chapter-index",t),e.querySelectorAll(".memory-story__tag").forEach((n,r)=>{n.style.setProperty("--tag-index",r)})}),this.insightPanel&&(this.insightPanel.classList.add("animate-ready"),this.insightPanel.querySelectorAll(".memory-story__insight-item").forEach((t,a)=>{t.style.setProperty("--item-index",a)})),this.dashboard&&(this.dashboard.classList.add("animate-ready"),this.dashboard.querySelectorAll(".memory-dashboard__pattern").forEach((t,a)=>{t.style.setProperty("--pattern-index",a)}))}setupIntersectionObserver(){if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){this.chapters.forEach(t=>{t.classList.remove("animate-ready"),t.classList.add("animate-in")}),this.insightPanel&&(this.insightPanel.classList.remove("animate-ready"),this.insightPanel.classList.add("animate-in")),this.dashboard&&(this.dashboard.classList.remove("animate-ready"),this.dashboard.classList.add("animate-in"));return}this.observer=new IntersectionObserver(t=>{t.forEach(a=>{a.isIntersecting&&!a.target.classList.contains("animate-in")&&this.animateElement(a.target)})},{threshold:.2,rootMargin:"0px 0px -50px 0px"}),this.chapters.forEach(t=>{this.observer.observe(t)}),this.insightPanel&&this.observer.observe(this.insightPanel),this.dashboard&&this.observer.observe(this.dashboard)}animateElement(e){const t=this.chapters.indexOf(e),a=t===this.chapters.length-1,n=e===this.insightPanel,r=e===this.dashboard;let o=0;t>=0&&(o=STAGGER.dramatic),a&&(o+=DURATION.moderate),setTimeout(()=>{if(e.classList.remove("animate-ready"),e.classList.add("animate-in"),a){const i=e.querySelector(".memory-story__card--ferni");i&&setTimeout(()=>{i.style.animation=`warmthPulse 2s ${EASING.gentle} infinite`},DURATION.dramatic)}r&&this.animateDashboard(e)},o)}animateDashboard(e){this.animateStatCounters(e);const t=e.querySelector(".memory-dashboard__line");t&&(t.style.strokeDasharray="500",t.style.strokeDashoffset="500",t.style.animation=`drawLine 1.5s ${EASING.expoOut} forwards`);const a=e.querySelector(".memory-dashboard__area");a&&(a.style.opacity="0",setTimeout(()=>{a.style.transition=`opacity ${DURATION.deliberate}ms ${EASING.gentle}`,a.style.opacity="1"},DURATION.slow)),e.querySelectorAll(".memory-dashboard__point").forEach((s,m)=>{s.style.opacity="0",s.style.transform="scale(0)",setTimeout(()=>{s.style.transition=`all ${DURATION.moderate}ms ${EASING.spring}`,s.style.opacity="1",s.style.transform="scale(1)"},DURATION.slow+m*STAGGER.normal)});const r=e.querySelectorAll(".memory-dashboard__pattern");r.forEach((s,m)=>{setTimeout(()=>{s.style.opacity="1",s.style.transform="translateY(0)"},DURATION.dramatic+m*STAGGER.slow)});const o=e.querySelector(".memory-dashboard__web");o&&setTimeout(()=>{o.style.opacity="1",o.style.transform="translateY(0)"},DURATION.dramatic+r.length*STAGGER.slow);const i=e.querySelector(".memory-dashboard__footer");i&&setTimeout(()=>{i.style.opacity="1",i.style.transform="translateY(0)"},DURATION.celebration+r.length*STAGGER.slow)}animateStatCounters(e){e.querySelectorAll(".memory-dashboard__stat-value[data-count]").forEach((a,n)=>{const r=parseInt(a.dataset.count,10),o=n*150,i=1200+r*10;setTimeout(()=>{this.countUp(a,r,Math.min(i,2e3))},o)})}countUp(e,t,a){const n=performance.now(),r=0,o=s=>s===1?1:1-Math.pow(2,-10*s),i=s=>{const m=s-n,c=Math.min(m/a,1),l=o(c),d=Math.floor(r+(t-r)*l);e.textContent=d,c<1?requestAnimationFrame(i):(e.textContent=t,e.style.transform="scale(1.1)",e.style.transition=`transform 200ms ${EASING.spring}`,setTimeout(()=>{e.style.transform="scale(1)"},200))};requestAnimationFrame(i)}setupHoverEffects(){this.chapters.forEach(e=>{const t=e.querySelector(".memory-story__card");t&&(t.addEventListener("mousemove",a=>this.handleMagneticHover(a,t)),t.addEventListener("mouseleave",a=>this.resetMagneticHover(t)))})}handleMagneticHover(e,t){const a=t.getBoundingClientRect(),n=e.clientX-a.left-a.width/2,r=e.clientY-a.top-a.height/2,o=2,i=r/a.height*o,s=-(n/a.width)*o;t.style.transform=`
      translateY(-6px) 
      scale(1.01) 
      perspective(1000px) 
      rotateX(${i}deg) 
      rotateY(${s}deg)
    `}resetMagneticHover(e){e.style.transform=""}destroy(){this.observer&&this.observer.disconnect();const e=document.getElementById("memory-story-keyframes");e&&e.remove()}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>new MemoryStoryAnimation):new MemoryStoryAnimation,typeof module<"u"&&module.exports&&(module.exports=MemoryStoryAnimation);
