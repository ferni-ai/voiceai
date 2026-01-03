"use strict";(function(){"use strict";const r={enableWidget:!0,position:"bottom-right",showDelay:3e3,peekDelay:12e3,baseTypingSpeed:35,typingVariation:.4,pausePunctuation:150,pauseComma:80,thinkingDelayBase:600,thinkingDelayPerChar:8,enableSound:!1,debugMode:!1},f={default:{greeting:"Hey. What's on your mind?",exchanges:[{triggers:["stressed","overwhelmed","too much","anxious","anxiety"],responses:["I hear that. Want to talk through what's weighing on you, or would it help more to just... breathe for a moment first?","That sounds heavy. What's one thing that feels the most pressing right now?","Stress has a way of piling up. No rush\u2014just tell me what's there."],emotion:"concerned",showsCapability:"emotional-intelligence",followUp:{triggers:["talk","tell you","vent","yes"],response:"I'm here. Take your time\u2014there's no rush."}},{triggers:["work","job","boss","career","office"],responses:["Work stuff. That can be a lot to carry. What's the main thing sitting with you right now?","Work takes up so much headspace, doesn't it? What's been the hardest part lately?","I hear you. Is it the work itself, or the people, or something else?"],emotion:"curious",showsCapability:"understanding"},{triggers:["relationship","partner","dating","lonely","love","girlfriend","boyfriend"],responses:["Relationships are complicated. I'm not going to give you a quick fix\u2014but I can help you figure out what you're really feeling.","That's tender territory. What part of it do you want to explore?","Love stuff. There's a lot there. What feels most important to talk about?"],emotion:"warm",showsCapability:"depth"},{triggers:["sad","down","depressed","unhappy","miserable"],responses:["I'm sorry you're feeling that way. Sometimes sadness needs space, not solutions. What does yours need right now?","That's hard. I'm not going to try to cheer you up\u2014but I'm here to sit with you in it.","Sadness has something to tell us. Want to listen to it together?"],emotion:"empathetic",showsCapability:"emotional-intelligence"},{triggers:["happy","good","great","excited","amazing"],responses:["That's wonderful to hear! What's bringing that energy?","I love that. Tell me what's going right.","That's great! I'm curious what's lighting you up."],emotion:"delighted"},{triggers:["tired","exhausted","burnt out","burnout","drained"],responses:["Exhaustion is real. Is this a 'I need rest' tired or a 'something deeper' tired?","Being drained like that... it's hard. What's been taking the most from you?","That kind of tired runs deep. What would help right now\u2014rest or talking?"],emotion:"concerned",showsCapability:"understanding"},{triggers:["confused","lost","uncertain","don't know","stuck"],responses:["Being stuck is uncomfortable. But sometimes it's just the pause before clarity. What feels most unclear?","That's okay. Confusion often means you're on the edge of figuring something out.","Not knowing is hard. Let's untangle it together\u2014what feels like the knot?"],emotion:"thoughtful",showsCapability:"depth"},{triggers:["hi","hello","hey","sup"],responses:["Hey. I'm here whenever you're ready to talk. No pressure.","Hey there. What's on your mind today?","Hi. How are you really doing?"],emotion:"neutral"}],defaults:["Tell me more about that. I want to understand.","I'm listening. What else is there?","Say more\u2014I'm here.","What's underneath that?","Keep going. I'm following."]},memory:{greeting:"Last time you mentioned you were working on setting boundaries at work. How's that going?",showsCapability:"memory",explanation:"I remember what matters to you.",emotion:"thoughtful"},lateNight:{greeting:"It's late. Can't sleep, or choosing not to?",showsCapability:"24-7-presence",explanation:"Same presence at 2am as noon.",emotion:"warm"}},L={memory:{label:"Perfect Memory",description:"I remember your whole story"},understanding:{label:"Deep Understanding",description:"I hear what you're not saying"},depth:{label:"Real Depth",description:"Not just surface-level help"},"emotional-intelligence":{label:"Emotional Intelligence",description:"I meet you where you are"},"24-7-presence":{label:"Always Present",description:"Same warmth, any hour"}},_={neutral:{color:"#4a6741",label:"Present"},curious:{color:"#3a6b73",label:"Curious"},warm:{color:"#a67a6a",label:"Warm"},concerned:{color:"#7a6a5a",label:"Concerned"},empathetic:{color:"#8a6a7a",label:"With You"},thoughtful:{color:"#5a6b8a",label:"Thinking"},delighted:{color:"#6a8a5a",label:"Happy"}},s={isOpen:!1,isPeeking:!1,messages:[],conversationScript:null,lastUserMessage:"",showedCapabilities:new Set,usedResponses:new Map,currentEmotion:"neutral",isTyping:!1,initialized:!1};let o=null,k=null,w=null,u=null,g=null;function v(){if(!r.enableWidget)return;W(),E(),setTimeout(()=>{H()},r.showDelay),setTimeout(()=>{s.isOpen||T()},r.peekDelay);const e=new Date().getHours();e>=23||e<5?s.conversationScript=f.lateNight:localStorage.getItem("ferni_demo_visited")?s.conversationScript=f.memory:s.conversationScript=f.default,s.initialized=!0,V("Demo Widget initialized")}function W(){o=document.createElement("div"),o.className="demo-widget",o.innerHTML=`
      <button class="demo-widget__trigger" aria-label="Chat with Ferni">
        <div class="demo-widget__avatar">
          <div class="demo-widget__avatar-glow"></div>
          <div class="demo-widget__avatar-orb">
            <svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg>
          </div>
        </div>
        <div class="demo-widget__peek">
          <span class="demo-widget__peek-text"></span>
        </div>
      </button>
      
      <div class="demo-widget__chat" aria-hidden="true">
        <div class="demo-widget__header">
          <div class="demo-widget__header-avatar">
            <div class="demo-widget__mini-orb">
              <svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg>
              <div class="demo-widget__mini-orb-glow"></div>
            </div>
            <div class="demo-widget__header-info">
              <span class="demo-widget__header-name">Ferni</span>
              <span class="demo-widget__status">Demo Mode</span>
            </div>
            <span class="demo-widget__emotion-badge"></span>
          </div>
          <button class="demo-widget__close" aria-label="Close chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div class="demo-widget__messages">
          <div class="demo-widget__capability-hint" hidden>
            <span class="demo-widget__capability-icon"></span>
            <span class="demo-widget__capability-text"></span>
          </div>
        </div>
        
        <div class="demo-widget__input-area">
          <input 
            type="text" 
            class="demo-widget__input" 
            placeholder="Try typing something..."
            aria-label="Type a message"
          />
          <button class="demo-widget__send" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
          <button class="demo-widget__voice" aria-label="Use voice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </button>
        </div>
        
        <div class="demo-widget__footer">
          <a href="https://app.ferni.ai" class="demo-widget__cta">
            Start a Real Conversation
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
        </div>
      </div>
    `,document.body.appendChild(o),k=o.querySelector(".demo-widget__trigger"),w=o.querySelector(".demo-widget__chat"),u=o.querySelector(".demo-widget__messages"),g=o.querySelector(".demo-widget__input")}function E(){k.addEventListener("click",x),o.querySelector(".demo-widget__close").addEventListener("click",m),o.querySelector(".demo-widget__send").addEventListener("click",S),g.addEventListener("keypress",e=>{e.key==="Enter"&&S()}),o.querySelector(".demo-widget__voice").addEventListener("click",()=>{U()}),document.addEventListener("click",e=>{s.isOpen&&!o.contains(e.target)&&m()})}function H(){o.classList.add("is-visible")}const h={morning:["Morning. Ready when you are.","How are you starting today?","Coffee and a thought?"],afternoon:["Something on your mind?","Taking a break?","How's your day going?"],evening:["Winding down?","How was today?","Want to reflect on today?"],lateNight:["Can't sleep?","Late thoughts?","I'm here. No rush."],returning:["Good to see you again.","Welcome back.","Still here whenever."]};function q(){const e=new Date().getHours();if(parseInt(localStorage.getItem("ferni_visit_count")||"0",10)>2&&Math.random()<.4){const a=h.returning;return a[Math.floor(Math.random()*a.length)]}let i;return e>=23||e<5?i=h.lateNight:e<12?i=h.morning:e<17?i=h.afternoon:i=h.evening,i[Math.floor(Math.random()*i.length)]}function T(){if(s.isOpen)return;s.isPeeking=!0;const e=o.querySelector(".demo-widget__peek-text");e.textContent=q(),o.classList.add("is-peeking"),setTimeout(()=>{s.isPeeking&&(o.classList.remove("is-peeking"),s.isPeeking=!1,D())},5e3)}function D(){const e=3e4+Math.random()*3e4;setTimeout(()=>{s.isOpen||T()},e)}function x(){s.isOpen?m():C()}function C(){s.isOpen=!0,s.isPeeking=!1,o.classList.remove("is-peeking"),o.classList.add("is-open"),w.setAttribute("aria-hidden","false"),setTimeout(()=>{g.focus()},300),s.messages.length===0&&setTimeout(()=>{M(s.conversationScript.greeting),s.conversationScript.showsCapability&&I(s.conversationScript.showsCapability)},500),localStorage.setItem("ferni_demo_visited","true")}function m(){s.isOpen=!1,o.classList.remove("is-open"),w.setAttribute("aria-hidden","true")}function S(){const e=g.value.trim();if(!e||s.isTyping)return;P(e),g.value="",s.lastUserMessage=e;const t=r.thinkingDelayBase+Math.min(e.length*r.thinkingDelayPerChar,800);setTimeout(()=>{B(),s.isTyping=!0;const i=F(e),a=i.text.length*r.baseTypingSpeed*1.5;setTimeout(()=>{O(),M(i.text,i.emotion),s.isTyping=!1,i.capability&&setTimeout(()=>I(i.capability),500)},a)},t)}function P(e){const t=document.createElement("div");t.className="demo-message demo-message--user",t.innerHTML=`<span class="demo-message__content">${A(e)}</span>`,u.appendChild(t),requestAnimationFrame(()=>t.classList.add("is-visible")),p(),s.messages.push({role:"user",text:e})}function M(e,t="neutral"){const i=document.createElement("div");i.className="demo-message demo-message--ferni",i.dataset.emotion=t,s.currentEmotion=t,R(t),i.innerHTML='<span class="demo-message__content"></span>';const a=i.querySelector(".demo-message__content");u.appendChild(i),requestAnimationFrame(()=>i.classList.add("is-visible")),N(a,e),p(),s.messages.push({role:"ferni",text:e,emotion:t})}function N(e,t){let i=0;e.textContent="";function a(){if(i<t.length){const d=t.charAt(i);e.textContent+=d,i++,p();let n=r.baseTypingSpeed;n+=(Math.random()-.5)*r.baseTypingSpeed*r.typingVariation*2,[".","!","?"].includes(d)?n+=r.pausePunctuation:d===","?n+=r.pauseComma:d==="\u2014"&&(n+=r.pausePunctuation*.5),Math.random()<.02&&(n+=150),setTimeout(a,Math.max(10,n))}}a()}function B(){const e=document.createElement("div");e.className="demo-typing",e.innerHTML=`
      <div class="demo-typing__dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="demo-typing__label">Ferni is thinking...</span>
    `,u.appendChild(e),requestAnimationFrame(()=>e.classList.add("is-visible")),p()}function O(){const e=u.querySelector(".demo-typing");e&&(e.classList.remove("is-visible"),setTimeout(()=>e.remove(),200))}function p(){u.scrollTo({top:u.scrollHeight,behavior:"smooth"})}function R(e){const t=o.querySelector(".demo-widget__emotion-badge");if(!t)return;const i=_[e]||_.neutral;t.textContent=i.label,t.style.setProperty("--emotion-color",i.color),t.classList.add("is-visible"),setTimeout(()=>t.classList.remove("is-visible"),3e3)}function A(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML}function F(e){const t=e.toLowerCase(),i=s.conversationScript;if(i.exchanges)for(const n of i.exchanges){const l=n.triggers.find(c=>t.includes(c));if(l){const c=n.responses||[n.response];return{text:j(l,c),capability:n.showsCapability,emotion:n.emotion||"neutral"}}}const a=Math.min(.4,s.messages.length*.1);if(s.messages.length>3&&Math.random()<a){const n=s.messages.filter(l=>l.role==="user");if(n.length>1){const l=n[0],c=[`You mentioned "${b(l.text,25)}" earlier. Does that connect to what you're feeling now?`,`I keep thinking about when you said "${b(l.text,25)}." Is that related?`,`Going back to what you said about "${b(l.text,25)}"\u2014is that still on your mind?`];return{text:y(c),capability:"memory",emotion:"thoughtful"}}}const d=i.defaults||[i.default||"Tell me more about that. I'm listening."];return{text:y(d),capability:null,emotion:"curious"}}function j(e,t){s.usedResponses.has(e)||s.usedResponses.set(e,new Set);const i=s.usedResponses.get(e);if(t.filter((l,c)=>!i.has(c)).length===0)return i.clear(),y(t);const d=t.map((l,c)=>c).filter(l=>!i.has(l)),n=y(d);return i.add(n),t[n]}function y(e){return e[Math.floor(Math.random()*e.length)]}function b(e,t){return e.length<=t?e:e.slice(0,t).trim()+"..."}function I(e){const t=L[e];if(!t||s.showedCapabilities.has(e))return;s.showedCapabilities.add(e);const i=u.querySelector(".demo-widget__capability-hint"),a=i.querySelector(".demo-widget__capability-icon"),d=i.querySelector(".demo-widget__capability-text");a.textContent=t.icon,d.textContent=t.description,i.hidden=!1,i.classList.add("is-visible"),setTimeout(()=>{i.classList.remove("is-visible"),setTimeout(()=>{i.hidden=!0},300)},4e3)}function U(){const e=o.querySelector(".demo-voice-tooltip");e&&e.remove();const t=document.createElement("div");t.className="demo-voice-tooltip",t.innerHTML=`
      <p>Ferni is voice-first.</p>
      <p>In the real app, just talk\u2014Ferni listens and responds naturally.</p>
      <a href="tel:+14844813081">Try calling: (484) 481-3081</a>
    `,o.querySelector(".demo-widget__input-area").appendChild(t),setTimeout(()=>{t.classList.add("is-visible")},10),setTimeout(()=>{t.classList.remove("is-visible"),setTimeout(()=>t.remove(),300)},5e3)}function V(...e){r.debugMode&&console.log("[DemoWidget]",...e)}window.FerniDemo={init:v,open:C,close:m,toggle:x,getState:()=>({...s})},document.readyState==="loading"?document.addEventListener("DOMContentLoaded",v):v()})();
