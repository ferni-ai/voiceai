import{a as b,j as a,R as r}from"./index-DZPSA8Wk.js";import{c}from"./client-CETsdmKV.js";import{p as J}from"./index-D5g3GZkO.js";import{F as l}from"./FerniProvider-D7df2m8C.js";import"./_commonjsHelpers-Cpj98o6Y.js";const K=n=>{var t;return((t=J[n])==null?void 0:t.colors.primary)??"#4a6741"},i=b.forwardRef(function({persona:t="ferni",size:s=200,state:e="idle",breathing:w=!0,glow:E=!0,expression:v="neutral",onClick:k,className:h="",style:L},Q){const p=K(t),q=b.useMemo(()=>{const o=["ferni-avatar"];return w&&o.push("breathing"),e==="speaking"&&o.push("speaking"),e==="celebrating"&&o.push("celebrating"),h&&o.push(h),o.join(" ")},[w,e,h]),H=b.useMemo(()=>{if(!E)return 0;switch(e){case"celebrating":return .6;case"speaking":return .4;case"listening":return .35;default:return .2}},[E,e]);return a.jsxs("svg",{ref:Q,viewBox:"0 0 200 200",width:s,height:s,className:q,style:{"--persona-primary":p,cursor:k?"pointer":"default",...L},onClick:k,role:"img","aria-label":`${t}, your ${t==="ferni"?"life coach":"team member"}`,children:[a.jsx("defs",{children:a.jsxs("filter",{id:`glow-${t}`,x:"-50%",y:"-50%",width:"200%",height:"200%",children:[a.jsx("feGaussianBlur",{in:"SourceGraphic",stdDeviation:"8",result:"blur"}),a.jsxs("feMerge",{children:[a.jsx("feMergeNode",{in:"blur"}),a.jsx("feMergeNode",{in:"SourceGraphic"})]})]})}),a.jsx("circle",{cx:"100",cy:"100",r:"85",fill:"none",stroke:p,strokeWidth:e==="celebrating"?2.5:1,opacity:H,filter:`url(#glow-${t})`,style:{transition:"opacity 0.4s ease, stroke-width 0.4s ease"}}),a.jsxs("g",{className:"ferni-body-group",style:{transformOrigin:"center center"},children:[a.jsx("circle",{cx:"100",cy:"100",r:"70",fill:p}),a.jsxs("g",{className:"ferni-eyes-group",children:[a.jsx("ellipse",{cx:"70",cy:"88",rx:"15",ry:"12",fill:"white",className:"ferni-eye"}),a.jsx("ellipse",{cx:"130",cy:"88",rx:"15",ry:"12",fill:"white",className:"ferni-eye"})]}),(v==="happy"||v==="warm"||v==="excited")&&a.jsx("path",{d:"M75 115 Q100 125, 125 115",fill:"none",stroke:p,strokeWidth:"1.5",strokeLinecap:"round",opacity:"0.5",style:{filter:"brightness(0.85)"}})]}),a.jsx("style",{children:`
        .ferni-avatar {
          user-select: none;
        }
        
        .ferni-avatar.breathing .ferni-body-group {
          animation: ferni-breathe 4s ease-in-out infinite;
        }
        
        .ferni-avatar.speaking .ferni-body-group {
          animation: ferni-speak 0.4s ease-in-out infinite alternate;
        }
        
        .ferni-avatar.celebrating .ferni-body-group {
          animation: ferni-celebrate 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        @keyframes ferni-breathe {
          0%, 100% { transform: scaleY(1) scaleX(1); }
          50% { transform: scaleY(1.018) scaleX(0.994); }
        }
        
        @keyframes ferni-speak {
          0% { transform: scaleY(1) scaleX(1); }
          100% { transform: scaleY(1.03) scaleX(0.98); }
        }
        
        @keyframes ferni-celebrate {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-10px) scale(1.08); }
          100% { transform: translateY(0) scale(1); }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .ferni-avatar .ferni-body-group {
            animation: none !important;
          }
        }
      `})]})});i.displayName="Avatar";const U=n=>{const t=document.createElement("div");return c(t).render(r.createElement(l,null,n)),t},te={title:"React/Avatar",tags:["autodocs"],render:n=>U(r.createElement(i,{...n})),argTypes:{persona:{control:{type:"select"},options:["ferni","peter","alex","maya","jordan","nayan"]},size:{control:{type:"range",min:50,max:400,step:10}},state:{control:{type:"select"},options:["idle","speaking","listening","thinking","celebrating","concerned"]},expression:{control:{type:"select"},options:["neutral","happy","curious","concerned","thinking","excited","sleepy","surprised","warm"]},breathing:{control:"boolean"},glow:{control:"boolean"}}},d={args:{persona:"ferni",size:200,breathing:!0,glow:!0}},m={args:{persona:"ferni",size:200,state:"speaking",breathing:!0,glow:!0}},g={args:{persona:"ferni",size:200,state:"celebrating",expression:"excited",breathing:!0,glow:!0}},f={render:()=>{const n=document.createElement("div");n.style.cssText="display: flex; gap: 24px; flex-wrap: wrap; align-items: center; padding: 24px;";const t=["ferni","peter","alex","maya","jordan","nayan"];return c(n).render(r.createElement(l,null,r.createElement("div",{style:{display:"flex",gap:"24px",flexWrap:"wrap",alignItems:"center"}},t.map(e=>r.createElement("div",{key:e,style:{textAlign:"center"}},r.createElement(i,{persona:e,size:100,breathing:!0,glow:!0}),r.createElement("p",{style:{marginTop:"8px",fontFamily:"Inter, system-ui, sans-serif",fontSize:"14px",textTransform:"capitalize",color:"#2C2520"}},e)))))),n}},u={render:()=>{const n=document.createElement("div"),t=[50,100,150,200,300];return c(n).render(r.createElement(l,null,r.createElement("div",{style:{display:"flex",gap:"24px",alignItems:"flex-end",padding:"24px"}},t.map(e=>r.createElement("div",{key:e,style:{textAlign:"center"}},r.createElement(i,{persona:"ferni",size:e,breathing:!0,glow:!0}),r.createElement("p",{style:{marginTop:"8px",fontFamily:"Inter, system-ui, sans-serif",fontSize:"12px",color:"#5C544A"}},e,"px")))))),n}},x={render:()=>{const n=document.createElement("div"),t=["idle","speaking","listening","thinking","celebrating"];return c(n).render(r.createElement(l,null,r.createElement("div",{style:{display:"flex",gap:"32px",flexWrap:"wrap",padding:"24px"}},t.map(e=>r.createElement("div",{key:e,style:{textAlign:"center"}},r.createElement(i,{persona:"ferni",size:120,state:e,breathing:!0,glow:!0}),r.createElement("p",{style:{marginTop:"12px",fontFamily:"Inter, system-ui, sans-serif",fontSize:"13px",textTransform:"capitalize",color:"#2C2520"}},e)))))),n}},y={render:()=>{const n=document.createElement("div"),t=["neutral","happy","curious","concerned","thinking","excited","warm"];return c(n).render(r.createElement(l,null,r.createElement("div",{style:{display:"flex",gap:"24px",flexWrap:"wrap",padding:"24px"}},t.map(e=>r.createElement("div",{key:e,style:{textAlign:"center"}},r.createElement(i,{persona:"ferni",size:100,expression:e,breathing:!0,glow:!0}),r.createElement("p",{style:{marginTop:"8px",fontFamily:"Inter, system-ui, sans-serif",fontSize:"12px",textTransform:"capitalize",color:"#5C544A"}},e)))))),n}};var z,S,A;d.parameters={...d.parameters,docs:{...(z=d.parameters)==null?void 0:z.docs,source:{originalSource:`{
  args: {
    persona: 'ferni',
    size: 200,
    breathing: true,
    glow: true
  }
}`,...(A=(S=d.parameters)==null?void 0:S.docs)==null?void 0:A.source}}};var j,F,T;m.parameters={...m.parameters,docs:{...(j=m.parameters)==null?void 0:j.docs,source:{originalSource:`{
  args: {
    persona: 'ferni',
    size: 200,
    state: 'speaking',
    breathing: true,
    glow: true
  }
}`,...(T=(F=m.parameters)==null?void 0:F.docs)==null?void 0:T.source}}};var I,P,C;g.parameters={...g.parameters,docs:{...(I=g.parameters)==null?void 0:I.docs,source:{originalSource:`{
  args: {
    persona: 'ferni',
    size: 200,
    state: 'celebrating',
    expression: 'excited',
    breathing: true,
    glow: true
  }
}`,...(C=(P=g.parameters)==null?void 0:P.docs)==null?void 0:C.source}}};var R,W,Y;f.parameters={...f.parameters,docs:{...(R=f.parameters)==null?void 0:R.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 24px; flex-wrap: wrap; align-items: center; padding: 24px;';
    const personas: PersonaId[] = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'];
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
          {personas.map(persona => <div key={persona} style={{
          textAlign: 'center'
        }}>
              <Avatar persona={persona} size={100} breathing glow />
              <p style={{
            marginTop: '8px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '14px',
            textTransform: 'capitalize',
            color: '#2C2520'
          }}>
                {persona}
              </p>
            </div>)}
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(Y=(W=f.parameters)==null?void 0:W.docs)==null?void 0:Y.source}}};var M,N,X;u.parameters={...u.parameters,docs:{...(M=u.parameters)==null?void 0:M.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const sizes = [50, 100, 150, 200, 300];
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'flex',
        gap: '24px',
        alignItems: 'flex-end',
        padding: '24px'
      }}>
          {sizes.map(size => <div key={size} style={{
          textAlign: 'center'
        }}>
              <Avatar persona="ferni" size={size} breathing glow />
              <p style={{
            marginTop: '8px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '12px',
            color: '#5C544A'
          }}>
                {size}px
              </p>
            </div>)}
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(X=(N=u.parameters)==null?void 0:N.docs)==null?void 0:X.source}}};var $,D,G;x.parameters={...x.parameters,docs:{...($=x.parameters)==null?void 0:$.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const states = ['idle', 'speaking', 'listening', 'thinking', 'celebrating'] as const;
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'flex',
        gap: '32px',
        flexWrap: 'wrap',
        padding: '24px'
      }}>
          {states.map(state => <div key={state} style={{
          textAlign: 'center'
        }}>
              <Avatar persona="ferni" size={120} state={state} breathing glow />
              <p style={{
            marginTop: '12px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '13px',
            textTransform: 'capitalize',
            color: '#2C2520'
          }}>
                {state}
              </p>
            </div>)}
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(G=(D=x.parameters)==null?void 0:D.docs)==null?void 0:G.source}}};var O,B,_;y.parameters={...y.parameters,docs:{...(O=y.parameters)==null?void 0:O.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const expressions = ['neutral', 'happy', 'curious', 'concerned', 'thinking', 'excited', 'warm'] as const;
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap',
        padding: '24px'
      }}>
          {expressions.map(expression => <div key={expression} style={{
          textAlign: 'center'
        }}>
              <Avatar persona="ferni" size={100} expression={expression} breathing glow />
              <p style={{
            marginTop: '8px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '12px',
            textTransform: 'capitalize',
            color: '#5C544A'
          }}>
                {expression}
              </p>
            </div>)}
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(_=(B=y.parameters)==null?void 0:B.docs)==null?void 0:_.source}}};const ae=["Default","Speaking","Celebrating","AllPersonas","Sizes","States","Expressions"];export{f as AllPersonas,g as Celebrating,d as Default,y as Expressions,u as Sizes,m as Speaking,x as States,ae as __namedExportsOrder,te as default};
