import{R as e}from"./index-DZPSA8Wk.js";import{c as a}from"./client-CETsdmKV.js";import{F as i}from"./FerniProvider-D7df2m8C.js";import{B as r}from"./Button-AjmoscDH.js";import"./_commonjsHelpers-Cpj98o6Y.js";const Q={title:"React/Button",tags:["autodocs"],argTypes:{variant:{control:{type:"select"},options:["primary","secondary","ghost","destructive"]},size:{control:{type:"select"},options:["sm","md","lg"]},disabled:{control:"boolean"},loading:{control:"boolean"}}},c={render:t=>{const n=document.createElement("div");return a(n).render(e.createElement(i,null,e.createElement("div",{style:{padding:"24px"}},e.createElement(r,{variant:"primary",...t},"Primary Button")))),n},args:{variant:"primary",size:"md"}},d={render:()=>{const t=document.createElement("div");return a(t).render(e.createElement(i,null,e.createElement("div",{style:{padding:"24px"}},e.createElement(r,{variant:"secondary"},"Secondary Button")))),t}},l={render:()=>{const t=document.createElement("div");return a(t).render(e.createElement(i,null,e.createElement("div",{style:{padding:"24px"}},e.createElement(r,{variant:"ghost"},"Ghost Button")))),t}},m={render:()=>{const t=document.createElement("div");return a(t).render(e.createElement(i,null,e.createElement("div",{style:{padding:"24px"}},e.createElement(r,{variant:"destructive"},"Delete")))),t}},p={render:()=>{const t=document.createElement("div"),n=["primary","secondary","ghost","destructive"];return a(t).render(e.createElement(i,null,e.createElement("div",{style:{display:"flex",gap:"12px",padding:"24px",flexWrap:"wrap"}},n.map(o=>e.createElement(r,{key:o,variant:o},o.charAt(0).toUpperCase()+o.slice(1)))))),t}},u={render:()=>{const t=document.createElement("div"),n=["sm","md","lg"];return a(t).render(e.createElement(i,null,e.createElement("div",{style:{display:"flex",gap:"12px",alignItems:"center",padding:"24px"}},n.map(o=>e.createElement(r,{key:o,size:o},"Size ",o.toUpperCase()))))),t}},v={render:()=>{const t=document.createElement("div");return a(t).render(e.createElement(i,null,e.createElement("div",{style:{display:"flex",gap:"12px",flexWrap:"wrap",padding:"24px"}},e.createElement(r,null,"Normal"),e.createElement(r,{disabled:!0},"Disabled"),e.createElement(r,{loading:!0},"Loading")))),t}},y={render:()=>{const t=document.createElement("div"),n=()=>e.createElement("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2"},e.createElement("line",{x1:"12",y1:"5",x2:"12",y2:"19"}),e.createElement("line",{x1:"5",y1:"12",x2:"19",y2:"12"})),s=()=>e.createElement("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2"},e.createElement("line",{x1:"5",y1:"12",x2:"19",y2:"12"}),e.createElement("polyline",{points:"12 5 19 12 12 19"}));return a(t).render(e.createElement(i,null,e.createElement("div",{style:{display:"flex",gap:"12px",padding:"24px"}},e.createElement(r,null,e.createElement(n,null)," Add Item"),e.createElement(r,{variant:"secondary"},"Continue ",e.createElement(s,null))))),t}},g={render:()=>{const t=document.createElement("div");return a(t).render(e.createElement(i,null,e.createElement("div",{style:{padding:"24px"}},e.createElement("div",{style:{display:"inline-flex",background:"#F5F1E8",padding:"4px",borderRadius:"10px",gap:"4px"}},e.createElement(r,{size:"sm",variant:"primary"},"Day"),e.createElement(r,{size:"sm",variant:"ghost"},"Week"),e.createElement(r,{size:"sm",variant:"ghost"},"Month"))))),t}};var x,E,B;c.parameters={...c.parameters,docs:{...(x=c.parameters)==null?void 0:x.docs,source:{originalSource:`{
  render: args => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        padding: '24px'
      }}>
          <Button variant="primary" {...args}>
            Primary Button
          </Button>
        </div>
      </FerniProvider>);
    return container;
  },
  args: {
    variant: 'primary',
    size: 'md'
  }
}`,...(B=(E=c.parameters)==null?void 0:E.docs)==null?void 0:B.source}}};var h,P,F;d.parameters={...d.parameters,docs:{...(h=d.parameters)==null?void 0:h.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        padding: '24px'
      }}>
          <Button variant="secondary">Secondary Button</Button>
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(F=(P=d.parameters)==null?void 0:P.docs)==null?void 0:F.source}}};var f,S,z;l.parameters={...l.parameters,docs:{...(f=l.parameters)==null?void 0:f.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        padding: '24px'
      }}>
          <Button variant="ghost">Ghost Button</Button>
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(z=(S=l.parameters)==null?void 0:S.docs)==null?void 0:z.source}}};var k,w,R;m.parameters={...m.parameters,docs:{...(k=m.parameters)==null?void 0:k.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        padding: '24px'
      }}>
          <Button variant="destructive">Delete</Button>
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(R=(w=m.parameters)==null?void 0:w.docs)==null?void 0:R.source}}};var I,W,b;p.parameters={...p.parameters,docs:{...(I=p.parameters)==null?void 0:I.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const variants = ['primary', 'secondary', 'ghost', 'destructive'] as const;
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'flex',
        gap: '12px',
        padding: '24px',
        flexWrap: 'wrap'
      }}>
          {variants.map(variant => <Button key={variant} variant={variant}>
              {variant.charAt(0).toUpperCase() + variant.slice(1)}
            </Button>)}
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(b=(W=p.parameters)==null?void 0:W.docs)==null?void 0:b.source}}};var C,A,D;u.parameters={...u.parameters,docs:{...(C=u.parameters)==null?void 0:C.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const sizes = ['sm', 'md', 'lg'] as const;
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        padding: '24px'
      }}>
          {sizes.map(size => <Button key={size} size={size}>
              Size {size.toUpperCase()}
            </Button>)}
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(D=(A=u.parameters)==null?void 0:A.docs)==null?void 0:D.source}}};var G,U,V;v.parameters={...v.parameters,docs:{...(G=v.parameters)==null?void 0:G.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        padding: '24px'
      }}>
          <Button>Normal</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(V=(U=v.parameters)==null?void 0:U.docs)==null?void 0:V.source}}};var L,M,N;y.parameters={...y.parameters,docs:{...(L=y.parameters)==null?void 0:L.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');

    // Simple SVG icons
    const PlusIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>;
    const ArrowIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>;
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        display: 'flex',
        gap: '12px',
        padding: '24px'
      }}>
          <Button>
            <PlusIcon /> Add Item
          </Button>
          <Button variant="secondary">
            Continue <ArrowIcon />
          </Button>
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(N=(M=y.parameters)==null?void 0:M.docs)==null?void 0:N.source}}};var _,O,T;g.parameters={...g.parameters,docs:{...(_=g.parameters)==null?void 0:_.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(<FerniProvider>
        <div style={{
        padding: '24px'
      }}>
          <div style={{
          display: 'inline-flex',
          background: '#F5F1E8',
          padding: '4px',
          borderRadius: '10px',
          gap: '4px'
        }}>
            <Button size="sm" variant="primary">Day</Button>
            <Button size="sm" variant="ghost">Week</Button>
            <Button size="sm" variant="ghost">Month</Button>
          </div>
        </div>
      </FerniProvider>);
    return container;
  }
}`,...(T=(O=g.parameters)==null?void 0:O.docs)==null?void 0:T.source}}};const X=["Primary","Secondary","Ghost","Destructive","AllVariants","Sizes","States","WithIcon","ButtonGroup"];export{p as AllVariants,g as ButtonGroup,m as Destructive,l as Ghost,c as Primary,d as Secondary,u as Sizes,v as States,y as WithIcon,X as __namedExportsOrder,Q as default};
