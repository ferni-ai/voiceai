"use strict";(function(){"use strict";function f(){const s=document.querySelectorAll("[data-lazy-src]");if("loading"in HTMLImageElement.prototype)s.forEach(e=>{e.loading="lazy",i(e)});else{const e=new IntersectionObserver(a=>{a.forEach(t=>{if(t.isIntersecting){const n=t.target;i(n),e.unobserve(n)}})},{rootMargin:"50px"});s.forEach(a=>e.observe(a))}}function i(s){const e=s.dataset.lazySrc,a=s.dataset.placeholder;a&&(s.src=a),s.style.filter="blur(10px)",s.style.transition="filter 0.5s ease-out",s.style.willChange="filter";const t=new Image;t.onload=()=>{s.src=e,s.style.filter="blur(0)",setTimeout(()=>{s.style.willChange=""},600)},t.src=e}function u(){document.querySelectorAll("[data-ken-burns]").forEach(e=>{const a=e.querySelector("img")||e,t=parseInt(e.dataset.kenBurns)||20,n=e.dataset.kenBurnsDirection||"random";e!==a&&(e.style.overflow="hidden"),a.style.transform="scale(1.1)",a.style.transformOrigin=l(n),a.style.transition=`transform ${t}s ease-in-out`;const o=()=>{const A=1+Math.random()*.1;a.style.transform=`scale(${A})`,a.style.transformOrigin=l(n)};new IntersectionObserver(A=>{A.forEach(c=>{c.isIntersecting&&(o(),setInterval(o,t*1e3))})}).observe(e)})}function l(s){if(s==="center")return"center center";const e=["top left","top center","top right","center left","center center","center right","bottom left","bottom center","bottom right"];return e[Math.floor(Math.random()*e.length)]}function g(){const s=document.querySelectorAll("[data-image-reveal]"),e=new IntersectionObserver(a=>{a.forEach(t=>{if(t.isIntersecting){const n=t.target,o=n.dataset.imageReveal||"up",r=parseInt(n.dataset.revealDelay)||0;setTimeout(()=>{n.classList.add("image-revealed")},r),e.unobserve(n)}})},{threshold:.2});s.forEach(a=>{const t=a.dataset.imageReveal||"up",n={up:"translateY(40px)",down:"translateY(-40px)",left:"translateX(-40px)",right:"translateX(40px)",scale:"scale(0.9)",fade:"none"};a.style.opacity="0",a.style.transform=n[t]||n.up,a.style.transition="opacity 0.8s ease, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)",e.observe(a)})}function p(){document.querySelectorAll("[data-responsive-src]").forEach(e=>{const a=e.dataset.responsiveSrc,t=e.dataset.sizes||"(max-width: 768px) 100vw, 50vw",n=a.lastIndexOf("."),o=a.substring(0,n),r=a.substring(n),c=[320,640,768,1024,1280,1920].map(m=>`${o}-${m}w${r} ${m}w`).join(", ");e.srcset=c,e.sizes=t,e.src=a})}function b(){const s=document.createElement("canvas").toDataURL("image/webp").indexOf("data:image/webp")===0,e=new Promise(t=>{const n=new Image;n.onload=n.onerror=()=>t(n.height===2),n.src="data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKBzgABc0WAAIewQB1//8AAAA+vN0JY="});document.documentElement.classList.add(s?"webp":"no-webp"),e.then(t=>{document.documentElement.classList.add(t?"avif":"no-avif")}),document.querySelectorAll("[data-webp], [data-avif]").forEach(t=>{e.then(n=>{n&&t.dataset.avif?t.src=t.dataset.avif:s&&t.dataset.webp&&(t.src=t.dataset.webp)})})}function v(){document.querySelectorAll("[data-image-hover]").forEach(e=>{const a=e.dataset.imageHover||"zoom",t=e.querySelector("img")||e;e.style.overflow="hidden",t.style.transition="transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)";const n={zoom:()=>{t.style.transform="scale(1.1)"},"zoom-rotate":()=>{t.style.transform="scale(1.1) rotate(2deg)"},"pan-left":()=>{t.style.transform="translateX(-5%)"},"pan-right":()=>{t.style.transform="translateX(5%)"}};e.addEventListener("mouseenter",()=>{n[a]?.()}),e.addEventListener("mouseleave",()=>{t.style.transform=""})})}function h(){const s=document.createElement("style");s.textContent=`
      /* Image reveal animation */
      .image-revealed {
        opacity: 1 !important;
        transform: none !important;
      }
      
      /* Placeholder skeleton for images */
      img[data-lazy-src]:not([src]) {
        background: linear-gradient(
          90deg,
          rgba(235, 230, 223, 1) 0%,
          rgba(245, 242, 237, 1) 50%,
          rgba(235, 230, 223, 1) 100%
        );
        background-size: 200% 100%;
        animation: imagePlaceholder 1.5s ease-in-out infinite;
      }
      
      @keyframes imagePlaceholder {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      
      /* Modern format support classes */
      .webp img[data-webp],
      .avif img[data-avif] {
        transition: opacity 0.3s ease;
      }
    `,document.head.appendChild(s)}function d(){h(),f(),u(),g(),p(),b(),v(),console.log("%c\u{1F5BC}\uFE0F Enhanced images loaded","color: #4a6741; font-weight: bold;")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",d):d()})();
