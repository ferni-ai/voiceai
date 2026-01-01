"use strict";(function(){"use strict";const e={initialized:!1,visible:!1,expanded:!1,greeting:null,greetingTiming:null,currentSection:"hero",timeOnPage:0,scrollDepth:0,greetingShown:!1,dismissed:!1};let t=null,c=null,s=null;function g(){t=document.createElement("div"),t.className="ferni-chat-widget",t.innerHTML=`
      <div class="ferni-chat-bubble" role="button" aria-label="Chat with Ferni">
        <div class="ferni-chat-bubble__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
        <div class="ferni-chat-bubble__greeting"></div>
      </div>
      <div class="ferni-chat-panel" role="dialog" aria-label="Chat with Ferni">
        <div class="ferni-chat-panel__header">
          <div class="ferni-chat-panel__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
          <div class="ferni-chat-panel__title">
            <span class="ferni-chat-panel__name">Ferni</span>
            <span class="ferni-chat-panel__status">Online</span>
          </div>
          <button class="ferni-chat-panel__close" aria-label="Close chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="ferni-chat-panel__body">
          <div class="ferni-chat-panel__message">
            <p>Hey! \u{1F44B}</p>
            <p>I'm Ferni, your AI life coach. Want to see how I can help?</p>
          </div>
          <div class="ferni-chat-panel__actions">
            <a href="tel:+18888888888" class="ferni-chat-panel__action ferni-chat-panel__action--call">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Call Now
            </a>
            <a href="#" class="ferni-chat-panel__action ferni-chat-panel__action--app" onclick="window.location.href='https://app.ferni.ai'">
              Try the App
            </a>
          </div>
        </div>
      </div>
    `,c=t.querySelector(".ferni-chat-bubble"),s=t.querySelector(".ferni-chat-panel"),c.addEventListener("click",u),t.querySelector(".ferni-chat-panel__close").addEventListener("click",l),document.body.appendChild(t)}function o(){e.visible||e.dismissed||(t.classList.add("is-visible"),e.visible=!0)}function d(){t.classList.remove("is-visible"),e.visible=!1}function u(){e.expanded?l():h()}function h(){t.classList.add("is-expanded"),s.setAttribute("aria-hidden","false"),e.expanded=!0,r()}function l(){t.classList.remove("is-expanded"),s.setAttribute("aria-hidden","true"),e.expanded=!1}function p(){e.dismissed=!0,d(),sessionStorage.setItem("ferni_chat_dismissed","true")}function v(i,n){e.greeting=i,e.greetingTiming=n,n&&n.shouldShow&&!e.greetingShown&&!e.dismissed&&setTimeout(()=>{a(i)},n.delay)}function a(i){if(e.greetingShown||e.expanded||e.dismissed)return;const n=t.querySelector(".ferni-chat-bubble__greeting");n&&(n.textContent=i,n.classList.add("is-visible"),e.greetingShown=!0,setTimeout(r,8e3)),o()}function r(){const i=t.querySelector(".ferni-chat-bubble__greeting");i&&i.classList.remove("is-visible")}function w(i){e.currentSection=i.section||e.currentSection,e.timeOnPage=i.timeOnPage||e.timeOnPage,e.scrollDepth=i.scrollDepth||e.scrollDepth,_()}function b(i){e.currentSection=i;const n={pricing:"Questions about pricing? I can help.",faq:"Don't see your question? Ask me directly.",proof:"Skeptical? Happy to address any concerns."};n[i]&&!e.greetingShown&&!e.dismissed&&setTimeout(()=>{a(n[i])},2e3)}let f=null;function _(){e.greetingShown||e.dismissed||(clearTimeout(f),e.timeOnPage>30&&e.scrollDepth>40&&(f=setTimeout(()=>{e.greetingShown||y()},3e3)))}async function y(){try{const i=await window.FerniLandingIntelligence?.fetchChatGreeting(e.currentSection,e.timeOnPage,e.scrollDepth);i&&i.shouldShowChat&&setTimeout(()=>{a(i.chatGreeting)},i.delay)}catch(i){console.warn("[ChatWidget] Failed to fetch greeting:",i)}}function m(){e.initialized||(sessionStorage.getItem("ferni_chat_dismissed")&&(e.dismissed=!0),g(),e.initialized=!0,console.log("%c\u{1F4AC} Ferni Chat Widget initialized","color: #a67a6a;"))}window.FerniChatWidget={init:m,show:o,hide:d,dismiss:p,setGreeting:v,showGreeting:a,hideGreeting:r,updateContext:w,onSectionChange:b,openPanel:h,closePanel:l,getState:()=>({...e})}})();
