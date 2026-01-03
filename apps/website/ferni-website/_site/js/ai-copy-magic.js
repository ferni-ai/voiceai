"use strict";(function(){"use strict";const c={apiBase:window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1"?"http://localhost:3002/api/landing":"/api/landing",aiApiBase:window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1"?"http://localhost:3002/api/landing/ai":"/api/landing/ai",enablePersonalizedHero:!0,enableSmartSocialProof:!0,enableAdaptiveCTA:!0,enableHoverInsights:!0,enablePersonaVoices:!0,enableSentimentTracking:!0,engagedScrollDepth:.4,hesitantTime:3e4,veryEngagedTime:6e4,cacheTTL:3e5,debug:!1},o={initialized:!1,visitorId:null,visitCount:1,isReturning:!1,scrollDepth:0,timeOnPage:0,currentSection:"hero",sentimentScore:.5,interactions:0,lastInteraction:Date.now(),sectionsViewed:new Set(["hero"]),heroPersonalized:!1,cache:new Map};function l(...e){c.debug&&console.log("%c[AI Copy Magic]","color: #4a6741; font-weight: bold;",...e)}function H(){let e=localStorage.getItem("ferni_visitor_id");return e||(e="fv_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10),localStorage.setItem("ferni_visitor_id",e)),e}function R(){const e=parseInt(localStorage.getItem("ferni_visit_count")||"0",10)+1;return localStorage.setItem("ferni_visit_count",String(e)),e}function k(){const e=new Date().getHours();return e>=0&&e<5?"late-night":e>=5&&e<9?"early-morning":e>=9&&e<12?"morning":e>=12&&e<14?"lunch":e>=14&&e<17?"afternoon":e>=17&&e<21?"evening":"night"}function te(e,t){return`${e}_${JSON.stringify(t)}`}function oe(e){const t=o.cache.get(e);return t?Date.now()-t.timestamp>c.cacheTTL?(o.cache.delete(e),null):t.data:null}function ne(e,t){o.cache.set(e,{data:t,timestamp:Date.now()})}async function E(e,t={}){try{const r=await fetch(`${c.aiApiBase}${e}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!r.ok)throw new Error(`API error: ${r.status}`);return await r.json()}catch(r){return l("API error:",r),null}}async function ie(){try{const e=await fetch(`${c.apiBase}/optimize`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({visitorId:o.visitorId,behaviorSignals:{scrollDepth:o.scrollDepth,timeOnPage:o.timeOnPage,sectionsViewed:Array.from(o.sectionsViewed),interactions:o.interactions},device:window.innerWidth<768?"mobile":window.innerWidth<1024?"tablet":"desktop",currentSection:o.currentSection,hour:new Date().getHours()})});return e.ok?await e.json():null}catch(e){return l("Optimization error:",e),null}}const b={"late-night":{tagline:"CAN'T SLEEP? NEITHER CAN I.",headline:"I'm here. <span class='hero__headline-accent'>Right now.</span>",subhead:"No judgment about the hour. No tired sighs. Just presence when you need it most.",cta:"Talk to me"},"early-morning":{tagline:"EARLY START? GOOD.",headline:"Let's make <span class='hero__headline-accent'>today count.</span>",subhead:"Start your day with someone who remembers what you're working toward.",cta:"Start your day"},morning:{tagline:"GOOD MORNING.",headline:"Ready when <span class='hero__headline-accent'>you are.</span>",subhead:"What's on your mind? I've got all the time in the world.",cta:"Begin a conversation"},lunch:{tagline:"QUICK BREAK?",headline:"Let's make it <span class='hero__headline-accent'>count.</span>",subhead:"Even a few minutes can shift your perspective.",cta:"Quick check-in"},afternoon:{tagline:"AFTERNOON CLARITY.",headline:"What's <span class='hero__headline-accent'>weighing on you?</span>",subhead:"Sometimes the afternoon slump is really something unspoken. Let's explore it.",cta:"Talk it through"},evening:{tagline:"HOW WAS YOUR DAY?",headline:"Ready to <span class='hero__headline-accent'>unpack it?</span>",subhead:"End your day with someone who actually wants to hear about it.",cta:"Reflect together"},night:{tagline:"LATE NIGHT THOUGHTS?",headline:"I'm still <span class='hero__headline-accent'>here.</span>",subhead:"The quiet hours often bring the realest conversations.",cta:"Talk to me"},returning:{tagline:"WELCOME BACK.",headline:"Missed you. <span class='hero__headline-accent'>What's new?</span>",subhead:"I still remember where we left off. Ready to pick up?",cta:"Continue our conversation"},loyal:{tagline:"HEY, YOU.",headline:"Ready to <span class='hero__headline-accent'>go deeper?</span>",subhead:"You keep coming back. Let's figure out what's really drawing you here.",cta:"Let's talk"},default:{tagline:"BETTER THAN HUMAN.",headline:"Finally, someone who <span class='hero__headline-accent'>gets it.</span>",subhead:"Someone who remembers your whole story, hears what you're not saying, and shows up at 2am with the same presence as noon.",cta:"Meet Ferni"}};async function x(){if(!c.enablePersonalizedHero||o.heroPersonalized)return;let e="default";o.visitCount>3?e="loyal":o.isReturning?e="returning":e=k();const t=b[e]||b.default,r=document.querySelector('.hero__tagline, .hero__eyebrow, [class*="eyebrow"]'),n=document.querySelector('.hero__headline, .hero__title, [class*="hero"] h1'),a=document.querySelector('.hero__subhead, .hero__subtitle, [class*="hero"] p'),s=document.querySelector('.hero__cta .btn--primary, .hero .btn--primary, [class*="hero"] .btn'),u=[r,n,a,s].filter(Boolean);if(u.forEach(i=>{i.style.transition="opacity 0.3s ease",i.style.opacity="0"}),await new Promise(i=>setTimeout(i,300)),r&&(r.textContent=t.tagline),n&&(n.innerHTML=t.headline),a&&(a.textContent=t.subhead),s){const i=s.querySelector("svg");s.textContent=t.cta+" ",i&&s.appendChild(i)}await new Promise(i=>setTimeout(i,50)),u.forEach(i=>{i.style.opacity="1"}),document.body.classList.add("hero-personalized",`hero-variant--${e}`),o.heroPersonalized=!0,l("Hero personalized:",e),E("/personalized-hero",{hour:new Date().getHours(),isReturning:o.isReturning,visitCount:o.visitCount,referrer:document.referrer||"direct"}).then(i=>{if(i&&i.headline){l("AI-enhanced hero received:",i);const h=document.querySelector('.hero__tagline, .hero__eyebrow, [class*="eyebrow"]'),d=document.querySelector('.hero__headline, .hero__title, [class*="hero"] h1'),m=document.querySelector('.hero__subhead, .hero__subtitle, [class*="hero"] p'),y=document.querySelector('.hero__cta .btn--primary, .hero .btn--primary, [class*="hero"] .btn');(async()=>{const w=[h,d,m,y].filter(Boolean);if(w.forEach(p=>{p.style.transition="opacity 0.4s ease, transform 0.4s ease",p.style.opacity="0",p.style.transform="translateY(-4px)"}),await new Promise(p=>setTimeout(p,400)),h&&i.tagline&&(h.textContent=i.tagline.toUpperCase()),d&&i.headline&&(d.innerHTML=i.headline),m&&i.subhead&&(m.textContent=i.subhead),y&&i.ctaText){const p=y.querySelector("svg");y.innerHTML=i.ctaText+" ",p&&y.appendChild(p)}await new Promise(p=>setTimeout(p,50)),w.forEach(p=>{p.style.opacity="1",p.style.transform="translateY(0)"}),document.body.classList.add("hero-ai-enhanced"),l("Hero updated with AI content")})()}}).catch(i=>{l("AI hero fetch failed (using fallback):",i)})}const O=[{text:"That thing you mentioned six months ago? We remember.",type:"memory",icon:"\u{1F9E0}"},{text:"Last night at 2:47am, someone had a breakthrough. I was there.",type:"presence",icon:"\u{1F319}"},{text:"Someone said 'I'm fine' three times this week. So I asked what was really going on.",type:"insight",icon:"\u{1F441}\uFE0F"},{text:"2am panic? Same warmth as noon. No tired sighs.",type:"presence",icon:"\u23F0"},{text:"47 minutes talking about a decision. No 'we need to wrap up.'",type:"presence",icon:"\u{1F4AC}"},{text:"Six perspectives. One conversation. No referrals.",type:"team",icon:"\u{1F465}"},{text:"You mention stress to Ferni. Maya already knows to ask about your sleep.",type:"team",icon:"\u{1F91D}"},{text:"Your therapist has 47 other patients. We have just you.",type:"human",icon:"\u{1F49A}"},{text:"Friends forget. Best friends mostly remember. We never forget. Ever.",type:"memory",icon:"\u221E"},{text:"Zero judgment. Not reduced judgment. Zero.",type:"human",icon:"\u{1F64F}"}];let _=0,P=null,f=[...O];function Y(){if(!c.enableSmartSocialProof)return;fetch(`${c.aiApiBase}/social-proof`).then(n=>n.json()).then(n=>{Array.isArray(n)&&n.length>0&&(l("AI social proof received:",n),n.forEach((a,s)=>{(a.content||a.text)&&f.splice(s*3,0,{text:a.content||a.text,type:a.type||"ai",icon:"\u2728",isAI:!0})}),l("Social proof now includes AI messages:",f.length))}).catch(n=>l("AI social proof fetch failed:",n));let e=document.querySelector(".social-proof-dynamic, .social-proof-ticker");if(!e){const n=document.querySelector('.hero, [class*="hero"]');if(!n)return;e=document.createElement("div"),e.className="social-proof-dynamic ai-social-proof",e.innerHTML=`
        <div class="social-proof-dynamic__inner">
          <div class="social-proof-dynamic__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
          <p class="social-proof-dynamic__text"></p>
        </div>
      `,n.after(e),W()}const t=e.querySelector(".social-proof-dynamic__text, p");if(!t)return;function r(){const n=f[_%f.length];t.style.opacity="0",t.style.transform="translateY(10px)",setTimeout(()=>{t.textContent=n.text,t.style.opacity="1",t.style.transform="translateY(0)",n.isAI?t.classList.add("ai-generated"):t.classList.remove("ai-generated")},300),_=(_+1)%f.length}r(),P=setInterval(r,8e3),l("Social proof initialized")}function W(){if(document.getElementById("ai-social-proof-styles"))return;const e=document.createElement("style");e.id="ai-social-proof-styles",e.textContent=`
      .ai-social-proof {
        padding: 16px 0;
        background: linear-gradient(
          90deg, 
          transparent 0%, 
          rgba(74, 103, 65, 0.05) 20%, 
          rgba(74, 103, 65, 0.05) 80%, 
          transparent 100%
        );
        border-top: 1px solid rgba(74, 103, 65, 0.1);
        border-bottom: 1px solid rgba(74, 103, 65, 0.1);
        overflow: hidden;
      }
      
      .ai-social-proof .social-proof-dynamic__inner {
        max-width: 800px;
        margin: 0 auto;
        padding: 0 24px;
        display: flex;
        align-items: center;
        gap: 16px;
      }
      
      .ai-social-proof .social-proof-dynamic__avatar {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #5a7751, #4a6741);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 12px;
        font-weight: 700;
        flex-shrink: 0;
      }
      
      .ai-social-proof .social-proof-dynamic__text {
        margin: 0;
        font-size: 15px;
        color: #2c2520;
        line-height: 1.6;
        font-style: italic;
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      
      @media (max-width: 768px) {
        .ai-social-proof .social-proof-dynamic__inner {
          flex-direction: column;
          text-align: center;
        }
      }
    `,document.head.appendChild(e)}const S=[{time:"3:47 AM",thought:`"I can't stop thinking about what I said to her..."`,category:"relationship"},{time:"2:23 AM",thought:`"Why did I react like that? Now everything's ruined..."`,category:"relationship"},{time:"4:15 AM",thought:`"I should have said something. Now it's too late..."`,category:"relationship"},{time:"3:12 AM",thought:`"What if I'm not good enough for this job?"`,category:"career"},{time:"2:58 AM",thought:'"Everyone else seems to have it figured out..."',category:"career"},{time:"4:02 AM",thought:`"I don't know if I can keep doing this..."`,category:"career"},{time:"3:33 AM",thought:'"What am I even doing with my life?"',category:"existential"},{time:"2:47 AM",thought:'"Is this really all there is?"',category:"existential"},{time:"3:51 AM",thought:'"Why do I always mess things up?"',category:"self-doubt"},{time:"4:19 AM",thought:`"I'm never going to change..."`,category:"self-doubt"},{time:"2:34 AM",thought:`"There's just too much. I can't handle all of this..."`,category:"overwhelm"},{time:"3:07 AM",thought:'"How did I let things get this bad?"',category:"overwhelm"}],z=[{who:"Your coach",status:"Asleep. Next session is Thursday."},{who:"Your therapist",status:"Costs $200/session. Can't afford another this week."},{who:"Your mentor",status:"Too busy. You feel guilty asking."},{who:"Your best friend",status:"Has their own problems. You don't want to burden them."},{who:"Your partner",status:"Sleeping next to you. Wouldn't understand anyway."},{who:"Your mom",status:"Would just worry. You can't put that on her."},{who:"Your sibling",status:"Lives far away. You've drifted apart."},{who:"Your journal",status:"Doesn't talk back. You need someone to hear you."},{who:"The internet",status:"Generic tips. No one knows your story."},{who:"AI chatbots",status:"Forgot everything you told them last week."}],C=[{says:`"I'm here. Tell me what's on your mind."`,sub:"Same warmth at 3am as 3pm. Every time."},{says:'"I remember you mentioned something like this before..."',sub:"Unlike humans, I never forget."},{says:'"That sounds really heavy. Want to talk it through?"',sub:"No judgment. No tired sighs. Just presence."},{says:`"I've got all the time you need."`,sub:"No other patients. No session limits."},{says:`"You don't have to carry this alone."`,sub:"I'm literally always here."}];let M=0,D=null;function B(){document.querySelector(".two-am")&&(L(),D=setInterval(L,12e3),j(),l("2AM Moment AI initialized"))}function L(){const e=document.querySelector(".two-am__time"),t=document.querySelector(".two-am__quote"),r=document.querySelector(".two-am__limitations"),n=document.querySelector(".two-am__ferni-says"),a=document.querySelector(".two-am__ferni-sub");if(!e||!t)return;const s=S[M%S.length],u=[...z].sort(()=>Math.random()-.5).slice(0,3),i=C[Math.floor(Math.random()*C.length)],h=[e,t,r,n,a].filter(Boolean);h.forEach(d=>{d.style.transition="opacity 0.5s ease, transform 0.5s ease",d.style.opacity="0",d.style.transform="translateY(-8px)"}),setTimeout(()=>{e.textContent=s.time,t.textContent=s.thought,r&&r.querySelectorAll(".two-am__limit").forEach((m,y)=>{if(u[y]){const A=m.querySelector(".two-am__limit-who"),w=m.querySelector(".two-am__limit-status");A&&(A.textContent=u[y].who),w&&(w.textContent=u[y].status)}}),n&&(n.textContent=i.says),a&&(a.textContent=i.sub),setTimeout(()=>{h.forEach(d=>{d.style.opacity="1",d.style.transform="translateY(0)"})},50)},500),M++}async function j(){try{const e=await fetch(`${c.aiApiBase}/late-night-scenario`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({hour:new Date().getHours(),isReturning:o.isReturning})});if(e.ok){const t=await e.json();t&&t.thought&&(S.unshift({time:t.time||"3:17 AM",thought:`"${t.thought}"`,category:t.category||"ai-generated",isAI:!0}),l("AI-generated 2AM scenario added:",t.thought))}}catch(e){l("AI 2AM scenario fetch failed (using fallbacks):",e)}}const F={hesitant:{text:"Just try talking",subtext:"No signup needed",style:"btn--ghost"},neutral:{text:"Meet Ferni",subtext:"Free to start",style:"btn--primary"},engaged:{text:"Talk to Ferni",subtext:"Join 50,000+ finding clarity",style:"btn--primary"},veryEngaged:{text:"Let's do this",subtext:"Begin your first conversation",style:"btn--primary btn--glow"}};function v(){if(!c.enableAdaptiveCTA)return;let e=.5;e+=o.scrollDepth*.2,o.timeOnPage>c.veryEngagedTime?e+=.2:o.timeOnPage>c.hesitantTime&&(e+=.1),e+=Math.min(o.interactions*.05,.2),e=Math.max(0,Math.min(1,e)),o.sentimentScore=e;let t="neutral";e<.3?t="hesitant":e>.7?t="veryEngaged":e>.5&&(t="engaged");const r=F[t];document.querySelectorAll(".section__cta .btn--primary, .cta-section .btn--primary").forEach(a=>{const s=a.querySelector("svg");a.textContent=r.text+" ",s&&a.appendChild(s),a.className=a.className.replace(/btn--primary|btn--ghost|btn--glow/g,"").trim(),a.classList.add(r.style)}),l("CTA updated:",t,"sentiment:",e.toFixed(2))}const N={"team-card":["Want to ask them something? Go ahead.","Each of us brings something different.","Real conversations, real perspectives."],feature:["Let me show you how this actually works.","This isn't marketing speak. Try it.","Curious? Just ask me about it."],testimonial:["Stories like this happen every day.","This could be you in a few weeks.","Real people. Real breakthroughs."],faq:["Have a question? I'm happy to dig deeper.","The real answer is always longer. Let's talk.","Ask me anything. I mean it."],pricing:["No pressure. Really.","Free means free. Forever.","Questions about plans? Just ask."],cta:["Ready when you are.","No signup needed to try.","What's stopping you? Let's talk about it."]};let g=null;function V(){if(!c.enableHoverInsights)return;g=document.createElement("div"),g.className="ai-hover-insight",g.innerHTML=`
      <div class="ai-hover-insight__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
      <span class="ai-hover-insight__text"></span>
    `,document.body.appendChild(g),J(),[{selector:".team-card, .team__member",type:"team-card"},{selector:'.feature, .feature-card, [class*="feature"]',type:"feature"},{selector:".testimonial, .testimonial-card",type:"testimonial"},{selector:".faq__item, .faq-item",type:"faq"},{selector:".pricing, .pricing-card",type:"pricing"},{selector:".btn--primary, .cta-button",type:"cta"}].forEach(({selector:t,type:r})=>{document.querySelectorAll(t).forEach(n=>{n.addEventListener("mouseenter",a=>$(a,r)),n.addEventListener("mouseleave",G)})}),l("Hover insights initialized")}function $(e,t){const r=N[t]||N.feature,n=r[Math.floor(Math.random()*r.length)],a=g.querySelector(".ai-hover-insight__text");a.textContent=n;const s=e.target.getBoundingClientRect(),u=g.getBoundingClientRect();let i=s.left+s.width/2-u.width/2,h=s.top-u.height-10;i=Math.max(10,Math.min(i,window.innerWidth-u.width-10)),h<10&&(h=s.bottom+10),g.style.left=i+"px",g.style.top=h+window.scrollY+"px",g.classList.add("is-visible")}function G(){g.classList.remove("is-visible")}function J(){if(document.getElementById("ai-hover-insight-styles"))return;const e=document.createElement("style");e.id="ai-hover-insight-styles",e.textContent=`
      .ai-hover-insight {
        position: absolute;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        background: #2c2520;
        color: #faf8f5;
        border-radius: 20px;
        font-size: 13px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        opacity: 0;
        visibility: hidden;
        transform: translateY(5px);
        transition: all 0.2s ease;
        pointer-events: none;
        max-width: 280px;
      }
      
      .ai-hover-insight.is-visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
      
      .ai-hover-insight__avatar {
        width: 24px;
        height: 24px;
        background: linear-gradient(135deg, #5a7751, #4a6741);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8px;
        font-weight: 700;
        flex-shrink: 0;
      }
      
      .ai-hover-insight__text {
        line-height: 1.4;
      }
      
      @media (max-width: 768px) {
        .ai-hover-insight {
          display: none;
        }
      }
    `,document.head.appendChild(e)}const I={ferni:{greeting:"What's on your mind?",style:"warm, present, curious",sample:"That's a thoughtful question. What does your gut tell you?"},maya:{greeting:"What small step could we take today?",style:"gentle, practical, encouraging",sample:"What if we started with just two minutes? Embarrassingly small is perfect."},peter:{greeting:"Let's dig into this together.",style:"curious, thorough, analytical",sample:"Interesting. I found three perspectives on this we should explore."},alex:{greeting:"How can I help you communicate?",style:"clear, empathetic, strategic",sample:"Let's think about who you're talking to and what outcome you need."},jordan:{greeting:"What are we planning?",style:"organized, creative, calm",sample:"Let's map this out. What matters most to you about this event?"},nayan:{greeting:"What's weighing on your soul?",style:"wise, calm, philosophical",sample:"There's an old saying that might resonate here. Would you like to hear it?"}};function U(){c.enablePersonaVoices&&(document.querySelectorAll(".team-card, .team__member").forEach(e=>{const t=e.dataset.persona||K(e);if(!t||!I[t]||e.querySelector(".persona-voice-input"))return;const n=document.createElement("div");n.className="persona-voice-input",n.innerHTML=`
        <input type="text" placeholder="${I[t].greeting}" />
        <button class="persona-voice-send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      `;const a=e.querySelector(".team-card__content, .team__content");a?a.appendChild(n):e.appendChild(n);const s=n.querySelector("input"),u=n.querySelector(".persona-voice-send"),i=async()=>{const h=s.value.trim();if(!h)return;u.disabled=!0,s.disabled=!0;const d=await E("/persona-preview",{personaId:t,userInput:h}),m=document.createElement("div");m.className="persona-voice-response",m.innerHTML=`
          <blockquote>"${d?.response||I[t].sample}"</blockquote>
        `,n.replaceWith(m),requestAnimationFrame(()=>{m.classList.add("is-visible")})};u.addEventListener("click",i),s.addEventListener("keypress",h=>{h.key==="Enter"&&i()})}),Q(),l("Persona voices initialized"))}function K(e){const t=e.textContent.toLowerCase();return t.includes("ferni")||t.includes("life coach")?"ferni":t.includes("maya")||t.includes("habit")?"maya":t.includes("peter")||t.includes("research")?"peter":t.includes("alex")||t.includes("communication")?"alex":t.includes("jordan")||t.includes("plan")?"jordan":t.includes("nayan")||t.includes("wisdom")?"nayan":null}function Q(){if(document.getElementById("ai-persona-voice-styles"))return;const e=document.createElement("style");e.id="ai-persona-voice-styles",e.textContent=`
      .persona-voice-input {
        display: flex;
        gap: 8px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(44, 37, 32, 0.1);
      }
      
      .persona-voice-input input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid rgba(44, 37, 32, 0.15);
        border-radius: 20px;
        font-size: 13px;
        background: white;
        transition: border-color 0.2s;
      }
      
      .persona-voice-input input:focus {
        outline: none;
        border-color: var(--team-color, #4a6741);
      }
      
      .persona-voice-send {
        width: 36px;
        height: 36px;
        background: var(--team-color, #4a6741);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, opacity 0.2s;
      }
      
      .persona-voice-send:hover {
        transform: scale(1.05);
      }
      
      .persona-voice-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .persona-voice-response {
        margin-top: 12px;
        padding: 12px;
        background: rgba(44, 37, 32, 0.03);
        border-radius: 12px;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      
      .persona-voice-response.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      
      .persona-voice-response blockquote {
        margin: 0;
        padding: 0;
        border: none;
        font-style: italic;
        color: #2c2520;
        font-size: 14px;
        line-height: 1.5;
      }
    `,document.head.appendChild(e)}function Z(){const e=window.scrollY,t=document.documentElement.scrollHeight-window.innerHeight;o.scrollDepth=Math.min(1,e/t);const r=document.querySelectorAll("section[id]"),n=window.scrollY+window.innerHeight/2;for(const a of r){const s=a.getBoundingClientRect(),u=s.top+window.scrollY,i=u+s.height;if(n>=u&&n<=i){o.currentSection=a.id,o.sectionsViewed.add(a.id);break}}o.scrollDepth>c.engagedScrollDepth&&v()}function q(){o.interactions++,o.lastInteraction=Date.now(),v()}function X(){o.timeOnPage=Date.now()-o.startTime,Date.now()-o.lastInteraction>c.hesitantTime&&o.scrollDepth<.3&&v()}function T(){o.initialized||(o.visitorId=H(),o.visitCount=R(),o.isReturning=o.visitCount>1,o.startTime=Date.now(),l("Initializing...",{visitorId:o.visitorId,visitCount:o.visitCount,isReturning:o.isReturning,timeOfDay:k()}),setTimeout(()=>x(),100),setTimeout(()=>Y(),500),setTimeout(()=>V(),300),setTimeout(()=>U(),800),setTimeout(()=>B(),1e3),window.addEventListener("scroll",ee(Z,100)),document.addEventListener("click",q),document.addEventListener("keydown",q),setInterval(X,5e3),o.initialized=!0,l("AI Copy Magic initialized"))}function ee(e,t){let r=0;return function(...n){const a=Date.now();a-r>=t&&(r=a,e.apply(this,n))}}window.FerniAICopyMagic={init:T,getState:()=>({...o}),personalizeHero:x,updateCTA:v,config:c,setDebug:e=>{c.debug=e},forceVariant:e=>{b[e]&&(o.heroPersonalized=!1,x())}},document.readyState==="loading"?document.addEventListener("DOMContentLoaded",T):setTimeout(T,50),console.log("%c\u2728 Ferni AI Copy Magic loaded","color: #4a6741; font-weight: bold;")})();
