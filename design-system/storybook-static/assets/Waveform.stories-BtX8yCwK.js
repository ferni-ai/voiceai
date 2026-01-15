import{a as d,j as re,R as t}from"./index-DZPSA8Wk.js";import{c as m}from"./client-CETsdmKV.js";import{F as p}from"./FerniProvider-D7df2m8C.js";import{p as ne}from"./index-D5g3GZkO.js";import"./_commonjsHelpers-Cpj98o6Y.js";const ae=e=>{var r;return((r=ne[e])==null?void 0:r.colors.primary)??"#4a6741"};function oe(e,r,s,n){return Array.from({length:e},(o,a)=>{const l=Math.abs(a-e/2)/(e/2),W=1-l*.5;switch(r){case"speaking":const h=Math.sin(n*.01+a*.5)*.3;return Math.max(.15,W*s*(.7+h));case"listening":const u=Math.sin(n*.003+a*.3)*.15;return Math.max(.1,.25+u+l*.1);case"thinking":const y=Math.sin(n*.005-l*2)*.2;return Math.max(.1,.3+y*(1-l));case"idle":default:const x=Math.sin(n*.002+a*.2)*.05;return Math.max(.1,.15+x)}})}const U=({persona:e="ferni",state:r="idle",intensity:s=.5,height:n=48,barCount:o=32,gap:a=2,className:l="",style:W})=>{const h=d.useRef(null),u=d.useRef(),y=d.useRef(0),x=ae(e),v=d.useMemo(()=>Math.max(2,(200-a*(o-1))/o),[o,a]);return d.useEffect(()=>{const f=h.current;if(!f)return;const i=f.getContext("2d");if(!i)return;const E=window.devicePixelRatio||1,c=f.getBoundingClientRect();f.width=c.width*E,f.height=c.height*E,i.scale(E,E);const M=()=>{y.current+=16;const V=oe(o,r,s,y.current);i.clearRect(0,0,c.width,c.height);const Y=o*v+(o-1)*a,Z=(c.width-Y)/2;V.forEach((w,b)=>{const ee=Z+b*(v+a),I=w*c.height,te=(c.height-I)/2;i.fillStyle=x,i.globalAlpha=.8+w*.2,i.beginPath(),i.roundRect(ee,te,v,I,v/2),i.fill()}),u.current=requestAnimationFrame(M)};return M(),()=>{u.current&&cancelAnimationFrame(u.current)}},[o,v,a,x,r,s]),re.jsx("canvas",{ref:h,className:`ferni-waveform ferni-waveform--${r} ${l}`,style:{width:"100%",height:n,...W},"aria-hidden":"true"})};U.displayName="Waveform";const me={title:"React/Waveform",tags:["autodocs"],argTypes:{persona:{control:{type:"select"},options:["ferni","peter","alex","maya","jordan","nayan"]},state:{control:{type:"select"},options:["idle","listening","speaking","thinking"]},intensity:{control:{type:"range",min:0,max:1,step:.1}},height:{control:{type:"range",min:20,max:200,step:10}},barCount:{control:{type:"range",min:5,max:30,step:1}}}},g=({persona:e="ferni",state:r="speaking",height:s=60})=>{const[n,o]=d.useState(.5);return d.useEffect(()=>{if(r!=="speaking"){o(r==="idle"?.1:.3);return}const a=setInterval(()=>{o(.3+Math.random()*.6)},100);return()=>clearInterval(a)},[r]),t.createElement("div",{style:{textAlign:"center"}},t.createElement(U,{persona:e,state:r,intensity:n,height:s}),t.createElement("p",{style:{marginTop:"12px",fontFamily:"Inter, system-ui, sans-serif",fontSize:"13px",textTransform:"capitalize",color:"#5C544A"}},r," (",Math.round(n*100),"%)"))},k={render:()=>{const e=document.createElement("div");return m(e).render(t.createElement(p,null,t.createElement("div",{style:{padding:"24px"}},t.createElement(g,{state:"speaking"})))),e}},A={render:()=>{const e=document.createElement("div");return m(e).render(t.createElement(p,null,t.createElement("div",{style:{padding:"24px"}},t.createElement(g,{state:"listening"})))),e}},F={render:()=>{const e=document.createElement("div");return m(e).render(t.createElement(p,null,t.createElement("div",{style:{padding:"24px"}},t.createElement(g,{state:"idle"})))),e}},P={render:()=>{const e=document.createElement("div"),r=["ferni","peter","alex","maya","jordan","nayan"];return m(e).render(t.createElement(p,null,t.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:"32px",padding:"24px"}},r.map(n=>t.createElement("div",{key:n,style:{textAlign:"center"}},t.createElement("h4",{style:{margin:"0 0 12px",fontFamily:"Plus Jakarta Sans, system-ui, sans-serif",textTransform:"capitalize",color:"#2C2520"}},n),t.createElement(g,{persona:n,state:"speaking",height:50})))))),e}},R={render:()=>{const e=document.createElement("div"),r=["idle","listening","speaking","thinking"];return m(e).render(t.createElement(p,null,t.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:"24px",padding:"24px"}},r.map(n=>t.createElement(g,{key:n,state:n}))))),e}},S={render:()=>{const e=document.createElement("div"),r=[30,50,80,120];return m(e).render(t.createElement(p,null,t.createElement("div",{style:{display:"flex",gap:"48px",alignItems:"flex-end",padding:"24px"}},r.map(n=>t.createElement("div",{key:n,style:{textAlign:"center"}},t.createElement(g,{height:n,state:"speaking"}),t.createElement("p",{style:{marginTop:"8px",fontFamily:"Inter, system-ui, sans-serif",fontSize:"12px",color:"#8A847A"}},n,"px")))))),e}};var T,j,z;k.parameters={...k.parameters,docs:{...(T=k.parameters)==null?void 0:T.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        padding: '24px'
      }}>
          <AnimatedWaveform state="speaking" />
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(z=(j=k.parameters)==null?void 0:j.docs)==null?void 0:z.source}}};var H,C,_;A.parameters={...A.parameters,docs:{...(H=A.parameters)==null?void 0:H.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        padding: '24px'
      }}>
          <AnimatedWaveform state="listening" />
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(_=(C=A.parameters)==null?void 0:C.docs)==null?void 0:_.source}}};var B,J,L;F.parameters={...F.parameters,docs:{...(B=F.parameters)==null?void 0:B.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        padding: '24px'
      }}>
          <AnimatedWaveform state="idle" />
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(L=(J=F.parameters)==null?void 0:J.docs)==null?void 0:L.source}}};var N,$,q;P.parameters={...P.parameters,docs:{...(N=P.parameters)==null?void 0:N.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const personas: PersonaId[] = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'];
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '32px',
        padding: '24px'
      }}>
          {personas.map(persona => <div key={persona} style={{
          textAlign: 'center'
        }}>
              <h4 style={{
            margin: '0 0 12px',
            fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
            textTransform: 'capitalize',
            color: '#2C2520'
          }}>
                {persona}
              </h4>
              <AnimatedWaveform persona={persona} state="speaking" height={50} />
            </div>)}
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(q=($=P.parameters)==null?void 0:$.docs)==null?void 0:q.source}}};var D,O,X;R.parameters={...R.parameters,docs:{...(D=R.parameters)==null?void 0:D.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const states: WaveformState[] = ['idle', 'listening', 'speaking', 'thinking'];
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '24px',
        padding: '24px'
      }}>
          {states.map(state => <AnimatedWaveform key={state} state={state} />)}
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(X=(O=R.parameters)==null?void 0:O.docs)==null?void 0:X.source}}};var G,K,Q;S.parameters={...S.parameters,docs:{...(G=S.parameters)==null?void 0:G.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const heights = [30, 50, 80, 120];
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'flex',
        gap: '48px',
        alignItems: 'flex-end',
        padding: '24px'
      }}>
          {heights.map(height => <div key={height} style={{
          textAlign: 'center'
        }}>
              <AnimatedWaveform height={height} state="speaking" />
              <p style={{
            marginTop: '8px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '12px',
            color: '#8A847A'
          }}>
                {height}px
              </p>
            </div>)}
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(Q=(K=S.parameters)==null?void 0:K.docs)==null?void 0:Q.source}}};const pe=["Speaking","Listening","Idle","AllPersonas","AllStates","Heights"];export{P as AllPersonas,R as AllStates,S as Heights,F as Idle,A as Listening,k as Speaking,pe as __namedExportsOrder,me as default};
