"use strict";(function(){"use strict";function c(){document.querySelectorAll("[data-floating-label]").forEach(e=>{const o=e.querySelector("input, textarea, select"),n=e.querySelector("label");if(!o||!n)return;e.style.position="relative",n.style.cssText=`
        position: absolute;
        left: 1rem;
        top: 50%;
        transform: translateY(-50%);
        color: rgba(92, 84, 74, 0.6);
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        transform-origin: left center;
        background: transparent;
        padding: 0 0.25rem;
      `,o.tagName==="TEXTAREA"&&(n.style.top="1rem",n.style.transform="none");const s=()=>{n.style.top="-0.5rem",n.style.transform="scale(0.85)",n.style.color="#4a6741",n.style.background="#faf8f5"},r=()=>{o.value||(n.style.top=o.tagName==="TEXTAREA"?"1rem":"50%",n.style.transform=o.tagName==="TEXTAREA"?"none":"translateY(-50%)",n.style.color="rgba(92, 84, 74, 0.6)",n.style.background="transparent")};o.addEventListener("focus",s),o.addEventListener("blur",r),o.value&&s()})}function d(){document.querySelectorAll("[data-validate]").forEach(e=>{const o=e.dataset.validate,n=e.dataset.errorMessage||"Invalid input",s=document.createElement("span");s.className="validation-error",s.style.cssText=`
        display: block;
        color: #b5453a;
        font-size: 0.75rem;
        margin-top: 0.25rem;
        opacity: 0;
        transform: translateY(-5px);
        transition: all 0.3s ease;
      `,s.textContent=n,e.parentNode.appendChild(s);const r={email:a=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a),phone:a=>/^[\d\s\-\+\(\)]{10,}$/.test(a),required:a=>a.trim().length>0,minlength:a=>a.length>=parseInt(e.dataset.minlength||1),maxlength:a=>a.length<=parseInt(e.dataset.maxlength||1e3),number:a=>!isNaN(parseFloat(a)),url:a=>/^https?:\/\/.+/.test(a)},l=()=>{const a=r[o]?.(e.value)??!0;return!a&&e.value?(e.style.borderColor="#b5453a",s.style.opacity="1",s.style.transform="translateY(0)"):(e.style.borderColor=e.value?"#3d7a52":"",s.style.opacity="0",s.style.transform="translateY(-5px)"),a};e.addEventListener("blur",l),e.addEventListener("input",()=>{e.dataset.validated&&l()}),e.addEventListener("blur",()=>{e.dataset.validated="true"},{once:!0})})}function u(){document.querySelectorAll("input, textarea, select").forEach(e=>{e.style.transition="border-color 0.3s ease, box-shadow 0.3s ease",e.addEventListener("focus",()=>{e.style.borderColor="#4a6741",e.style.boxShadow="0 0 0 3px rgba(74, 103, 65, 0.15), 0 0 20px rgba(74, 103, 65, 0.1)",e.style.outline="none"}),e.addEventListener("blur",()=>{e.style.boxShadow="",e.value||(e.style.borderColor="")})})}function f(){document.querySelectorAll("[data-celebrate-submit]").forEach(e=>{e.addEventListener("submit",o=>{if(!e.checkValidity())return;window.ferniConfetti&&window.ferniConfetti(e,30);const n=e.querySelector('button[type="submit"]');if(n){const s=n.textContent;n.textContent="\u2713 Sent!",n.style.background="#3d7a52",setTimeout(()=>{n.textContent=s,n.style.background=""},3e3)}})})}function m(){window.ferniButtonSuccess=t=>{const e=t.innerHTML;t.innerHTML=`
        <svg class="btn-success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:20px;height:20px;">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        Success!
      `,t.style.background="#3d7a52",t.classList.add("btn-success-animate"),setTimeout(()=>{t.innerHTML=e,t.style.background="",t.classList.remove("btn-success-animate")},2500)},window.ferniButtonError=(t,e="Error")=>{const o=t.innerHTML;t.innerHTML=`
        <svg class="btn-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        ${e}
      `,t.style.background="#b5453a",t.classList.add("btn-shake"),setTimeout(()=>{t.innerHTML=o,t.style.background="",t.classList.remove("btn-shake")},2500)},window.ferniButtonLoading=t=>{const e=t.innerHTML;t.dataset.originalContent=e,t.innerHTML=`
        <span class="btn-spinner"></span>
        Loading...
      `,t.disabled=!0,t.style.pointerEvents="none"},window.ferniButtonReset=t=>{t.innerHTML=t.dataset.originalContent||t.innerHTML,t.disabled=!1,t.style.pointerEvents=""}}function y(){const t=document.createElement("style");t.textContent=`
      /* Button success animation */
      .btn-success-animate {
        animation: successPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      @keyframes successPop {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      
      /* Button shake animation */
      .btn-shake {
        animation: shake 0.5s ease;
      }
      
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-5px); }
        40%, 80% { transform: translateX(5px); }
      }
      
      /* Button spinner */
      .btn-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid transparent;
        border-top-color: currentColor;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-right: 8px;
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      /* Autofill styling */
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus,
      textarea:-webkit-autofill {
        -webkit-box-shadow: 0 0 0 1000px #faf8f5 inset !important;
        -webkit-text-fill-color: #2c2520 !important;
        caret-color: #2c2520;
        transition: background-color 5000s ease-in-out 0s;
      }
      
      /* Validation icons */
      input:valid:not(:placeholder-shown) {
        border-color: #3d7a52;
      }
      
      input:invalid:not(:placeholder-shown):not(:focus) {
        border-color: #b5453a;
      }
    `,document.head.appendChild(t)}function i(){y(),c(),d(),u(),f(),m(),console.log("%c\u{1F4DD} Enhanced forms loaded","color: #4a6741; font-weight: bold;")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",i):i()})();
