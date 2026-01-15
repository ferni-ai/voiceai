import{a as l,j as t,R as e}from"./index-DZPSA8Wk.js";import{c as d}from"./client-CETsdmKV.js";import{F as m}from"./FerniProvider-D7df2m8C.js";import{B as c}from"./Button-AjmoscDH.js";import"./_commonjsHelpers-Cpj98o6Y.js";const v=l.forwardRef(function({open:o,onClose:a,title:i,description:n,children:J,showClose:h=!0,closeOnBackdrop:E=!0,closeOnEscape:k=!0,className:q=""},M){const D=l.useRef(null),C=l.useRef(null),b=l.useCallback(s=>{k&&s.key==="Escape"&&a()},[k,a]),Q=l.useCallback(s=>{E&&s.target===s.currentTarget&&a()},[E,a]);return l.useEffect(()=>{var s,F;return o?(C.current=document.activeElement,(s=D.current)==null||s.focus(),document.addEventListener("keydown",b),document.body.style.overflow="hidden"):((F=C.current)==null||F.focus(),document.body.style.overflow=""),()=>{document.removeEventListener("keydown",b),document.body.style.overflow=""}},[o,b]),o?t.jsxs(t.Fragment,{children:[t.jsx("div",{className:`ferni-dialog-overlay ${q}`,onClick:Q,role:"presentation",children:t.jsxs("div",{ref:M||D,className:"ferni-dialog",role:"dialog","aria-modal":"true","aria-labelledby":i?"dialog-title":void 0,"aria-describedby":n?"dialog-description":void 0,tabIndex:-1,children:[(i||h)&&t.jsxs("header",{className:"ferni-dialog__header",children:[t.jsxs("div",{children:[i&&t.jsx("h2",{id:"dialog-title",className:"ferni-dialog__title",children:i}),n&&t.jsx("p",{id:"dialog-description",className:"ferni-dialog__description",children:n})]}),h&&t.jsx("button",{className:"ferni-dialog__close",onClick:a,"aria-label":"Close dialog",children:t.jsxs("svg",{width:"24",height:"24",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",children:[t.jsx("line",{x1:"18",y1:"6",x2:"6",y2:"18"}),t.jsx("line",{x1:"6",y1:"6",x2:"18",y2:"18"})]})})]}),t.jsx("div",{className:"ferni-dialog__content",children:J})]})}),t.jsx("style",{children:`
        .ferni-dialog-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 1000;
          animation: ferni-dialog-overlay-in 200ms ease-out;
        }

        .ferni-dialog-overlay::before {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(44, 37, 32, 0.4);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        @keyframes ferni-dialog-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .ferni-dialog {
          position: relative;
          background: white;
          border-radius: 24px;
          box-shadow: 0 25px 50px rgba(44, 37, 32, 0.25);
          max-width: 500px;
          width: 100%;
          max-height: calc(100vh - 48px);
          overflow: auto;
          animation: ferni-dialog-in 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes ferni-dialog-in {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .ferni-dialog__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 24px 24px 0;
        }

        .ferni-dialog__title {
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          font-size: 1.25rem;
          font-weight: 700;
          color: #2C2520;
          margin: 0;
        }

        .ferni-dialog__description {
          font-size: 0.875rem;
          color: #5C544A;
          margin: 4px 0 0;
        }

        .ferni-dialog__close {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          color: #8A847A;
          transition: all 150ms ease;
        }

        .ferni-dialog__close:hover {
          background: rgba(44, 37, 32, 0.05);
          color: #2C2520;
        }

        .ferni-dialog__close:focus-visible {
          outline: 2px solid #4a6741;
          outline-offset: 2px;
        }

        .ferni-dialog__content {
          padding: 24px;
        }

        @media (prefers-reduced-motion: reduce) {
          .ferni-dialog-overlay,
          .ferni-dialog {
            animation: none;
          }
        }
      `})]}):null}),$=({children:r,className:o=""})=>t.jsx("header",{className:`ferni-dialog-header ${o}`,children:r}),H=({children:r,className:o=""})=>t.jsx("div",{className:`ferni-dialog-body ${o}`,children:r}),I=({children:r,className:o=""})=>t.jsxs(t.Fragment,{children:[t.jsx("footer",{className:`ferni-dialog-footer ${o}`,children:r}),t.jsx("style",{children:`
      .ferni-dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding-top: 16px;
        border-top: 1px solid rgba(44, 37, 32, 0.1);
        margin-top: 16px;
      }
    `})]});v.displayName="Dialog";const Z={title:"React/Dialog",tags:["autodocs"],argTypes:{size:{control:{type:"select"},options:["sm","md","lg","xl"]}}},y=({size:r="md",title:o="Dialog Title",children:a="Dialog content goes here."})=>{const[i,n]=l.useState(!1);return e.createElement("div",{style:{padding:"24px"}},e.createElement(c,{onClick:()=>n(!0)},"Open Dialog"),e.createElement(v,{open:i,onClose:()=>n(!1),size:r},e.createElement($,null,e.createElement("h2",{style:{margin:0}},o)),e.createElement(H,null,a),e.createElement(I,null,e.createElement(c,{variant:"secondary",onClick:()=>n(!1)},"Cancel"),e.createElement(c,{onClick:()=>n(!1)},"Confirm"))))},p={render:()=>{const r=document.createElement("div");return d(r).render(e.createElement(m,null,e.createElement(y,null))),r}},u={render:()=>{const r=document.createElement("div");return d(r).render(e.createElement(m,null,e.createElement(y,{size:"sm",title:"Quick Note",children:"This is a small dialog for quick confirmations."}))),r}},g={render:()=>{const r=document.createElement("div");return d(r).render(e.createElement(m,null,e.createElement(y,{size:"lg",title:"Team Selection",children:e.createElement("div",null,e.createElement("p",{style:{marginTop:0}},"Choose your Ferni team members:"),e.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:"12px",marginTop:"16px"}},["Ferni","Peter","Alex","Maya","Jordan","Nayan"].map(a=>e.createElement("label",{key:a,style:{display:"flex",alignItems:"center",gap:"8px",padding:"12px",background:"#F5F1E8",borderRadius:"8px",cursor:"pointer"}},e.createElement("input",{type:"checkbox",defaultChecked:a==="Ferni"}),a))))}))),r}},f={render:()=>{const r=document.createElement("div");return d(r).render(e.createElement(m,null,e.createElement(y,{title:"Create Goal",children:e.createElement("form",{style:{display:"flex",flexDirection:"column",gap:"16px"}},e.createElement("div",null,e.createElement("label",{style:{display:"block",marginBottom:"6px",fontWeight:500,fontSize:"14px"}},"Goal Name"),e.createElement("input",{type:"text",placeholder:"e.g., Exercise more",style:{width:"100%",padding:"10px 12px",border:"1px solid rgba(44, 37, 32, 0.15)",borderRadius:"8px",fontSize:"15px",boxSizing:"border-box"}})),e.createElement("div",null,e.createElement("label",{style:{display:"block",marginBottom:"6px",fontWeight:500,fontSize:"14px"}},"Why is this important to you?"),e.createElement("textarea",{placeholder:"Tell me more...",rows:3,style:{width:"100%",padding:"10px 12px",border:"1px solid rgba(44, 37, 32, 0.15)",borderRadius:"8px",fontSize:"15px",resize:"vertical",boxSizing:"border-box"}})))}))),r}},x={render:()=>{const r=document.createElement("div"),o=()=>{const[i,n]=l.useState(!1);return e.createElement("div",{style:{padding:"24px"}},e.createElement(c,{variant:"destructive",onClick:()=>n(!0)},"Delete Account"),e.createElement(v,{open:i,onClose:()=>n(!1),size:"sm"},e.createElement($,null,e.createElement("h2",{style:{margin:0,color:"#a05454"}},"Are you sure?")),e.createElement(H,null,e.createElement("p",{style:{margin:0,color:"#5C544A"}},"This action cannot be undone. All your data will be permanently deleted.")),e.createElement(I,null,e.createElement(c,{variant:"secondary",onClick:()=>n(!1)},"Cancel"),e.createElement(c,{variant:"destructive",onClick:()=>n(!1)},"Delete"))))};return d(r).render(e.createElement(m,null,e.createElement(o,null))),r}};var _,w,z;p.parameters={...p.parameters,docs:{...(_=p.parameters)==null?void 0:_.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <DialogDemo />
      </FerniProvider>);
    return container;
  }
}`,...(z=(w=p.parameters)==null?void 0:w.docs)==null?void 0:z.source}}};var S,j,R;u.parameters={...u.parameters,docs:{...(S=u.parameters)==null?void 0:S.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <DialogDemo size="sm" title="Quick Note" children="This is a small dialog for quick confirmations." />
      </FerniProvider>);
    return container;
  }
}`,...(R=(j=u.parameters)==null?void 0:j.docs)==null?void 0:R.source}}};var N,T,B;g.parameters={...g.parameters,docs:{...(N=g.parameters)==null?void 0:N.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <DialogDemo size="lg" title="Team Selection" children={<div>
              <p style={{
          marginTop: 0
        }}>Choose your Ferni team members:</p>
              <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          marginTop: '16px'
        }}>
                {['Ferni', 'Peter', 'Alex', 'Maya', 'Jordan', 'Nayan'].map(name => <label key={name} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px',
            background: '#F5F1E8',
            borderRadius: '8px',
            cursor: 'pointer'
          }}>
                    <input type="checkbox" defaultChecked={name === 'Ferni'} />
                    {name}
                  </label>)}
              </div>
            </div>} />
      </FerniProvider>);
    return container;
  }
}`,...(B=(T=g.parameters)==null?void 0:T.docs)==null?void 0:B.source}}};var P,A,W;f.parameters={...f.parameters,docs:{...(P=f.parameters)==null?void 0:P.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <DialogDemo title="Create Goal" children={<form style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
              <div>
                <label style={{
            display: 'block',
            marginBottom: '6px',
            fontWeight: 500,
            fontSize: '14px'
          }}>
                  Goal Name
                </label>
                <input type="text" placeholder="e.g., Exercise more" style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid rgba(44, 37, 32, 0.15)',
            borderRadius: '8px',
            fontSize: '15px',
            boxSizing: 'border-box'
          }} />
              </div>
              <div>
                <label style={{
            display: 'block',
            marginBottom: '6px',
            fontWeight: 500,
            fontSize: '14px'
          }}>
                  Why is this important to you?
                </label>
                <textarea placeholder="Tell me more..." rows={3} style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid rgba(44, 37, 32, 0.15)',
            borderRadius: '8px',
            fontSize: '15px',
            resize: 'vertical',
            boxSizing: 'border-box'
          }} />
              </div>
            </form>} />
      </FerniProvider>);
    return container;
  }
}`,...(W=(A=f.parameters)==null?void 0:A.docs)==null?void 0:W.source}}};var O,L,G;x.parameters={...x.parameters,docs:{...(O=x.parameters)==null?void 0:O.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const ConfirmationDemo = () => {
      const [open, setOpen] = useState(false);
      return <div style={{
        padding: '24px'
      }}>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete Account
          </Button>
          
          <Dialog open={open} onClose={() => setOpen(false)} size="sm">
            <DialogHeader>
              <h2 style={{
              margin: 0,
              color: '#a05454'
            }}>Are you sure?</h2>
            </DialogHeader>
            <DialogBody>
              <p style={{
              margin: 0,
              color: '#5C544A'
            }}>
                This action cannot be undone. All your data will be permanently deleted.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => setOpen(false)}>
                Delete
              </Button>
            </DialogFooter>
          </Dialog>
        </div>;
    };
    const root = createRoot(container);
    root.render(<FerniProvider>
        <ConfirmationDemo />
      </FerniProvider>);
    return container;
  }
}`,...(G=(L=x.parameters)==null?void 0:L.docs)==null?void 0:G.source}}};const ee=["Default","Small","Large","WithForm","Confirmation"];export{x as Confirmation,p as Default,g as Large,u as Small,f as WithForm,ee as __namedExportsOrder,Z as default};
