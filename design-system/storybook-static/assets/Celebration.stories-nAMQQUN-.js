import{a as s,j as d,R as t}from"./index-DZPSA8Wk.js";import{c}from"./client-CETsdmKV.js";import{F as l}from"./FerniProvider-D7df2m8C.js";import{c as J}from"./index-D5g3GZkO.js";import"./_commonjsHelpers-Cpj98o6Y.js";const q=J,G={smallWin:20,bigWin:60,milestone:80,streak:40,teamUnlock:50},H={smallWin:1500,bigWin:2500,milestone:3e3,streak:2e3,teamUnlock:2500};function K(e,r){const n=q[e];return Array.from({length:r},(i,a)=>({id:a,x:50+(Math.random()-.5)*20,y:50,color:n[Math.floor(Math.random()*n.length)],size:4+Math.random()*8,rotation:Math.random()*360,velocityX:(Math.random()-.5)*15,velocityY:-10-Math.random()*10,delay:Math.random()*200}))}const L=({type:e="smallWin",trigger:r=!1,onComplete:n,particleCount:i,duration:a,haptic:E=!0})=>{const[k,h]=s.useState([]),[x,T]=s.useState(!1),B=s.useRef(null),W=i??G[e],b=a??H[e],C=s.useCallback(()=>{if(h(K(e,W)),T(!0),E&&"vibrate"in navigator){const o=e==="bigWin"||e==="milestone"?[50,50,50,50,100]:[30,30,50];navigator.vibrate(o)}setTimeout(()=>{T(!1),h([]),n==null||n()},b)},[e,W,b,E,n]);return s.useEffect(()=>{r&&!x&&C()},[r,x,C]),!x||k.length===0?null:d.jsxs(d.Fragment,{children:[d.jsx("div",{ref:B,className:"ferni-celebration","aria-hidden":"true",children:k.map(o=>d.jsx("div",{className:"ferni-celebration__particle",style:{"--x":`${o.x}%`,"--y":`${o.y}%`,"--color":o.color,"--size":`${o.size}px`,"--rotation":`${o.rotation}deg`,"--velocity-x":o.velocityX,"--velocity-y":o.velocityY,"--delay":`${o.delay}ms`,"--duration":`${b}ms`}},o.id))}),d.jsx("style",{children:`
        .ferni-celebration {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 9999;
          overflow: hidden;
        }

        .ferni-celebration__particle {
          position: absolute;
          left: var(--x);
          top: var(--y);
          width: var(--size);
          height: var(--size);
          background: var(--color);
          border-radius: 2px;
          transform: rotate(var(--rotation));
          animation: ferni-confetti var(--duration) ease-out forwards;
          animation-delay: var(--delay);
          opacity: 0;
        }

        @keyframes ferni-confetti {
          0% {
            opacity: 1;
            transform: 
              translateX(0) 
              translateY(0) 
              rotate(var(--rotation))
              scale(0);
          }
          10% {
            opacity: 1;
            transform: 
              translateX(calc(var(--velocity-x) * 0.1vw)) 
              translateY(calc(var(--velocity-y) * 0.1vh)) 
              rotate(calc(var(--rotation) + 20deg))
              scale(1);
          }
          100% {
            opacity: 0;
            transform: 
              translateX(calc(var(--velocity-x) * 3vw)) 
              translateY(calc(var(--velocity-y) * -3vh + 100vh)) 
              rotate(calc(var(--rotation) + 720deg))
              scale(0.5);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ferni-celebration__particle {
            animation: ferni-confetti-reduced var(--duration) ease-out forwards;
          }
          
          @keyframes ferni-confetti-reduced {
            0% { opacity: 0; }
            20% { opacity: 1; }
            100% { opacity: 0; }
          }
        }
      `})]})};L.displayName="Celebration";const re={title:"React/Celebration",tags:["autodocs"],argTypes:{type:{control:{type:"select"},options:["smallWin","bigWin","milestone","streak","teamUnlock"]},particleCount:{control:{type:"range",min:20,max:200,step:10}},duration:{control:{type:"range",min:500,max:5e3,step:100}}}},m=({type:e="smallWin"})=>{const[r,n]=s.useState(!1),i=()=>{n(!0),setTimeout(()=>n(!1),100)};return t.createElement("div",{style:{padding:"24px",textAlign:"center"}},t.createElement(L,{type:e,trigger:r}),t.createElement("button",{onClick:i,style:{padding:"16px 32px",fontSize:"16px",fontFamily:"Plus Jakarta Sans, system-ui, sans-serif",fontWeight:600,color:"white",background:"#4a6741",border:"none",borderRadius:"12px",cursor:"pointer",transition:"transform 0.2s, box-shadow 0.2s"},onMouseEnter:a=>{a.currentTarget.style.transform="scale(1.02)",a.currentTarget.style.boxShadow="0 4px 12px rgba(74, 103, 65, 0.3)"},onMouseLeave:a=>{a.currentTarget.style.transform="scale(1)",a.currentTarget.style.boxShadow="none"}},"Celebrate! 🎉"),t.createElement("p",{style:{marginTop:"16px",fontFamily:"Inter, system-ui, sans-serif",color:"#5C544A",fontSize:"14px"}},"Type: ",t.createElement("strong",{style:{textTransform:"capitalize"}},e)))},u={render:()=>{const e=document.createElement("div");return c(e).render(t.createElement(l,null,t.createElement(m,{type:"smallWin"}))),e}},p={render:()=>{const e=document.createElement("div");return c(e).render(t.createElement(l,null,t.createElement(m,{type:"bigWin"}))),e}},y={render:()=>{const e=document.createElement("div");return c(e).render(t.createElement(l,null,t.createElement(m,{type:"milestone"}))),e}},v={render:()=>{const e=document.createElement("div");return c(e).render(t.createElement(l,null,t.createElement(m,{type:"streak"}))),e}},f={render:()=>{const e=document.createElement("div");return c(e).render(t.createElement(l,null,t.createElement(m,{type:"teamUnlock"}))),e}},g={render:()=>{const e=document.createElement("div"),r=["smallWin","bigWin","milestone","streak","teamUnlock"];return c(e).render(t.createElement(l,null,t.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:"24px",padding:"24px"}},r.map(i=>t.createElement(m,{key:i,type:i}))))),e}};var S,P,R;u.parameters={...u.parameters,docs:{...(S=u.parameters)==null?void 0:S.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <CelebrationDemo type="smallWin" />
      </FerniProvider>);
    return container;
  }
}`,...(R=(P=u.parameters)==null?void 0:P.docs)==null?void 0:R.source}}};var F,M,U;p.parameters={...p.parameters,docs:{...(F=p.parameters)==null?void 0:F.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <CelebrationDemo type="bigWin" />
      </FerniProvider>);
    return container;
  }
}`,...(U=(M=p.parameters)==null?void 0:M.docs)==null?void 0:U.source}}};var _,w,A;y.parameters={...y.parameters,docs:{...(_=y.parameters)==null?void 0:_.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <CelebrationDemo type="milestone" />
      </FerniProvider>);
    return container;
  }
}`,...(A=(w=y.parameters)==null?void 0:w.docs)==null?void 0:A.source}}};var z,D,j;v.parameters={...v.parameters,docs:{...(z=v.parameters)==null?void 0:z.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <CelebrationDemo type="streak" />
      </FerniProvider>);
    return container;
  }
}`,...(j=(D=v.parameters)==null?void 0:D.docs)==null?void 0:j.source}}};var N,O,$;f.parameters={...f.parameters,docs:{...(N=f.parameters)==null?void 0:N.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <CelebrationDemo type="teamUnlock" />
      </FerniProvider>);
    return container;
  }
}`,...($=(O=f.parameters)==null?void 0:O.docs)==null?void 0:$.source}}};var I,X,Y;g.parameters={...g.parameters,docs:{...(I=g.parameters)==null?void 0:I.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const types: CelebrationType[] = ['smallWin', 'bigWin', 'milestone', 'streak', 'teamUnlock'];
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '24px',
        padding: '24px'
      }}>
          {types.map(type => <CelebrationDemo key={type} type={type} />)}
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(Y=(X=g.parameters)==null?void 0:X.docs)==null?void 0:Y.source}}};const ne=["SmallWin","BigWin","Milestone","Streak","TeamUnlock","AllTypes"];export{g as AllTypes,p as BigWin,y as Milestone,u as SmallWin,v as Streak,f as TeamUnlock,ne as __namedExportsOrder,re as default};
