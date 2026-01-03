"use strict";(function(){"use strict";const c={ttsEndpoint:"https://app.ferni.ai/api/landing/tts",samplesPath:"/audio/samples/",enabled:!0,useBrowserTTS:!0,cacheAudio:!0},p={"career-advice":{question:"I'm thinking about changing careers but I'm scared",response:"That fear makes sense. Career changes are big. What is it specifically\u2014the uncertainty, leaving something familiar, or something else? Let's sit with that together.",duration:12,persona:"ferni"},stress:{question:"I'm feeling really overwhelmed lately",response:"I hear that. Overwhelm is heavy. Before we try to fix anything, what's weighing on you most right now? Sometimes just naming it helps.",duration:11,persona:"ferni"},habits:{question:"How do I actually stick to a habit?",response:"Here's the plan: make it embarrassingly small. Want to exercise? Start with putting on your shoes. That's it. Once that's automatic, we build. What habit are we working on?",duration:13,persona:"maya"},relationship:{question:"I need to have a hard conversation with someone",response:"That takes courage. Let's find the right words. What's the core thing you need them to understand? We can practice it together until it feels right.",duration:12,persona:"alex"},decision:{question:"I have a big decision to make and I'm stuck",response:"Interesting. Being stuck usually tells us something. Let's explore both paths\u2014what do you gain and what do you risk with each? Sometimes the answer's already there.",duration:13,persona:"peter"},sleep:{question:"It's 3am and I can't stop thinking",response:"I'm here. 3am thoughts hit different. You don't have to figure anything out right now. Just tell me what's keeping you up. Sometimes that's enough.",duration:11,persona:"ferni"},meaning:{question:"I feel like I'm just going through the motions",response:"That's worth sitting with. Going through the motions often means something deeper is asking for attention. What would a day that felt meaningful actually look like?",duration:13,persona:"nayan"},celebration:{question:"I got the promotion but I don't feel excited",response:"Wait\u2014you got the promotion? That's huge! Let's not skip past this. You worked for this. What would celebrating actually look like? You deserve to feel this.",duration:12,persona:"jordan"}},o={currentlyPlaying:null,audioContext:null,synthesis:window.speechSynthesis,preferredVoice:null,initialized:!1,audioCache:new Map},f={ferni:"ferni",maya:"maya-santos",peter:"peter-john",alex:"alex-chen",jordan:"jordan-taylor",nayan:"nayan-patel"};function k(){return o.audioContext||(o.audioContext=new(window.AudioContext||window.webkitAudioContext)),o.audioContext}function m(){if(!o.synthesis)return null;const a=o.synthesis.getVoices(),i=["Samantha","Karen","Google US English","Microsoft Aria Online"];for(const e of i){const t=a.find(n=>n.name.includes(e));if(t)return t}return a.find(e=>e.lang.startsWith("en"))||a[0]}async function d(a,i){const e=p[a];if(!e)return;o.currentlyPlaying&&l(),i.classList.add("is-playing"),o.currentlyPlaying={sampleId:a,button:i,audio:null};const t=f[e.persona]||"ferni",n=`${a}-${t}`;if(c.cacheAudio&&o.audioCache.has(n)){console.log("%c\u{1F3A4} Using cached AI voice","color: #4a6741"),await g(o.audioCache.get(n));return}if(c.ttsEndpoint)try{console.log("%c\u{1F3A4} Generating real AI voice...","color: #4a6741; font-weight: bold");const r=await w(e.response,t);if(r){c.cacheAudio&&o.audioCache.set(n,r),await g(r);return}}catch(r){console.warn("AI TTS failed, trying fallback:",r.message)}const s=c.samplesPath+a+".mp3";try{const r=new Audio(s);o.currentlyPlaying.audio=r,r.addEventListener("ended",()=>l()),r.addEventListener("error",()=>{h(e.response,i)}),await r.play()}catch{h(e.response,i)}}async function w(a,i){if(!c.ttsEndpoint)return null;const e=await fetch(c.ttsEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:a,personaId:i})});if(!e.ok)throw new Error(`TTS API error: ${e.status}`);const t=await e.blob(),n=e.headers.get("X-Persona-Name")||i;return console.log(`%c\u2705 Generated ${n}'s voice (${Math.round(t.size/1024)}KB)`,"color: #4a6741"),t}async function g(a){const i=URL.createObjectURL(a),e=new Audio(i);o.currentlyPlaying&&(o.currentlyPlaying.audio=e),e.addEventListener("ended",()=>{URL.revokeObjectURL(i),l()}),e.addEventListener("error",t=>{URL.revokeObjectURL(i),console.error("Audio playback error:",t),l()}),await e.play()}function h(a,i){if(!o.synthesis||!c.useBrowserTTS){l();return}console.log("%c\u26A0\uFE0F Using browser TTS fallback","color: #b8956a");const e=new SpeechSynthesisUtterance(a);o.preferredVoice&&(e.voice=o.preferredVoice),e.rate=.95,e.pitch=1,e.volume=1,e.addEventListener("end",()=>l()),e.addEventListener("error",()=>l()),o.synthesis.speak(e)}function S(a,i){h(a,i)}function l(){o.synthesis&&o.synthesis.cancel(),o.currentlyPlaying?.audio&&(o.currentlyPlaying.audio.pause(),o.currentlyPlaying.audio.currentTime=0),o.currentlyPlaying?.button&&o.currentlyPlaying.button.classList.remove("is-playing"),o.currentlyPlaying=null}function v(a,i={}){const e=p[a];if(!e)return null;const t={ferni:{name:"Ferni",role:"Life Coach",color:"#4a6741",initials:"FE"},maya:{name:"Maya",role:"Habit Architect",color:"#a67a6a",initials:"MY"},peter:{name:"Peter",role:"Research Guide",color:"#3a6b73",initials:"PL"},alex:{name:"Alex",role:"Communications Coach",color:"#5a6b8a",initials:"AX"},jordan:{name:"Jordan",role:"Celebration Catalyst",color:"#c4856a",initials:"JD"},nayan:{name:"Nayan",role:"Wisdom Guide",color:"#b8956a",initials:"NP"}},n=t[e.persona]||t.ferni,s=document.createElement("div");return s.className="voice-sample",s.dataset.sampleId=a,s.style.setProperty("--persona-color",n.color),s.innerHTML=`
      <div class="voice-sample__header">
        <div class="voice-sample__avatar" style="--persona-color: ${n.color}">
          ${n.initials}
        </div>
        <div class="voice-sample__info">
          <span class="voice-sample__persona">${n.name}</span>
          <span class="voice-sample__role">${n.role}</span>
        </div>
        <button class="voice-sample__play" aria-label="Play voice sample" style="--persona-color: ${n.color}">
          <svg class="voice-sample__icon-play" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <svg class="voice-sample__icon-pause" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        </button>
      </div>
      
      ${i.showQuestion?`
        <div class="voice-sample__question">
          <span class="voice-sample__q-label">Q:</span>
          "${e.question}"
        </div>
      `:""}
      
      <div class="voice-sample__waveform">
        ${Array(20).fill(0).map(()=>'<div class="voice-sample__bar"></div>').join("")}
      </div>
      
      ${i.showTranscript?`
        <div class="voice-sample__transcript">
          <span class="voice-sample__a-label">Response:</span>
          "${e.response}"
        </div>
      `:""}
    `,s.querySelector(".voice-sample__play").addEventListener("click",()=>{o.currentlyPlaying?.sampleId===a?l():d(a,s)}),s}function y(a,i){if(!p[a])return null;const t=document.createElement("button");return t.className="voice-sample-inline",t.dataset.sampleId=a,t.innerHTML=`
      <svg class="voice-sample-inline__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      <span class="voice-sample-inline__label">${i}</span>
    `,t.addEventListener("click",()=>{o.currentlyPlaying?.sampleId===a?l():d(a,t)}),t}function _(){const a=document.querySelectorAll(".feature"),i=Array.from(a).find(e=>{const t=e.querySelector(".feature__title");return t&&t.textContent.toLowerCase().includes("voice")});if(i){const e=y("stress","\u{1F50A} Hear Ferni respond");i.appendChild(e)}}function b(){const a=document.querySelector(".use-cases, #use-cases");if(!a)return;const i=document.createElement("div");i.className="voice-samples-showcase",i.innerHTML=`
      <div class="voice-samples-showcase__header">
        <p class="voice-samples-showcase__eyebrow">YOUR TEAM</p>
        <h3 class="voice-samples-showcase__title">Six voices. One conversation.</h3>
        <p class="voice-samples-showcase__subtitle">Each brings something different\u2014hear how they respond</p>
      </div>
      <div class="voice-samples-showcase__grid"></div>
    `;const e=i.querySelector(".voice-samples-showcase__grid");["stress","habits","relationship","decision","meaning","celebration"].forEach(n=>{const s=v(n,{showQuestion:!0,showTranscript:!1,topic:p[n].question.slice(0,30)+"..."});s&&e.appendChild(s)}),a.parentNode.insertBefore(i,a)}function x(){if(document.getElementById("voice-samples-styles"))return;const a=document.createElement("style");a.id="voice-samples-styles",a.textContent=`
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         VOICE SAMPLE PLAYER
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      .voice-sample {
        background: white;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
        transition: box-shadow 0.3s ease;
      }
      
      .voice-sample:hover {
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
      }
      
      .voice-sample.is-playing {
        box-shadow: 0 8px 32px color-mix(in srgb, var(--persona-color, #4a6741) 25%, transparent);
      }
      
      .voice-sample__header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .voice-sample__avatar {
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, var(--persona-color, #4a6741), color-mix(in srgb, var(--persona-color, #4a6741) 80%, black));
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 12px;
        font-weight: 700;
        flex-shrink: 0;
      }
      
      .voice-sample__info {
        flex: 1;
      }
      
      .voice-sample__persona {
        display: block;
        font-weight: 600;
        color: #2c2520;
        font-size: 15px;
      }
      
      .voice-sample__role {
        display: block;
        font-size: 12px;
        color: #70605a;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 500;
      }
      
      .voice-sample__play {
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, var(--persona-color), color-mix(in srgb, var(--persona-color) 85%, black));
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        flex-shrink: 0;
      }
      
      .voice-sample__play:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 16px color-mix(in srgb, var(--persona-color) 40%, transparent);
      }
      
      .voice-sample__icon-play,
      .voice-sample__icon-pause {
        width: 20px;
        height: 20px;
      }
      
      .voice-sample__icon-pause {
        display: none;
      }
      
      .voice-sample.is-playing .voice-sample__icon-play {
        display: none;
      }
      
      .voice-sample.is-playing .voice-sample__icon-pause {
        display: block;
      }
      
      /* Waveform */
      .voice-sample__waveform {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        height: 32px;
        margin: 16px 0;
        opacity: 0.3;
        transition: opacity 0.3s;
      }
      
      .voice-sample.is-playing .voice-sample__waveform {
        opacity: 1;
      }
      
      .voice-sample__bar {
        width: 3px;
        height: 8px;
        background: var(--persona-color, #4a6741);
        border-radius: 2px;
        transition: height 0.1s ease;
      }
      
      .voice-sample.is-playing .voice-sample__bar {
        animation: waveBar 0.6s ease-in-out infinite;
      }
      
      .voice-sample.is-playing .voice-sample__bar:nth-child(odd) {
        animation-delay: 0.1s;
      }
      
      .voice-sample.is-playing .voice-sample__bar:nth-child(3n) {
        animation-delay: 0.2s;
      }
      
      @keyframes waveBar {
        0%, 100% { height: 8px; }
        50% { height: 24px; }
      }
      
      /* Question */
      .voice-sample__question {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(44, 37, 32, 0.08);
        font-size: 14px;
        color: #2c2520;
        font-style: italic;
      }
      
      .voice-sample__q-label {
        font-weight: 600;
        font-style: normal;
        color: #70605a;
        margin-right: 4px;
      }
      
      /* Transcript */
      .voice-sample__transcript {
        margin-top: 12px;
        font-size: 13px;
        color: #70605a;
        line-height: 1.6;
      }
      
      .voice-sample__a-label {
        font-weight: 600;
        display: block;
        margin-bottom: 4px;
        color: #4a6741;
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         INLINE PLAY BUTTON
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      .voice-sample-inline {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: rgba(74, 103, 65, 0.1);
        border: 1px solid rgba(74, 103, 65, 0.2);
        border-radius: 20px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        color: #4a6741;
        transition: all 0.2s;
      }
      
      .voice-sample-inline:hover {
        background: rgba(74, 103, 65, 0.15);
        border-color: rgba(74, 103, 65, 0.3);
      }
      
      .voice-sample-inline.is-playing {
        background: #4a6741;
        color: white;
        border-color: #4a6741;
      }
      
      .voice-sample-inline__icon {
        width: 14px;
        height: 14px;
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         VOICE SAMPLES SHOWCASE
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      .voice-samples-showcase {
        padding: 60px 24px;
        background: linear-gradient(180deg, rgba(74, 103, 65, 0.05) 0%, transparent 100%);
      }
      
      .voice-samples-showcase__header {
        text-align: center;
        margin-bottom: 48px;
      }
      
      .voice-samples-showcase__eyebrow {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #4a6741;
        margin: 0 0 12px;
      }
      
      .voice-samples-showcase__title {
        font-size: 32px;
        font-weight: 700;
        color: #2c2520;
        margin: 0 0 12px;
        line-height: 1.2;
      }
      
      .voice-samples-showcase__subtitle {
        font-size: 18px;
        color: #70605a;
        margin: 0;
        font-weight: 400;
      }
      
      .voice-samples-showcase__grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        max-width: 1200px;
        margin: 0 auto;
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         RESPONSIVE
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      @media (max-width: 1024px) {
        .voice-samples-showcase__grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      
      @media (max-width: 640px) {
        .voice-samples-showcase__grid {
          grid-template-columns: 1fr;
        }
        
        .voice-sample {
          padding: 16px;
        }
        
        .voice-samples-showcase__title {
          font-size: 26px;
        }
        
        .voice-samples-showcase__subtitle {
          font-size: 16px;
        }
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         REDUCED MOTION
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      @media (prefers-reduced-motion: reduce) {
        .voice-sample.is-playing .voice-sample__bar {
          animation: none;
          height: 16px;
        }
      }
    `,document.head.appendChild(a)}function u(){if(!c.enabled||o.initialized)return;x(),o.synthesis&&(o.preferredVoice=m(),o.synthesis.addEventListener("voiceschanged",()=>{o.preferredVoice=m()})),b(),_(),o.initialized=!0;const a=c.ttsEndpoint?"(Real AI voices enabled! \u{1F3A4})":"(Using browser TTS fallback)";console.log(`%c\u{1F50A} Voice Samples initialized ${a}`,"color: #4a6741; font-weight: bold;")}window.FerniVoiceSamples={init:u,createPlayer:v,createInlineButton:y,play:d,stop:l,samples:p,state:()=>({...o})},document.readyState==="loading"?document.addEventListener("DOMContentLoaded",u):setTimeout(u,200)})();
