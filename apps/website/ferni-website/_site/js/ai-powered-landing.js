"use strict";(function(){"use strict";const n={apiBase:"/api/landing/ai",enableChat:!1,enablePersonalizedHero:!1,enablePersonaPreviews:!1,enableSmartFAQ:!1,enableSocialProof:!1,enableHoverPreviews:!1,enableSentimentCopy:!1,enableMicroExpressions:!0,enableVoiceSamples:!0,enableMemoryDemo:!0,debugMode:!1},b={"landing-ai-live-chat":"enableChat","landing-ai-personalized-hero":"enablePersonalizedHero","landing-ai-persona-previews":"enablePersonaPreviews","landing-ai-smart-faq":"enableSmartFAQ","landing-ai-social-proof":"enableSocialProof","landing-ai-hover-previews":"enableHoverPreviews","landing-ai-sentiment-copy":"enableSentimentCopy","landing-ai-micro-expressions":"enableMicroExpressions","landing-ai-voice-samples":"enableVoiceSamples","landing-ai-memory-demo":"enableMemoryDemo"};async function _(){try{if(typeof window.FerniExperiments>"u"){console.warn("[AI Landing] FerniExperiments not available, using defaults");return}const e=Object.entries(b).map(async([t,r])=>{try{const a=await window.FerniExperiments.getVariant(t,{skipExposure:!0});n[r]=a!=="control"&&a!=="0",n.debugMode&&console.log(`[AI Landing] Flag ${t} = ${n[r]}`)}catch{}});await Promise.all(e),console.log("[AI Landing] Feature flags loaded")}catch(e){console.warn("[AI Landing] Failed to load feature flags:",e)}}const s={visitorId:null,chatOpen:!1,chatMessages:[],messagesRemaining:10,currentPersona:"ferni",sentiment:.5,initialized:!1};function w(){let e=localStorage.getItem("ferni_visitor_id");return e||(e="fv_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10),localStorage.setItem("ferni_visitor_id",e)),e}const k={"/chat":e=>({response:S(e?.message||""),emotion:"warm",persona:"ferni"}),"/personalized-hero":()=>({headline:"Finally, someone who gets it.",subheadline:"Someone who remembers your whole story, hears what you're not saying, and shows up at 2am with the same presence as noon.",cta:"Begin a real conversation"}),"/persona-preview":e=>({persona:e?.personaId||"ferni",greeting:C(e?.personaId||"ferni"),traits:["Empathetic","Present","Wise"]}),"/social-proof":()=>({stats:[{label:"Conversations this week",value:"2,847+"},{label:"People supported",value:"12k+"},{label:"Average session",value:"23 min"}]}),"/sentiment-copy":()=>({headline:"We hear you.",supportText:"Whatever you're going through, you don't have to go through it alone."}),"/faq":e=>({answer:q(e?.question||""),relatedQuestions:["How does Ferni work?","Is my data private?","What can I talk about?"]}),"/hover-preview":()=>({preview:"Click to learn more about how Ferni can support you.",tone:"warm"})};function S(e){const t=e.toLowerCase();return t.includes("stress")||t.includes("anxious")||t.includes("worried")?"I hear you. That weight you're carrying? It's valid. Let's breathe through this together. What's the one thing that feels heaviest right now?":t.includes("hello")||t.includes("hi")||t.includes("hey")?"Hey there. I'm glad you're here. What's on your mind today?":t.includes("help")||t.includes("need")?"I'm here. Whatever you're going through, you don't have to figure it out alone. What would feel most helpful right now?":"I'm listening. Tell me more about what's going on for you."}function C(e){const t={ferni:"Hey there. I'm Ferni - I'm here to listen and support you through whatever's on your mind.",peter:"Hello! I'm Peter. I love diving deep into research and finding patterns that can help you.",alex:"Hi! I'm Alex. I help people find the right words for difficult conversations.",maya:"Welcome! I'm Maya. I'm passionate about helping people build sustainable habits.",jordan:"Hey! I'm Jordan. I love helping people plan and celebrate life's moments.",nayan:"Greetings. I'm Nayan. I share wisdom from philosophy and help with life's deeper questions."};return t[e]||t.ferni}function q(e){const t=e.toLowerCase();return t.includes("privacy")||t.includes("data")?"Your privacy is sacred to us. All conversations are encrypted, and we never sell your data. You can delete your history anytime.":t.includes("cost")||t.includes("price")||t.includes("free")?"You can start talking to Ferni for free. We have subscription plans for unlimited access and premium features.":t.includes("how")&&t.includes("work")?"Ferni is always available via phone call, text, or web app. Just reach out whenever you need support - we're here 24/7.":"Great question! You can call 1 (484) 481-3081 anytime, or use our web app. We're here whenever you need us."}async function l(e,t={}){try{const r=await fetch(n.apiBase+e,{headers:{"Content-Type":"application/json"},...t,body:t.body?JSON.stringify(t.body):void 0});if(!r.ok)throw new Error(`API error: ${r.status}`);return await r.json()}catch{const a=k[e];return a?(n.debugMode&&console.log("[AI Landing] Using offline fallback for:",e),a(t.body)):(n.debugMode&&console.warn("[AI Landing] API unavailable, no fallback for:",e),null)}}const p={container:null,panel:null,messagesContainer:null,input:null,sendButton:null,init(){n.enableChat&&(this.createChatWidget(),this.bindEvents(),n.debugMode&&console.log("[LiveChat] Initialized"))},createChatWidget(){if(document.getElementById("ferni-live-chat"))return;const e=document.createElement("div");e.id="ferni-live-chat",e.innerHTML=`
        <button class="ferni-chat-trigger" aria-label="Chat with Ferni">
          <div class="ferni-chat-trigger__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
          <span class="ferni-chat-trigger__text">Chat with Ferni</span>
          <span class="ferni-chat-trigger__badge">AI</span>
        </button>
        
        <div class="ferni-chat-panel" aria-hidden="true">
          <div class="ferni-chat-panel__header">
            <div class="ferni-chat-panel__persona">
              <div class="ferni-chat-panel__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
              <div class="ferni-chat-panel__info">
                <span class="ferni-chat-panel__name">Ferni</span>
                <span class="ferni-chat-panel__status">\u25CF Online</span>
              </div>
            </div>
            <div class="ferni-chat-panel__remaining">
              <span class="ferni-chat-panel__count">${s.messagesRemaining}</span> messages left
            </div>
            <button class="ferni-chat-panel__close" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <div class="ferni-chat-panel__messages" role="log" aria-live="polite" aria-label="Chat messages">
            <div class="ferni-chat-message ferni-chat-message--ai">
              <p>Hey! \u{1F44B} I'm Ferni. Want to see what it's like to talk to someone who actually listens? Try me\u2014no signup needed.</p>
            </div>
          </div>
          
          <div class="ferni-chat-panel__input-area">
            <input 
              type="text" 
              class="ferni-chat-panel__input" 
              placeholder="What's on your mind?"
              maxlength="500"
            />
            <button class="ferni-chat-panel__send" aria-label="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
          
          <div class="ferni-chat-panel__footer">
            <a href="https://app.ferni.ai" class="ferni-chat-panel__upgrade">
              Create free account for unlimited access \u2192
            </a>
          </div>
        </div>
      `,document.body.appendChild(e),this.container=e,this.panel=e.querySelector(".ferni-chat-panel"),this.messagesContainer=e.querySelector(".ferni-chat-panel__messages"),this.input=e.querySelector(".ferni-chat-panel__input"),this.sendButton=e.querySelector(".ferni-chat-panel__send")},bindEvents(){const e=this.container.querySelector(".ferni-chat-trigger"),t=this.container.querySelector(".ferni-chat-panel__close");e.addEventListener("click",()=>this.togglePanel()),t.addEventListener("click",()=>this.closePanel()),this.input.addEventListener("keypress",r=>{r.key==="Enter"&&!r.shiftKey&&(r.preventDefault(),this.sendMessage())}),this.sendButton.addEventListener("click",()=>this.sendMessage()),document.addEventListener("keydown",r=>{r.key==="Escape"&&s.chatOpen&&this.closePanel()})},togglePanel(){s.chatOpen?this.closePanel():this.openPanel()},openPanel(){s.chatOpen=!0,this.panel.classList.add("is-open"),this.panel.setAttribute("aria-hidden","false"),this.container.classList.add("is-open"),this.input.focus(),window.FerniExperiments?.trackConversionForAll("chat_opened")},closePanel(){s.chatOpen=!1,this.panel.classList.remove("is-open"),this.panel.setAttribute("aria-hidden","true"),this.container.classList.remove("is-open")},async sendMessage(){const e=this.input.value.trim();if(!e)return;this.input.value="",this.addMessage(e,"user"),this.showTyping();const t=await l("/chat",{method:"POST",body:{visitorId:s.visitorId,message:e,persona:s.currentPersona}});this.hideTyping(),t?(this.addMessage(t.response,"ai"),s.messagesRemaining=t.messagesRemaining,this.updateRemainingCount(),t.messagesRemaining===0&&this.showUpgradePrompt()):this.addMessage("Sorry, I couldn't respond right now. Try again?","ai")},addMessage(e,t){const r=document.createElement("div");r.className=`ferni-chat-message ferni-chat-message--${t}`,r.innerHTML=`<p>${this.escapeHtml(e)}</p>`,this.messagesContainer.appendChild(r),this.messagesContainer.scrollTop=this.messagesContainer.scrollHeight},showTyping(){const e=document.createElement("div");e.className="ferni-chat-typing",e.innerHTML=`
        <div class="ferni-chat-typing__dot"></div>
        <div class="ferni-chat-typing__dot"></div>
        <div class="ferni-chat-typing__dot"></div>
      `,this.messagesContainer.appendChild(e),this.messagesContainer.scrollTop=this.messagesContainer.scrollHeight},hideTyping(){const e=this.messagesContainer.querySelector(".ferni-chat-typing");e&&e.remove()},updateRemainingCount(){const e=this.container.querySelector(".ferni-chat-panel__count");e&&(e.textContent=s.messagesRemaining,s.messagesRemaining<=3&&e.classList.add("is-low"))},showUpgradePrompt(){const e=document.createElement("div");e.className="ferni-chat-upgrade-prompt",e.innerHTML=`
        <p>You've used all your demo messages! \u{1F49A}</p>
        <a href="https://app.ferni.ai" class="btn btn--primary btn--sm">
          Create free account to continue
        </a>
      `,this.messagesContainer.appendChild(e)},escapeHtml(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML}},m={async init(){if(!n.enablePersonalizedHero)return;const e={hour:new Date().getHours(),referrer:document.referrer||void 0,isReturning:parseInt(localStorage.getItem("ferni_visit_count")||"0",10)>1,visitCount:parseInt(localStorage.getItem("ferni_visit_count")||"1",10),device:window.innerWidth<768?"mobile":window.innerWidth<1024?"tablet":"desktop",sentiment:window.FerniSentience?.sentiment?.()||.5,topSectionsViewed:this.getTopSections()},t=await l("/personalized-hero",{method:"POST",body:e});t&&this.applyHero(t)},getTopSections(){const e=window.FerniSentience?.attention?.();return e?e.map(t=>t.id).slice(0,3):[]},applyHero(e){const t=document.querySelector(".hero__tagline"),r=document.querySelector(".hero__headline"),a=document.querySelector(".hero__subhead"),i=document.querySelector(".hero__cta .btn--primary");if(t&&e.tagline&&(t.textContent=e.tagline,t.classList.add("is-personalized")),r&&e.headline&&(r.innerHTML=e.headline,r.classList.add("is-personalized")),a&&e.subhead&&(a.textContent=e.subhead,a.classList.add("is-personalized")),i&&e.ctaText){const o=i.querySelector("svg");i.childNodes[0].textContent=e.ctaText+" ",o&&i.appendChild(o)}n.debugMode&&console.log("[PersonalizedHero] Applied:",e.generationReason)}},h={init(){n.enablePersonaPreviews&&this.enhanceTeamCards()},enhanceTeamCards(){document.querySelectorAll(".team-card").forEach(t=>{const r=this.getPersonaId(t);if(!r)return;const a=document.createElement("div");a.className="team-card__preview-input",a.innerHTML=`
          <input 
            type="text" 
            placeholder="Ask ${this.getPersonaName(r)} something..."
            maxlength="200"
            data-persona="${r}"
          />
          <button class="team-card__preview-btn" data-persona="${r}" aria-label="Send message to ${this.getPersonaName(r)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        `;const i=document.createElement("div");i.className="team-card__preview-response",i.style.display="none",t.appendChild(a),t.appendChild(i);const o=a.querySelector("input");a.querySelector("button").addEventListener("click",()=>this.askPersona(r,o,i)),o.addEventListener("keypress",I=>{I.key==="Enter"&&this.askPersona(r,o,i)})})},getPersonaId(e){const r=e.className.match(/team-card--(\w+)/);return r?r[1]:e.dataset.persona},getPersonaName(e){return{ferni:"Ferni",maya:"Maya",peter:"Peter",alex:"Alex",jordan:"Jordan",nayan:"Nayan"}[e]||"them"},async askPersona(e,t,r){const a=t.value.trim();if(!a)return;r.style.display="block",r.innerHTML='<div class="team-card__preview-loading">Thinking...</div>';const i=await l("/persona-preview",{method:"POST",body:{persona:e,question:a,visitorId:s.visitorId}});i?r.innerHTML=`
          <blockquote class="team-card__preview-quote">
            <p>"${i.response}"</p>
          </blockquote>
          <div class="team-card__preview-traits">
            ${i.traits.map(o=>`<span class="trait">${o}</span>`).join("")}
          </div>
        `:r.innerHTML='<p class="team-card__preview-error">Could not get response. Try again?</p>'}},u={container:null,init(){this.container=document.querySelector(".memory-demo__showcase"),this.container&&this.addInteractiveInput()},addInteractiveInput(){const e=document.createElement("div");e.className="memory-demo__interactive",e.innerHTML=`
        <div class="memory-demo__try-it">
          <h4>Try it yourself</h4>
          <p>Type something and see how Ferni would remember it:</p>
          <div class="memory-demo__input-area">
            <input 
              type="text" 
              placeholder="e.g., I'm stressed about my new job..."
              maxlength="200"
              class="memory-demo__input"
            />
            <button class="memory-demo__btn btn btn--primary btn--sm">
              See the memory
            </button>
          </div>
          <div class="memory-demo__result" style="display: none;"></div>
        </div>
      `,this.container.appendChild(e);const t=e.querySelector(".memory-demo__input"),r=e.querySelector(".memory-demo__btn"),a=e.querySelector(".memory-demo__result");r.addEventListener("click",()=>this.showMemoryVisualization(t.value,a)),t.addEventListener("keypress",i=>{i.key==="Enter"&&this.showMemoryVisualization(t.value,a)})},showMemoryVisualization(e,t){if(!e.trim())return;const r=this.extractInsights(e);t.style.display="block",t.innerHTML=`
        <div class="memory-demo__visualization">
          <div class="memory-demo__today">
            <div class="memory-demo__date">TODAY</div>
            <div class="memory-demo__card">
              <p>"${e}"</p>
              <span class="memory-demo__emotion">Current feeling</span>
            </div>
          </div>
          
          <div class="memory-demo__future">
            <div class="memory-demo__date">IN 3 MONTHS</div>
            <div class="memory-demo__card memory-demo__card--ferni">
              <div class="memory-demo__speaker">
                <div class="memory-demo__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
                Ferni remembers
              </div>
              <ul class="memory-demo__insights">
                ${r.map(a=>`<li>${a}</li>`).join("")}
              </ul>
            </div>
          </div>
          
          <div class="memory-demo__connection">
            <svg viewBox="0 0 100 20" class="memory-demo__line">
              <path d="M0 10 Q25 0, 50 10 T100 10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4"/>
            </svg>
            <span>Connected across time</span>
          </div>
        </div>
      `},extractInsights(e){const t=[],r=e.toLowerCase();return(r.includes("job")||r.includes("work")||r.includes("career"))&&t.push("Your work situation and career concerns"),(r.includes("stress")||r.includes("anxious")||r.includes("worried"))&&t.push("The emotional weight you were carrying"),(r.includes("relationship")||r.includes("friend")||r.includes("family"))&&t.push("Important relationships in your life"),t.push("The context around this moment"),t.push("How this connects to your bigger story"),t.push("Growth opportunities I noticed"),t.slice(0,4)}},f={cache:new Map,tooltip:null,init(){n.enableHoverPreviews&&(this.createTooltip(),this.bindHoverElements())},createTooltip(){this.tooltip=document.createElement("div"),this.tooltip.className="ferni-hover-preview",this.tooltip.setAttribute("role","tooltip"),this.tooltip.innerHTML=`
        <div class="ferni-hover-preview__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
        <div class="ferni-hover-preview__content"></div>
      `,document.body.appendChild(this.tooltip)},bindHoverElements(){document.querySelectorAll(".faq-item summary, .faq-item__question").forEach(e=>{this.bindElement(e,"faq",e.textContent.trim())}),document.querySelectorAll(".feature, .feature-card").forEach(e=>{const t=e.querySelector(".feature__title, .feature-title")?.textContent;t&&this.bindElement(e,"feature",t)}),document.querySelectorAll(".btn--primary").forEach(e=>{this.bindElement(e,"cta",e.textContent.trim())})},bindElement(e,t,r){let a;e.addEventListener("mouseenter",async i=>{a=setTimeout(async()=>{const o=await this.getPreview(t,r);this.showTooltip(i.target,o)},500)}),e.addEventListener("mouseleave",()=>{clearTimeout(a),this.hideTooltip()})},async getPreview(e,t){const r=`${e}:${t}`;if(this.cache.has(r))return this.cache.get(r);const i=(await l("/hover-preview",{method:"POST",body:{elementType:e,context:t}}))?.preview||this.getFallbackPreview(e);return this.cache.set(r,i),i},getFallbackPreview(e){return{faq:"I'd love to explain this more...",feature:"Let me show you how this works...",testimonial:"Stories like this...",cta:"No pressure. Just try talking."}[e]||"Tell me more..."},showTooltip(e,t){const r=this.tooltip.querySelector(".ferni-hover-preview__content");r.textContent=t;const a=e.getBoundingClientRect(),i=this.tooltip.getBoundingClientRect();let o=a.left+a.width/2-i.width/2,c=a.top-i.height-10;o=Math.max(10,Math.min(o,window.innerWidth-i.width-10)),c<10&&(c=a.bottom+10),this.tooltip.style.left=o+"px",this.tooltip.style.top=c+window.scrollY+"px",this.tooltip.classList.add("is-visible")},hideTooltip(){this.tooltip.classList.remove("is-visible")}},g={container:null,snippets:[],currentIndex:0,interval:null,async init(){if(!n.enableSocialProof)return;this.container=document.querySelector(".social-proof-dynamic"),this.container||this.createContainer();const e=await l("/social-proof?count=5",{method:"GET"});e&&e.length&&(this.snippets=e,this.render(),this.startRotation())},createContainer(){const e=document.querySelector(".stats-bar");e&&(this.container=document.createElement("div"),this.container.className="social-proof-dynamic",e.parentNode.insertBefore(this.container,e.nextSibling))},render(){!this.container||!this.snippets.length||(this.container.innerHTML=`
        <div class="social-proof-dynamic__inner">
          <div class="social-proof-dynamic__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
          <div class="social-proof-dynamic__content">
            <p class="social-proof-dynamic__text">${this.snippets[0].content}</p>
          </div>
        </div>
      `)},startRotation(){this.snippets.length<=1||(this.interval=setInterval(()=>{this.currentIndex=(this.currentIndex+1)%this.snippets.length,this.animateToNext()},8e3))},animateToNext(){const e=this.container.querySelector(".social-proof-dynamic__text");e&&(e.style.opacity="0",e.style.transform="translateY(-10px)",setTimeout(()=>{e.textContent=this.snippets[this.currentIndex].content,e.style.opacity="1",e.style.transform="translateY(0)"},300))}},v={lastSentiment:.5,appliedChanges:!1,init(){n.enableSentimentCopy&&this.monitorSentiment()},monitorSentiment(){setInterval(async()=>{const e=window.FerniSentience?.sentiment?.()||.5;Math.abs(e-this.lastSentiment)<.15||this.appliedChanges||(this.lastSentiment=e,(e<.35||e>.75)&&await this.fetchAndApplyCopy(e))},5e3)},async fetchAndApplyCopy(e){const t=document.querySelector(".hero__cta .btn--primary"),r=document.querySelector(".hero__subhead"),a=await l("/sentiment-copy",{method:"POST",body:{sentiment:e,currentSection:window.FerniSentience?.state?.()?.currentSection||"hero",timeOnPage:Math.floor((Date.now()-window.performance.timing.navigationStart)/1e3),originalCopy:{ctaText:t?.textContent?.trim(),subhead:r?.textContent?.trim()}}});a&&(a.ctaText||a.subhead)&&(this.applyCopy(a),this.appliedChanges=!0,n.debugMode&&console.log("[SentimentCopy] Applied:",a.reason))},applyCopy(e){if(e.ctaText){const t=document.querySelector(".hero__cta .btn--primary");if(t){const r=t.querySelector("svg");t.childNodes[0].textContent=e.ctaText+" ",r&&t.appendChild(r),t.classList.add("is-sentiment-adjusted")}}if(e.subhead){const t=document.querySelector(".hero__subhead");t&&(t.textContent=e.subhead,t.classList.add("is-sentiment-adjusted"))}}},x={container:null,init(){n.enableSmartFAQ&&this.addAskAnything()},addAskAnything(){const e=document.querySelector(".faq, #faq");if(!e)return;const t=document.createElement("div");t.className="smart-faq",t.innerHTML=`
        <div class="smart-faq__header">
          <div class="smart-faq__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
          <h4 class="smart-faq__title">Ask me anything</h4>
        </div>
        <div class="smart-faq__input-area">
          <input 
            type="text" 
            class="smart-faq__input"
            placeholder="What would you like to know about Ferni?"
            maxlength="300"
          />
          <button class="smart-faq__btn btn btn--primary btn--sm">Ask</button>
        </div>
        <div class="smart-faq__response" style="display: none;"></div>
      `;const r=e.querySelector(".section__header");r?r.parentNode.insertBefore(t,r.nextSibling):e.insertBefore(t,e.firstChild),this.container=t,this.bindEvents()},bindEvents(){const e=this.container.querySelector(".smart-faq__input"),t=this.container.querySelector(".smart-faq__btn"),r=this.container.querySelector(".smart-faq__response");t.addEventListener("click",()=>this.askQuestion(e,r)),e.addEventListener("keypress",a=>{a.key==="Enter"&&this.askQuestion(e,r)})},async askQuestion(e,t){const r=e.value.trim();if(!r)return;t.style.display="block",t.innerHTML='<div class="smart-faq__loading">Thinking...</div>';const a=await l("/faq",{method:"POST",body:{question:r,visitorId:s.visitorId}});a?(t.innerHTML=`
          <div class="smart-faq__answer">
            <p>${a.answer}</p>
            ${a.confidence<.7?'<p class="smart-faq__disclaimer">Not sure about this one? <a href="https://app.ferni.ai">Ask me directly in the app</a>.</p>':""}
          </div>
          ${a.relatedQuestions?.length?`
            <div class="smart-faq__related">
              <p>Related questions:</p>
              <ul>
                ${a.relatedQuestions.map(i=>`<li><button class="smart-faq__related-btn">${i}</button></li>`).join("")}
              </ul>
            </div>
          `:""}
        `,t.querySelectorAll(".smart-faq__related-btn").forEach(i=>{i.addEventListener("click",()=>{e.value=i.textContent,this.askQuestion(e,t)})})):t.innerHTML='<p class="smart-faq__error">Could not get an answer. Try rephrasing?</p>'}},y={orb:null,currentExpression:"present",init(){n.enableMicroExpressions&&(this.orb=document.querySelector(".hero-ferni, [data-hero-orb]"),this.orb&&this.bindBehaviorTriggers())},bindBehaviorTriggers(){document.querySelectorAll(".btn--primary").forEach(o=>{o.addEventListener("mouseenter",()=>this.flash("curious"))});const e=new IntersectionObserver(o=>{o.forEach(c=>{c.isIntersecting&&this.flash("interested")})},{threshold:.5}),t=document.getElementById("pricing");t&&e.observe(t),document.querySelectorAll(".faq-item, details").forEach(o=>{o.addEventListener("toggle",()=>this.flash("helpful"))});let r=window.scrollY,a=0;window.addEventListener("scroll",()=>{a=Math.abs(window.scrollY-r),r=window.scrollY,a>100&&this.flash("concerned")},{passive:!0});let i;window.addEventListener("scroll",()=>{clearTimeout(i),i=setTimeout(()=>{a<10&&this.flash("warm")},2e3)},{passive:!0})},flash(e){!this.orb||this.currentExpression===e||(this.orb.classList.remove(`ferni-expression--${this.currentExpression}`),this.orb.classList.add(`ferni-expression--${e}`),this.currentExpression=e,this.orb.animate([{filter:"brightness(1)"},{filter:"brightness(1.15)"},{filter:"brightness(1)"}],{duration:120,easing:"ease-out"}),setTimeout(()=>{this.orb.classList.remove(`ferni-expression--${e}`),this.orb.classList.add("ferni-expression--present"),this.currentExpression="present"},3e3))}};function E(){if(document.getElementById("ferni-ai-landing-styles"))return;const e=document.createElement("style");e.id="ferni-ai-landing-styles",e.textContent=`
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         LIVE CHAT WIDGET
         Uses CSS variables from design-tokens.css for brand compliance
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      #ferni-live-chat {
        position: fixed;
        bottom: var(--space-6, 24px);
        right: var(--space-6, 24px);
        z-index: 9998;
        font-family: var(--font-display, 'Plus Jakarta Sans', -apple-system, sans-serif);
      }
      
      .ferni-chat-trigger {
        display: flex;
        align-items: center;
        gap: var(--space-2, 10px);
        padding: var(--space-3, 12px) var(--space-5, 20px);
        background: linear-gradient(135deg, var(--color-ferni, #5a7751) 0%, var(--color-ferni-secondary, #4a6741) 100%);
        color: var(--color-text-inverse, white);
        border: none;
        border-radius: var(--radius-full, 100px);
        cursor: pointer;
        font-weight: 600;
        font-size: var(--text-sm, 14px);
        box-shadow: 0 8px 32px var(--color-ferni-glow, rgba(74, 103, 65, 0.4));
        transition: all var(--duration-slow, 0.3s) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
      }
      
      .ferni-chat-trigger:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 40px var(--color-ferni-glow, rgba(74, 103, 65, 0.5));
      }
      
      .ferni-chat-trigger__avatar {
        width: 28px;
        height: 28px;
        background: rgba(255,255,255,0.2);
        border-radius: var(--radius-full, 50%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--text-2xs, 10px);
        font-weight: 700;
      }
      
      .ferni-chat-trigger__badge {
        padding: var(--space-0_5, 2px) var(--space-2, 8px);
        background: rgba(255,255,255,0.2);
        border-radius: var(--radius-lg, 10px);
        font-size: var(--text-2xs, 10px);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      #ferni-live-chat.is-open .ferni-chat-trigger {
        opacity: 0;
        pointer-events: none;
      }
      
      /* Chat Panel */
      .ferni-chat-panel {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 380px;
        max-height: 600px;
        background: var(--color-bg-primary, #faf8f5);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl, 0 20px 60px rgba(0, 0, 0, 0.2));
        display: flex;
        flex-direction: column;
        opacity: 0;
        visibility: hidden;
        transform: translateY(20px) scale(0.95);
        transition: all var(--duration-slow, 0.3s) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
      }
      
      .ferni-chat-panel.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
      }
      
      .ferni-chat-panel__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-4, 16px) var(--space-5, 20px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      }
      
      .ferni-chat-panel__persona {
        display: flex;
        align-items: center;
        gap: var(--space-2, 10px);
        flex: 1;
      }
      
      .ferni-chat-panel__avatar {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, var(--color-ferni, #5a7751), var(--color-ferni-secondary, #4a6741));
        border-radius: var(--radius-full, 50%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-inverse, white);
        font-size: var(--text-xs, 12px);
        font-weight: 700;
      }
      
      .ferni-chat-panel__name {
        font-weight: 600;
        color: var(--color-text-primary, #2c2520);
        display: block;
      }
      
      .ferni-chat-panel__status {
        font-size: var(--text-xs, 12px);
        color: var(--color-ferni, #4a6741);
      }
      
      .ferni-chat-panel__remaining {
        font-size: var(--text-2xs, 11px);
        color: var(--color-text-muted, #70605a);
        background: var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        padding: var(--space-1, 4px) var(--space-2, 10px);
        border-radius: var(--radius-lg, 12px);
      }
      
      .ferni-chat-panel__count {
        font-weight: 600;
        color: var(--color-ferni, #4a6741);
      }
      
      .ferni-chat-panel__count.is-low {
        color: var(--color-jordan, #c4856a);
      }
      
      .ferni-chat-panel__close {
        width: 32px;
        height: 32px;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-text-muted, #70605a);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-full, 50%);
        transition: background var(--duration-fast, 0.2s);
      }
      
      .ferni-chat-panel__close:hover {
        background: var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      }
      
      .ferni-chat-panel__close svg {
        width: 18px;
        height: 18px;
      }
      
      /* Messages */
      .ferni-chat-panel__messages {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-5, 20px);
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
        min-height: 300px;
        max-height: 400px;
        /* Accessibility: ARIA live region for screen readers */
      }
      
      .ferni-chat-message {
        max-width: 85%;
        animation: chatMessageIn 0.3s ease;
      }
      
      @keyframes chatMessageIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .ferni-chat-message p {
        margin: 0;
        padding: 12px 16px;
        border-radius: 18px;
        font-size: 14px;
        line-height: 1.5;
      }
      
      .ferni-chat-message--user {
        align-self: flex-end;
      }
      
      .ferni-chat-message--user p {
        background: linear-gradient(135deg, var(--color-ferni, #5a7751), var(--color-ferni-secondary, #4a6741));
        color: var(--color-text-inverse, white);
        border-bottom-right-radius: var(--radius-xs, 4px);
      }
      
      .ferni-chat-message--ai p {
        background: var(--color-bg-elevated, white);
        color: var(--color-text-primary, #2c2520);
        border-bottom-left-radius: var(--radius-xs, 4px);
        box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.05));
      }
      
      /* Typing indicator */
      .ferni-chat-typing {
        display: flex;
        gap: var(--space-1, 4px);
        padding: var(--space-4, 16px);
        align-self: flex-start;
      }
      
      .ferni-chat-typing__dot {
        width: 8px;
        height: 8px;
        background: var(--color-ferni, #4a6741);
        border-radius: var(--radius-full, 50%);
        animation: typingDot 1.4s ease-in-out infinite;
      }
      
      .ferni-chat-typing__dot:nth-child(2) { animation-delay: 0.2s; }
      .ferni-chat-typing__dot:nth-child(3) { animation-delay: 0.4s; }
      
      @keyframes typingDot {
        0%, 100% { opacity: 0.3; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1); }
      }
      
      /* Input area */
      .ferni-chat-panel__input-area {
        display: flex;
        gap: var(--space-2, 8px);
        padding: var(--space-4, 16px) var(--space-5, 20px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      }
      
      .ferni-chat-panel__input {
        flex: 1;
        padding: var(--space-3, 12px) var(--space-4, 16px);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
        border-radius: var(--radius-xl, 24px);
        font-size: var(--text-sm, 14px);
        background: white;
        transition: border-color var(--duration-fast, 0.2s);
      }
      
      .ferni-chat-panel__input:focus {
        outline: none;
        border-color: var(--color-ferni, #4a6741);
        box-shadow: 0 0 0 3px var(--color-accent-glow, rgba(61, 90, 69, 0.15));
      }
      
      .ferni-chat-panel__send {
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, var(--color-ferni, #5a7751), var(--color-ferni-secondary, #4a6741));
        border: none;
        border-radius: var(--radius-full, 50%);
        cursor: pointer;
        color: var(--color-text-inverse, white);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform var(--duration-fast, 0.2s);
      }
      
      .ferni-chat-panel__send:hover {
        transform: scale(1.05);
      }
      
      .ferni-chat-panel__send svg {
        width: 18px;
        height: 18px;
      }
      
      /* Footer */
      .ferni-chat-panel__footer {
        padding: var(--space-3, 12px) var(--space-5, 20px);
        text-align: center;
        background: var(--color-bg-subtle, rgba(44, 37, 32, 0.03));
        border-radius: 0 0 var(--radius-xl, 24px) var(--radius-xl, 24px);
      }
      
      .ferni-chat-panel__upgrade {
        font-size: var(--text-xs, 12px);
        color: var(--color-ferni, #4a6741);
        text-decoration: none;
        font-weight: 500;
      }
      
      .ferni-chat-panel__upgrade:hover {
        text-decoration: underline;
      }
      
      /* Upgrade prompt */
      .ferni-chat-upgrade-prompt {
        background: linear-gradient(135deg, var(--color-ferni-glow, rgba(74, 103, 65, 0.1)), rgba(90, 119, 81, 0.1));
        padding: var(--space-5, 20px);
        border-radius: var(--radius-lg, 16px);
        text-align: center;
      }
      
      .ferni-chat-upgrade-prompt p {
        margin: 0 0 var(--space-3, 12px);
        color: var(--color-text-primary, #2c2520);
        font-weight: 500;
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         PERSONA PREVIEW CARDS
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      .team-card__preview-input {
        display: flex;
        gap: var(--space-2, 8px);
        margin-top: var(--space-4, 16px);
        padding-top: var(--space-4, 16px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      }
      
      .team-card__preview-input input {
        flex: 1;
        padding: var(--space-2, 10px) var(--space-3, 14px);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
        border-radius: var(--radius-xl, 20px);
        font-size: var(--text-xs, 13px);
        background: white;
      }
      
      .team-card__preview-input input:focus {
        outline: none;
        border-color: var(--team-color, #4a6741);
      }
      
      .team-card__preview-btn {
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
        transition: transform 0.2s;
      }
      
      .team-card__preview-btn:hover {
        transform: scale(1.05);
      }
      
      .team-card__preview-response {
        margin-top: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-bg-subtle, rgba(44, 37, 32, 0.03));
        border-radius: var(--radius-md, 12px);
      }
      
      .team-card__preview-quote {
        margin: 0;
        padding: 0;
        border: none;
        font-style: italic;
        color: var(--color-text-primary, #2c2520);
      }
      
      .team-card__preview-quote p {
        margin: 0;
      }
      
      .team-card__preview-traits {
        display: flex;
        gap: var(--space-1, 6px);
        flex-wrap: wrap;
        margin-top: var(--space-2, 10px);
      }
      
      .team-card__preview-traits .trait {
        padding: 3px 10px;
        background: var(--team-color, #4a6741);
        color: white;
        border-radius: 12px;
        font-size: 11px;
        text-transform: lowercase;
      }
      
      .team-card__preview-loading {
        color: var(--color-text-muted, #70605a);
        font-size: var(--text-sm, 13px);
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         HOVER PREVIEW TOOLTIP
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      .ferni-hover-preview {
        position: absolute;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: var(--space-2, 10px);
        padding: var(--space-2, 10px) var(--space-4, 16px);
        background: var(--color-text-primary, #2c2520);
        color: var(--color-bg-primary, #faf8f5);
        border-radius: var(--radius-xl, 20px);
        font-size: var(--text-sm, 13px);
        box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.2));
        opacity: 0;
        visibility: hidden;
        transform: translateY(5px);
        transition: all var(--duration-fast, 0.2s) ease;
        pointer-events: none;
        max-width: 300px;
      }
      
      .ferni-hover-preview.is-visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
      
      .ferni-hover-preview__avatar {
        width: 24px;
        height: 24px;
        background: linear-gradient(135deg, var(--color-ferni, #5a7751), var(--color-ferni-secondary, #4a6741));
        border-radius: var(--radius-full, 50%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--text-2xs, 8px);
        font-weight: 700;
        flex-shrink: 0;
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         SOCIAL PROOF DYNAMIC
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      .social-proof-dynamic {
        padding: var(--space-6, 24px) 0;
        background: var(--color-ferni-glow, rgba(74, 103, 65, 0.05));
        border-top: 1px solid rgba(74, 103, 65, 0.1);
        border-bottom: 1px solid rgba(74, 103, 65, 0.1);
      }
      
      .social-proof-dynamic__inner {
        max-width: 800px;
        margin: 0 auto;
        padding: 0 var(--space-6, 24px);
        display: flex;
        align-items: center;
        gap: var(--space-4, 16px);
      }
      
      .social-proof-dynamic__avatar {
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, var(--color-ferni, #5a7751), var(--color-ferni-secondary, #4a6741));
        border-radius: var(--radius-full, 50%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-inverse, white);
        font-size: var(--text-sm, 14px);
        font-weight: 700;
        flex-shrink: 0;
      }
      
      .social-proof-dynamic__text {
        margin: 0;
        font-size: var(--text-base, 15px);
        color: var(--color-text-primary, #2c2520);
        line-height: 1.6;
        font-style: italic;
        transition: opacity 0.3s, transform 0.3s;
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         SMART FAQ
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      .smart-faq {
        background: linear-gradient(135deg, var(--color-ferni-glow, rgba(74, 103, 65, 0.08)), rgba(90, 119, 81, 0.05));
        padding: var(--space-6, 24px);
        border-radius: var(--radius-xl, 20px);
        margin-bottom: var(--space-10, 40px);
      }
      
      .smart-faq__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-4, 16px);
      }
      
      .smart-faq__avatar {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, var(--color-ferni, #5a7751), var(--color-ferni-secondary, #4a6741));
        border-radius: var(--radius-full, 50%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-inverse, white);
        font-size: var(--text-xs, 12px);
        font-weight: 700;
      }
      
      .smart-faq__title {
        margin: 0;
        font-size: var(--text-lg, 18px);
        font-weight: 600;
        color: var(--color-text-primary, #2c2520);
      }
      
      .smart-faq__input-area {
        display: flex;
        gap: var(--space-2, 10px);
      }
      
      .smart-faq__input {
        flex: 1;
        padding: var(--space-3, 14px) var(--space-5, 20px);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
        border-radius: var(--radius-xl, 24px);
        font-size: var(--text-base, 15px);
        background: white;
      }
      
      .smart-faq__input:focus {
        outline: none;
        border-color: var(--color-ferni, #4a6741);
        box-shadow: 0 0 0 3px var(--color-accent-glow, rgba(61, 90, 69, 0.15));
      }
      
      .smart-faq__response {
        margin-top: var(--space-5, 20px);
        padding: var(--space-5, 20px);
        background: white;
        border-radius: var(--radius-lg, 16px);
        box-shadow: var(--shadow-sm, 0 2px 12px rgba(0, 0, 0, 0.05));
      }
      
      .smart-faq__answer {
        font-size: var(--text-base, 15px);
        line-height: 1.7;
        color: var(--color-text-primary, #2c2520);
      }
      
      .smart-faq__answer p {
        margin: 0 0 12px;
      }
      
      .smart-faq__disclaimer {
        font-size: var(--text-sm, 13px);
        color: var(--color-text-muted, #70605a);
      }
      
      .smart-faq__disclaimer a {
        color: var(--color-ferni, #4a6741);
      }
      
      .smart-faq__related {
        margin-top: var(--space-4, 16px);
        padding-top: var(--space-4, 16px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      }
      
      .smart-faq__related p {
        margin: 0 0 var(--space-2, 8px);
        font-size: var(--text-xs, 12px);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--color-text-muted, #70605a);
      }
      
      .smart-faq__related ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      
      .smart-faq__related-btn {
        padding: var(--space-1_5, 6px) var(--space-3_5, 14px);
        background: var(--color-accent-subtle, rgba(74, 103, 65, 0.1));
        border: none;
        border-radius: var(--radius-lg, 16px);
        font-size: var(--text-sm, 13px);
        color: var(--color-ferni, #4a6741);
        cursor: pointer;
        transition: background var(--duration-fast, 0.2s);
      }
      
      .smart-faq__related-btn:hover {
        background: var(--color-accent-glow, rgba(74, 103, 65, 0.2));
      }
      
      .smart-faq__loading {
        color: var(--color-text-muted, #70605a);
        font-style: italic;
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         MEMORY DEMO INTERACTIVE
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      .memory-demo__interactive {
        margin-top: var(--space-10, 40px);
        padding: var(--space-8, 30px);
        background: linear-gradient(135deg, var(--color-ferni-glow, rgba(74, 103, 65, 0.05)), transparent);
        border-radius: var(--radius-xl, 24px);
        border: 1px solid rgba(74, 103, 65, 0.15);
      }
      
      .memory-demo__try-it h4 {
        margin: 0 0 var(--space-2, 8px);
        font-size: var(--text-lg, 18px);
        color: var(--color-text-primary, #2c2520);
      }
      
      .memory-demo__try-it > p {
        margin: 0 0 var(--space-4, 16px);
        color: var(--color-text-muted, #70605a);
        font-size: var(--text-sm, 14px);
      }
      
      .memory-demo__input-area {
        display: flex;
        gap: var(--space-3, 12px);
      }
      
      .memory-demo__input {
        flex: 1;
        padding: var(--space-3, 14px) var(--space-5, 20px);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
        border-radius: var(--radius-xl, 24px);
        font-size: var(--text-base, 15px);
        background: white;
      }
      
      .memory-demo__input:focus {
        outline: none;
        border-color: var(--color-ferni, #4a6741);
        box-shadow: 0 0 0 3px var(--color-accent-glow, rgba(61, 90, 69, 0.15));
      }
      
      .memory-demo__result {
        margin-top: var(--space-6, 24px);
      }
      
      .memory-demo__visualization {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-5, 20px);
      }
      
      .memory-demo__today,
      .memory-demo__future {
        padding: var(--space-5, 20px);
        background: white;
        border-radius: var(--radius-lg, 16px);
        box-shadow: var(--shadow-sm, 0 2px 12px rgba(0, 0, 0, 0.05));
      }
      
      .memory-demo__date {
        font-size: var(--text-2xs, 11px);
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--color-text-muted, #70605a);
        margin-bottom: var(--space-3, 12px);
      }
      
      .memory-demo__card p {
        margin: 0;
        font-style: italic;
        color: var(--color-text-primary, #2c2520);
      }
      
      .memory-demo__emotion {
        display: inline-block;
        margin-top: var(--space-2, 10px);
        padding: var(--space-1, 4px) var(--space-2, 10px);
        background: var(--color-maya-glow, rgba(166, 122, 106, 0.15));
        border-radius: var(--radius-lg, 10px);
        font-size: var(--text-2xs, 11px);
        color: var(--color-maya, #a67a6a);
      }
      
      .memory-demo__card--ferni .memory-demo__speaker {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-3, 12px);
        font-weight: 600;
        color: var(--color-ferni, #4a6741);
      }
      
      .memory-demo__card--ferni .memory-demo__avatar {
        width: 28px;
        height: 28px;
        background: linear-gradient(135deg, var(--color-ferni, #5a7751), var(--color-ferni-secondary, #4a6741));
        border-radius: var(--radius-full, 50%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-inverse, white);
        font-size: var(--text-2xs, 9px);
        font-weight: 700;
      }
      
      .memory-demo__insights {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      
      .memory-demo__insights li {
        padding: var(--space-1_5, 6px) 0;
        font-size: var(--text-sm, 13px);
        color: var(--color-text-primary, #2c2520);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }
      
      .memory-demo__insights li:last-child {
        border-bottom: none;
      }
      
      .memory-demo__connection {
        grid-column: 1 / -1;
        text-align: center;
        padding: var(--space-4, 16px);
      }
      
      .memory-demo__line {
        display: block;
        margin: 0 auto var(--space-2, 10px);
        width: 200px;
        color: var(--color-ferni, #4a6741);
      }
      
      .memory-demo__connection span {
        font-size: var(--text-xs, 12px);
        color: var(--color-text-muted, #70605a);
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         MICRO EXPRESSIONS
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      /* Micro-expression colors - using brand-adjacent greens */
      .ferni-expression--curious {
        --mood-color: var(--color-ferni, #5a8060);
      }
      
      .ferni-expression--interested {
        --mood-color: var(--color-ferni, #6a9070);
      }
      
      .ferni-expression--helpful {
        --mood-color: var(--color-ferni, #5a7751);
      }
      
      .ferni-expression--concerned {
        --mood-color: var(--color-ferni-secondary, #5a7050);
      }
      
      .ferni-expression--warm {
        --mood-color: var(--color-ferni, #7aa080);
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         PERSONALIZED ELEMENTS
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      .is-personalized {
        animation: personalizedFadeIn 0.5s ease;
      }
      
      @keyframes personalizedFadeIn {
        from {
          opacity: 0.5;
        }
        to {
          opacity: 1;
        }
      }
      
      .is-sentiment-adjusted {
        transition: all 0.5s ease;
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         RESPONSIVE
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      @media (max-width: 768px) {
        #ferni-live-chat {
          bottom: 80px;
          right: 16px;
        }
        
        .ferni-chat-trigger__text {
          display: none;
        }
        
        .ferni-chat-trigger {
          padding: 14px;
          border-radius: 50%;
        }
        
        .ferni-chat-panel {
          width: calc(100vw - 32px);
          max-height: calc(100vh - 120px);
        }
        
        .memory-demo__visualization {
          grid-template-columns: 1fr;
        }
        
        .smart-faq__input-area {
          flex-direction: column;
        }
        
        .team-card__preview-input {
          flex-direction: column;
        }
        
        .team-card__preview-btn {
          align-self: flex-end;
        }
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         REDUCED MOTION
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      @media (prefers-reduced-motion: reduce) {
        .ferni-chat-panel,
        .ferni-chat-message,
        .ferni-hover-preview,
        .is-personalized {
          animation: none !important;
          transition: opacity 0.1s !important;
        }
        
        .ferni-chat-typing__dot {
          animation: none;
          opacity: 0.5;
        }
      }
    `,document.head.appendChild(e)}async function d(){if(s.initialized)return;s.visitorId=w(),await _(),E();const e=[];n.enableChat&&(p.init(),e.push("Live Text Chat")),n.enablePersonaPreviews&&(h.init(),e.push("Persona Previews")),n.enableMemoryDemo&&(u.init(),e.push("Memory Demo")),n.enableHoverPreviews&&(f.init(),e.push("Hover Previews")),n.enableSmartFAQ&&(x.init(),e.push("Smart FAQ")),n.enableSentimentCopy&&(v.init(),e.push("Sentiment-Reactive Copy")),n.enableMicroExpressions&&(y.init(),e.push("Micro Expressions")),n.enablePersonalizedHero&&(m.init(),e.push("Personalized Hero")),n.enableSocialProof&&(g.init(),e.push("AI Social Proof")),s.initialized=!0,e.length>0?(console.log("%c\u{1F916} AI-Powered Landing initialized","color: #4a6741; font-weight: bold;"),console.log("%c  Enabled features:","color: #70605a; font-size: 11px;"),e.forEach(t=>{console.log(`%c    \u2713 ${t}`,"color: #70605a; font-size: 10px;")})):console.log("%c\u{1F916} AI-Powered Landing: All features disabled by flags","color: #70605a;"),console.log("%c    \u2713 Micro-Expressions","color: #70605a; font-size: 10px;")}window.FerniAI={init:d,chat:p,hero:m,personas:h,memory:u,hover:f,socialProof:g,sentimentCopy:v,faq:x,expressions:y,config:n,state:()=>({...s})},document.readyState==="loading"?document.addEventListener("DOMContentLoaded",d):setTimeout(d,100)})();
