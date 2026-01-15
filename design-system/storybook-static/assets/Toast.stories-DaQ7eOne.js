import{a as c,j as l,R as e}from"./index-DZPSA8Wk.js";import{c as y}from"./client-CETsdmKV.js";import{F as v}from"./FerniProvider-D7df2m8C.js";import{B as s}from"./Button-AjmoscDH.js";import"./_commonjsHelpers-Cpj98o6Y.js";const J=c.createContext(null);let V=0;const W=()=>`toast-${++V}`;let r=null;const o=Object.assign((t,n)=>{r==null||r(t,n==null?void 0:n.type,n==null?void 0:n.duration)},{success:t=>r==null?void 0:r(t,"success"),error:t=>r==null?void 0:r(t,"error",4e3),info:t=>r==null?void 0:r(t,"info"),warning:t=>r==null?void 0:r(t,"warning")}),H=({toast:t,onDismiss:n})=>(c.useEffect(()=>{const a=setTimeout(()=>{n(t.id)},t.duration);return()=>clearTimeout(a)},[t.id,t.duration,n]),l.jsx("div",{className:`ferni-toast ferni-toast--${t.type}`,role:"status",children:t.message})),g=({position:t="bottom",offset:n=80,maxToasts:a=3})=>{const[m,T]=c.useState([]),x=c.useCallback((i,E="default",C=2500)=>{const G={id:W(),message:i,type:E,duration:C};T(b=>[...b,G].slice(-a))},[a]),k=c.useCallback(i=>{T(E=>E.filter(C=>C.id!==i))},[]);return c.useEffect(()=>(r=x,()=>{r=null}),[x]),l.jsxs(J.Provider,{value:{toasts:m,addToast:x,removeToast:k},children:[l.jsx("div",{className:"ferni-toaster",style:{[t]:n},children:m.map(i=>l.jsx(H,{toast:i,onDismiss:k},i.id))}),l.jsx("style",{children:`
        .ferni-toaster {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          z-index: 9999;
          pointer-events: none;
        }
        
        .ferni-toast {
          background: #2C2520;
          color: white;
          padding: 12px 24px;
          border-radius: 9999px;
          font-size: 0.9375rem;
          font-weight: 500;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          animation: ferni-toast-in 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
          pointer-events: auto;
        }
        
        .ferni-toast--success {
          background: #4a6741;
        }
        
        .ferni-toast--error {
          background: #a05454;
        }
        
        .ferni-toast--warning {
          background: #a08054;
        }
        
        .ferni-toast--info {
          background: #546080;
        }
        
        @keyframes ferni-toast-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .ferni-toast {
            animation: none;
          }
        }
      `})]})},K={title:"React/Toast",tags:["autodocs"]},N=()=>e.createElement("div",{style:{padding:"24px"}},e.createElement(g,null),e.createElement("div",{style:{display:"flex",gap:"12px",flexWrap:"wrap"}},e.createElement(s,{onClick:()=>o.success("Saved!")},"Success Toast"),e.createElement(s,{variant:"secondary",onClick:()=>o.info("Just a moment...")},"Info Toast"),e.createElement(s,{variant:"secondary",onClick:()=>o.warning("Add a name first")},"Warning Toast"),e.createElement(s,{variant:"destructive",onClick:()=>o.error("Couldn't connect. Try again?")},"Error Toast"))),u={render:()=>{const t=document.createElement("div");return y(t).render(e.createElement(v,null,e.createElement(N,null))),t}},d={render:()=>{const t=document.createElement("div");return y(t).render(e.createElement(v,null,e.createElement("div",{style:{padding:"24px"}},e.createElement(g,null),e.createElement(s,{onClick:()=>o.success("Saved!")},"Show Success")))),t}},p={render:()=>{const t=document.createElement("div"),n=()=>{const m=()=>{o.success("Great job!"),setTimeout(()=>o.info("Processing..."),300),setTimeout(()=>o.warning("Check your input"),600),setTimeout(()=>o.error("Something went wrong"),900)};return e.createElement("div",{style:{padding:"24px"}},e.createElement(g,null),e.createElement(s,{onClick:m},"Show All Toast Types"),e.createElement("p",{style:{marginTop:"16px",fontFamily:"Inter, system-ui, sans-serif",color:"#5C544A",fontSize:"14px"}},"Click to see all 4 toast types stacked"))};return y(t).render(e.createElement(v,null,e.createElement(n,null))),t}},f={render:()=>{const t=document.createElement("div"),n=()=>e.createElement("div",{style:{padding:"24px"}},e.createElement(g,null),e.createElement("h3",{style:{margin:"0 0 16px",fontFamily:"Plus Jakarta Sans, system-ui, sans-serif",color:"#2C2520"}},"Toast Copy Guidelines"),e.createElement("p",{style:{marginBottom:"16px",fontFamily:"Inter, system-ui, sans-serif",color:"#5C544A",fontSize:"14px",lineHeight:1.6}},'Toasts should use warm, human language. Short phrases, contractions, no "please" or "successfully".'),e.createElement("div",{style:{display:"flex",gap:"8px",flexWrap:"wrap"}},e.createElement(s,{size:"sm",onClick:()=>o.success("Saved!")},'"Saved!"'),e.createElement(s,{size:"sm",onClick:()=>o.success("Got it!")},'"Got it!"'),e.createElement(s,{size:"sm",onClick:()=>o.info("Just a moment...")},'"Just a moment..."'),e.createElement(s,{size:"sm",onClick:()=>o.warning("Add a name first")},'"Add a name first"'),e.createElement(s,{size:"sm",onClick:()=>o.error("Couldn't save. Try again?")},`"Couldn't save. Try again?"`)));return y(t).render(e.createElement(v,null,e.createElement(n,null))),t}};var h,S,w;u.parameters={...u.parameters,docs:{...(h=u.parameters)==null?void 0:h.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <ToastDemo />
      </FerniProvider>);
    return container;
  }
}`,...(w=(S=u.parameters)==null?void 0:S.docs)==null?void 0:w.source}}};var B,z,F;d.parameters={...d.parameters,docs:{...(B=d.parameters)==null?void 0:B.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        padding: '24px'
      }}>
          <Toaster />
          <Button onClick={() => toast.success('Saved!')}>
            Show Success
          </Button>
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(F=(z=d.parameters)==null?void 0:z.docs)==null?void 0:F.source}}};var P,j,A;p.parameters={...p.parameters,docs:{...(P=p.parameters)==null?void 0:P.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const AllTypesDemo = () => {
      const showAll = () => {
        toast.success('Great job!');
        setTimeout(() => toast.info('Processing...'), 300);
        setTimeout(() => toast.warning('Check your input'), 600);
        setTimeout(() => toast.error("Something went wrong"), 900);
      };
      return <div style={{
        padding: '24px'
      }}>
          <Toaster />
          <Button onClick={showAll}>
            Show All Toast Types
          </Button>
          <p style={{
          marginTop: '16px',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#5C544A',
          fontSize: '14px'
        }}>
            Click to see all 4 toast types stacked
          </p>
        </div>;
    };
    const root = createRoot(container);
    root.render(<FerniProvider>
        <AllTypesDemo />
      </FerniProvider>);
    return container;
  }
}`,...(A=(j=p.parameters)==null?void 0:j.docs)==null?void 0:A.source}}};var I,R,D;f.parameters={...f.parameters,docs:{...(I=f.parameters)==null?void 0:I.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const BrandVoiceDemo = () => {
      return <div style={{
        padding: '24px'
      }}>
          <Toaster />
          <h3 style={{
          margin: '0 0 16px',
          fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
          color: '#2C2520'
        }}>
            Toast Copy Guidelines
          </h3>
          <p style={{
          marginBottom: '16px',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#5C544A',
          fontSize: '14px',
          lineHeight: 1.6
        }}>
            Toasts should use warm, human language. Short phrases, contractions, no "please" or "successfully".
          </p>
          <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
            <Button size="sm" onClick={() => toast.success('Saved!')}>
              "Saved!"
            </Button>
            <Button size="sm" onClick={() => toast.success(\`Got it!\`)}>
              "Got it!"
            </Button>
            <Button size="sm" onClick={() => toast.info('Just a moment...')}>
              "Just a moment..."
            </Button>
            <Button size="sm" onClick={() => toast.warning('Add a name first')}>
              "Add a name first"
            </Button>
            <Button size="sm" onClick={() => toast.error("Couldn't save. Try again?")}>
              "Couldn't save. Try again?"
            </Button>
          </div>
        </div>;
    };
    const root = createRoot(container);
    root.render(<FerniProvider>
        <BrandVoiceDemo />
      </FerniProvider>);
    return container;
  }
}`,...(D=(R=f.parameters)==null?void 0:R.docs)==null?void 0:D.source}}};const L=["Interactive","Success","AllTypes","BrandVoice"];export{p as AllTypes,f as BrandVoice,u as Interactive,d as Success,L as __namedExportsOrder,K as default};
